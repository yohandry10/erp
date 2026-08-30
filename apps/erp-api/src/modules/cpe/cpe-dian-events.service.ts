import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import {
  DianEventPackageContext,
  DianEventPreparationInput,
  DianFiscalService,
} from '../fiscal/dian-fiscal.service';
import { DianEventStatusResponse } from '../fiscal/colombia/dian-api-client.service';
import { DianIdentityType } from '../fiscal/colombia/dian-document.util';
import { findAllByKey, findFirstByKey, scalar } from '../fiscal/colombia/dian-soap.util';
import { parseColombiaNit } from '../paises/initial-country';
import {
  CreateDianEventDto,
  DianEventCode,
  ImportDianReceivedInvoiceDto,
} from './dto/dian-event.dto';

type EventResultKind = 'ACCEPTED' | 'PENDING' | 'REJECTED' | 'TECHNICAL_ERROR';

interface EventOperation {
  id: string;
  claim_token: string;
  state: string;
  attempt: number;
  result_kind?: EventResultKind;
  response_code?: string;
  error_message?: string;
  next_retry_at?: string;
  request_summary: Record<string, any>;
}

interface EventClaim {
  claimed?: boolean;
  idempotent?: boolean;
  reason?: string;
  retry_at?: string;
  operation: EventOperation;
  cpe?: Record<string, any>;
}

type DianEventAnchorKind = 'RECEIVED_INVOICE' | 'ISSUED_CPE';

interface DianEventRetryContext {
  operationId: string;
  anchorId: string;
  anchorKind: DianEventAnchorKind;
  eventCode: DianEventCode;
  idempotencyKey: string;
  canRetry: boolean;
  retryAt?: string | null;
  request?: {
    responsiblePerson?: Record<string, unknown>;
    claimReason?: Record<string, unknown>;
    swornConfirmation?: boolean;
  };
}

@Injectable()
export class CpeDianEventsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly dian: DianFiscalService,
  ) {}

  async emitir(
    cpeId: string,
    dto: CreateDianEventDto,
    tenantId: string,
    actorId: string,
    idempotencyKey?: string,
  ) {
    const key = String(idempotencyKey ?? '').trim();
    if (key.length < 8 || key.length > 255) {
      throw new BadRequestException('Idempotency-Key es obligatorio (8-255 caracteres)');
    }
    if (!actorId) throw new BadRequestException('La operación DIAN requiere un actor autenticado');

    const claim = await this.rpc<EventClaim>('reservar_evento_dian_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_cpe_id: cpeId,
      p_event_code: dto.eventCode,
      p_idempotency_key: key,
      p_payload: this.toDatabasePayload(dto),
      p_origin: 'USER',
    });
    if (!claim.claimed) return this.publicResult(claim);

    let operation = claim.operation;
    let request = operation.request_summary;
    let finalized = false;
    let ioAttempted = false;
    let eventCude = String(request.event_cude ?? '').trim().toUpperCase();
    try {
      const invoiceCufe = String(request.referenced_document_uuid ?? '').trim().toUpperCase();
      const authority = await this.dian.consultarEventosFacturaDian(invoiceCufe, tenantId);
      if (!authority.usable) {
        throw new ServiceUnavailableException(
          `DIAN no devolvió una lista de eventos verificable: ${authority.statusCode}`,
        );
      }

      const existingForCode = authority.events.filter((event) => event.code === dto.eventCode);
      const sealedXml = String(request.signed_application_response ?? '').trim();
      if (sealedXml) {
        const exactStatus = await this.dian.consultarEventoDian(eventCude, tenantId);
        const exactAccepted = exactStatus.success
          && exactStatus.estado === 'ACEPTADO'
          && exactStatus.authorityStatusCode === '00'
          && exactStatus.authoritySignatureTrusted === true
          && String(exactStatus.cufe ?? '').trim().toUpperCase() === eventCude
          && exactStatus.applicationResponseEvidence?.referencedDocumentKeys
            .includes(eventCude) === true
          && exactStatus.applicationResponseEvidence.responseCodes.length === 1
          && exactStatus.applicationResponseEvidence.responseCodes[0] === '02';
        if (exactAccepted) {
          const result = await this.finalize(
            tenantId,
            claim,
            'ACCEPTED',
            authority.statusCode || '00',
            'GetStatusEvent confirmó el evento sellado en DIAN.',
            {
              success: true,
              countryCode: 'CO',
              eventCode: dto.eventCode,
              eventCude,
              reconciliation: 'GET_STATUS_BY_EVENT_CUDE',
              invoiceCufe,
              authorityDocumentKey: exactStatus.cufe,
              eventStatusCode: exactStatus.authorityStatusCode,
              signatureVerified: exactStatus.authoritySignatureTrusted === true,
              authoritySignatureTrusted: exactStatus.authoritySignatureTrusted === true,
              applicationResponseEvidence: exactStatus.applicationResponseEvidence,
            },
            exactStatus.xmlResponse,
          );
          finalized = true;
          return this.publicResult(result);
        }
        if (exactStatus.explicitNotFound !== true) {
          throw new ServiceUnavailableException(
            'DIAN no confirmó ni descartó de forma inequívoca el CUDE sellado',
          );
        }
        if (existingForCode.length > 0) {
          throw new ConflictException(
            `DIAN ya registra el evento ${dto.eventCode}; su CUDE individual debe reconciliarse por GetStatus`,
          );
        }
        // Sólo una respuesta utilizable y sin el CUDE sellado autoriza a
        // reenviar exactamente los mismos bytes.
        this.assertAuthoritySequence(dto.eventCode, authority);
      } else {
        if (existingForCode.length > 0) {
          throw new ConflictException(`DIAN ya registra el evento ${dto.eventCode}`);
        }
        this.assertAuthoritySequence(dto.eventCode, authority);
        const prepared = await this.dian.prepararEventoDian(
          this.preparationInput(request),
          tenantId,
        );
        eventCude = prepared.eventCude;
        const sealed = await this.rpc<{ operation: EventOperation }>('sellar_evento_dian_tx', {
          p_tenant_id: tenantId,
          p_operation_id: operation.id,
          p_claim_token: operation.claim_token,
          p_signed_application_response: prepared.signedApplicationResponse,
          p_event_cude: prepared.eventCude,
          p_xml_sha256: prepared.xmlSha256,
          p_authority_event_snapshot: this.authoritySnapshot(authority),
        });
        operation = sealed.operation;
        request = operation.request_summary;
      }

      ioAttempted = true;
      const response = await this.dian.enviarEventoDianFirmado(
        String(request.signed_application_response),
        eventCude,
        tenantId,
        this.packageContext(request),
      );
      if (response.success && (
        response.statusCode !== '00'
        || response.signatureVerified !== true
        || response.authoritySignatureTrusted !== true
        || String(response.cufe ?? '').trim().toUpperCase() !== eventCude
        || response.applicationResponseEvidence?.referencedDocumentKeys
          .includes(eventCude) !== true
        || response.applicationResponseEvidence.responseCodes.length !== 1
        || response.applicationResponseEvidence.responseCodes[0] !== '02'
      )) {
        throw new Error('DIAN_EVENT_ACCEPTANCE_EVIDENCE_INVALID');
      }
      const resultKind = this.resultKind(response, eventCude);
      const result = await this.finalize(
        tenantId,
        { ...claim, operation },
        resultKind,
        response.statusCode,
        response.statusDescription,
        {
          success: resultKind === 'ACCEPTED',
          countryCode: 'CO',
          eventCode: dto.eventCode,
          eventCude,
          authorityDocumentKey: response.cufe,
          invoiceCufe: request.referenced_document_uuid,
          ioAttempted: true,
          uncertain: response.statusCode === 'DIAN_TIMEOUT_UNCERTAIN',
          signatureVerified: response.authoritySignatureTrusted === true,
          authoritySignatureTrusted: response.authoritySignatureTrusted === true,
          applicationResponseEvidence: response.applicationResponseEvidence,
          errors: response.errors ?? [],
        },
        response.xmlResponse,
      );
      finalized = true;
      if (resultKind === 'REJECTED') {
        throw new BadRequestException(
          `DIAN rechazó el evento ${dto.eventCode}: ${response.statusDescription}`,
        );
      }
      if (resultKind === 'TECHNICAL_ERROR') {
        throw new ServiceUnavailableException(response.statusDescription);
      }
      return this.publicResult(result);
    } catch (error) {
      if (!finalized) {
        try {
          await this.finalize(
            tenantId,
            { ...claim, operation },
            'TECHNICAL_ERROR',
            this.errorCode(error),
            this.errorMessage(error),
            {
              success: false,
              countryCode: 'CO',
              eventCode: dto.eventCode,
              eventCude,
              ioAttempted,
              uncertain: ioAttempted,
              stage: eventCude ? 'SEALED' : 'PREFLIGHT',
            },
          );
        } catch {
          // La excepción original es la evidencia útil. Un fallo adicional al
          // finalizar no puede provocar un reenvío automático.
        }
      }
      if (error instanceof BadRequestException
          || error instanceof ConflictException
          || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(this.errorMessage(error));
    }
  }

  async importarFacturaRecibida(
    dto: ImportDianReceivedInvoiceDto,
    tenantId: string,
    actorId: string,
    idempotencyKey?: string,
  ) {
    const key = String(idempotencyKey ?? '').trim();
    if (key.length < 8 || key.length > 255) {
      throw new BadRequestException('Idempotency-Key es obligatorio (8-255 caracteres)');
    }
    if (!actorId) throw new BadRequestException('La importación DIAN requiere un actor autenticado');
    const cufe = String(dto.cufe ?? '').trim().toUpperCase();
    const authority = await this.dian.consultarFacturaRecibidaDian(cufe, tenantId);
    const statusXml = String(authority.status.xmlResponse ?? '');
    const invoiceXml = String(authority.document.xml ?? '');
    if (authority.status.authorityStatusCode !== '00'
        || String(authority.status.cufe ?? '').trim().toUpperCase() !== cufe
        || authority.status.authoritySignatureTrusted !== true
        || authority.document.usable !== true
        || !/<(?:[A-Za-z_][\w.-]*:)?ApplicationResponse\b/u.test(statusXml)
        || !statusXml.includes('http://www.w3.org/2000/09/xmldsig#')) {
      throw new ServiceUnavailableException('DIAN_RECEIVED_INVOICE_STATUS_EVIDENCE_INVALID');
    }
    const invoiceSnapshot = this.parseReceivedInvoice(invoiceXml, cufe);
    const statusHash = createHash('sha256').update(statusXml, 'utf8').digest('hex');
    const result = await this.rpc<any>('registrar_fev_recibida_dian_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_cufe: cufe,
      p_proveedor_id: dto.proveedorId,
      p_cuenta_por_pagar_id: dto.cuentaPorPagarId ?? null,
      p_idempotency_key: key,
      p_invoice_xml: invoiceXml,
      p_invoice_snapshot: invoiceSnapshot,
      p_authority_status_snapshot: {
        success: true,
        statusCode: authority.status.authorityStatusCode,
        documentKey: authority.status.cufe,
        description: authority.status.descripcion,
        authorityXmlSha256: statusHash,
        signatureVerified: authority.status.authoritySignatureTrusted === true,
        authoritySignatureTrusted: authority.status.authoritySignatureTrusted === true,
        source: 'DIAN_GET_STATUS',
      },
      p_authority_status_xml: statusXml,
      p_get_xml_snapshot: {
        usable: authority.document.usable,
        code: authority.document.code,
        message: authority.document.message,
        validationDate: authority.document.validationDate,
        invoiceXmlSha256: authority.document.xmlSha256,
        signatureVerified: true,
        source: 'DIAN_GET_XML_BY_DOCUMENT_KEY',
      },
    });
    const invoice = result?.invoice ?? {};
    return {
      success: true,
      created: result?.created === true,
      idempotent: result?.idempotent === true,
      id: invoice.id,
      cufe: invoice.cufe,
      documentId: invoice.document_id,
      state: invoice.state,
      proveedorId: invoice.proveedor_id,
      cuentaPorPagarId: invoice.cuenta_por_pagar_id ?? null,
      invoiceXmlSha256: invoice.invoice_xml_sha256,
    };
  }

  async emitirSobreFacturaRecibida(
    receivedInvoiceId: string,
    dto: CreateDianEventDto,
    tenantId: string,
    actorId: string,
    idempotencyKey?: string,
  ) {
    if (dto.eventCode === '034') {
      throw new BadRequestException('El evento 034 corresponde al facturador, no al adquirente');
    }
    return this.emitir(receivedInvoiceId, dto, tenantId, actorId, idempotencyKey);
  }

  async emitirSobreFacturaEmitida(
    cpeId: string,
    dto: CreateDianEventDto,
    tenantId: string,
    actorId: string,
    idempotencyKey?: string,
  ) {
    if (dto.eventCode !== '034') {
      throw new BadRequestException(
        'Los eventos 030-033 requieren una FEV recibida importada desde DIAN',
      );
    }
    return this.emitir(cpeId, dto, tenantId, actorId, idempotencyKey);
  }

  async listarFacturasRecibidas(tenantId: string, requestedLimit?: number) {
    const limit = Number.isSafeInteger(Number(requestedLimit))
      ? Math.min(100, Math.max(1, Number(requestedLimit)))
      : 50;
    const invoices = await this.rpc<any[]>('listar_fev_recibidas_dian_tx', {
      p_tenant_id: tenantId,
      p_limit: limit,
    });
    return {
      success: true,
      data: invoices ?? [],
    };
  }

  async reintentarEvento(
    operationId: string,
    tenantId: string,
    actorId: string,
    expectedAnchorKind: DianEventAnchorKind,
  ) {
    if (!actorId) throw new BadRequestException('El reintento DIAN requiere un actor autenticado');
    const context = await this.rpc<DianEventRetryContext>('obtener_reintento_evento_dian_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_operation_id: operationId,
      p_expected_anchor_kind: expectedAnchorKind,
    });
    if (context.canRetry !== true) {
      throw new ConflictException({
        code: 'DIAN_EVENT_RETRY_NOT_READY',
        retryAt: context.retryAt ?? null,
      });
    }

    const responsible = context.request?.responsiblePerson;
    const claimReason = context.request?.claimReason;
    const dto: CreateDianEventDto = {
      eventCode: context.eventCode,
      responsiblePerson: responsible ? {
        identityType: String(responsible.identity_type) as DianIdentityType,
        identityNumber: String(responsible.identity_number),
        firstName: String(responsible.first_name),
        familyName: String(responsible.family_name),
        jobTitle: String(responsible.job_title),
        organizationDepartment: String(responsible.organization_department),
      } : undefined,
      claimReason: claimReason ? {
        listId: String(claimReason.list_id) as '01' | '02' | '03' | '04',
        name: String(claimReason.name),
      } : undefined,
      swornConfirmation: context.eventCode === '034'
        ? context.request?.swornConfirmation === true
        : undefined,
    };

    return expectedAnchorKind === 'RECEIVED_INVOICE'
      ? this.emitirSobreFacturaRecibida(
        context.anchorId,
        dto,
        tenantId,
        actorId,
        context.idempotencyKey,
      )
      : this.emitirSobreFacturaEmitida(
        context.anchorId,
        dto,
        tenantId,
        actorId,
        context.idempotencyKey,
      );
  }

  private parseReceivedInvoice(xml: string, expectedCufe: string): Record<string, unknown> {
    if (!xml || xml.length > 8 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/iu.test(xml)) {
      throw new BadRequestException('DIAN_RECEIVED_INVOICE_XML_INVALID');
    }
    let parsed: unknown;
    try {
      parsed = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        parseTagValue: false,
        trimValues: true,
        processEntities: false,
      }).parse(xml);
    } catch {
      throw new BadRequestException('DIAN_RECEIVED_INVOICE_XML_MALFORMED');
    }
    const invoices = findAllByKey(parsed, 'Invoice')
      .flatMap((value) => Array.isArray(value) ? value : [value]);
    if (invoices.length !== 1 || !invoices[0] || typeof invoices[0] !== 'object') {
      throw new BadRequestException('DIAN_RECEIVED_INVOICE_ROOT_INVALID');
    }
    const invoice = invoices[0] as Record<string, unknown>;
    const cufe = scalar(invoice.UUID).toUpperCase();
    const documentTypeCode = scalar(invoice.InvoiceTypeCode);
    const documentId = scalar(invoice.ID);
    const issueDate = scalar(invoice.IssueDate);
    const currencyCode = scalar(invoice.DocumentCurrencyCode).toUpperCase();
    const payableAmount = scalar(findFirstByKey(
      findFirstByKey(invoice, 'LegalMonetaryTotal'),
      'PayableAmount',
    ));
    const issuer = this.invoiceParty(invoice, 'AccountingSupplierParty');
    const receiver = this.invoiceParty(invoice, 'AccountingCustomerParty');
    if (cufe !== expectedCufe || documentTypeCode !== '01' || !documentId
        || !/^\d{4}-\d{2}-\d{2}$/u.test(issueDate)
        || !/^[A-Z]{3}$/u.test(currencyCode)
        || !/^\d+(?:\.\d{1,2})?$/u.test(payableAmount)
        || !xml.includes('http://www.w3.org/2000/09/xmldsig#')
        || !/<ds:Signature\b/u.test(xml)) {
      throw new BadRequestException('DIAN_RECEIVED_INVOICE_CONTENT_INVALID');
    }
    return {
      cufe,
      documentTypeCode,
      documentId,
      issueDate,
      currencyCode,
      payableAmount,
      issuer,
      receiver,
    };
  }

  private invoiceParty(
    invoice: Record<string, unknown>,
    localName: 'AccountingSupplierParty' | 'AccountingCustomerParty',
  ): { type: string; number: string; verificationDigit: string; name: string } {
    const party = findFirstByKey(invoice, localName);
    const partyTax = findFirstByKey(party, 'PartyTaxScheme');
    const companyId = findFirstByKey(partyTax, 'CompanyID');
    const companyRecord = companyId && typeof companyId === 'object' && !Array.isArray(companyId)
      ? companyId as Record<string, unknown> : {};
    const result = {
      type: scalar(companyRecord['@_schemeName']),
      number: scalar(companyId),
      verificationDigit: scalar(companyRecord['@_schemeID']),
      name: scalar(findFirstByKey(partyTax, 'RegistrationName')),
    };
    const nit = result.type === '31'
      ? parseColombiaNit(`${result.number}-${result.verificationDigit}`)
      : null;
    if (!nit || !result.name) {
      throw new BadRequestException(`DIAN_RECEIVED_INVOICE_${localName.toUpperCase()}_INVALID`);
    }
    return {
      ...result,
      number: nit.base,
      verificationDigit: nit.dv,
    };
  }

  private toDatabasePayload(dto: CreateDianEventDto): Record<string, unknown> {
    return {
      responsible_person: dto.responsiblePerson ? {
        identity_type: dto.responsiblePerson.identityType,
        identity_number: dto.responsiblePerson.identityNumber,
        first_name: dto.responsiblePerson.firstName,
        family_name: dto.responsiblePerson.familyName,
        job_title: dto.responsiblePerson.jobTitle,
        organization_department: dto.responsiblePerson.organizationDepartment,
      } : undefined,
      claim_reason: dto.claimReason ? {
        list_id: dto.claimReason.listId,
        name: dto.claimReason.name,
      } : undefined,
      sworn_confirmation: dto.eventCode === '034' && dto.swornConfirmation === true,
    };
  }

  private preparationInput(request: Record<string, any>): DianEventPreparationInput {
    const person = request.responsible_person as Record<string, string> | undefined;
    const reason = request.claim_reason as Record<string, string> | undefined;
    return {
      id: String(request.event_id),
      issueDate: String(request.issue_date),
      issueTime: String(request.issue_time),
      responseCode: String(request.event_code) as DianEventCode,
      responseDescription: String(request.event_description),
      referencedDocumentId: String(request.referenced_document_id),
      referencedDocumentTypeCode: '01',
      referencedDocumentUuid: String(request.referenced_document_uuid),
      sender: request.sender,
      receiver: request.receiver,
      responsiblePerson: person ? {
        identityType: String(person.identity_type),
        identityNumber: String(person.identity_number),
        firstName: String(person.first_name),
        familyName: String(person.family_name),
        jobTitle: String(person.job_title),
        organizationDepartment: String(person.organization_department),
      } : undefined,
      claimReason: reason ? {
        listId: String(reason.list_id) as '01' | '02' | '03' | '04',
        name: String(reason.name),
      } : undefined,
      swornStatement: request.event_code === '034'
        ? String(request.sworn_statement)
        : undefined,
    };
  }

  private assertAuthoritySequence(code: DianEventCode, status: DianEventStatusResponse): void {
    const codes = new Set(status.eventCodes);
    if (['031', '032', '033', '034'].includes(code) && !codes.has('030')) {
      throw new BadRequestException('DIAN no registra el evento previo 030');
    }
    if (['031', '033', '034'].includes(code) && !codes.has('032')) {
      throw new BadRequestException('DIAN no registra el evento previo 032');
    }
    if ((code === '031' && (codes.has('033') || codes.has('034')))
        || (code === '033' && (codes.has('031') || codes.has('034')))
        || (code === '034' && (codes.has('031') || codes.has('033')))) {
      throw new BadRequestException('La secuencia legal de eventos DIAN ya es incompatible');
    }
  }

  private authoritySnapshot(status: DianEventStatusResponse): Record<string, unknown> {
    return {
      countryCode: 'CO',
      invoiceCufe: status.invoiceCufe,
      usable: status.usable,
      statusCode: status.statusCode,
      description: status.description,
      eventCodes: status.eventCodes,
      events: status.events.map((event) => ({ code: event.code })),
      authorityDocumentKey: status.authorityDocumentKey,
      authorityXml: status.authorityXml,
      authorityXmlSha256: status.authorityXmlSha256,
      signatureVerified: status.authoritySignatureTrusted === true,
      authoritySignatureTrusted: status.authoritySignatureTrusted === true,
      applicationResponseEvidence: status.applicationResponseEvidence,
      explicitNoEvents: status.explicitNoEvents,
      obtainedAt: new Date().toISOString(),
      source: 'DIAN_GET_STATUS_EVENT',
    };
  }

  private packageContext(request: Record<string, any>): DianEventPackageContext {
    return {
      packageYear: Number(request.dian_package_year),
      packageSequence: Number(request.dian_package_sequence),
      providerCode: String(request.dian_provider_code ?? ''),
    };
  }

  private resultKind(response: {
    success: boolean;
    pending?: boolean;
    authorityResponse?: boolean;
    technical?: boolean;
    statusCode: string;
    cufe?: string;
    xmlResponse?: string;
    authoritySignatureTrusted?: boolean;
    applicationResponseEvidence?: {
      referencedDocumentKeys: string[];
      responseCodes: string[];
    };
  }, expectedCude: string): EventResultKind {
    if (response.success) return 'ACCEPTED';
    const authoritativeFiscalRejection = response.authorityResponse === true
      && response.technical !== true
      && response.pending !== true
      && ['66', '90', '99'].includes(response.statusCode)
      && response.authoritySignatureTrusted === true
      && String(response.cufe ?? '').trim().toUpperCase()
        === String(expectedCude ?? '').trim().toUpperCase()
      && response.applicationResponseEvidence?.referencedDocumentKeys
        .includes(String(expectedCude ?? '').trim().toUpperCase()) === true
      && response.applicationResponseEvidence.responseCodes.length === 1
      && response.applicationResponseEvidence.responseCodes[0] === '04';
    return authoritativeFiscalRejection ? 'REJECTED' : 'TECHNICAL_ERROR';
  }

  private async finalize(
    tenantId: string,
    claim: EventClaim,
    resultKind: EventResultKind,
    responseCode: string,
    description: string,
    summary: Record<string, unknown>,
    authorityResponse?: string,
  ): Promise<EventClaim> {
    return this.rpc<EventClaim>('finalizar_evento_dian_tx', {
      p_tenant_id: tenantId,
      p_operation_id: claim.operation.id,
      p_claim_token: claim.operation.claim_token,
      p_result_kind: resultKind,
      p_response_code: responseCode || 'DIAN_EVENT_ERROR',
      p_description: description || 'Error procesando evento DIAN',
      p_response_summary: summary,
      p_authority_response: authorityResponse ?? null,
    });
  }

  private async rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.getClient().rpc(name, params);
    if (error) {
      throw new ServiceUnavailableException(`${name}: ${error.message}`);
    }
    return data as T;
  }

  private publicResult(claim: EventClaim) {
    const operation = claim.operation;
    const request = operation?.request_summary ?? {};
    return {
      success: operation?.result_kind === 'ACCEPTED',
      claimed: claim.claimed,
      idempotent: claim.idempotent === true,
      reason: claim.reason,
      operationId: operation?.id,
      state: operation?.state,
      resultKind: operation?.result_kind ?? null,
      responseCode: operation?.response_code ?? null,
      eventCode: request.event_code ?? null,
      eventCude: request.event_cude ?? null,
      attempt: operation?.attempt,
      retryAt: claim.retry_at ?? operation?.next_retry_at ?? null,
      error: operation?.error_message ?? null,
    };
  }

  private errorCode(error: unknown): string {
    if (error instanceof ServiceUnavailableException) return 'DIAN_EVENT_AUTHORITY_UNAVAILABLE';
    if (error instanceof ConflictException) return 'DIAN_EVENT_ALREADY_REGISTERED';
    if (error instanceof BadRequestException) return 'DIAN_EVENT_SEQUENCE_INVALID';
    const message = this.errorMessage(error);
    const match = /\b(DIAN_[A-Z0-9_]+)\b/u.exec(message);
    return match?.[1] ?? 'DIAN_EVENT_TECHNICAL_ERROR';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Error técnico procesando evento DIAN';
  }
}
