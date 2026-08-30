import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { FiscalServiceAbstract } from '../../shared/integration/fiscal-service.abstract';
import { 
  FiscalConfig, 
  FiscalResponse, 
  DocumentoElectronico, 
  DianGenerationContext,
  ValidacionDocumento,
  ConsultaEstado,
  LibroContableFiscal 
} from '../../shared/integration/fiscal.interfaces';
import {
  DianApplicationResponseInput,
  DianXmlBuilderService,
} from './colombia/dian-xml-builder.service';
import {
  DianSignerService,
  type DianAuthorityTrustConfig,
} from './colombia/dian-signer.service';
import {
  DianApiClientService,
  DianConfig,
  DianConsultaResponse,
  DianEnvioResponse,
  DianEventStatusResponse,
  DianXmlByDocumentKeyResponse,
} from './colombia/dian-api-client.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { decryptBuffer, decryptText } from '../../shared/utils/secure-config.utils';
import { parseColombiaNit } from '../paises/initial-country';
import { hasCurrentDianPortalApproval } from './colombia/dian-habilitation-evidence.util';

interface TenantDianSnapshot {
  isDemo: boolean;
  resolutionNumber?: string;
  resolutionPrefix?: string;
  rangeFrom?: number;
  rangeTo?: number;
  validFrom?: string;
  validTo?: string;
}

interface TenantDianRuntime {
  fiscalConfig: FiscalConfig;
  dianConfig: DianConfig;
  dianActive: boolean;
  externalApprovalValidated: boolean;
  certificateBuffer?: Buffer;
  snapshot?: TenantDianSnapshot;
}

export type DianEventCode = '030' | '031' | '032' | '033' | '034';

export interface DianEventPreparationInput {
  id: string;
  issueDate: string;
  issueTime: string;
  responseCode: DianEventCode;
  responseDescription: string;
  referencedDocumentId: string;
  referencedDocumentTypeCode: '01';
  referencedDocumentUuid: string;
  sender: { type: string; number: string; name: string };
  receiver: { type: string; number: string; name: string };
  responsiblePerson?: {
    identityType: string;
    identityNumber: string;
    firstName: string;
    familyName: string;
    jobTitle: string;
    organizationDepartment: string;
  };
  claimReason?: { listId: '01' | '02' | '03' | '04'; name: string };
  swornStatement?: string;
}

export interface PreparedDianEvent {
  signedApplicationResponse: string;
  eventCude: string;
  xmlSha256: string;
}

export interface DianEventPackageContext {
  packageYear: number;
  packageSequence: number;
  providerCode: string;
}

export interface DianReceivedInvoiceAuthority {
  status: DianConsultaResponse;
  document: DianXmlByDocumentKeyResponse;
}

@Injectable()
export class DianFiscalService extends FiscalServiceAbstract {
  private readonly defaultConfig: FiscalConfig;
  private readonly defaultDianConfig: DianConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly xmlBuilder: DianXmlBuilderService,
    private readonly signer: DianSignerService,
    private readonly apiClient: DianApiClientService,
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService
  ) {
    const config: FiscalConfig = {
      url: configService.get('DIAN_URL') || 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      usuario: configService.get('DIAN_USUARIO') || '',
      password: configService.get('DIAN_PASSWORD') || '',
      empresaId: configService.get('EMPRESA_NIT') || '',
      certificatePath: configService.get('DIAN_CERTIFICATE_PATH') || '/certificates/dian.p12',
      certificatePassword: configService.get('DIAN_CERTIFICATE_PASSWORD') || '',
      environment: configService.get('DIAN_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion',
      pais: 'CO'
    };
    
    super(config);
    this.defaultConfig = { ...config };

    const authorityCaBundlePem = String(
      configService.get('DIAN_AUTHORITY_CA_BUNDLE_PEM') ?? '',
    ).trim();
    const authorityCaBundlePath = String(
      configService.get('DIAN_AUTHORITY_CA_BUNDLE_PATH') ?? '',
    ).trim();
    const authoritySpkiPins = String(
      configService.get('DIAN_AUTHORITY_SPKI_SHA256') ?? '',
    ).split(',').map((pin) => pin.trim().toLowerCase()).filter(Boolean);
    const authorityTrust: DianAuthorityTrustConfig | undefined =
      (authorityCaBundlePem ? 1 : 0) + (authorityCaBundlePath ? 1 : 0) === 1
      && authoritySpkiPins.length > 0
        ? {
            ...(authorityCaBundlePem
              ? { caBundlePem: authorityCaBundlePem }
              : { caBundlePath: authorityCaBundlePath }),
            allowedSpkiSha256: authoritySpkiPins,
          }
        : undefined;

    // Configurar cliente DIAN
    const dianConfig: DianConfig = {
      url: config.url,
      environment: config.environment === 'produccion' ? 'produccion' : 'habilitacion',
      nit: config.empresaId,
      softwareId: configService.get('DIAN_SOFTWARE_ID') || '',
      softwarePin: configService.get('DIAN_SOFTWARE_PIN') || '',
      testSetId: configService.get('DIAN_TEST_SET_ID'),
      authorityTrust,
    };
    this.defaultDianConfig = { ...dianConfig };
  }

  async enviarDocumento(documento: DocumentoElectronico): Promise<FiscalResponse> {
    let deliveryStage: 'PREFLIGHT' | 'SEALED' | 'EXTERNAL_IO' = 'PREFLIGHT';
    let sealed = false;
    let ioAttempted = false;
    try {
      const runtime = await this.loadTenantConfig();
      if (runtime.snapshot?.isDemo === true) {
        throw new Error('DIAN_DEMO_EXTERNAL_TRANSPORT_BLOCKED');
      }
      if (!runtime.dianActive) {
        throw new Error('DIAN_DISABLED');
      }
      this.assertRuntimeReadyForTransmission(runtime);
      if (runtime.dianConfig.environment === 'produccion'
          && !runtime.externalApprovalValidated) {
        throw new Error('DIAN_TEST_SET_APPROVAL_EVIDENCE_REQUIRED');
      }
      this.logOperation('Enviando documento a DIAN', { 
        tipo: documento.tipoDocumento, 
        numero: `${documento.serie}-${documento.numero}` 
      });

      // 1. Reservar el nombre ZIP en la misma operación SEND antes de leer el
      // rango. La reserva es atómica e idempotente por operation_id.
      const dianConfig = await this.reservarPaqueteDian(documento, runtime.dianConfig);

      // 2. Sellar el contexto desde configuración/DIAN y generar el UBL.
      const preparedDocument = await this.prepararDocumentoDian(documento, runtime);
      const xmlContent = await this.generarXmlPreparado(preparedDocument);
      
      // 3. Firmar y persistir la evidencia exacta antes del I/O externo.
      const xmlSigned = await this.firmarXmlWithRuntime(xmlContent, runtime);
      const expectedDianUniqueCode = this.xmlText(xmlSigned, 'UUID').trim().toUpperCase();
      if (!/^[0-9A-F]{96}$/.test(expectedDianUniqueCode)) {
        throw new Error('DIAN_SEALED_DOCUMENT_UUID_INVALID');
      }
      await this.sellarEnvioDian(preparedDocument, xmlSigned);
      sealed = true;
      deliveryStage = 'SEALED';
      
      // 4. Enviar el XML firmado. AttachedDocument se construye únicamente
      // cuando exista un ApplicationResponse real devuelto por DIAN.
      ioAttempted = true;
      deliveryStage = 'EXTERNAL_IO';
      const dianResponse = await this.apiClient.enviarDocumento(
        xmlSigned,
        '',
        dianConfig
      );

      if (dianResponse.pending) {
        return {
          success: true,
          codigoRespuesta: dianResponse.statusCode,
          descripcionRespuesta: dianResponse.statusDescription,
          hash: dianResponse.trackId,
          metadata: {
            pending: true,
            trackId: dianResponse.trackId,
            authorityResponse: dianResponse.authorityResponse === true,
            technical: dianResponse.technical === true,
            // La recepción del ZIP no equivale a aceptación fiscal.
            uncertain: true,
            dianDeliveryStage: deliveryStage,
            dianSealed: sealed,
            dianIoAttempted: ioAttempted,
            expectedDianUniqueCode,
            authorityStatusCode: dianResponse.statusCode,
            authorityDocumentKey: dianResponse.cufe,
            authoritySignatureTrusted: dianResponse.authoritySignatureTrusted === true,
          },
        };
      }

      const acceptedEvidence = dianResponse.success
        && dianResponse.statusCode === '00'
        && dianResponse.authoritySignatureTrusted === true
        && String(dianResponse.cufe ?? '').trim().toUpperCase() === expectedDianUniqueCode
        && dianResponse.applicationResponseEvidence?.referencedDocumentKeys
          .includes(expectedDianUniqueCode) === true
        && dianResponse.applicationResponseEvidence.responseCodes.length === 1
        && dianResponse.applicationResponseEvidence.responseCodes[0] === '02';
      if (dianResponse.success && !acceptedEvidence) {
        return {
          success: false,
          codigoRespuesta: 'DIAN_SYNC_ACCEPTANCE_EVIDENCE_INVALID',
          descripcionRespuesta: 'La respuesta DIAN no coincide con el CUFE sellado o carece de firma de autoridad confiable.',
          errores: ['DIAN_SYNC_ACCEPTANCE_EVIDENCE_INVALID'],
          metadata: {
            authorityResponse: false,
            technical: true,
            uncertain: true,
            dianDeliveryStage: deliveryStage,
            dianSealed: sealed,
            dianIoAttempted: ioAttempted,
            expectedDianUniqueCode,
            authorityStatusCode: dianResponse.statusCode,
            authorityDocumentKey: dianResponse.cufe,
            authoritySignatureTrusted: dianResponse.authoritySignatureTrusted === true,
            applicationResponseEvidence: dianResponse.applicationResponseEvidence,
          },
        };
      }

      if (acceptedEvidence) {
        const applicationResponse = String(dianResponse.xmlResponse ?? '').trim();
        const attachedDocument = await this.firmarXmlWithRuntime(
          this.xmlBuilder.generarAttachedDocument(
            preparedDocument,
            xmlSigned,
            applicationResponse,
          ),
          runtime,
        );
        const documentKey = String(dianResponse.cufe).trim().toUpperCase();
        this.logSuccess('Documento aceptado por DIAN', { 
          cufe: documentKey,
          documento: `${documento.serie}-${documento.numero}` 
        });

        return {
          success: true,
          codigoRespuesta: dianResponse.statusCode,
          descripcionRespuesta: dianResponse.statusDescription,
          cdr: attachedDocument || dianResponse.xmlResponse,
          hash: documentKey,
          metadata: {
            cufe: documentKey,
            qrCode: dianResponse.qrCode || this.xmlText(xmlSigned, 'QRCode'),
            applicationResponse: applicationResponse || undefined,
            attachedDocument,
            dianDeliveryStage: deliveryStage,
            dianSealed: sealed,
            dianIoAttempted: ioAttempted,
            authorityStatusCode: dianResponse.statusCode,
            authorityDocumentKey: documentKey,
            expectedDianUniqueCode,
            authoritySignatureTrusted: true,
            applicationResponseEvidence: dianResponse.applicationResponseEvidence,
            authorityResponse: true,
            technical: false,
            uncertain: false,
          }
        };
      } else {
        const applicationResponse = String(dianResponse.xmlResponse ?? '').trim();
        const authoritativeRejection = dianResponse.authorityResponse === true
          && dianResponse.technical !== true
          && dianResponse.uncertain !== true
          && ['66', '90', '99'].includes(dianResponse.statusCode)
          && dianResponse.authoritySignatureTrusted === true
          && String(dianResponse.cufe ?? '').trim().toUpperCase() === expectedDianUniqueCode
          && dianResponse.applicationResponseEvidence?.referencedDocumentKeys
            .includes(expectedDianUniqueCode) === true
          && dianResponse.applicationResponseEvidence.responseCodes.length === 1
          && dianResponse.applicationResponseEvidence.responseCodes[0] === '04';
        this.logError('Documento rechazado por DIAN', dianResponse.errors);
        return {
          success: false,
          codigoRespuesta: authoritativeRejection
            ? dianResponse.statusCode
            : 'DIAN_REJECTION_EVIDENCE_INVALID',
          descripcionRespuesta: authoritativeRejection
            ? dianResponse.statusDescription
            : `${dianResponse.statusDescription} (resultado técnico o evidencia fiscal incompleta)`,
          ...(authoritativeRejection ? { cdr: applicationResponse } : {}),
          errores: dianResponse.errors,
          metadata: {
            ...(authoritativeRejection ? { applicationResponse } : {}),
            authorityResponse: authoritativeRejection,
            technical: !authoritativeRejection,
            uncertain: !authoritativeRejection,
            dianDeliveryStage: deliveryStage,
            dianSealed: sealed,
            dianIoAttempted: ioAttempted,
            expectedDianUniqueCode,
            authorityStatusCode: dianResponse.statusCode,
            authorityDocumentKey: dianResponse.cufe,
            authoritySignatureTrusted: dianResponse.authoritySignatureTrusted === true,
            applicationResponseEvidence: dianResponse.applicationResponseEvidence,
          },
        };
      }
    } catch (error) {
      this.logError('enviarDocumento', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error técnico: ${error.message}`,
        errores: [error.message],
        metadata: {
          authorityResponse: false,
          technical: true,
          uncertain: ioAttempted,
          dianDeliveryStage: deliveryStage,
          dianSealed: sealed,
          dianIoAttempted: ioAttempted,
        },
      };
    }
  }

  async consultarEstado(consulta: ConsultaEstado): Promise<FiscalResponse> {
    try {
      const runtime = await this.loadTenantConfig();
      if (runtime.snapshot?.isDemo === true) {
        throw new Error('DIAN_DEMO_EXTERNAL_TRANSPORT_BLOCKED');
      }
      if (!runtime.dianActive) {
        throw new Error('DIAN_DISABLED');
      }
      this.assertRuntimeReadyForTransmission(runtime);
      this.logOperation('Consultando estado en DIAN', consulta);
      
      // Consultar por CUFE (hash del documento)
      const cufe = consulta.hash || consulta.numeroDocumento;
      
      if (!cufe) {
        return {
          success: false,
          codigoRespuesta: '99',
          descripcionRespuesta: 'CUFE no proporcionado para consulta'
        };
      }

      const dianQueryKind = consulta.dianQueryKind ?? 'CUFE_CUDE';
      const dianResponse = dianQueryKind === 'ZIP_TRACK_ID'
        ? await this.apiClient.consultarEstadoZip(cufe, runtime.dianConfig)
        : await this.apiClient.consultarEstado(cufe, runtime.dianConfig);

      if (dianResponse.estado === 'NO_ENCONTRADO') {
        return {
          success: false,
          codigoRespuesta: 'DIAN_NOT_FOUND',
          descripcionRespuesta: dianResponse.descripcion,
          metadata: {
            status: 'NOT_FOUND',
            explicitNotFound: dianResponse.explicitNotFound === true,
            authorityStatusCode: dianResponse.authorityStatusCode,
            authorityDocumentKey: dianResponse.cufe,
            expectedDianUniqueCode: dianQueryKind === 'CUFE_CUDE'
              ? String(cufe).trim().toUpperCase() : undefined,
            authoritySignatureTrusted: dianResponse.authoritySignatureTrusted === true,
            applicationResponseEvidence: dianResponse.applicationResponseEvidence,
            transportCode: dianResponse.transportCode,
            uncertain: dianResponse.uncertain === true,
            authorityResponse: dianResponse.authorityResponse === true,
            technical: dianResponse.technical === true,
            dianQueryKind,
            dianQueryKey: cufe,
          },
        };
      }

      return {
        success: dianResponse.success,
        codigoRespuesta: dianResponse.estado === 'ACEPTADO'
          ? '00'
          : dianResponse.estado === 'PENDIENTE'
            ? 'DIAN_PENDING'
            : 'DIAN_REJECTED',
        descripcionRespuesta: dianResponse.descripcion,
        ...(dianResponse.authorityResponse === true && dianResponse.xmlResponse
          ? { cdr: dianResponse.xmlResponse } : {}),
        metadata: {
          estado: dianResponse.estado,
          cufe: dianResponse.cufe,
          fechaProcesamiento: dianResponse.fechaProcesamiento,
          authorityStatusCode: dianResponse.authorityStatusCode,
          authorityDocumentKey: dianResponse.cufe,
          expectedDianUniqueCode: dianQueryKind === 'CUFE_CUDE'
            ? String(cufe).trim().toUpperCase() : undefined,
          authoritySignatureTrusted: dianResponse.authoritySignatureTrusted === true,
          applicationResponseEvidence: dianResponse.applicationResponseEvidence,
          transportCode: dianResponse.transportCode,
          uncertain: dianResponse.uncertain === true,
          authorityResponse: dianResponse.authorityResponse === true,
          technical: dianResponse.technical === true,
          ...(dianResponse.authorityResponse === true && dianResponse.xmlResponse
            ? { applicationResponse: dianResponse.xmlResponse } : {}),
          dianQueryKind,
          dianQueryKey: cufe,
        }
      };
    } catch (error) {
      this.logError('consultarEstado', error);
      return {
        success: false,
        codigoRespuesta: '99',
        descripcionRespuesta: `Error consultando estado: ${error.message}`
      };
    }
  }

  async validarDocumento(documento: DocumentoElectronico): Promise<ValidacionDocumento> {
    const runtime = await this.loadTenantConfig();
    const errores: string[] = [];
    const advertencias: string[] = [];

    // Validaciones específicas de DIAN Colombia
    if (!parseColombiaNit(documento.emisor.numeroDocumento)) {
      errores.push('NIT del emisor inválido o sin dígito de verificación válido');
    }

    if (documento.moneda !== 'COP' && documento.moneda !== 'USD') {
      errores.push('Moneda debe ser COP o USD');
    }

    // Validación de rangos autorizados por DIAN
    if (documento.tipoDocumento === '01' && !(await this.validarRangoAutorizado(
      documento.serie,
      documento.numero,
      runtime.dianConfig,
    ))) {
      errores.push('Número de factura fuera del rango autorizado por DIAN');
    }

    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      numeroDocumento: `${documento.serie}-${documento.numero}`,
      tipoDocumento: documento.tipoDocumento
    };
  }

  async generarXML(documento: DocumentoElectronico): Promise<string> {
    const runtime = await this.loadTenantConfig();
    const prepared = await this.prepararDocumentoDian(documento, runtime);
    return this.generarXmlPreparado(prepared);
  }

  private async generarXmlPreparado(documento: DocumentoElectronico): Promise<string> {
    switch (documento.tipoDocumento) {
      case '01': // Factura de Venta
        return await this.xmlBuilder.generarFacturaElectronica(documento);
      
      case '91': // Nota Crédito
        return await this.xmlBuilder.generarNotaCredito(documento);
      
      case '92': // Nota Débito
        return await this.xmlBuilder.generarNotaDebito(documento);
      
      default:
        throw new Error(`Tipo de documento no soportado: ${documento.tipoDocumento}`);
    }
  }

  async firmarXML(xmlContent: string): Promise<string> {
    const runtime = await this.loadTenantConfig();
    return this.firmarXmlWithRuntime(xmlContent, runtime);
  }

  /**
   * Construye y firma el ApplicationResponse usando únicamente secretos del
   * tenant actual. Sender/receiver provienen del snapshot atómico de la
   * operación EVENT; el llamador no puede inyectar software/PIN/ambiente.
   */
  async prepararEventoDian(
    input: DianEventPreparationInput,
    tenantId: string,
  ): Promise<PreparedDianEvent> {
    const runtime = await this.loadTenantConfig(tenantId);
    this.assertEventRuntimeReady(runtime);

    const senderTaxId = this.identityDigits(input.sender.number);
    const tenantTaxId = this.identityDigits(runtime.dianConfig.nit);
    if (!senderTaxId || senderTaxId !== tenantTaxId) {
      throw new Error('DIAN_EVENT_SENDER_TENANT_MISMATCH');
    }
    if (!/^[0-9a-f]{96}$/i.test(String(input.referencedDocumentUuid ?? '').trim())) {
      throw new Error('DIAN_EVENT_REFERENCED_CUFE_INVALID');
    }
    if (input.responseCode === '034') {
      const receiver = this.identityDigits(input.receiver.number);
      if (receiver !== '8001972684' || !String(input.swornStatement ?? '').trim()) {
        throw new Error('DIAN_EVENT_034_DECLARATION_INVALID');
      }
    }

    const applicationResponse: DianApplicationResponseInput = {
      ...input,
      environmentId: runtime.dianConfig.environment === 'produccion' ? '1' : '2',
      softwareId: runtime.dianConfig.softwareId,
      softwarePin: runtime.dianConfig.softwarePin,
      issuerPerson: input.responsiblePerson
        ? {
            identity: {
              type: input.responsiblePerson.identityType,
              number: input.responsiblePerson.identityNumber,
            },
            firstName: input.responsiblePerson.firstName,
            familyName: input.responsiblePerson.familyName,
            jobTitle: input.responsiblePerson.jobTitle,
            organizationDepartment: input.responsiblePerson.organizationDepartment,
          }
        : undefined,
      claimReason: input.claimReason,
      swornStatement: input.swornStatement,
    };
    const xml = this.xmlBuilder.generarApplicationResponse(applicationResponse);
    const signedApplicationResponse = await this.signer.firmarXML(xml, {
      certificatePath: runtime.fiscalConfig.certificatePath,
      certificateBuffer: runtime.certificateBuffer,
      certificatePassword: runtime.fiscalConfig.certificatePassword,
      signatureId: `xmldsig-dian-event-${input.id}`,
      // RADIAN usa literalmente supplier en los XML oficiales de eventos;
      // SenderParty sigue expresando por separado adquirente/facturador.
      signerRole: 'supplier',
    });
    const eventCude = this.xmlText(signedApplicationResponse, 'UUID').toUpperCase();
    if (!/^[0-9A-F]{96}$/.test(eventCude)) {
      throw new Error('DIAN_EVENT_CUDE_INVALID');
    }
    return {
      signedApplicationResponse,
      eventCude,
      xmlSha256: createHash('sha256')
        .update(signedApplicationResponse, 'utf8')
        .digest('hex'),
    };
  }

  /** Envía exactamente el XML sellado; nunca vuelve a construirlo. */
  async enviarEventoDianFirmado(
    signedApplicationResponse: string,
    expectedCude: string,
    tenantId: string,
    packageContext: DianEventPackageContext,
  ): Promise<DianEnvioResponse> {
    const runtime = await this.loadTenantConfig(tenantId);
    this.assertEventRuntimeReady(runtime);
    const actualCude = this.xmlText(signedApplicationResponse, 'UUID').toUpperCase();
    if (!/^[0-9A-F]{96}$/.test(actualCude)
        || actualCude !== String(expectedCude ?? '').trim().toUpperCase()) {
      throw new Error('DIAN_EVENT_SEALED_XML_CUDE_MISMATCH');
    }
    if (!Number.isSafeInteger(packageContext.packageYear)
        || packageContext.packageYear < 2000 || packageContext.packageYear > 9999
        || !Number.isSafeInteger(packageContext.packageSequence)
        || packageContext.packageSequence < 1 || packageContext.packageSequence > 0xffffffff
        || !/^\d{3}$/.test(String(packageContext.providerCode ?? '').trim())) {
      throw new Error('DIAN_EVENT_PACKAGE_RESERVATION_INVALID');
    }
    return this.apiClient.enviarEventoXml(signedApplicationResponse, {
      ...runtime.dianConfig,
      packageYear: packageContext.packageYear,
      packageSequence: packageContext.packageSequence,
      providerCode: String(packageContext.providerCode).trim(),
    });
  }

  async consultarEventosFacturaDian(
    invoiceCufe: string,
    tenantId: string,
  ): Promise<DianEventStatusResponse> {
    const runtime = await this.loadTenantConfig(tenantId);
    this.assertEventRuntimeReady(runtime);
    return this.apiClient.consultarEventosFactura(invoiceCufe, runtime.dianConfig);
  }

  /** GetStatus + GetXmlByDocumentKey bajo el mismo runtime/PFX tenant-scoped. */
  async consultarFacturaRecibidaDian(
    invoiceCufe: string,
    tenantId: string,
  ): Promise<DianReceivedInvoiceAuthority> {
    const runtime = await this.loadTenantConfig(tenantId);
    this.assertEventRuntimeReady(runtime);
    const status = await this.apiClient.consultarEstado(invoiceCufe, runtime.dianConfig);
    if (!status.success || status.estado !== 'ACEPTADO'
        || status.authorityStatusCode !== '00'
        || String(status.cufe ?? '').trim().toUpperCase()
          !== String(invoiceCufe ?? '').trim().toUpperCase()
        || !status.xmlResponse
        || status.authoritySignatureTrusted !== true) {
      throw new Error('DIAN_RECEIVED_INVOICE_NOT_ACCEPTED');
    }
    const document = await this.apiClient.consultarXmlPorClave(invoiceCufe, runtime.dianConfig);
    if (!document.usable) {
      throw new Error(`DIAN_RECEIVED_INVOICE_XML_UNAVAILABLE:${document.code}`);
    }
    return { status, document };
  }

  /** Consulta autoritativa usada antes de todo reintento de resultado incierto. */
  async consultarEventoDian(
    eventCude: string,
    tenantId: string,
  ): Promise<DianConsultaResponse> {
    const runtime = await this.loadTenantConfig(tenantId);
    this.assertEventRuntimeReady(runtime);
    if (!/^[0-9a-f]{96}$/i.test(String(eventCude ?? '').trim())) {
      throw new Error('DIAN_EVENT_CUDE_INVALID');
    }
    const status = await this.apiClient.consultarEstado(eventCude, runtime.dianConfig);
    if (status.success && (
      status.estado !== 'ACEPTADO'
      || status.authorityStatusCode !== '00'
      || String(status.cufe ?? '').trim().toUpperCase()
        !== String(eventCude).trim().toUpperCase()
      || !status.xmlResponse
      || status.authoritySignatureTrusted !== true
    )) {
      throw new Error('DIAN_EVENT_STATUS_ACCEPTANCE_EVIDENCE_INVALID');
    }
    return status;
  }

  private async firmarXmlWithRuntime(
    xmlContent: string,
    runtime: TenantDianRuntime,
  ): Promise<string> {
    return await this.signer.firmarXML(xmlContent, {
      certificatePath: runtime.fiscalConfig.certificatePath,
      certificateBuffer: runtime.certificateBuffer,
      certificatePassword: runtime.fiscalConfig.certificatePassword,
      signatureId: 'xmldsig-dian-signature'
    });
  }

  async enviarLibroContable(libro: LibroContableFiscal): Promise<FiscalResponse> {
    this.logOperation('Libro contable DIAN no soportado', {
      periodo: libro.periodo,
      tipo: libro.tipoLibro,
    });
    return {
      success: false,
      codigoRespuesta: 'NO_SOPORTADO',
      descripcionRespuesta: 'DIAN no expone este flujo como envío genérico de libro contable.',
      errores: ['Operación no implementada: no se simuló una aceptación DIAN.'],
    };
  }

  // ========== MÉTODOS PRIVADOS ==========

  private deliveryClaim(documento: DocumentoElectronico): NonNullable<
    NonNullable<DocumentoElectronico['fiscalContext']>['deliveryOperation']
  > {
    const claim = documento.fiscalContext?.deliveryOperation;
    if (!claim?.tenantId || !claim.operationId || !claim.claimToken) {
      throw new Error('DIAN: falta claim SEND para reservar y sellar el envío');
    }
    return claim;
  }

  private assertRuntimeReadyForTransmission(runtime: TenantDianRuntime): void {
    const missing: string[] = [];
    if (!parseColombiaNit(runtime.dianConfig.nit)) missing.push('nit');
    if (!String(runtime.dianConfig.softwareId ?? '').trim()) missing.push('software_id');
    if (!String(runtime.dianConfig.softwarePin ?? '').trim()) missing.push('software_pin');
    if (!String(runtime.dianConfig.testSetId ?? '').trim()) missing.push('test_set_id');
    if (!Buffer.isBuffer(runtime.certificateBuffer) || runtime.certificateBuffer.length === 0) {
      missing.push('certificate_pfx');
    }
    const authorityTrust = this.authorityTrustReadiness(runtime.dianConfig);
    if (!authorityTrust.bundleConfigured) missing.push('authority_trust_bundle');
    if (!authorityTrust.pinsConfigured) missing.push('authority_trust_spki_pins');
    if (missing.length > 0) {
      throw new Error(`DIAN_TENANT_CONFIGURATION_INCOMPLETE:${missing.join(',')}`);
    }
  }

  private authorityTrustReadiness(dianConfig: DianConfig): {
    bundleConfigured: boolean;
    bundleSource: 'PEM' | 'PATH' | 'MISSING' | 'AMBIGUOUS';
    pinsConfigured: boolean;
    spkiPinCount: number;
    ready: boolean;
  } {
    const trust = dianConfig.authorityTrust;
    const hasPem = Boolean(String(trust?.caBundlePem ?? '').trim());
    const hasPath = Boolean(String(trust?.caBundlePath ?? '').trim());
    const bundleConfigured = Number(hasPem) + Number(hasPath) === 1;
    const pins = Array.isArray(trust?.allowedSpkiSha256)
      ? trust.allowedSpkiSha256.map((pin) => String(pin).trim().toLowerCase())
      : [];
    const pinsConfigured = pins.length > 0
      && pins.every((pin) => /^[0-9a-f]{64}$/u.test(pin));
    return {
      bundleConfigured,
      bundleSource: hasPem && hasPath ? 'AMBIGUOUS' : hasPem ? 'PEM' : hasPath ? 'PATH' : 'MISSING',
      pinsConfigured,
      spkiPinCount: pins.length,
      ready: bundleConfigured && pinsConfigured,
    };
  }

  private assertEventRuntimeReady(runtime: TenantDianRuntime): void {
    if (runtime.snapshot?.isDemo === true) {
      throw new Error('DIAN_DEMO_EXTERNAL_TRANSPORT_BLOCKED');
    }
    if (!runtime.dianActive) throw new Error('DIAN_DISABLED');
    this.assertRuntimeReadyForTransmission(runtime);
    if (runtime.dianConfig.environment === 'produccion'
        && !runtime.externalApprovalValidated) {
      throw new Error('DIAN_TEST_SET_APPROVAL_EVIDENCE_REQUIRED');
    }
  }

  private identityDigits(value: unknown): string {
    return String(value ?? '').replace(/\D/g, '');
  }

  private async reservarPaqueteDian(
    documento: DocumentoElectronico,
    dianConfig: DianConfig,
  ): Promise<DianConfig> {
    const claim = this.deliveryClaim(documento);
    const packageYear = Number(this.bogotaDate(new Date()).slice(0, 4));
    const { data, error } = await this.supabase.getClient().rpc('reservar_paquete_dian_tx', {
      p_tenant_id: claim.tenantId,
      p_operation_id: claim.operationId,
      p_claim_token: claim.claimToken,
      p_package_year: packageYear,
      p_provider_code: '000',
    });
    if (error) throw new Error(`DIAN: no se pudo reservar el paquete: ${error.message}`);
    const sequence = Number((data as any)?.package_sequence);
    const reservedPackageYear = Number((data as any)?.package_year);
    const providerCode = String((data as any)?.provider_code ?? '').trim();
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 0xFFFFFFFF
        || !Number.isSafeInteger(reservedPackageYear)
        || reservedPackageYear < 2000 || reservedPackageYear > 9999
        || !/^\d{3}$/.test(providerCode)) {
      throw new Error('DIAN: reserva de paquete inválida');
    }
    return {
      ...dianConfig,
      packageSequence: sequence,
      packageYear: reservedPackageYear,
      providerCode,
    };
  }

  private async sellarEnvioDian(
    documento: DocumentoElectronico,
    signedXml: string,
  ): Promise<void> {
    const claim = this.deliveryClaim(documento);
    const context = documento.dianContext;
    if (!context) throw new Error('DIAN: no existe contexto para sellar el envío');
    const kind = documento.tipoDocumento === '01' ? 'CUFE' : 'CUDE';
    const uniqueCode = this.xmlText(signedXml, 'UUID');
    if (!/^[0-9a-f]{96}$/i.test(uniqueCode)) {
      throw new Error('DIAN: el XML firmado no contiene CUFE/CUDE válido');
    }
    const authorization = kind === 'CUFE'
      ? {
          source: 'DIAN_GET_NUMBERING_RANGE',
          environment_id: context.environmentId,
          software_id: context.software.id,
          number: context.authorization?.number,
          prefix: context.authorization?.prefix,
          range_from: context.authorization?.rangeFrom,
          range_to: context.authorization?.rangeTo,
          valid_from: context.authorization?.validFrom,
          valid_to: context.authorization?.validTo,
          technical_key_sha256: this.sha256(context.authorization?.technicalKey),
        }
      : {
          source: 'DIAN_SOFTWARE_CATALOG',
          environment_id: context.environmentId,
          software_id: context.software.id,
          document_series: documento.serie,
        };
    const { error } = await this.supabase.getClient().rpc('sellar_envio_dian_tx', {
      p_tenant_id: claim.tenantId,
      p_operation_id: claim.operationId,
      p_claim_token: claim.claimToken,
      p_xml_firmado: signedXml,
      p_code_kind: kind,
      p_unique_code: uniqueCode,
      p_authorization: authorization,
      p_issuer_tax_profile: {
        profile_id: this.xmlText(signedXml, 'ProfileID'),
        operation_code: context.operationCode
          || (documento.tipoDocumento === '01' ? '10' : documento.tipoDocumento === '91' ? '20' : '30'),
        environment_id: context.environmentId,
        tax_responsibility: documento.emisor.regimenFiscal,
        contributor_type: documento.emisor.tipoContribuyente,
      },
    });
    if (error) throw new Error(`DIAN: no se pudo sellar el envío: ${error.message}`);
  }

  private sha256(value: unknown): string {
    const secret = String(value ?? '').trim();
    if (!secret) throw new Error('DIAN: falta clave técnica para sellar el envío');
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  private async prepararDocumentoDian(
    documento: DocumentoElectronico,
    runtime: TenantDianRuntime,
  ): Promise<DocumentoElectronico> {
    // Un contexto ya sellado puede venir de la operación idempotente de
    // delivery. El builder vuelve a validar prefijo, rango, fecha y sumas.
    if (documento.dianContext) return { ...documento };

    const softwareId = String(runtime.dianConfig.softwareId ?? '').trim();
    const softwarePin = String(runtime.dianConfig.softwarePin ?? '').trim();
    if (!softwareId || !softwarePin) {
      throw new Error('DIAN: faltan Software ID o Software PIN');
    }
    const context: DianGenerationContext = {
      environmentId: runtime.dianConfig.environment === 'produccion' ? '1' : '2',
      software: { id: softwareId, pin: softwarePin },
      taxes: this.resolveTaxSeed(documento),
    };

    if (documento.tipoDocumento === '01') {
      if (runtime.snapshot?.isDemo === true) {
        if (!this.isExplicitDemoFixture(documento)) {
          throw new Error('DIAN: una demo sólo puede generar fixtures fiscales identificados');
        }
        context.authorization = this.demoAuthorization(documento, runtime.snapshot);
      } else {
        context.authorization = await this.resolveOfficialAuthorization(documento, runtime);
      }
    }
    return { ...documento, dianContext: context };
  }

  private resolveTaxSeed(documento: DocumentoElectronico): DianGenerationContext['taxes'] {
    const supplied = documento.dianContext?.taxes;
    if (supplied) return supplied;
    const extendedTaxes = (documento as DocumentoElectronico & {
      dianTaxes?: Array<{ id: string; amount: number }>;
    }).dianTaxes;
    if (extendedTaxes?.length) {
      const sum = (id: string) => extendedTaxes
        .filter((tax) => String(tax.id).trim() === id)
        .reduce((total, tax) => total + Number(tax.amount || 0), 0);
      return { iva: sum('01'), inc: sum('04'), ica: sum('03') };
    }
    // El contrato histórico sólo modela `igv`; por ello ese total representa
    // IVA. INC/ICA deben llegar desglosados, no se reparten por conjetura.
    return { iva: Number(documento.totalImpuestos), inc: 0, ica: 0 };
  }

  private async resolveOfficialAuthorization(
    documento: DocumentoElectronico,
    runtime: TenantDianRuntime,
  ): Promise<NonNullable<DianGenerationContext['authorization']>> {
    const number = this.documentNumber(documento.numero);
    const prefix = String(documento.serie ?? '').trim().toUpperCase();
    const result = await this.apiClient.consultarRangosAutorizados(runtime.dianConfig);
    const ranges = Array.isArray(result?.rangos) ? result.rangos as any[] : [];
    const issueDate = this.bogotaDate(documento.fechaEmision);
    const range = ranges.find((candidate) => {
      const validFrom = this.dateOnly(candidate.fechaInicio);
      const validTo = this.dateOnly(candidate.fechaFin);
      return String(candidate.prefijo ?? '').trim().toUpperCase() === prefix
        && number >= Number(candidate.desde)
        && number <= Number(candidate.hasta)
        && issueDate >= validFrom
        && issueDate <= validTo;
    });
    if (!range) {
      throw new Error('DIAN: GetNumberingRange no devolvió un rango vigente para la factura');
    }
    if (!String(range.claveTecnica ?? '').trim()) {
      throw new Error('DIAN: el rango oficial no contiene TechnicalKey');
    }
    const snapshot = runtime.snapshot;
    if (snapshot?.resolutionNumber
        && snapshot.resolutionNumber !== String(range.resolucion).trim()) {
      throw new Error('DIAN: la resolución configurada no coincide con GetNumberingRange');
    }
    if (snapshot?.resolutionPrefix
        && snapshot.resolutionPrefix.toUpperCase() !== prefix) {
      throw new Error('DIAN: el prefijo configurado no coincide con el documento');
    }
    return {
      number: String(range.resolucion).trim(),
      prefix: String(range.prefijo).trim(),
      rangeFrom: Number(range.desde),
      rangeTo: Number(range.hasta),
      validFrom: this.dateOnly(range.fechaInicio),
      validTo: this.dateOnly(range.fechaFin),
      technicalKey: String(range.claveTecnica).trim(),
    };
  }

  private demoAuthorization(
    documento: DocumentoElectronico,
    snapshot: TenantDianSnapshot | undefined,
  ): NonNullable<DianGenerationContext['authorization']> {
    const number = this.documentNumber(documento.numero);
    if (!snapshot?.resolutionNumber || !snapshot.resolutionPrefix
        || snapshot.rangeFrom == null || snapshot.rangeTo == null
        || !snapshot.validFrom || !snapshot.validTo) {
      throw new Error('DIAN: fixture demo sin resolución de numeración completa');
    }
    if (number < snapshot.rangeFrom || number > snapshot.rangeTo) {
      throw new Error('DIAN: fixture demo fuera del rango configurado');
    }
    return {
      number: snapshot.resolutionNumber,
      prefix: snapshot.resolutionPrefix,
      rangeFrom: snapshot.rangeFrom,
      rangeTo: snapshot.rangeTo,
      validFrom: snapshot.validFrom,
      validTo: snapshot.validTo,
      // Sólo una demo marcada puede usar este secreto ficticio; nunca se
      // transmite porque enviarDocumento bloquea el tenant demo.
      technicalKey: 'DEMO-CLAVE-TECNICA-SIN-VALIDEZ-DIAN',
    };
  }

  private isExplicitDemoFixture(documento: DocumentoElectronico): boolean {
    return documento.fiscalContext?.isDemo === true
      && documento.fiscalContext?.simulated === true
      && Boolean(String(documento.fiscalContext?.fixtureSource ?? '').trim());
  }

  private documentNumber(value: unknown): number {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) throw new Error('DIAN: el consecutivo debe ser numérico');
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error('DIAN: consecutivo inválido');
    return number;
  }

  private bogotaDate(value: Date | string): string {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      return value.trim();
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('DIAN: fecha de emisión inválida');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private dateOnly(value: Date | string): string {
    if (value instanceof Date) return this.bogotaDate(value);
    const match = /^\d{4}-\d{2}-\d{2}/.exec(String(value ?? '').trim());
    if (!match) throw new Error('DIAN: vigencia de rango inválida');
    return match[0];
  }

  private xmlText(xml: string, localName: string): string {
    const pattern = new RegExp(
      `<(?:\\w+:)?${localName}(?:\\s[^>]*)?>([^<]+)</(?:\\w+:)?${localName}>`,
      'u',
    );
    return pattern.exec(xml)?.[1]?.trim() || '';
  }

  private async validarRangoAutorizado(
    serie: string,
    numero: string,
    dianConfig: DianConfig,
  ): Promise<boolean> {
    try {
      const numeroInt = parseInt(numero, 10);
      const resultado = await this.apiClient.validarNumeracion(serie, numeroInt, dianConfig);
      return resultado.valido;
    } catch (error) {
      this.logger.warn(`No se pudo validar rango autorizado: ${error.message}`);
      return false; // Fallar cerrado: no asumir autorización ante una caída externa.
    }
  }

  /**
   * Obtiene rangos de numeración autorizados por DIAN
   */
  async obtenerRangosAutorizados(): Promise<any[]> {
    try {
      const runtime = await this.loadTenantConfig();
      const resultado = await this.apiClient.consultarRangosAutorizados(runtime.dianConfig);
      return resultado.rangos;
    } catch (error) {
      this.logger.error('Error obteniendo rangos autorizados:', error);
      return [];
    }
  }

  async probarConfiguracion(tenantIdOverride?: string): Promise<any> {
    const runtime = await this.loadTenantConfig(tenantIdOverride);
    const tenantId = tenantIdOverride || this.tenantContext.getTenantId();
    if (!tenantId) {
      return { ready: false, mode: 'NO_TENANT', missing: ['tenant_id'] };
    }

    const { data } = await this.supabase.getClient()
      .from('empresa_config')
      .select('pais,pais_id,is_demo,dian_activo,dian_environment,dian_software_id,dian_software_pin,dian_test_set_id,dian_resolucion_numero,dian_resolucion_prefijo,dian_resolucion_desde,dian_resolucion_hasta,dian_resolucion_fecha_inicio,dian_resolucion_fecha_fin,certificado_pfx,certificado_password,dian_habilitacion_estado,dian_habilitacion_at,dian_habilitacion_evidencia')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const row = data as any;
    if (!row) return { ready: false, mode: 'MISSING_CONFIG', missing: ['empresa_config'] };
    if (String(row.pais || '').toUpperCase() !== 'CO' && Number(row.pais_id) !== 2) {
      return { ready: false, mode: 'WRONG_COUNTRY', missing: ['tenant_colombia'] };
    }
    if (row.is_demo === true) {
      return {
        ready: false,
        mode: 'DEMO_EXTERNAL_TRANSPORT_BLOCKED',
        transportReachable: false,
        credentialsValidated: false,
        message:
          'La demo Colombia no abre conexiones a DIAN ni valida endpoints externos. Convierte la cuenta a real para probar el transporte.',
      };
    }

    const required: Record<string, unknown> = {
      softwareId: row.dian_software_id,
      softwarePin: row.dian_software_pin,
      resolucion: row.dian_resolucion_numero,
      prefijo: row.dian_resolucion_prefijo,
      rangoDesde: row.dian_resolucion_desde,
      rangoHasta: row.dian_resolucion_hasta,
      vigenciaDesde: row.dian_resolucion_fecha_inicio,
      vigenciaHasta: row.dian_resolucion_fecha_fin,
      certificado: row.certificado_pfx,
      certificadoPassword: row.certificado_password,
    };
    // El TestSet identifica la habilitación del software aun cuando el tenant
    // ya opere en producción. Sin él no se puede ligar la constancia del portal
    // a la misma identidad que fue habilitada por DIAN.
    required.testSetId = row.dian_test_set_id;
    const authorityTrust = this.authorityTrustReadiness(runtime.dianConfig);
    const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
    if (!authorityTrust.bundleConfigured) missing.push('authorityTrustBundle');
    if (!authorityTrust.pinsConfigured) missing.push('authorityTrustSpkiPins');
    if (missing.length) {
      await this.persistirPrueba('INCOMPLETA', { missing, authorityTrust }, tenantId);
      return {
        ready: false,
        mode: 'REAL',
        missing,
        authorityTrust,
        transportReachable: false,
      };
    }

    const connectivity = await this.apiClient.probarConectividad(runtime.dianConfig);
    const rangeResult = connectivity.reachable
      ? await this.apiClient.consultarRangosAutorizados(runtime.dianConfig)
      : { rangos: [] };
    const ranges = Array.isArray(rangeResult?.rangos) ? rangeResult.rangos : [];
    const configuredResolution = String(row.dian_resolucion_numero ?? '').trim();
    const configuredPrefix = String(row.dian_resolucion_prefijo ?? '').trim().toUpperCase();
    const configuredFrom = Number(row.dian_resolucion_desde);
    const configuredTo = Number(row.dian_resolucion_hasta);
    const configuredValidFrom = this.dateOnly(row.dian_resolucion_fecha_inicio);
    const configuredValidTo = this.dateOnly(row.dian_resolucion_fecha_fin);
    const todayBogota = this.bogotaDate(new Date());
    const numberingValidated = ranges.some((range: any) => {
      const officialFrom = Number(range.desde);
      const officialTo = Number(range.hasta);
      const officialValidFrom = this.dateOnly(range.fechaInicio);
      const officialValidTo = this.dateOnly(range.fechaFin);
      return String(range.resolucion ?? '').trim() === configuredResolution
        && String(range.prefijo ?? '').trim().toUpperCase() === configuredPrefix
        && officialFrom === configuredFrom
        && officialTo === configuredTo
        && officialValidFrom === configuredValidFrom
        && officialValidTo === configuredValidTo
        && todayBogota >= officialValidFrom
        && todayBogota <= officialValidTo;
    });
    const isProduction = runtime.dianConfig.environment === 'produccion';
    const homologationValidated = runtime.externalApprovalValidated;
    // GetNumberingRange autentica el certificado y devuelve numeración, pero
    // su contrato no recibe el Software PIN. Por tanto nunca puede probarlo.
    // La constancia de portal sí queda invalidada en DB al cambiar el PIN.
    const softwarePinValidated = homologationValidated;
    const credentialsValidated = numberingValidated && softwarePinValidated;
    const portalAttestationReady = connectivity.reachable
      && row.dian_activo === true
      && numberingValidated
      && authorityTrust.ready;
    const testSetSubmissionReady = connectivity.reachable
      && row.dian_activo === true
      && numberingValidated
      && !isProduction;
    const transmissionEnabled = row.dian_activo === true
      && numberingValidated
      && (!isProduction || homologationValidated);
    const ready = connectivity.reachable && transmissionEnabled;
    const blocker = !connectivity.reachable
      ? 'DIAN_SERVICE_UNREACHABLE'
      : !numberingValidated
        ? 'DIAN_NUMBERING_NOT_VALIDATED'
        : row.dian_activo !== true
          ? 'DIAN_DISABLED'
          : isProduction && !homologationValidated
            ? 'DIAN_TEST_SET_APPROVAL_EVIDENCE_REQUIRED'
          : undefined;
    await this.persistirPrueba(
      ready ? (isProduction ? 'VALIDADA' : 'LISTA_PARA_TESTSET') : 'INCOMPLETA',
      {
        ...connectivity,
        numberingValidated,
        softwarePinValidated,
        credentialsValidated,
        portalAttestationReady,
        homologationValidated,
        testSetSubmissionReady,
        transmissionEnabled,
        blocker,
        environment: runtime.dianConfig.environment,
        authorityTrust,
        authorizedRanges: ranges.map((range: any) => ({
          resolution: String(range.resolucion ?? ''),
          prefix: String(range.prefijo ?? ''),
          from: Number(range.desde),
          to: Number(range.hasta),
          validFrom: this.dateOnly(range.fechaInicio),
          validTo: this.dateOnly(range.fechaFin),
        })),
      },
      tenantId,
    );
    return {
      ready,
      mode: 'REAL',
      transportReachable: connectivity.reachable,
      credentialsPresent: true,
      numberingValidated,
      softwarePinValidated,
      credentialsValidated,
      portalAttestationReady,
      homologationValidated,
      testSetSubmissionReady,
      transmissionEnabled,
      blocker,
      environment: runtime.dianConfig.environment,
      authorityTrust,
      authorizedRanges: ranges.length,
      externalApprovalPending: isProduction && !homologationValidated,
      message: ready
        ? isProduction
          ? 'Certificado, Software PIN, numeración y habilitación DIAN validados para producción.'
          : 'Certificado y numeración validados. El sistema puede enviar al TestSet; el Software PIN sólo queda validado al completar la habilitación y registrar la constancia del portal DIAN.'
        : connectivity.reachable
          ? 'El servicio DIAN está accesible, pero no validó la numeración configurada o la habilitación requerida.'
          : connectivity.message,
    };
  }

  private async persistirPrueba(estado: string, detalle: any, tenantIdOverride?: string): Promise<void> {
    const tenantId = tenantIdOverride || this.tenantContext.getTenantId();
    if (!tenantId) return;
    const { error } = await this.supabase.getClient().from('empresa_config').update({
      dian_ultima_prueba_at: new Date().toISOString(),
      dian_ultima_prueba_estado: estado,
      dian_ultima_prueba_detalle: detalle,
    }).eq('tenant_id', tenantId);
    if (error) {
      throw new Error(`No se pudo persistir la prueba DIAN: ${error.message}`);
    }
  }

  async registrarHabilitacionPortal(
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
    evidenceReference: string,
  ): Promise<any> {
    const { data, error } = await this.supabase.getClient().rpc(
      'registrar_habilitacion_dian_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_idempotency_key: idempotencyKey,
        p_reference: evidenceReference,
      },
    );
    if (error) {
      throw new Error(`No se pudo registrar la habilitación DIAN: ${error.message}`);
    }

    // Revalida inmediatamente el transporte/rango con la identidad ya ligada
    // a la constancia del portal; así la UI no muestra un estado listo obsoleto.
    return {
      attestation: data,
      validation: await this.probarConfiguracion(tenantId),
    };
  }

  private async loadTenantConfig(tenantIdOverride?: string): Promise<TenantDianRuntime> {
    const tenantId = tenantIdOverride || this.tenantContext.getTenantId();
    if (!tenantId) {
      return {
        fiscalConfig: { ...this.defaultConfig },
        dianConfig: { ...this.defaultDianConfig },
        dianActive: false,
        externalApprovalValidated: false,
      };
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('empresa_config')
      .select([
        'ruc',
        'pais',
        'certificado_pfx',
        'certificado_password',
        'dian_activo',
        'dian_url',
        'dian_software_id',
        'dian_software_pin',
        'dian_test_set_id',
        'dian_environment',
        'is_demo',
        'dian_resolucion_numero',
        'dian_resolucion_prefijo',
        'dian_resolucion_desde',
        'dian_resolucion_hasta',
        'dian_resolucion_fecha_inicio',
        'dian_resolucion_fecha_fin',
        'dian_habilitacion_estado',
        'dian_habilitacion_at',
        'dian_habilitacion_evidencia',
      ].join(','))
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`No se pudo cargar config DIAN para tenant ${tenantId}: ${error.message}`);
    }

    const typedData = data as any;
    if (!typedData) {
      return {
        fiscalConfig: {
          ...this.defaultConfig,
          usuario: '',
          password: '',
          empresaId: '',
          certificatePath: '',
          certificatePassword: '',
        },
        dianConfig: {
          url: this.defaultDianConfig.url,
          environment: this.defaultDianConfig.environment,
          nit: '',
          softwareId: '',
          softwarePin: '',
          authorityTrust: this.defaultDianConfig.authorityTrust,
        },
        dianActive: false,
        externalApprovalValidated: false,
      };
    }

    const envRaw = (typedData.dian_environment || 'HOMOLOGACION').toString().toUpperCase();
    const fiscalEnvironment = envRaw === 'PRODUCCION' ? 'produccion' : 'homologacion';
    const apiEnvironment = envRaw === 'PRODUCCION' ? 'produccion' : 'habilitacion';

    // Una fila tenant nunca hereda identidad, certificados ni secretos del
    // proceso. Los defaults de entorno sólo sirven para construir el servicio;
    // mezclar un campo faltante con ellos podría firmar un CPE de otro tenant.
    const fiscalConfig: FiscalConfig = {
      url: typedData.dian_url || this.defaultConfig.url,
      usuario: '',
      password: '',
      empresaId: String(typedData.ruc ?? '').trim(),
      certificatePath: '',
      certificatePassword: typedData.certificado_password
        ? decryptText(this.configService, typedData.certificado_password)
        : '',
      environment: fiscalEnvironment,
      pais: 'CO',
    };

    const dianConfig: DianConfig = {
      url: typedData.dian_url || this.defaultDianConfig.url,
      environment: apiEnvironment,
      nit: String(typedData.ruc ?? '').trim(),
      softwareId: String(typedData.dian_software_id ?? '').trim(),
      softwarePin: typedData.dian_software_pin
        ? decryptText(this.configService, typedData.dian_software_pin)
        : '',
      testSetId: String(typedData.dian_test_set_id ?? '').trim() || undefined,
      authorityTrust: this.defaultDianConfig.authorityTrust,
    };

    const certificateBuffer = decryptBuffer(this.configService, typedData.certificado_pfx) || undefined;
    dianConfig.certificatePfx = certificateBuffer;
    dianConfig.certificatePassword = fiscalConfig.certificatePassword;
    const snapshot: TenantDianSnapshot = {
      isDemo: typedData.is_demo === true,
      resolutionNumber: String(typedData.dian_resolucion_numero ?? '').trim() || undefined,
      resolutionPrefix: String(typedData.dian_resolucion_prefijo ?? '').trim() || undefined,
      rangeFrom: typedData.dian_resolucion_desde == null
        ? undefined : Number(typedData.dian_resolucion_desde),
      rangeTo: typedData.dian_resolucion_hasta == null
        ? undefined : Number(typedData.dian_resolucion_hasta),
      validFrom: String(typedData.dian_resolucion_fecha_inicio ?? '').trim() || undefined,
      validTo: String(typedData.dian_resolucion_fecha_fin ?? '').trim() || undefined,
    };
    return {
      fiscalConfig,
      dianConfig,
      dianActive: typedData.dian_activo === true,
      externalApprovalValidated: hasCurrentDianPortalApproval(typedData),
      certificateBuffer,
      snapshot,
    };
  }
}
