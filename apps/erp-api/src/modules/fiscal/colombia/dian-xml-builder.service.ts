/** Constructor UBL 2.1 para DIAN FEV Anexo 1.9. */
import { Injectable, Logger } from '@nestjs/common';
import * as builder from 'xmlbuilder2';
import {
  DianGenerationContext,
  DianReceiverTaxProfile,
  DocumentoElectronico,
} from '../../../shared/integration/fiscal.interfaces';
import { DianIdentity, normalizeDianIdentity } from './dian-document.util';
import {
  formatDianAmount,
  generarApplicationResponseCude,
  generarCude,
  generarCufe,
  generarDianQrUrl,
  generarSoftwareSecurityCode,
} from './dian-unique-code.util';

const DIAN_AGENCY = 'Unidad Administrativa Especial Dirección de Impuestos y Aduanas Nacionales';
const DIAN_NIT = '800197268';
const DIAN_NIT_DV = '4';
const DIAN_APPLICATION_RESPONSE_PROFILE =
  'DIAN 2.1: ApplicationResponse de Factura Electrónica de Venta';
const DIAN_DOCUMENT_PROFILES: Record<DocumentKind, string> = {
  Invoice: 'DIAN 2.1: Factura Electrónica de Venta',
  CreditNote: 'DIAN 2.1: Nota Crédito de Factura Electrónica de Venta',
  DebitNote: 'DIAN 2.1: Nota Débito de Factura Electrónica de Venta',
};
type DocumentKind = 'Invoice' | 'CreditNote' | 'DebitNote';

export type DianEventResponseCode = '030' | '031' | '032' | '033' | '034';
export type DianEventClaimReasonCode = '01' | '02' | '03' | '04';

export interface DianEventIssuerPersonInput {
  identity: { type: string; number: string };
  firstName: string;
  familyName: string;
  jobTitle: string;
  organizationDepartment: string;
}

export interface DianEventClaimReasonInput {
  listId: DianEventClaimReasonCode;
  name: string;
}

export interface DianTaxInput {
  id: string;
  name: string;
  taxableAmount: number;
  amount: number;
  percent: number;
  /** 01 gravado, 02 exento, 03 excluido. */
  categoryCode?: string;
}

export interface DianAllowanceChargeInput {
  chargeIndicator: boolean;
  amount: number;
  baseAmount?: number;
  percent?: number;
  reasonCode: string;
  reason: string;
}

export interface DianApplicationResponseInput {
  id: string;
  issueDate: string;
  issueTime: string;
  environmentId: '1' | '2';
  softwareId: string;
  softwarePin: string;
  sender: { type: string; number: string; name: string };
  receiver: { type: string; number: string; name: string };
  responseCode: DianEventResponseCode;
  responseDescription: string;
  referencedDocumentId: string;
  referencedDocumentTypeCode: string;
  referencedDocumentUuid: string;
  /** Notas de mandato u otra trazabilidad suministradas por el emisor. */
  notes?: string[];
  /** Responsable que recibió la factura o el bien/servicio (obligatorio en 030/032). */
  issuerPerson?: DianEventIssuerPersonInput;
  /** Motivo explícito del reclamo según el catálogo DIAN (obligatorio sólo en 031). */
  claimReason?: DianEventClaimReasonInput;
  /** Declaración juramentada de aceptación tácita (obligatoria sólo en 034). */
  swornStatement?: string;
}

type ExtendedDocument = DocumentoElectronico & {
  dianTaxes?: DianTaxInput[];
  dianWithholdings?: DianTaxInput[];
  dianAllowanceCharges?: DianAllowanceChargeInput[];
  payableAmount?: number;
};

type ExtendedItem = DocumentoElectronico['items'][number] & {
  dianTaxes?: DianTaxInput[];
  dianAllowanceCharges?: DianAllowanceChargeInput[];
  dianTaxCategory?: 'GRAVADO' | 'EXENTO' | 'EXCLUIDO';
};

interface DocumentIdentity {
  id: string;
  date: string;
  time: string;
  uniqueCode: string;
  uniqueCodeScheme: 'CUFE-SHA384' | 'CUDE-SHA384';
  softwareSecurityCode: string;
  qrUrl: string;
}

@Injectable()
export class DianXmlBuilderService {
  private readonly logger = new Logger(DianXmlBuilderService.name);

  async generarFacturaElectronica(documento: DocumentoElectronico): Promise<string> {
    if (String(documento.tipoDocumento).trim() !== '01') {
      throw new Error('DIAN: una factura electrónica debe ser tipo 01');
    }
    return this.generarDocumento(documento, 'Invoice');
  }

  async generarNotaCredito(documento: DocumentoElectronico): Promise<string> {
    if (String(documento.tipoDocumento).trim() !== '91') {
      throw new Error('DIAN: una nota crédito debe ser tipo 91');
    }
    return this.generarDocumento(documento, 'CreditNote');
  }

  async generarNotaDebito(documento: DocumentoElectronico): Promise<string> {
    if (String(documento.tipoDocumento).trim() !== '92') {
      throw new Error('DIAN: una nota débito debe ser tipo 92');
    }
    return this.generarDocumento(documento, 'DebitNote');
  }

  /** Genera un evento sólo desde datos explícitos; no suplanta la respuesta DIAN. */
  generarApplicationResponse(input: DianApplicationResponseInput): string {
    const sender = normalizeDianIdentity(input.sender.type, input.sender.number);
    const receiver = normalizeDianIdentity(input.receiver.type, input.receiver.number);
    const id = this.nonEmpty(input.id, 'ID del ApplicationResponse');
    const date = this.isoDate(input.issueDate);
    const time = this.isoTime(input.issueTime);
    const responseCode = this.dianEventResponseCode(input.responseCode);
    const referencedDocumentTypeCode = this.nonEmpty(
      input.referencedDocumentTypeCode,
      'tipo referenciado',
    );
    if (referencedDocumentTypeCode !== '01') {
      throw new Error('DIAN: los eventos RADIAN 030-034 sólo referencian factura tipo 01');
    }
    const referencedDocumentUuid = this.nonEmpty(
      input.referencedDocumentUuid,
      'CUFE de la factura referenciada',
    ).toLowerCase();
    if (!/^[0-9a-f]{96}$/u.test(referencedDocumentUuid)) {
      throw new Error('DIAN: el CUFE referenciado debe ser SHA-384 hexadecimal (96 caracteres)');
    }
    if (input.notes !== undefined && !Array.isArray(input.notes)) {
      throw new Error('DIAN: notes debe ser una lista de notas explícitas');
    }
    const notes = (input.notes ?? []).map((note, index) => this.nonEmpty(
      note,
      `nota ${index + 1} del ApplicationResponse`,
    ));
    const issuerPerson = this.validateEventIssuerPerson(responseCode, input.issuerPerson);
    const claimReason = this.validateEventClaimReason(responseCode, input.claimReason);
    const swornStatement = this.validateEventSwornStatement(responseCode, input.swornStatement);
    this.validateEventReceiver(responseCode, receiver, input.receiver.name);
    const cude = generarApplicationResponseCude({
      numeroDocumento: id,
      fechaEmision: date,
      horaEmision: time,
      documentoEmisor: sender.xmlNumber,
      documentoReceptor: receiver.xmlNumber,
      codigoRespuesta: responseCode,
      documentoReferenciado: this.nonEmpty(input.referencedDocumentId, 'documento referenciado'),
      tipoDocumentoReferenciado: referencedDocumentTypeCode,
      softwarePin: this.nonEmpty(input.softwarePin, 'PIN de software'),
    });
    const root = builder.create({ version: '1.0', encoding: 'UTF-8' }).ele('ApplicationResponse', {
      xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'xmlns:sts': 'dian:gov:co:facturaelectronica:Structures-2-1',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
    });
    const extensions = this.addSignaturePlaceholder(root);
    const dian = extensions.ele('ext:UBLExtension').ele('ext:ExtensionContent')
      .ele('sts:DianExtensions');
    dian.ele('sts:InvoiceSource').ele('cbc:IdentificationCode', {
      listAgencyID: '6',
      listAgencyName: 'United Nations Economic Commission for Europe',
      listSchemeURI: 'urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1',
    }).txt('CO');
    const provider = dian.ele('sts:SoftwareProvider');
    provider.ele('sts:ProviderID', this.dianIdentityAttributes(sender)).txt(sender.xmlNumber);
    provider.ele('sts:SoftwareID', { schemeAgencyID: '195', schemeAgencyName: DIAN_AGENCY })
      .txt(this.nonEmpty(input.softwareId, 'ID de software'));
    dian.ele('sts:SoftwareSecurityCode', {
      schemeAgencyID: '195', schemeAgencyName: DIAN_AGENCY,
    }).txt(generarSoftwareSecurityCode(input.softwareId, input.softwarePin, id));
    dian.ele('sts:AuthorizationProvider').ele('sts:AuthorizationProviderID', {
      schemeAgencyID: '195', schemeAgencyName: DIAN_AGENCY, schemeID: '4', schemeName: '31',
    }).txt(DIAN_NIT);
    dian.ele('sts:QRCode').txt(generarDianQrUrl(cude, input.environmentId));
    root.ele('cbc:UBLVersionID').txt('UBL 2.1');
    root.ele('cbc:CustomizationID').txt('1');
    root.ele('cbc:ProfileID').txt(DIAN_APPLICATION_RESPONSE_PROFILE);
    root.ele('cbc:ProfileExecutionID').txt(input.environmentId);
    root.ele('cbc:ID').txt(id);
    root.ele('cbc:UUID', { schemeID: input.environmentId, schemeName: 'CUDE-SHA384' }).txt(cude);
    root.ele('cbc:IssueDate').txt(date);
    root.ele('cbc:IssueTime').txt(time);
    for (const note of notes) root.ele('cbc:Note').txt(note);
    if (swornStatement) root.ele('cbc:Note').txt(swornStatement);
    this.addApplicationResponseParty(root, 'cac:SenderParty', sender, input.sender.name);
    this.addApplicationResponseParty(root, 'cac:ReceiverParty', receiver, input.receiver.name);
    const response = root.ele('cac:DocumentResponse');
    const status = response.ele('cac:Response');
    status.ele('cbc:ResponseCode', claimReason
      ? { listID: claimReason.listId, name: claimReason.name }
      : {}).txt(responseCode);
    status.ele('cbc:Description').txt(this.nonEmpty(
      input.responseDescription,
      'descripción del evento RADIAN',
    ));
    const reference = response.ele('cac:DocumentReference');
    reference.ele('cbc:ID').txt(input.referencedDocumentId);
    reference.ele('cbc:UUID', { schemeName: 'CUFE-SHA384' }).txt(referencedDocumentUuid);
    reference.ele('cbc:DocumentTypeCode').txt(referencedDocumentTypeCode);
    if (issuerPerson) this.addEventIssuerPerson(response, issuerPerson);
    return root.end({ prettyPrint: true });
  }

  /**
   * Contenedor real: exige XML firmado y ApplicationResponse recibido. Nunca
   * fabrica una aceptación, un validador ni una fecha de validación.
   */
  generarAttachedDocument(
    documento: DocumentoElectronico,
    signedDocumentXml: string,
    applicationResponseXml: string,
  ): string {
    if (!/<(?:\w+:)?Signature\b/u.test(signedDocumentXml)) {
      throw new Error('DIAN: AttachedDocument requiere el documento fiscal firmado');
    }
    if (!/<(?:\w+:)?ApplicationResponse\b/u.test(applicationResponseXml)
        || !/<(?:\w+:)?Signature\b/u.test(applicationResponseXml)) {
      throw new Error('DIAN: AttachedDocument requiere un ApplicationResponse DIAN firmado');
    }
    const context = this.contexto(documento);
    const identity = this.resolveDocumentIdentity(documento, this.kindFor(documento), context);
    const responseId = this.xmlText(applicationResponseXml, 'ID');
    const responseDate = this.xmlText(applicationResponseXml, 'IssueDate');
    const responseTime = this.xmlText(applicationResponseXml, 'IssueTime');
    const responseCode = this.xmlText(applicationResponseXml, 'ResponseCode');
    const validatorId = this.xmlText(applicationResponseXml, 'CompanyID');
    if (!responseId || !responseDate || !responseTime || !responseCode || !validatorId) {
      throw new Error('DIAN: ApplicationResponse sin evidencia mínima verificable');
    }
    const root = builder.create({ version: '1.0', encoding: 'UTF-8' }).ele('AttachedDocument', {
      xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
    });
    this.addSignaturePlaceholder(root);
    root.ele('cbc:UBLVersionID').txt('UBL 2.1');
    root.ele('cbc:CustomizationID').txt('Documentos adjuntos');
    root.ele('cbc:ProfileID').txt('Factura Electrónica de Venta');
    root.ele('cbc:ProfileExecutionID').txt(context.environmentId);
    root.ele('cbc:ID').txt(`AD-${identity.id}`);
    root.ele('cbc:IssueDate').txt(responseDate);
    root.ele('cbc:IssueTime').txt(responseTime);
    root.ele('cbc:DocumentType').txt('Contenedor de Factura Electrónica');
    root.ele('cbc:ParentDocumentID').txt(identity.id);
    this.addAttachedParty(root, 'cac:SenderParty', documento.emisor);
    this.addAttachedParty(root, 'cac:ReceiverParty', documento.receptor);
    const attachment = root.ele('cac:Attachment').ele('cac:ExternalReference');
    attachment.ele('cbc:MimeCode').txt('text/xml');
    attachment.ele('cbc:EncodingCode').txt('UTF-8');
    attachment.ele('cbc:Description').dat(signedDocumentXml);
    const line = root.ele('cac:ParentDocumentLineReference');
    line.ele('cbc:LineID').txt('1');
    const reference = line.ele('cac:DocumentReference');
    reference.ele('cbc:ID').txt(identity.id);
    reference.ele('cbc:UUID', {
      schemeID: context.environmentId,
      schemeName: identity.uniqueCodeScheme,
    }).txt(identity.uniqueCode);
    reference.ele('cbc:IssueDate').txt(identity.date);
    reference.ele('cbc:DocumentType').txt('ApplicationResponse');
    const responseAttachment = reference.ele('cac:Attachment').ele('cac:ExternalReference');
    responseAttachment.ele('cbc:MimeCode').txt('text/xml');
    responseAttachment.ele('cbc:EncodingCode').txt('UTF-8');
    responseAttachment.ele('cbc:Description').dat(applicationResponseXml);
    const verification = reference.ele('cac:ResultOfVerification');
    verification.ele('cbc:ValidatorID').txt(validatorId);
    verification.ele('cbc:ValidationResultCode').txt(responseCode);
    verification.ele('cbc:ValidationDate').txt(responseDate);
    verification.ele('cbc:ValidationTime').txt(responseTime);
    return root.end({ prettyPrint: true });
  }

  private generarDocumento(documento: DocumentoElectronico, kind: DocumentKind): string {
    const context = this.contexto(documento);
    const identity = this.resolveDocumentIdentity(documento, kind, context);
    const root = this.createRoot(kind);
    this.addUBLExtensions(root, documento, kind, context, identity);
    root.ele('cbc:UBLVersionID').txt('UBL 2.1');
    root.ele('cbc:CustomizationID').txt(
      context.operationCode || (kind === 'Invoice' ? '10' : kind === 'CreditNote' ? '20' : '30'),
    );
    root.ele('cbc:ProfileID').txt(this.profileId(kind));
    root.ele('cbc:ProfileExecutionID').txt(context.environmentId);
    root.ele('cbc:ID').txt(identity.id);
    root.ele('cbc:UUID', { schemeID: context.environmentId, schemeName: identity.uniqueCodeScheme })
      .txt(identity.uniqueCode);
    root.ele('cbc:IssueDate').txt(identity.date);
    root.ele('cbc:IssueTime').txt(identity.time);
    if (kind !== 'DebitNote') {
      root.ele(`cbc:${kind}TypeCode`).txt(documento.tipoDocumento);
    }
    root.ele('cbc:DocumentCurrencyCode').txt(this.currency(documento.moneda));
    root.ele('cbc:LineCountNumeric').txt(String(documento.items.length));
    if (kind !== 'Invoice') this.addNoteReference(root, documento);
    this.addEmisor(root, documento);
    this.addReceptor(root, documento);
    if (kind === 'Invoice') this.addMediosPago(root, documento);
    const adjustments = this.resolveAdjustments(documento);
    this.addAllowanceCharges(root, adjustments, documento.moneda);
    const taxes = this.resolveHeaderTaxes(documento, context);
    this.addTaxTotals(root, 'cac:TaxTotal', taxes, documento.moneda);
    const withholdings = this.explicitTaxes((documento as ExtendedDocument).dianWithholdings, 'retenciones');
    if (withholdings.length) this.addTaxTotals(root, 'cac:WithholdingTaxTotal', withholdings, documento.moneda);
    this.addMonetaryTotal(root, documento, kind, adjustments, withholdings);
    this.addItems(root, documento, kind, taxes);
    this.logger.log(`XML ${kind} DIAN FEV 1.9 generado: ${identity.id}`);
    return root.end({ prettyPrint: true });
  }

  private createRoot(kind: DocumentKind): any {
    return builder.create({ version: '1.0', encoding: 'UTF-8' }).ele(kind, {
      xmlns: `urn:oasis:names:specification:ubl:schema:xsd:${kind}-2`,
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'xmlns:sts': 'dian:gov:co:facturaelectronica:Structures-2-1',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'xmlns:xades': 'http://uri.etsi.org/01903/v1.3.2#',
      'xmlns:xades141': 'http://uri.etsi.org/01903/v1.4.1#',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    });
  }

  private profileId(kind: DocumentKind): string {
    return DIAN_DOCUMENT_PROFILES[kind];
  }

  private dianEventResponseCode(value: unknown): DianEventResponseCode {
    const code = this.nonEmpty(value, 'código de respuesta RADIAN');
    if (!['030', '031', '032', '033', '034'].includes(code)) {
      throw new Error('DIAN: evento RADIAN no soportado; use 030, 031, 032, 033 o 034');
    }
    return code as DianEventResponseCode;
  }

  private validateEventIssuerPerson(
    responseCode: DianEventResponseCode,
    person: DianEventIssuerPersonInput | undefined,
  ): DianEventIssuerPersonInput | undefined {
    if ((responseCode === '030' || responseCode === '032') && !person) {
      throw new Error(`DIAN: el evento ${responseCode} requiere issuerPerson responsable`);
    }
    if (!person) return undefined;
    normalizeDianIdentity(person.identity?.type, person.identity?.number);
    this.nonEmpty(person.firstName, 'nombre del responsable del evento');
    this.nonEmpty(person.familyName, 'apellido del responsable del evento');
    this.nonEmpty(person.jobTitle, 'cargo del responsable del evento');
    this.nonEmpty(person.organizationDepartment, 'área del responsable del evento');
    return person;
  }

  private validateEventClaimReason(
    responseCode: DianEventResponseCode,
    reason: DianEventClaimReasonInput | undefined,
  ): DianEventClaimReasonInput | undefined {
    if (responseCode === '031' && !reason) {
      throw new Error('DIAN: el evento 031 requiere claimReason explícito');
    }
    if (responseCode !== '031' && reason) {
      throw new Error('DIAN: claimReason sólo aplica al evento 031');
    }
    if (!reason) return undefined;
    if (!['01', '02', '03', '04'].includes(String(reason.listId))) {
      throw new Error('DIAN: claimReason.listId debe pertenecer al catálogo 01-04');
    }
    return { listId: reason.listId, name: this.nonEmpty(reason.name, 'nombre del motivo de reclamo') };
  }

  private validateEventSwornStatement(
    responseCode: DianEventResponseCode,
    statement: string | undefined,
  ): string | undefined {
    if (responseCode !== '034') {
      if (statement !== undefined) {
        throw new Error('DIAN: swornStatement sólo aplica al evento 034');
      }
      return undefined;
    }
    const normalized = this.nonEmpty(statement, 'declaración juramentada del evento 034');
    if (!/bajo la gravedad de juramento/iu.test(normalized)
        || !/3\s+d[ií]as\s+h[aá]biles/iu.test(normalized)) {
      throw new Error(
        'DIAN: el evento 034 exige declaración bajo gravedad de juramento por 3 días hábiles',
      );
    }
    return normalized;
  }

  private validateEventReceiver(
    responseCode: DianEventResponseCode,
    receiver: DianIdentity,
    receiverName: string,
  ): void {
    if (responseCode !== '034') return;
    if (receiver.type !== '31'
        || receiver.xmlNumber !== DIAN_NIT
        || receiver.verificationDigit !== DIAN_NIT_DV) {
      throw new Error('DIAN: ReceiverParty del evento 034 debe ser el NIT DIAN 800197268-4');
    }
    if (this.nonEmpty(receiverName, 'razón social de ReceiverParty') !== DIAN_AGENCY) {
      throw new Error(`DIAN: ReceiverParty del evento 034 debe ser ${DIAN_AGENCY}`);
    }
  }

  private addEventIssuerPerson(
    documentResponse: any,
    personInput: DianEventIssuerPersonInput,
  ): void {
    const identity = normalizeDianIdentity(
      personInput.identity.type,
      personInput.identity.number,
    );
    const person = documentResponse.ele('cac:IssuerParty').ele('cac:Person');
    person.ele('cbc:ID', this.dianIdentityAttributes(identity)).txt(identity.xmlNumber);
    person.ele('cbc:FirstName').txt(this.nonEmpty(personInput.firstName, 'nombre del responsable'));
    person.ele('cbc:FamilyName').txt(this.nonEmpty(personInput.familyName, 'apellido del responsable'));
    person.ele('cbc:JobTitle').txt(this.nonEmpty(personInput.jobTitle, 'cargo del responsable'));
    person.ele('cbc:OrganizationDepartment')
      .txt(this.nonEmpty(personInput.organizationDepartment, 'área del responsable'));
  }

  private kindFor(documento: DocumentoElectronico): DocumentKind {
    if (documento.tipoDocumento === '01') return 'Invoice';
    if (documento.tipoDocumento === '91') return 'CreditNote';
    if (documento.tipoDocumento === '92') return 'DebitNote';
    throw new Error(`DIAN: tipo no soportado ${documento.tipoDocumento}`);
  }

  private contexto(documento: DocumentoElectronico): DianGenerationContext {
    if (documento.dianContext) return this.validateContext(documento, documento.dianContext);
    if (!this.isExplicitDemoFixture(documento)) {
      throw new Error('DIAN: falta contexto fiscal sellado para generar el UBL');
    }
    const number = this.integerDocumentNumber(documento.numero);
    return this.validateContext(documento, {
      environmentId: '2',
      software: { id: 'DEMO-SOFTWARE-ID', pin: 'DEMO-SOFTWARE-PIN' },
      authorization: documento.tipoDocumento === '01' ? {
        number: '18760000001', prefix: documento.serie, rangeFrom: 1,
        rangeTo: Math.max(5_000_000, number), validFrom: '2020-01-01', validTo: '2099-12-31',
        technicalKey: 'DEMO-CLAVE-TECNICA-SIN-VALIDEZ-DIAN',
      } : undefined,
      taxes: { iva: documento.totalImpuestos, inc: 0, ica: 0 },
    });
  }

  private validateContext(documento: DocumentoElectronico, context: DianGenerationContext): DianGenerationContext {
    if (!['1', '2'].includes(context.environmentId)) {
      throw new Error('DIAN: ProfileExecutionID debe ser 1 o 2');
    }
    this.nonEmpty(context.software?.id, 'Software ID');
    this.nonEmpty(context.software?.pin, 'Software PIN');
    if (documento.tipoDocumento === '01') {
      const auth = context.authorization;
      if (!auth) throw new Error('DIAN: falta autorización de numeración');
      this.nonEmpty(auth.number, 'número de resolución');
      this.nonEmpty(auth.technicalKey, 'clave técnica del rango');
      const authorizedPrefix = String(auth.prefix ?? '').trim().toUpperCase();
      const documentPrefix = String(documento.serie ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9]{0,4}$/.test(authorizedPrefix)
          || !/^[A-Z0-9]{0,4}$/.test(documentPrefix)) {
        throw new Error(
          'DIAN: el prefijo es opcional; cuando exista debe tener máximo 4 alfanuméricos',
        );
      }
      const number = this.integerDocumentNumber(documento.numero);
      if (authorizedPrefix !== documentPrefix) {
        throw new Error('DIAN: la serie no coincide con el prefijo autorizado');
      }
      if (!Number.isSafeInteger(auth.rangeFrom) || !Number.isSafeInteger(auth.rangeTo)
          || number < auth.rangeFrom || number > auth.rangeTo) {
        throw new Error('DIAN: factura fuera del rango autorizado');
      }
      const date = this.formatDate(documento.fechaEmision);
      if (date < this.isoDate(auth.validFrom) || date > this.isoDate(auth.validTo)) {
        throw new Error('DIAN: factura fuera de la vigencia de la resolución');
      }
    }
    return context;
  }

  private resolveDocumentIdentity(
    documento: DocumentoElectronico,
    kind: DocumentKind,
    context: DianGenerationContext,
  ): DocumentIdentity {
    const prefix = String(documento.serie ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{0,4}$/.test(prefix)) {
      throw new Error(
        'DIAN: el prefijo es opcional; cuando exista debe tener máximo 4 alfanuméricos',
      );
    }
    const id = `${prefix}${this.nonEmpty(documento.numero, 'número')}`;
    const date = this.formatDate(documento.fechaEmision);
    const time = this.formatTime(documento.fechaEmision);
    const emisor = normalizeDianIdentity(documento.emisor.tipoDocumento || '31', documento.emisor.numeroDocumento);
    const receptor = normalizeDianIdentity(documento.receptor.tipoDocumento, documento.receptor.numeroDocumento);
    const seed = context.taxes || { iva: documento.totalImpuestos, inc: 0, ica: 0 };
    const common = {
      numeroDocumento: id, fechaEmision: date, horaEmision: time,
      valorSinImpuestos: documento.subtotal, iva: seed.iva, inc: seed.inc, ica: seed.ica,
      total: documento.importeTotal, nitEmisor: emisor.xmlNumber,
      numeroAdquirente: receptor.xmlNumber, ambiente: context.environmentId,
    } as const;
    const uniqueCode = kind === 'Invoice'
      ? generarCufe({ ...common, claveTecnica: context.authorization!.technicalKey })
      : generarCude({ ...common, softwarePin: context.software.pin });
    return {
      id, date, time, uniqueCode,
      uniqueCodeScheme: kind === 'Invoice' ? 'CUFE-SHA384' : 'CUDE-SHA384',
      softwareSecurityCode: generarSoftwareSecurityCode(context.software.id, context.software.pin, id),
      qrUrl: generarDianQrUrl(uniqueCode, context.environmentId),
    };
  }

  private addSignaturePlaceholder(root: any): any {
    const extensions = root.ele('ext:UBLExtensions');
    extensions.ele('ext:UBLExtension').ele('ext:ExtensionContent');
    return extensions;
  }

  private addUBLExtensions(
    root: any,
    documento: DocumentoElectronico,
    kind: DocumentKind,
    context: DianGenerationContext,
    identity: DocumentIdentity,
  ): void {
    const extensions = this.addSignaturePlaceholder(root);
    const dian = extensions.ele('ext:UBLExtension').ele('ext:ExtensionContent').ele('sts:DianExtensions');
    if (kind === 'Invoice') {
      const auth = context.authorization!;
      const control = dian.ele('sts:InvoiceControl');
      control.ele('sts:InvoiceAuthorization').txt(auth.number);
      const period = control.ele('sts:AuthorizationPeriod');
      period.ele('cbc:StartDate').txt(this.isoDate(auth.validFrom));
      period.ele('cbc:EndDate').txt(this.isoDate(auth.validTo));
      const authorized = control.ele('sts:AuthorizedInvoices');
      const prefix = String(auth.prefix ?? '').trim().toUpperCase();
      if (prefix) authorized.ele('sts:Prefix').txt(prefix);
      authorized.ele('sts:From').txt(String(auth.rangeFrom));
      authorized.ele('sts:To').txt(String(auth.rangeTo));
    }
    dian.ele('sts:InvoiceSource').ele('cbc:IdentificationCode', {
      listAgencyID: '6',
      listAgencyName: 'United Nations Economic Commission for Europe',
      listSchemeURI: 'urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1',
    }).txt('CO');
    const providerIdentity = normalizeDianIdentity(documento.emisor.tipoDocumento || '31', documento.emisor.numeroDocumento);
    const provider = dian.ele('sts:SoftwareProvider');
    provider.ele('sts:ProviderID', {
      schemeAgencyID: '195', schemeAgencyName: DIAN_AGENCY,
      schemeID: providerIdentity.verificationDigit!, schemeName: '31',
    }).txt(providerIdentity.xmlNumber);
    provider.ele('sts:SoftwareID', { schemeAgencyID: '195', schemeAgencyName: DIAN_AGENCY })
      .txt(context.software.id);
    dian.ele('sts:SoftwareSecurityCode', { schemeAgencyID: '195', schemeAgencyName: DIAN_AGENCY })
      .txt(identity.softwareSecurityCode);
    dian.ele('sts:AuthorizationProvider').ele('sts:AuthorizationProviderID', {
      schemeAgencyID: '195', schemeAgencyName: DIAN_AGENCY, schemeID: '4', schemeName: '31',
    }).txt(DIAN_NIT);
    dian.ele('sts:QRCode').txt(identity.qrUrl);
  }

  private addNoteReference(root: any, documento: DocumentoElectronico): void {
    const reference = documento.documentoReferencia;
    const discrepancy = documento.dianDiscrepancy;
    if (!reference) throw new Error('DIAN: la nota requiere documento de referencia');
    if (!discrepancy?.responseCode || !discrepancy.description) {
      throw new Error('DIAN: la nota requiere código y motivo de discrepancia');
    }
    if (!reference.uuid && !this.isExplicitDemoFixture(documento)) {
      throw new Error('DIAN: la nota requiere CUFE/CUDE del documento referenciado');
    }
    const discrepancyNode = root.ele('cac:DiscrepancyResponse');
    discrepancyNode.ele('cbc:ReferenceID').txt(this.referenceId(reference));
    discrepancyNode.ele('cbc:ResponseCode').txt(discrepancy.responseCode);
    discrepancyNode.ele('cbc:Description').txt(discrepancy.description);
    const billing = root.ele('cac:BillingReference').ele('cac:InvoiceDocumentReference');
    billing.ele('cbc:ID').txt(this.referenceId(reference));
    if (reference.uuid) {
      billing.ele('cbc:UUID', {
        schemeName: reference.uuidSchemeName ?? 'CUFE-SHA384',
      }).txt(reference.uuid);
    }
    billing.ele('cbc:IssueDate').txt(this.formatDate(reference.fecha));
    billing.ele('cbc:DocumentTypeCode').txt(this.nonEmpty(reference.tipo, 'tipo de documento referenciado'));
  }

  private referenceId(reference: NonNullable<DocumentoElectronico['documentoReferencia']>): string {
    const number = this.nonEmpty(reference.numero, 'número referenciado');
    const series = String(reference.serie ?? '').trim();
    return series && !number.startsWith(series) ? `${series}${number}` : number;
  }

  private isExplicitDemoFixture(documento: DocumentoElectronico): boolean {
    return documento.fiscalContext?.isDemo === true
      && documento.fiscalContext?.simulated === true
      && Boolean(String(documento.fiscalContext?.fixtureSource ?? '').trim());
  }

  private dianIdentityAttributes(identity: DianIdentity): Record<string, string> {
    return identity.type === '31'
      ? { schemeID: identity.verificationDigit!, schemeName: identity.type, schemeAgencyID: '195' }
      : { schemeName: identity.type, schemeAgencyID: '195' };
  }

  private addEmisor(root: any, documento: DocumentoElectronico): void {
    const identity = normalizeDianIdentity(
      documento.emisor.tipoDocumento || '31',
      documento.emisor.numeroDocumento,
    );
    if (identity.type !== '31') throw new Error('DIAN: el emisor debe identificarse con NIT (31)');
    const contributor = this.required(
      documento, documento.emisor.tipoContribuyente, 'tipo de contribuyente del emisor', '1',
    );
    if (!['1', '2'].includes(contributor)) throw new Error('DIAN: tipo de contribuyente inválido');
    const dane = this.required(
      documento, documento.emisor.codigoUbigeo, 'código DANE del domicilio fiscal', '11001',
    );
    if (!/^\d{5}$/.test(dane)) throw new Error('DIAN: el código DANE debe tener 5 dígitos');
    const city = this.required(documento, documento.emisor.ciudad, 'municipio fiscal', 'Bogotá D.C.');
    const department = this.required(
      documento, documento.emisor.departamento, 'departamento fiscal', 'Bogotá D.C.',
    );
    const departmentCode = this.required(
      documento,
      documento.emisor.codigoDepartamento || dane.slice(0, 2),
      'código de departamento DANE',
      '11',
    );
    if (!/^\d{2}$/.test(departmentCode)) {
      throw new Error('DIAN: el código de departamento debe tener 2 dígitos');
    }
    const addressLine = this.required(
      documento, documento.emisor.direccion, 'dirección fiscal del emisor', 'Carrera 7 # 72-41',
    );
    const name = this.required(
      documento, documento.emisor.razonSocial, 'razón social del emisor', 'EMPRESA DEMO CO S.A.S.',
    );
    const taxLevel = this.required(
      documento, documento.emisor.regimenFiscal, 'responsabilidad fiscal DIAN', 'O-13',
    );
    const supplier = root.ele('cac:AccountingSupplierParty');
    supplier.ele('cbc:AdditionalAccountID').txt(contributor);
    const party = supplier.ele('cac:Party');
    party.ele('cac:PartyIdentification').ele('cbc:ID', this.dianIdentityAttributes(identity))
      .txt(identity.xmlNumber);
    if (documento.emisor.nombreComercial) {
      party.ele('cac:PartyName').ele('cbc:Name').txt(documento.emisor.nombreComercial);
    }
    const address = party.ele('cac:PhysicalLocation').ele('cac:Address');
    address.ele('cbc:ID').txt(dane);
    address.ele('cbc:CityName').txt(city);
    address.ele('cbc:CountrySubentity').txt(department);
    address.ele('cbc:CountrySubentityCode').txt(departmentCode);
    address.ele('cac:AddressLine').ele('cbc:Line').txt(addressLine);
    const country = address.ele('cac:Country');
    country.ele('cbc:IdentificationCode').txt('CO');
    country.ele('cbc:Name', { languageID: 'es' }).txt('Colombia');
    const tax = party.ele('cac:PartyTaxScheme');
    tax.ele('cbc:RegistrationName').txt(name);
    tax.ele('cbc:CompanyID', this.dianIdentityAttributes(identity)).txt(identity.xmlNumber);
    tax.ele('cbc:TaxLevelCode', { listName: '05' }).txt(taxLevel);
    const scheme = tax.ele('cac:TaxScheme');
    scheme.ele('cbc:ID').txt('01');
    scheme.ele('cbc:Name').txt('IVA');
    const legal = party.ele('cac:PartyLegalEntity');
    legal.ele('cbc:RegistrationName').txt(name);
    legal.ele('cbc:CompanyID', this.dianIdentityAttributes(identity)).txt(identity.xmlNumber);
  }

  private addReceptor(root: any, documento: DocumentoElectronico): void {
    const identity = normalizeDianIdentity(
      documento.receptor.tipoDocumento,
      documento.receptor.numeroDocumento,
    );
    const name = this.required(
      documento, documento.receptor.razonSocial, 'nombre o razón social del receptor', 'CLIENTE DEMO CO',
    );
    const receiverTaxProfile = this.receiverTaxProfile(documento);
    if (receiverTaxProfile.profile === 'ADQUIRIENTE_NIT_B2B' && identity.type !== '31') {
      throw new Error('DIAN: el perfil ADQUIRIENTE_NIT_B2B exige documento NIT');
    }
    if (receiverTaxProfile.profile === 'CONSUMIDOR_FINAL' && identity.type === '31') {
      throw new Error('DIAN: un NIT no puede usar el perfil CONSUMIDOR_FINAL');
    }
    const customer = root.ele('cac:AccountingCustomerParty');
    customer.ele('cbc:AdditionalAccountID').txt(identity.type === '31' ? '1' : '2');
    const party = customer.ele('cac:Party');
    party.ele('cac:PartyIdentification').ele('cbc:ID', this.dianIdentityAttributes(identity))
      .txt(identity.xmlNumber);
    const line = String(documento.receptor.direccion ?? '').trim();
    const dane = String(documento.receptor.codigoUbigeo ?? '').trim();
    const city = String(documento.receptor.ciudad ?? '').trim();
    const department = String(documento.receptor.departamento ?? '').trim();
    const hasGeo = Boolean(dane || city || department);
    if (hasGeo && (!/^\d{5}$/.test(dane) || !city || !department)) {
      throw new Error('DIAN: geografía del receptor incompleta');
    }
    if (line || hasGeo) {
      const address = party.ele('cac:PhysicalLocation').ele('cac:Address');
      if (hasGeo) {
        address.ele('cbc:ID').txt(dane);
        address.ele('cbc:CityName').txt(city);
        address.ele('cbc:CountrySubentity').txt(department);
        address.ele('cbc:CountrySubentityCode')
          .txt(String(documento.receptor.codigoDepartamento || dane.slice(0, 2)));
      }
      if (line) address.ele('cac:AddressLine').ele('cbc:Line').txt(line);
      address.ele('cac:Country').ele('cbc:IdentificationCode').txt('CO');
    }
    const tax = party.ele('cac:PartyTaxScheme');
    tax.ele('cbc:RegistrationName').txt(name);
    tax.ele('cbc:CompanyID', this.dianIdentityAttributes(identity)).txt(identity.xmlNumber);
    tax.ele('cbc:TaxLevelCode', { listName: receiverTaxProfile.taxLevelListName })
      .txt(receiverTaxProfile.taxLevelCode);
    const scheme = tax.ele('cac:TaxScheme');
    scheme.ele('cbc:ID').txt(receiverTaxProfile.taxSchemeId);
    scheme.ele('cbc:Name').txt(receiverTaxProfile.taxSchemeName);
    const legal = party.ele('cac:PartyLegalEntity');
    legal.ele('cbc:RegistrationName').txt(name);
    legal.ele('cbc:CompanyID', this.dianIdentityAttributes(identity)).txt(identity.xmlNumber);
  }

  private receiverTaxProfile(documento: DocumentoElectronico): DianReceiverTaxProfile {
    const profile = documento.receptor.dianTaxProfile;
    if (!profile) throw new Error('DIAN: falta perfil tributario del receptor');
    const serialized = [
      profile.taxLevelCode,
      profile.taxLevelListName,
      profile.taxSchemeId,
      profile.taxSchemeName,
    ].join('|');
    if (profile.profile === 'CONSUMIDOR_FINAL' && serialized === 'R-99-PN|49|ZY|No causa') {
      return profile;
    }
    if (profile.profile === 'ADQUIRIENTE_NIT_B2B' && serialized === 'O-99|04|01|IVA') {
      return profile;
    }
    throw new Error('DIAN: perfil tributario del receptor inconsistente');
  }

  private addMediosPago(root: any, documento: DocumentoElectronico): void {
    const raw = this.required(documento, documento.formaPago, 'forma de pago DIAN', 'CONTADO')
      .toUpperCase();
    const form = raw === '1' || raw === 'CONTADO' ? '1'
      : raw === '2' || raw === 'CREDITO' || raw === 'CRÉDITO' ? '2' : '';
    if (!form) throw new Error('DIAN: forma de pago inválida');
    const rawMeans = String(
      this.required(documento, documento.medioPago, 'medio de pago DIAN', form === '2' ? '1' : '10'),
    ).trim().toUpperCase();
    const means = form === '2' && ['2', 'CREDITO', 'CRÉDITO'].includes(rawMeans)
      ? '1'
      : rawMeans;
    if (!/^\d{1,3}$/.test(means) && means !== 'ZZZ') {
      throw new Error('DIAN: medio de pago inválido');
    }
    const payment = root.ele('cac:PaymentMeans');
    payment.ele('cbc:ID').txt(form);
    payment.ele('cbc:PaymentMeansCode').txt(means);
    payment.ele('cbc:PaymentDueDate')
      .txt(this.formatDate(documento.fechaVencimiento || documento.fechaEmision));
  }

  private resolveHeaderTaxes(
    documento: DocumentoElectronico,
    context: DianGenerationContext,
  ): DianTaxInput[] {
    const explicit = this.explicitTaxes((documento as ExtendedDocument).dianTaxes, 'impuestos');
    if (explicit.length) {
      const total = explicit.reduce((sum, tax) => sum + tax.amount, 0);
      if (Math.abs(total - documento.totalImpuestos) > 0.02) {
        throw new Error('DIAN: impuestos detallados no coinciden con totalImpuestos');
      }
      return explicit;
    }
    const seed = context.taxes || { iva: documento.totalImpuestos, inc: 0, ica: 0 };
    const total = Number(seed.iva) + Number(seed.inc) + Number(seed.ica);
    if (Math.abs(total - documento.totalImpuestos) > 0.02) {
      throw new Error('DIAN: IVA + INC + ICA no coincide con totalImpuestos');
    }
    const result: DianTaxInput[] = [];
    const add = (id: string, name: string, amount: number, taxableAmount = documento.subtotal) => {
      if (amount <= 0) return;
      result.push({
        id, name, amount, taxableAmount,
        percent: taxableAmount > 0 ? amount * 100 / taxableAmount : 0,
        categoryCode: '01',
      });
    };
    add('01', 'IVA', Number(seed.iva), Number(documento.totalGravadas ?? documento.subtotal));
    add('04', 'INC', Number(seed.inc));
    add('03', 'ICA', Number(seed.ica));
    if (Number(documento.totalExoneradas ?? 0) > 0) {
      result.push({
        id: '01', name: 'IVA', amount: 0,
        taxableAmount: Number(documento.totalExoneradas), percent: 0, categoryCode: '02',
      });
    }
    // El Anexo FEV 1.9 (FAX01/FAX05) prohíbe informar TaxTotal para bienes
    // excluidos. Su base queda en los totales monetarios, no como IVA cero.
    if (!result.length && Number(documento.totalInafectas ?? 0) <= 0) {
      throw new Error('DIAN: no se pudo determinar la afectación tributaria');
    }
    return result;
  }

  private explicitTaxes(value: DianTaxInput[] | undefined, label: string): DianTaxInput[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length === 0) throw new Error(`DIAN: ${label} inválidos`);
    return value.map((tax) => ({
      id: this.nonEmpty(tax.id, `código de ${label}`),
      name: this.nonEmpty(tax.name, `nombre de ${label}`),
      taxableAmount: this.nonNegative(tax.taxableAmount, `base de ${label}`),
      amount: this.nonNegative(tax.amount, `importe de ${label}`),
      percent: this.nonNegative(tax.percent, `porcentaje de ${label}`),
      categoryCode: tax.categoryCode
        ? this.nonEmpty(tax.categoryCode, 'categoría tributaria') : undefined,
    }));
  }

  private addTaxTotals(root: any, element: string, taxes: DianTaxInput[], currency: string): void {
    const groups = new Map<string, DianTaxInput[]>();
    for (const tax of taxes) {
      const key = `${tax.id}|${tax.name}`;
      groups.set(key, [...(groups.get(key) || []), tax]);
    }
    for (const group of groups.values()) {
      const total = root.ele(element);
      total.ele('cbc:TaxAmount', { currencyID: currency })
        .txt(this.amount(group.reduce((sum, tax) => sum + tax.amount, 0)));
      for (const tax of group) {
        const subtotal = total.ele('cac:TaxSubtotal');
        subtotal.ele('cbc:TaxableAmount', { currencyID: currency })
          .txt(this.amount(tax.taxableAmount));
        subtotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(this.amount(tax.amount));
        const category = subtotal.ele('cac:TaxCategory');
        category.ele('cbc:Percent').txt(this.amount(tax.percent));
        const scheme = category.ele('cac:TaxScheme');
        scheme.ele('cbc:ID').txt(tax.id);
        scheme.ele('cbc:Name').txt(tax.name);
      }
    }
  }

  private resolveAdjustments(documento: DocumentoElectronico): DianAllowanceChargeInput[] {
    const supplied = (documento as ExtendedDocument).dianAllowanceCharges;
    if (supplied) return this.validateAdjustments(supplied);
    if (Number(documento.totalDescuentos ?? 0) <= 0) return [];
    if (!this.isExplicitDemoFixture(documento)) {
      throw new Error('DIAN: el descuento requiere código y motivo explícitos');
    }
    return [{
      chargeIndicator: false,
      amount: Number(documento.totalDescuentos),
      baseAmount: documento.subtotal + Number(documento.totalDescuentos),
      reasonCode: '00',
      reason: 'Descuento de demostración',
    }];
  }

  private validateAdjustments(value: DianAllowanceChargeInput[]): DianAllowanceChargeInput[] {
    if (!Array.isArray(value)) throw new Error('DIAN: cargos/descuentos inválidos');
    return value.map((item) => ({
      chargeIndicator: item.chargeIndicator === true,
      amount: this.nonNegative(item.amount, 'importe de cargo/descuento'),
      baseAmount: item.baseAmount === undefined ? undefined
        : this.nonNegative(item.baseAmount, 'base de cargo/descuento'),
      percent: item.percent === undefined ? undefined
        : this.nonNegative(item.percent, 'porcentaje de cargo/descuento'),
      reasonCode: this.nonEmpty(item.reasonCode, 'código de cargo/descuento'),
      reason: this.nonEmpty(item.reason, 'motivo de cargo/descuento'),
    }));
  }

  private addAllowanceCharges(
    root: any,
    adjustments: DianAllowanceChargeInput[],
    currency: string,
  ): void {
    adjustments.forEach((item, index) => {
      const node = root.ele('cac:AllowanceCharge');
      node.ele('cbc:ID').txt(String(index + 1));
      node.ele('cbc:ChargeIndicator').txt(String(item.chargeIndicator));
      node.ele('cbc:AllowanceChargeReasonCode').txt(item.reasonCode);
      node.ele('cbc:AllowanceChargeReason').txt(item.reason);
      if (item.percent !== undefined) {
        node.ele('cbc:MultiplierFactorNumeric').txt(this.amount(item.percent / 100));
      }
      node.ele('cbc:Amount', { currencyID: currency }).txt(this.amount(item.amount));
      if (item.baseAmount !== undefined) {
        node.ele('cbc:BaseAmount', { currencyID: currency }).txt(this.amount(item.baseAmount));
      }
    });
  }

  private addMonetaryTotal(
    root: any,
    documento: DocumentoElectronico,
    kind: DocumentKind,
    adjustments: DianAllowanceChargeInput[],
    withholdings: DianTaxInput[],
  ): void {
    const tag = kind === 'DebitNote' ? 'cac:RequestedMonetaryTotal' : 'cac:LegalMonetaryTotal';
    const total = root.ele(tag);
    const allowances = adjustments.filter((item) => !item.chargeIndicator)
      .reduce((sum, item) => sum + item.amount, 0);
    const charges = adjustments.filter((item) => item.chargeIndicator)
      .reduce((sum, item) => sum + item.amount, 0);
    const withheld = withholdings.reduce((sum, item) => sum + item.amount, 0);
    const payable = (documento as ExtendedDocument).payableAmount
      ?? documento.importeTotal - withheld;
    total.ele('cbc:LineExtensionAmount', { currencyID: documento.moneda })
      .txt(this.amount(documento.subtotal));
    total.ele('cbc:TaxExclusiveAmount', { currencyID: documento.moneda })
      .txt(this.amount(documento.subtotal));
    total.ele('cbc:TaxInclusiveAmount', { currencyID: documento.moneda })
      .txt(this.amount(documento.importeTotal));
    if (allowances > 0) {
      total.ele('cbc:AllowanceTotalAmount', { currencyID: documento.moneda })
        .txt(this.amount(allowances));
    }
    if (charges > 0) {
      total.ele('cbc:ChargeTotalAmount', { currencyID: documento.moneda })
        .txt(this.amount(charges));
    }
    total.ele('cbc:PayableAmount', { currencyID: documento.moneda }).txt(this.amount(payable));
  }

  private addItems(
    root: any,
    documento: DocumentoElectronico,
    kind: DocumentKind,
    headerTaxes: DianTaxInput[],
  ): void {
    const positiveSchemes = new Set(headerTaxes.filter((tax) => tax.amount > 0).map((tax) => tax.id));
    documento.items.forEach((raw, index) => {
      const item = raw as ExtendedItem;
      const explicit = this.explicitTaxes(item.dianTaxes, `impuestos del ítem ${index + 1}`);
      if (!explicit.length && positiveSchemes.size > 1) {
        throw new Error(`DIAN: el ítem ${index + 1} requiere desglose de impuestos múltiples`);
      }
      const taxes = explicit.length ? explicit : this.inferItemTax(documento, item, index);
      const lineTag = kind === 'Invoice' ? 'cac:InvoiceLine'
        : kind === 'CreditNote' ? 'cac:CreditNoteLine' : 'cac:DebitNoteLine';
      const quantityTag = kind === 'Invoice' ? 'cbc:InvoicedQuantity'
        : kind === 'CreditNote' ? 'cbc:CreditedQuantity' : 'cbc:DebitedQuantity';
      const line = root.ele(lineTag);
      line.ele('cbc:ID').txt(String(index + 1));
      line.ele(quantityTag, { unitCode: item.unidadMedida || 'NIU' })
        .txt(this.amount(item.cantidad));
      line.ele('cbc:LineExtensionAmount', { currencyID: documento.moneda })
        .txt(this.amount(item.valorVenta));
      this.addAllowanceCharges(
        line,
        this.validateAdjustments(item.dianAllowanceCharges || []),
        documento.moneda,
      );
      if (taxes.length) this.addTaxTotals(line, 'cac:TaxTotal', taxes, documento.moneda);
      const itemNode = line.ele('cac:Item');
      itemNode.ele('cbc:Description')
        .txt(this.nonEmpty(item.descripcion, `descripción del ítem ${index + 1}`));
      if (item.codigoProducto) {
        itemNode.ele('cac:SellersItemIdentification').ele('cbc:ID').txt(item.codigoProducto);
      }
      const price = line.ele('cac:Price');
      price.ele('cbc:PriceAmount', { currencyID: documento.moneda })
        .txt(this.amount(item.precioUnitario));
      price.ele('cbc:BaseQuantity', { unitCode: item.unidadMedida || 'NIU' }).txt('1.00');
    });
  }

  private inferItemTax(
    documento: DocumentoElectronico,
    item: ExtendedItem,
    index: number,
  ): DianTaxInput[] {
    const amount = Number(item.igv ?? 0);
    const rate = Number(item.tasaIgv ?? (item.valorVenta > 0 ? amount / item.valorVenta : 0)) * 100;
    if (amount > 0) {
      return [{
        id: '01', name: 'IVA', taxableAmount: item.valorVenta,
        amount, percent: rate, categoryCode: '01',
      }];
    }
    let category = item.dianTaxCategory;
    if (!category) {
      const exempt = Number(documento.totalExoneradas ?? 0) > 0;
      const excluded = Number(documento.totalInafectas ?? 0) > 0;
      if (exempt === excluded) {
        throw new Error(`DIAN: no se puede inferir si el ítem ${index + 1} es exento o excluido`);
      }
      category = exempt ? 'EXENTO' : 'EXCLUIDO';
    }
    if (category === 'EXCLUIDO') return [];
    const categoryCode = category === 'GRAVADO' ? '01' : '02';
    return [{
      id: '01', name: 'IVA', taxableAmount: item.valorVenta,
      amount: 0, percent: 0, categoryCode,
    }];
  }

  private addApplicationResponseParty(
    root: any,
    tag: string,
    identity: DianIdentity,
    name: string,
  ): void {
    const party = root.ele(tag).ele('cac:PartyTaxScheme');
    party.ele('cbc:RegistrationName').txt(this.nonEmpty(name, 'nombre de parte'));
    party.ele('cbc:CompanyID', this.dianIdentityAttributes(identity)).txt(identity.xmlNumber);
    const scheme = party.ele('cac:TaxScheme');
    scheme.ele('cbc:ID').txt('01');
    scheme.ele('cbc:Name').txt('IVA');
  }

  private addAttachedParty(
    root: any,
    tag: string,
    source: DocumentoElectronico['emisor'] | DocumentoElectronico['receptor'],
  ): void {
    const identity = normalizeDianIdentity(source.tipoDocumento, source.numeroDocumento);
    const party = root.ele(tag).ele('cac:PartyTaxScheme');
    party.ele('cbc:RegistrationName').txt(this.nonEmpty(source.razonSocial, 'nombre de parte'));
    party.ele('cbc:CompanyID', this.dianIdentityAttributes(identity)).txt(identity.xmlNumber);
    const scheme = party.ele('cac:TaxScheme');
    scheme.ele('cbc:ID').txt('01');
    scheme.ele('cbc:Name').txt('IVA');
  }

  private required(
    documento: DocumentoElectronico,
    value: unknown,
    label: string,
    demoFixture?: string,
  ): string {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
    if (demoFixture !== undefined && this.isExplicitDemoFixture(documento)) return demoFixture;
    throw new Error(`DIAN: falta ${label}`);
  }

  private nonEmpty(value: unknown, label: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new Error(`DIAN: falta ${label}`);
    return normalized;
  }

  private nonNegative(value: unknown, label: string): number {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(`DIAN: ${label} debe ser un número no negativo`);
    }
    return number;
  }

  private integerDocumentNumber(value: unknown): number {
    const normalized = this.nonEmpty(value, 'número de documento');
    if (!/^\d+$/.test(normalized)) throw new Error('DIAN: el consecutivo debe ser numérico');
    const number = Number(normalized);
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error('DIAN: consecutivo inválido');
    return number;
  }

  private currency(value: unknown): string {
    const currency = this.nonEmpty(value, 'moneda').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('DIAN: moneda inválida');
    return currency;
  }

  private formatDate(value: Date | string): string {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      return this.isoDate(value);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('DIAN: fecha de emisión inválida');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private formatTime(value: Date | string): string {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      return '00:00:00-05:00';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('DIAN: hora de emisión inválida');
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
    return `${part('hour')}:${part('minute')}:${part('second')}-05:00`;
  }

  private isoDate(value: string): string {
    const normalized = String(value ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)
        || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
      throw new Error('DIAN: fecha ISO inválida');
    }
    return normalized;
  }

  private isoTime(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!/^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
      throw new Error('DIAN: hora ISO debe incluir zona horaria');
    }
    return normalized;
  }

  private amount(value: number): string {
    return formatDianAmount(value);
  }

  private xmlText(xml: string, localName: string): string {
    const pattern = new RegExp(
      `<(?:\\w+:)?${localName}(?:\\s[^>]*)?>([^<]+)</(?:\\w+:)?${localName}>`,
      'u',
    );
    return pattern.exec(xml)?.[1]?.trim() || '';
  }
}
