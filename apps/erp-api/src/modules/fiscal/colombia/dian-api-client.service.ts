import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { createHash } from 'crypto';
import { DOMParser } from '@xmldom/xmldom';
import { XMLParser } from 'fast-xml-parser';
import {
  resolveOfficialDianEndpoint,
  type DianTransportEnvironment,
} from './dian-endpoint.util';
import {
  buildSignedDianSoapEnvelope,
  DIAN_SOAP_NAMESPACES,
  dianSoapAction,
  escapeXml,
  findAllByKey,
  findFirstByKey,
  parseDianSoapResponse,
  scalar,
  type DianSoapOperation,
} from './dian-soap.util';
import { normalizeDianIdentity } from './dian-document.util';
import {
  DianSignerService,
  type DianAuthorityTrustConfig,
} from './dian-signer.service';

export { DIAN_OFFICIAL_ENDPOINTS, resolveOfficialDianEndpoint } from './dian-endpoint.util';

export interface DianConfig {
  url: string;
  environment: DianTransportEnvironment;
  nit: string;
  softwareId: string;
  softwarePin: string;
  testSetId?: string;
  /** PFX descifrado sólo en memoria; nunca se registra ni se serializa. */
  certificatePfx?: Buffer;
  certificatePassword?: string;
  /** Consecutivo anual del paquete ZIP, 00000001..FFFFFFFF (Anexo FEV 1.9). */
  packageSequence?: number;
  /** Año calendario de la reserva del paquete; se reinicia cada 1 de enero. */
  packageYear?: number;
  /** Código DIAN del proveedor tecnológico; software propio usa 000. */
  providerCode?: string;
  timeoutMs?: number;
  /** Trust store DIAN independiente del PFX tenant; ausencia = fail-closed. */
  authorityTrust?: DianAuthorityTrustConfig;
}

export interface DianEnvioResponse {
  success: boolean;
  pending?: boolean;
  /** El resultado proviene de un DianResponse parseado, no de un fault local/transporte. */
  authorityResponse?: boolean;
  /** Fault SOAP, transporte o validación local: nunca es rechazo fiscal terminal. */
  technical?: boolean;
  uncertain?: boolean;
  signatureVerified?: boolean;
  authoritySignatureTrusted?: boolean;
  statusCode: string;
  statusDescription: string;
  cufe?: string;
  trackId?: string;
  qrCode?: string;
  xmlResponse?: string;
  applicationResponseEvidence?: DianApplicationResponseEvidence;
  errors?: string[];
}

export interface DianApplicationResponseEvidence {
  rootNamespace: 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2';
  signatureCount: 1;
  referencedDocumentKeys: string[];
  responseCodes: string[];
}

export interface DianConsultaResponse {
  success: boolean;
  estado: 'ACEPTADO' | 'RECHAZADO' | 'PENDIENTE' | 'NO_ENCONTRADO';
  descripcion: string;
  cufe?: string;
  fechaProcesamiento?: Date;
  /** ApplicationResponse que DIAN devuelve en XmlBase64Bytes/XmlBytes. */
  xmlResponse?: string;
  /** Error técnico/transporte; nunca equivale a rechazo fiscal. */
  transportCode?: string;
  /** StatusCode crudo informado por DIAN; no se reemplaza por códigos internos. */
  authorityStatusCode?: string;
  /** Sólo true cuando DIAN declaró de forma inequívoca que la clave no existe. */
  explicitNotFound?: boolean;
  uncertain?: boolean;
  authoritySignatureTrusted?: boolean;
  applicationResponseEvidence?: DianApplicationResponseEvidence;
  /** Sólo true para una conclusión fiscal atribuible a DianResponse. */
  authorityResponse?: boolean;
  /** Transporte, fault o evidencia incompleta; nunca es rechazo terminal. */
  technical?: boolean;
}

export interface DianRegisteredEvent {
  code: '030' | '031' | '032' | '033' | '034';
  /** GetStatusEvent no garantiza un CUDE individual por DocumentResponse. */
  cude?: string;
  referencedCufe: string;
  fileName: string;
  /** ApplicationResponse exacto devuelto por DIAN para auditoría/reconciliación. */
  xml: string;
  xmlSha256: string;
}

export interface DianEventStatusResponse {
  success: boolean;
  /** Sólo true si la respuesta contiene una lista parseable o declara cero eventos. */
  usable: boolean;
  invoiceCufe: string;
  statusCode: string;
  description: string;
  events: DianRegisteredEvent[];
  eventCodes: Array<DianRegisteredEvent['code']>;
  /** XmlDocumentKey autoritativo; para GetStatusEvent debe coincidir con el CUFE consultado. */
  authorityDocumentKey?: string;
  /** XmlBase64Bytes decodificado sin reconstruirlo. */
  authorityXml?: string;
  authorityXmlSha256?: string;
  explicitNoEvents: boolean;
  explicitNotFound?: boolean;
  uncertain: boolean;
  authoritySignatureTrusted?: boolean;
  applicationResponseEvidence?: DianApplicationResponseEvidence;
}

export interface DianXmlByDocumentKeyResponse {
  usable: boolean;
  documentKey: string;
  code: string;
  message: string;
  validationDate?: string;
  xml?: string;
  xmlSha256?: string;
  explicitNotFound: boolean;
  uncertain: boolean;
}

interface DianNumberRange {
  prefijo: string;
  desde: number;
  hasta: number;
  resolucion: string;
  fechaInicio: Date;
  fechaFin: Date;
  claveTecnica: string;
}

@Injectable()
export class DianApiClientService {
  private readonly logger = new Logger(DianApiClientService.name);
  private readonly axiosInstance: AxiosInstance;

  constructor(private readonly signer: DianSignerService = new DianSignerService()) {
    this.axiosInstance = axios.create({
      timeout: 30000,
      maxRedirects: 0,
      maxBodyLength: 55 * 1024 * 1024,
      maxContentLength: 10 * 1024 * 1024,
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 600,
    });
  }

  configurar(config: DianConfig): void {
    this.axiosInstance.defaults.baseURL = resolveOfficialDianEndpoint(config);
    this.logger.log(`Cliente DIAN configurado: ${config.environment}`);
  }

  /** Sólo comprueba el contrato público. No autentica ni homologa al emisor. */
  async probarConectividad(config: DianConfig): Promise<{
    reachable: boolean;
    endpoint: string;
    serviceDetected: boolean;
    message: string;
  }> {
    const endpoint = resolveOfficialDianEndpoint(config);
    try {
      const wsdlUrl = `${endpoint}?singleWsdl`;
      const response = await this.axiosInstance.get(wsdlUrl, {
        timeout: 15000,
        maxRedirects: 0,
        headers: { Accept: 'application/xml,text/xml,*/*' },
        responseType: 'text',
      });
      const body = String(response.data || '');
      const serviceDetected = response.status >= 200 && response.status < 300 &&
        /WcfDianCustomerServices/u.test(body) && /soap12:binding/u.test(body) && /SendBillSync/u.test(body);
      return {
        reachable: serviceDetected,
        endpoint,
        serviceDetected,
        message: serviceDetected
          ? 'WSDL SOAP 1.2 oficial DIAN disponible.'
          : 'El endpoint respondió, pero no publicó el contrato DIAN esperado.',
      };
    } catch (error) {
      return {
        reachable: false,
        endpoint,
        serviceDetected: false,
        message: axios.isAxiosError(error)
          ? `No se pudo alcanzar el servicio DIAN (${error.code || error.response?.status || 'ERROR'}).`
          : 'No se pudo alcanzar el servicio DIAN.',
      };
    }
  }

  /** Habilitación usa SendTestSetAsync y producción SendBillSync. */
  async enviarDocumento(
    xmlContent: string,
    _attachedDocument: string,
    config: DianConfig,
  ): Promise<DianEnvioResponse> {
    const expectedDocumentKey = this.xmlText(xmlContent, 'UUID').trim().toUpperCase();
    if (!this.isTrackId(expectedDocumentKey)) {
      return this.fail(
        'DIAN_DOCUMENT_UUID_INVALID',
        'El UBL sellado no contiene el CUFE/CUDE SHA-384 esperado.',
      );
    }
    const archive = this.createDianArchive(xmlContent, config);
    if (config.environment === 'habilitacion') {
      if (!config.testSetId) return this.fail('DIAN_TEST_SET_REQUIRED', 'DIAN requiere el TestSetId de habilitación.');
      return this.sendAsyncArchive('SendTestSetAsync', archive, config, config.testSetId);
    }
    return this.sendSyncArchive(archive, expectedDocumentKey, config);
  }

  async enviarDocumentoAsync(xmlContent: string, config: DianConfig): Promise<DianEnvioResponse> {
    if (config.environment !== 'produccion') {
      return this.fail(
        'DIAN_ASYNC_ENVIRONMENT_INVALID',
        'En habilitación debe usarse SendTestSetAsync con el TestSetId asignado.',
      );
    }
    return this.sendAsyncArchive('SendBillAsync', this.createDianArchive(xmlContent, config), config);
  }

  async enviarSetPruebas(xmlContent: string, config: DianConfig): Promise<DianEnvioResponse> {
    if (config.environment !== 'habilitacion') {
      return this.fail('DIAN_TEST_SET_ENVIRONMENT_INVALID', 'SendTestSetAsync sólo se permite en habilitación.');
    }
    if (!config.testSetId) return this.fail('DIAN_TEST_SET_REQUIRED', 'DIAN requiere el TestSetId de habilitación.');
    return this.sendAsyncArchive('SendTestSetAsync', this.createDianArchive(xmlContent, config), config, config.testSetId);
  }

  async consultarEstado(cufe: string, config: DianConfig): Promise<DianConsultaResponse> {
    if (!this.isTrackId(cufe)) {
      return {
        success: false,
        estado: 'NO_ENCONTRADO',
        descripcion: 'CUFE/CUDE inválido para consulta DIAN.',
        explicitNotFound: false,
      };
    }
    const response = await this.callSoap(
      'GetStatus',
      `<wcf:GetStatus><wcf:trackId>${escapeXml(cufe)}</wcf:trackId></wcf:GetStatus>`,
      config,
    );
    return this.parseStatus(response, cufe, config, 'GetStatus');
  }

  async consultarEstadoZip(trackId: string, config: DianConfig): Promise<DianConsultaResponse> {
    if (!this.isTrackId(trackId)) {
      return {
        success: false,
        estado: 'NO_ENCONTRADO',
        descripcion: 'TrackId ZIP inválido para consulta DIAN.',
        explicitNotFound: false,
      };
    }
    const response = await this.callSoap(
      'GetStatusZip',
      `<wcf:GetStatusZip><wcf:trackId>${escapeXml(trackId)}</wcf:trackId></wcf:GetStatusZip>`,
      config,
    );
    return this.parseStatus(response, trackId, config, 'GetStatusZip');
  }

  /** Consulta sincrónica oficial de los eventos asociados a una FEV por CUFE. */
  async consultarEventosFactura(
    invoiceCufe: string,
    config: DianConfig,
  ): Promise<DianEventStatusResponse> {
    const normalized = String(invoiceCufe ?? '').trim().toUpperCase();
    if (!/^[0-9A-F]{96}$/u.test(normalized)) {
      return this.unusableEventStatus(
        normalized,
        'DIAN_EVENT_REFERENCE_INVALID',
        'GetStatusEvent requiere el CUFE SHA-384 de la factura.',
      );
    }
    const response = await this.callSoap(
      'GetStatusEvent',
      `<wcf:GetStatusEvent><wcf:trackId>${escapeXml(normalized)}</wcf:trackId></wcf:GetStatusEvent>`,
      config,
    );
    return this.parseEventStatus(response, normalized, config);
  }

  /** Recupera el UBL original por CUFE; EventResponse usa Code 100/205/206/401. */
  async consultarXmlPorClave(
    documentKey: string,
    config: DianConfig,
  ): Promise<DianXmlByDocumentKeyResponse> {
    const normalized = String(documentKey ?? '').trim().toUpperCase();
    if (!/^[0-9A-F]{96}$/u.test(normalized)) {
      return this.unusableXmlByKey(
        normalized,
        'DIAN_XML_DOCUMENT_KEY_INVALID',
        'GetXmlByDocumentKey requiere un CUFE SHA-384.',
      );
    }
    const parsed = await this.callSoap(
      'GetXmlByDocumentKey',
      `<wcf:GetXmlByDocumentKey><wcf:trackId>${escapeXml(normalized)}</wcf:trackId></wcf:GetXmlByDocumentKey>`,
      config,
    );
    if (parsed.fault) {
      return this.unusableXmlByKey(normalized, parsed.fault.code, parsed.fault.reason);
    }
    const code = scalar(findFirstByKey(parsed.root, 'Code'));
    const message = scalar(findFirstByKey(parsed.root, 'Message'))
      || 'DIAN no devolvió descripción para GetXmlByDocumentKey.';
    const validationDate = scalar(findFirstByKey(parsed.root, 'ValidationDate')) || undefined;
    const xmlBase64 = scalar(findFirstByKey(parsed.root, 'XmlBytesBase64')).replace(/\s+/g, '');
    const explicitNotFound = code === '205';
    if (!['100', 'Ok'].includes(code) || !xmlBase64 || !this.isBase64(xmlBase64)) {
      return {
        ...this.unusableXmlByKey(normalized, code || 'DIAN_XML_RESPONSE_INCOMPLETE', message),
        ...(validationDate ? { validationDate } : {}),
        explicitNotFound,
        uncertain: !['205', '206', '401'].includes(code),
      };
    }
    const payload = Buffer.from(xmlBase64, 'base64');
    if (!payload.length || payload.length > 8 * 1024 * 1024
        || (payload[0] === 0x50 && payload[1] === 0x4b)) {
      return this.unusableXmlByKey(normalized, 'DIAN_XML_PAYLOAD_INVALID', message);
    }
    const xml = payload.toString('utf8');
    const xmlCufe = this.xmlText(xml, 'UUID').toUpperCase();
    if (xml.includes('\uFFFD') || /<!DOCTYPE|<!ENTITY/iu.test(xml)
        || !/<(?:[A-Za-z_][\w.-]*:)?Invoice\b/u.test(xml)
        || xmlCufe !== normalized) {
      return this.unusableXmlByKey(normalized, 'DIAN_XML_PAYLOAD_MISMATCH', message);
    }
    if (!(await this.signer.verificarFirma(xml))) {
      return this.unusableXmlByKey(normalized, 'DIAN_XML_SIGNATURE_INVALID', message);
    }
    return {
      usable: true,
      documentKey: normalized,
      code,
      message,
      ...(validationDate ? { validationDate } : {}),
      xml,
      xmlSha256: createHash('sha256').update(xml, 'utf8').digest('hex'),
      explicitNotFound: false,
      uncertain: false,
    };
  }

  async validarNumeracion(
    prefijo: string,
    numero: number,
    config: DianConfig,
  ): Promise<{ valido: boolean; mensaje: string }> {
    if (!Number.isSafeInteger(numero) || numero <= 0) return { valido: false, mensaje: 'Número DIAN inválido.' };
    const resultado = await this.consultarRangosAutorizados(config);
    const normalizado = String(prefijo || '').trim().toUpperCase();
    const rango = resultado.rangos.find((item) =>
      item.prefijo.toUpperCase() === normalizado && numero >= item.desde && numero <= item.hasta,
    );
    return rango
      ? { valido: true, mensaje: `Número autorizado por resolución ${rango.resolucion}.` }
      : { valido: false, mensaje: 'Número fuera de los rangos vigentes informados por DIAN.' };
  }

  async consultarRangosAutorizados(config: DianConfig): Promise<{ rangos: DianNumberRange[] }> {
    const nit = this.normalizedNit(config.nit);
    if (!nit || !String(config.softwareId || '').trim()) return { rangos: [] };
    const body = `<wcf:GetNumberingRange><wcf:accountCode>${escapeXml(nit)}</wcf:accountCode><wcf:accountCodeT>${escapeXml(nit)}</wcf:accountCodeT><wcf:softwareCode>${escapeXml(config.softwareId)}</wcf:softwareCode></wcf:GetNumberingRange>`;
    const parsed = await this.callSoap('GetNumberingRange', body, config);
    if (parsed.fault) return { rangos: [] };
    const operationCode = scalar(findFirstByKey(parsed.root, 'OperationCode'));
    if (operationCode && operationCode !== '100') return { rangos: [] };
    const ranges = findAllByKey(parsed.root, 'NumberRangeResponse')
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => this.parseNumberRange(value))
      .filter((value): value is DianNumberRange => value !== null);
    return { rangos: ranges };
  }

  /**
   * La firma histórica no recibe el ApplicationResponse completo. No se
   * reconstruye desde CUFE/tipo/motivo: debe proporcionarse el UBL firmado.
   */
  async enviarEvento(
    _cufe: string,
    _tipoEvento: 'ACUSE' | 'ACEPTACION' | 'RECHAZO',
    _motivoRechazo: string | null,
    config: DianConfig,
    signedApplicationResponse?: string,
  ): Promise<DianEnvioResponse> {
    if (!signedApplicationResponse) {
      return this.fail(
        'DIAN_EVENT_XML_SIGNED_REQUIRED',
        'SendEventUpdateStatus requiere el ApplicationResponse UBL firmado; no se genera desde datos parciales.',
      );
    }
    return this.enviarEventoXml(signedApplicationResponse, config);
  }

  async enviarEventoXml(signedApplicationResponse: string, config: DianConfig): Promise<DianEnvioResponse> {
    if (!/<(?:\w+:)?ApplicationResponse\b/u.test(signedApplicationResponse)
        || !(await this.signer.verificarFirma(signedApplicationResponse))) {
      return this.fail('DIAN_EVENT_XML_INVALID', 'El evento DIAN debe ser un ApplicationResponse UBL firmado.');
    }
    const expectedCude = this.xmlText(signedApplicationResponse, 'UUID').trim().toUpperCase();
    if (!this.isTrackId(expectedCude)) {
      return this.fail('DIAN_EVENT_CUDE_INVALID', 'El ApplicationResponse firmado no contiene un CUDE válido.');
    }
    // SendEventUpdateStatus recibe contentFile, pero el contrato DIAN exige un
    // ZIP con exactamente un ar...xml. XML crudo en base64 es rechazado.
    const archive = this.createDianArchive(signedApplicationResponse, config);
    const parsed = await this.callSoap(
      'SendEventUpdateStatus',
      `<wcf:SendEventUpdateStatus><wcf:contentFile>${archive.contentBase64}</wcf:contentFile></wcf:SendEventUpdateStatus>`,
      config,
    );
    const response = this.parseDianResponse(parsed);
    const authoritySignatureTrusted = response.xmlResponse
      ? await this.verifyAuthorityResponse(response.xmlResponse, config)
      : false;
    const applicationResponseEvidence = response.xmlResponse
      ? this.applicationResponseEvidence(response.xmlResponse, expectedCude)
      : null;
    if (!response.success) {
      const authoritativeFiscalRejection = response.authorityResponse === true
        && ['66', '90', '99'].includes(response.statusCode)
        && String(response.cufe ?? '').trim().toUpperCase() === expectedCude
        && applicationResponseEvidence !== null
        && applicationResponseEvidence.responseCodes.length === 1
        && applicationResponseEvidence.responseCodes[0] === '04'
        && authoritySignatureTrusted;
      return authoritativeFiscalRejection
        ? {
          ...response,
          technical: false,
          uncertain: false,
          signatureVerified: true,
          authoritySignatureTrusted: true,
          applicationResponseEvidence,
        }
        : {
          ...response,
          authorityResponse: false,
          technical: true,
          uncertain: true,
          authoritySignatureTrusted,
          statusDescription:
            `${response.statusDescription} (sin evidencia autoritativa completa para rechazo terminal)`,
        };
    }
    if (response.statusCode !== '00'
        || String(response.cufe ?? '').trim().toUpperCase() !== expectedCude
        || applicationResponseEvidence === null
        || applicationResponseEvidence.responseCodes.length !== 1
        || applicationResponseEvidence.responseCodes[0] !== '02'
        || !authoritySignatureTrusted) {
      return {
        success: false,
        authorityResponse: false,
        technical: true,
        uncertain: true,
        authoritySignatureTrusted,
        statusCode: 'DIAN_EVENT_ACCEPTANCE_EVIDENCE_INVALID',
        statusDescription: 'DIAN no devolvió evidencia 00/CUDE/XAdES encadenada al trust store oficial para el evento.',
        errors: ['DIAN_EVENT_ACCEPTANCE_EVIDENCE_INVALID'],
      };
    }
    return {
      ...response,
      signatureVerified: true,
      authoritySignatureTrusted: true,
      applicationResponseEvidence,
    };
  }

  /** CUFE canónico pertenece al constructor UBL; se conserva por compatibilidad. */
  generarCUFE(
    numeroFactura: string,
    fechaEmision: Date,
    nitEmisor: string,
    nitReceptor: string,
    total: number,
    _subtotal: number,
    iva: number,
    _totalConImpuestos: number,
    claveTecnica: string,
  ): string {
    const data = [
      numeroFactura,
      fechaEmision.toISOString().split('T')[0].replace(/-/g, ''),
      fechaEmision.toISOString().split('T')[1].substring(0, 8).replace(/:/g, ''),
      total.toFixed(2),
      '01', iva.toFixed(2), nitEmisor, '31', nitReceptor, claveTecnica,
    ].join('');
    return require('crypto').createHash('sha384').update(data).digest('hex');
  }

  private async sendSyncArchive(
    archive: { zipFileName: string; contentBase64: string },
    expectedDocumentKey: string,
    config: DianConfig,
  ): Promise<DianEnvioResponse> {
    const body = `<wcf:SendBillSync><wcf:fileName>${escapeXml(archive.zipFileName)}</wcf:fileName><wcf:contentFile>${archive.contentBase64}</wcf:contentFile></wcf:SendBillSync>`;
    const response = this.parseDianResponse(
      await this.callSoap('SendBillSync', body, config),
    );
    const authoritySignatureTrusted = response.xmlResponse
      ? await this.verifyAuthorityResponse(response.xmlResponse, config)
      : false;
    const applicationResponseEvidence = response.xmlResponse
      ? this.applicationResponseEvidence(response.xmlResponse, expectedDocumentKey)
      : null;
    if (!response.success) {
      const authoritativeFiscalRejection = response.authorityResponse === true
        && response.technical !== true
        && response.uncertain !== true
        && ['66', '90', '99'].includes(response.statusCode)
        && String(response.cufe ?? '').trim().toUpperCase() === expectedDocumentKey
        && applicationResponseEvidence !== null
        && applicationResponseEvidence.responseCodes.length === 1
        && applicationResponseEvidence.responseCodes[0] === '04'
        && authoritySignatureTrusted;
      return authoritativeFiscalRejection
        ? {
          ...response,
          authorityResponse: true,
          technical: false,
          uncertain: false,
          signatureVerified: true,
          authoritySignatureTrusted: true,
          applicationResponseEvidence,
        }
        : {
          ...response,
          authorityResponse: false,
          technical: true,
          uncertain: true,
          authoritySignatureTrusted,
          statusDescription:
            `${response.statusDescription} (sin evidencia autoritativa completa para rechazo terminal)`,
        };
    }
    if (response.statusCode !== '00'
        || String(response.cufe ?? '').trim().toUpperCase() !== expectedDocumentKey
        || applicationResponseEvidence === null
        || applicationResponseEvidence.responseCodes.length !== 1
        || applicationResponseEvidence.responseCodes[0] !== '02'
        || !authoritySignatureTrusted) {
      return {
        success: false,
        authorityResponse: false,
        technical: true,
        uncertain: true,
        authoritySignatureTrusted,
        statusCode: 'DIAN_SYNC_ACCEPTANCE_EVIDENCE_INVALID',
        statusDescription: 'DIAN no devolvió evidencia 00/CUFE/ApplicationResponse encadenada al trust store oficial.',
        errors: ['DIAN_SYNC_ACCEPTANCE_EVIDENCE_INVALID'],
      };
    }
    return {
      ...response,
      signatureVerified: true,
      authoritySignatureTrusted: true,
      applicationResponseEvidence,
    };
  }

  private async sendAsyncArchive(
    operation: 'SendTestSetAsync' | 'SendBillAsync',
    archive: { zipFileName: string; contentBase64: string },
    config: DianConfig,
    testSetId?: string,
  ): Promise<DianEnvioResponse> {
    const testSet = operation === 'SendTestSetAsync'
      ? `<wcf:testSetId>${escapeXml(testSetId)}</wcf:testSetId>` : '';
    const body = `<wcf:${operation}><wcf:fileName>${escapeXml(archive.zipFileName)}</wcf:fileName><wcf:contentFile>${archive.contentBase64}</wcf:contentFile>${testSet}</wcf:${operation}>`;
    const parsed = await this.callSoap(operation, body, config);
    if (parsed.fault) return this.fromFault(parsed.fault);
    const errors = this.collectErrors(parsed.root);
    const zipKey = scalar(findFirstByKey(parsed.root, 'ZipKey'));
    if (!zipKey || errors.length) {
      return this.fail('DIAN_ASYNC_REJECTED', errors[0] || 'DIAN no devolvió TrackId para el ZIP.', errors);
    }
    return {
      success: false,
      pending: true,
      statusCode: 'DIAN_ASYNC_SUBMITTED',
      statusDescription: 'ZIP recibido por DIAN; falta consultar GetStatusZip para conocer la validación fiscal.',
      trackId: zipKey,
      errors: [],
    };
  }

  private async callSoap(operation: DianSoapOperation, bodyXml: string, config: DianConfig) {
    const endpoint = resolveOfficialDianEndpoint(config);
    if (!config.certificatePfx) {
      return { root: {}, fault: {
        code: 'DIAN_TRANSPORT_CERT_REQUIRED',
        reason: 'DIAN requiere certificado PFX para WS-Security.',
      } };
    }
    let envelope: string;
    try {
      envelope = buildSignedDianSoapEnvelope({
        endpoint,
        operation,
        bodyXml,
        certificatePfx: config.certificatePfx,
        certificatePassword: config.certificatePassword || '',
        expectedNit: config.nit,
      });
    } catch (error) {
      return { root: {}, fault: {
        code: 'DIAN_WS_SECURITY_INVALID',
        reason: error instanceof Error ? error.message : 'No se pudo firmar el sobre SOAP DIAN.',
      } };
    }

    try {
      const response = await this.axiosInstance.post(endpoint, envelope, {
        timeout: this.safeTimeout(config.timeoutMs),
        maxRedirects: 0,
        headers: {
          Accept: 'application/soap+xml',
          'Content-Type': `application/soap+xml; charset=utf-8; action="${dianSoapAction(operation)}"`,
        },
        responseType: 'text',
      });
      const parsed = parseDianSoapResponse(response.data);
      if (response.status < 200 || response.status >= 300) {
        return parsed.fault ? parsed : {
          root: parsed.root,
          fault: { code: `HTTP_${response.status}`, reason: 'DIAN respondió fuera del rango exitoso.' },
        };
      }
      return parsed;
    } catch (error) {
      const timeout = axios.isAxiosError(error) && ['ECONNABORTED', 'ETIMEDOUT'].includes(String(error.code));
      return { root: {}, fault: {
        code: timeout ? 'DIAN_TIMEOUT_UNCERTAIN' : 'DIAN_TRANSPORT_ERROR',
        reason: timeout
          ? 'DIAN no respondió antes del tiempo límite; el resultado es incierto y debe consultarse antes de reenviar.'
          : 'No se pudo completar el transporte SOAP DIAN.',
      } };
    }
  }

  private parseDianResponse(parsed: ReturnType<typeof parseDianSoapResponse>): DianEnvioResponse {
    if (parsed.fault) return this.fromFault(parsed.fault);
    const valid = scalar(findFirstByKey(parsed.root, 'IsValid')).toLowerCase() === 'true';
    const statusCode = scalar(findFirstByKey(parsed.root, 'StatusCode')) || 'DIAN_RESPONSE_INCOMPLETE';
    const description = scalar(findFirstByKey(parsed.root, 'StatusDescription')) ||
      scalar(findFirstByKey(parsed.root, 'StatusMessage')) || 'DIAN no devolvió descripción.';
    const errors = this.collectErrors(parsed.root);
    const cufe = scalar(findFirstByKey(parsed.root, 'XmlDocumentKey')) || undefined;
    const xmlBase64 = (scalar(findFirstByKey(parsed.root, 'XmlBase64Bytes')) ||
      scalar(findFirstByKey(parsed.root, 'XmlBytes'))).replace(/\s+/g, '');
    return {
      success: valid,
      authorityResponse: true,
      technical: false,
      uncertain: false,
      statusCode,
      statusDescription: description,
      ...(cufe ? { cufe } : {}),
      ...(xmlBase64 && this.isBase64(xmlBase64)
        ? { xmlResponse: Buffer.from(xmlBase64, 'base64').toString('utf8') } : {}),
      errors: valid ? [] : (errors.length ? errors : [description]),
    };
  }

  private async parseStatus(
    parsed: ReturnType<typeof parseDianSoapResponse>,
    key: string,
    config: DianConfig,
    operation: 'GetStatus' | 'GetStatusZip',
  ): Promise<DianConsultaResponse> {
    if (parsed.fault) {
      return {
        success: false,
        estado: 'PENDIENTE',
        descripcion: `${parsed.fault.code}: ${parsed.fault.reason}`,
        cufe: key,
        transportCode: parsed.fault.code,
        explicitNotFound: false,
        uncertain: true,
        authorityResponse: false,
        technical: true,
      };
    }
    const response = this.exactStatusResponse(parsed, operation);
    const validText = this.directScalar(response, 'IsValid').toLowerCase();
    const declaredValid = validText === 'true';
    const declaredInvalid = validText === 'false';
    const code = this.directScalar(response, 'StatusCode');
    const description = this.directScalar(response, 'StatusDescription') ||
      this.directScalar(response, 'StatusMessage') ||
      (declaredValid ? 'Documento validado por DIAN.' : 'Documento todavía no validado por DIAN.');
    // Los códigos provienen del contrato GetStatus/GetStatusZip de DIAN.
    // El texto libre nunca autoriza un reenvío: un SOAP Fault o una
    // descripción ambigua puede contener "no encontrado" sin ser evidencia.
    const requireExactDocumentKey = operation === 'GetStatus';
    const expectedNotFoundCode = requireExactDocumentKey ? '66' : '90';
    const xmlBase64 = (this.directScalar(response, 'XmlBase64Bytes') ||
      this.directScalar(response, 'XmlBytes')).replace(/\s+/g, '');
    const authorityDocumentKey = this.directScalar(response, 'XmlDocumentKey')
      .trim().toUpperCase();
    // Una inexistencia fiscal sólo es autoritativa cuando el sobre coincide
    // exactamente con el WSDL de la operación, declara IsValid=false y no
    // transporta a la vez una clave/XML contradictorios. Un código suelto o
    // anidado nunca habilita el reenvío del mismo CPE.
    const notFound = response !== null
      && declaredInvalid
      && code === expectedNotFoundCode
      && !authorityDocumentKey
      && !xmlBase64;
    let xmlResponse: string | undefined;
    if (xmlBase64 && this.isBase64(xmlBase64)) {
      const decoded = Buffer.from(xmlBase64, 'base64');
      if (decoded.length > 0 && decoded.length <= 8 * 1024 * 1024
          && !(decoded[0] === 0x50 && decoded[1] === 0x4b)) {
        const candidate = decoded.toString('utf8');
        if (!candidate.includes('\uFFFD') && !/<!DOCTYPE|<!ENTITY/iu.test(candidate)) {
          xmlResponse = candidate;
        }
      }
    }
    const authoritySignatureTrusted = xmlResponse
      ? await this.verifyAuthorityResponse(xmlResponse, config)
      : false;
    const documentKeyMatches = requireExactDocumentKey
      ? authorityDocumentKey === key.trim().toUpperCase()
      : this.isTrackId(authorityDocumentKey);
    const applicationResponseEvidence = xmlResponse && authorityDocumentKey
      ? this.applicationResponseEvidence(xmlResponse, authorityDocumentKey)
      : null;
    const accepted = response !== null && declaredValid && code === '00' && documentKeyMatches
      && authoritySignatureTrusted && applicationResponseEvidence !== null
      && applicationResponseEvidence.responseCodes.length === 1
      && applicationResponseEvidence.responseCodes[0] === '02';
    const rejected = response !== null && declaredInvalid && code === '99'
      && documentKeyMatches
      && applicationResponseEvidence !== null
      && applicationResponseEvidence.responseCodes.length === 1
      && applicationResponseEvidence.responseCodes[0] === '04'
      && authoritySignatureTrusted;
    const responseStructureInvalid = response === null || (!declaredValid && !declaredInvalid);
    const acceptanceEvidenceInvalid = declaredValid && !accepted;
    const rejectionEvidenceInvalid = declaredInvalid && code === '99' && !rejected;
    return {
      success: accepted,
      estado: accepted ? 'ACEPTADO'
        : notFound ? 'NO_ENCONTRADO'
          : rejected ? 'RECHAZADO' : 'PENDIENTE',
      descripcion: description,
      // Nunca se sustituye la clave autoritativa ausente por la consultada:
      // hacerlo convertiría una respuesta incompleta en evidencia de igualdad.
      ...(authorityDocumentKey ? { cufe: authorityDocumentKey } : {}),
      ...(xmlResponse ? { xmlResponse } : {}),
      ...(responseStructureInvalid
        ? { transportCode: 'DIAN_STATUS_RESPONSE_STRUCTURE_INVALID' }
        : acceptanceEvidenceInvalid
        ? { transportCode: 'DIAN_STATUS_ACCEPTANCE_EVIDENCE_INVALID' }
        : rejectionEvidenceInvalid
          ? { transportCode: 'DIAN_STATUS_REJECTION_EVIDENCE_INVALID' }
          : {}),
      ...(code ? { authorityStatusCode: code } : {}),
      explicitNotFound: notFound,
      uncertain: responseStructureInvalid || acceptanceEvidenceInvalid || rejectionEvidenceInvalid
        || (!accepted && !notFound && !rejected),
      authoritySignatureTrusted,
      ...(applicationResponseEvidence ? { applicationResponseEvidence } : {}),
      authorityResponse: accepted || rejected || notFound,
      technical: !accepted && !rejected && !notFound,
    };
  }

  private exactStatusResponse(
    parsed: ReturnType<typeof parseDianSoapResponse>,
    operation: 'GetStatus' | 'GetStatusZip',
  ): Record<string, unknown> | null {
    if (!this.hasExactStatusSoapStructure(parsed.rawXml, operation)) return null;
    const root = parsed.root;
    const rootRecord = this.asRecord(root);
    const envelope = this.asRecord(rootRecord?.Envelope);
    const body = this.asRecord(envelope?.Body);
    const wrapperName = `${operation}Response`;
    const resultName = `${operation}Result`;
    if (!body || findAllByKey(root, wrapperName).length !== 1
        || findAllByKey(root, resultName).length !== 1) return null;
    const wrapper = this.asRecord(body[wrapperName]);
    const result = this.asRecord(wrapper?.[resultName]);
    if (!result) return null;
    if (operation === 'GetStatus') return result;

    // GetStatusZipResult es ArrayOfDianResponse en el WSDL oficial. Este
    // cliente consulta archivos de un solo CPE: una colección vacía, múltiple
    // o con la respuesta fuera del result es ambigua y se conserva pendiente.
    const rawResponses = result.DianResponse;
    const responses = Array.isArray(rawResponses) ? rawResponses : [rawResponses];
    if (responses.length !== 1 || findAllByKey(result, 'DianResponse').length !== 1) return null;
    return this.asRecord(responses[0]);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private directScalar(record: Record<string, unknown> | null, key: string): string {
    if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return '';
    const value = record[key];
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      return String(value).trim();
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length !== 1 || entries[0][0] !== '#text') return '';
    const text = entries[0][1];
    return ['string', 'number', 'boolean'].includes(typeof text)
      ? String(text).trim()
      : '';
  }

  private hasExactStatusSoapStructure(
    xml: string | undefined,
    operation: 'GetStatus' | 'GetStatusZip',
  ): boolean {
    if (!xml) return false;
    const parseErrors: string[] = [];
    const document = new DOMParser({
      errorHandler: {
        warning: () => undefined,
        error: (message: string) => parseErrors.push(message),
        fatalError: (message: string) => parseErrors.push(message),
      },
    }).parseFromString(xml, 'application/xml');
    const root = document.documentElement;
    if (parseErrors.length > 0 || !root
        || root.localName !== 'Envelope'
        || root.namespaceURI !== DIAN_SOAP_NAMESPACES.soap) {
      return false;
    }

    const elementChildren = (parent: any): any[] => {
      const values: any[] = [];
      for (let index = 0; index < parent.childNodes.length; index += 1) {
        const child = parent.childNodes.item(index);
        if (child?.nodeType === 1) values.push(child);
      }
      return values;
    };
    const exactChildren = (parent: any, namespace: string, localName: string): any[] =>
      elementChildren(parent).filter((child) =>
        child.namespaceURI === namespace && child.localName === localName,
      );

    const bodies = exactChildren(root, DIAN_SOAP_NAMESPACES.soap, 'Body');
    if (bodies.length !== 1 || elementChildren(bodies[0]).length !== 1) return false;
    const wrapperName = `${operation}Response`;
    const wrappers = exactChildren(bodies[0], DIAN_SOAP_NAMESPACES.wcf, wrapperName);
    if (wrappers.length !== 1 || elementChildren(wrappers[0]).length !== 1) return false;
    const resultName = `${operation}Result`;
    const results = exactChildren(wrappers[0], DIAN_SOAP_NAMESPACES.wcf, resultName);
    if (results.length !== 1) return false;

    const dianResponseNamespace = 'http://schemas.datacontract.org/2004/07/DianResponse';
    let response = results[0];
    if (operation === 'GetStatusZip') {
      const responses = exactChildren(response, dianResponseNamespace, 'DianResponse');
      if (responses.length !== 1 || elementChildren(response).length !== 1) return false;
      response = responses[0];
    }
    return elementChildren(response).every((child) =>
      child.namespaceURI === dianResponseNamespace,
    );
  }

  private async parseEventStatus(
    parsed: ReturnType<typeof parseDianSoapResponse>,
    invoiceCufe: string,
    config: DianConfig,
  ): Promise<DianEventStatusResponse> {
    if (parsed.fault) {
      return this.unusableEventStatus(
        invoiceCufe,
        parsed.fault.code,
        parsed.fault.reason,
      );
    }
    const valid = scalar(findFirstByKey(parsed.root, 'IsValid')).toLowerCase() === 'true';
    const statusCode = scalar(findFirstByKey(parsed.root, 'StatusCode'))
      || 'DIAN_EVENT_RESPONSE_INCOMPLETE';
    const description = scalar(findFirstByKey(parsed.root, 'StatusDescription'))
      || scalar(findFirstByKey(parsed.root, 'StatusMessage'))
      || 'DIAN no devolvió una descripción para GetStatusEvent.';
    const authorityDocumentKey = scalar(findFirstByKey(parsed.root, 'XmlDocumentKey'))
      .trim().toUpperCase();
    const xmlBase64 = (scalar(findFirstByKey(parsed.root, 'XmlBase64Bytes'))
      || scalar(findFirstByKey(parsed.root, 'XmlBytes'))).replace(/\s+/g, '');
    const explicitNotFound = statusCode === '90';

    // Anexo FEV 1.9 §7.17: sólo 00 + IsValid=true, para el mismo CUFE y
    // con ApplicationResponse decodificable constituye evidencia utilizable.
    // 90 es un NOT_FOUND explícito, pero no autoriza a emitir ni reenviar.
    if (!valid || statusCode !== '00' || authorityDocumentKey !== invoiceCufe
        || !xmlBase64 || !this.isBase64(xmlBase64)) {
      return {
        ...this.unusableEventStatus(invoiceCufe, statusCode, description),
        ...(authorityDocumentKey ? { authorityDocumentKey } : {}),
        explicitNotFound,
        explicitNoEvents: explicitNotFound,
      };
    }

    let events: DianRegisteredEvent[] = [];
    let authorityXml = '';
    let applicationResponseEvidence: DianApplicationResponseEvidence | null = null;
    try {
      authorityXml = this.decodeEventApplicationResponse(
        Buffer.from(xmlBase64, 'base64'),
      );
      applicationResponseEvidence = this.applicationResponseEvidence(
        authorityXml,
        invoiceCufe,
      );
      if (!applicationResponseEvidence) {
        throw new Error('DIAN_EVENT_APPLICATION_RESPONSE_STRUCTURE_INVALID');
      }
      if (!(await this.verifyAuthorityResponse(authorityXml, config))) {
        return {
          ...this.unusableEventStatus(
            invoiceCufe,
            'DIAN_EVENT_AUTHORITY_SIGNATURE_UNTRUSTED',
            'GetStatusEvent no devolvió una firma encadenada al trust store DIAN configurado.',
          ),
          authorityDocumentKey,
          authoritySignatureTrusted: false,
          explicitNotFound: false,
        };
      }
      events = this.parseRegisteredEvents(authorityXml, invoiceCufe);
    } catch {
      return {
        ...this.unusableEventStatus(
          invoiceCufe,
          'DIAN_EVENT_APPLICATION_RESPONSE_INVALID',
          'GetStatusEvent devolvió un ApplicationResponse que no pudo validarse de forma segura.',
        ),
        authorityDocumentKey,
        explicitNotFound: false,
      };
    }
    const explicitNoEvents = events.length === 0;
    const eventCodes = [...new Set(events.map((event) => event.code))];
    return {
      success: true,
      usable: true,
      invoiceCufe,
      statusCode,
      description,
      events,
      eventCodes,
      authorityDocumentKey,
      authorityXml,
      authorityXmlSha256: createHash('sha256').update(authorityXml, 'utf8').digest('hex'),
      authoritySignatureTrusted: true,
      applicationResponseEvidence,
      explicitNoEvents,
      explicitNotFound: false,
      uncertain: false,
    };
  }

  private decodeEventApplicationResponse(payload: Buffer): string {
    if (!payload.length || payload.length > 8 * 1024 * 1024) {
      throw new Error('DIAN_EVENT_APPLICATION_RESPONSE_SIZE_INVALID');
    }
    // A diferencia de SendEventUpdateStatus, GetStatusEvent devuelve el UBL
    // directamente en XmlBase64Bytes, no un ZIP.
    if (payload[0] === 0x50 && payload[1] === 0x4b) {
      throw new Error('DIAN_EVENT_APPLICATION_RESPONSE_ZIP_UNEXPECTED');
    }
    const xml = payload.toString('utf8');
    if (xml.includes('\uFFFD') || /<!DOCTYPE|<!ENTITY/iu.test(xml)) {
      throw new Error('DIAN_EVENT_APPLICATION_RESPONSE_INVALID');
    }
    return xml;
  }

  private parseRegisteredEvents(xmlDocument: string, invoiceCufe: string): DianRegisteredEvent[] {
    let parsed: unknown;
    try {
      parsed = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        parseTagValue: false,
        trimValues: true,
        processEntities: false,
        isArray: (name) => ['ApplicationResponse', 'DocumentResponse', 'ResponseCode']
          .includes(String(name).replace(/^.*:/u, '')),
      }).parse(xmlDocument);
    } catch {
      throw new Error('DIAN_EVENT_APPLICATION_RESPONSE_MALFORMED');
    }
    const applicationResponses = findAllByKey(parsed, 'ApplicationResponse')
      .flatMap((value) => Array.isArray(value) ? value : [value]);
    if (applicationResponses.length !== 1 || !applicationResponses[0]
        || typeof applicationResponses[0] !== 'object') {
      throw new Error('DIAN_EVENT_APPLICATION_RESPONSE_ROOT_INVALID');
    }
    const applicationResponse = applicationResponses[0] as Record<string, unknown>;
    const responseUuid = scalar(applicationResponse.UUID).toUpperCase();
    if (!/^[0-9A-F]{96}$/u.test(responseUuid)) {
      throw new Error('DIAN_EVENT_APPLICATION_RESPONSE_CUDE_INVALID');
    }
    const documentResponses = findAllByKey(applicationResponse, 'DocumentResponse')
      .flatMap((value) => Array.isArray(value) ? value : [value]);
    const xmlSha256 = createHash('sha256').update(xmlDocument, 'utf8').digest('hex');
    const events = documentResponses.map((documentResponse) => {
      const response = findFirstByKey(documentResponse, 'Response');
      const codes = findAllByKey(response, 'ResponseCode')
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .map(scalar)
        .filter(Boolean);
      const reference = findFirstByKey(documentResponse, 'DocumentReference');
      const referencedCufe = scalar(findFirstByKey(reference, 'UUID')).toUpperCase();
      if (codes.length !== 1
          || !['030', '031', '032', '033', '034'].includes(codes[0])) {
        throw new Error('DIAN_EVENT_DOCUMENT_RESPONSE_CODE_INVALID');
      }
      if (referencedCufe !== invoiceCufe) {
        throw new Error('DIAN_EVENT_APPLICATION_RESPONSE_REFERENCE_MISMATCH');
      }
      return {
        code: codes[0] as DianRegisteredEvent['code'],
        referencedCufe,
        fileName: 'GetStatusEvent.xml',
        xml: xmlDocument,
        xmlSha256,
      };
    });
    return events.filter((event, index, all) =>
      all.findIndex((candidate) => candidate.code === event.code) === index,
    );
  }

  private unusableEventStatus(
    invoiceCufe: string,
    statusCode: string,
    description: string,
  ): DianEventStatusResponse {
    return {
      success: false,
      usable: false,
      invoiceCufe,
      statusCode,
      description,
      events: [],
      eventCodes: [],
      explicitNoEvents: false,
      uncertain: true,
    };
  }

  private unusableXmlByKey(
    documentKey: string,
    code: string,
    message: string,
  ): DianXmlByDocumentKeyResponse {
    return {
      usable: false,
      documentKey,
      code,
      message,
      explicitNotFound: code === '205',
      uncertain: !['205', '206', '401'].includes(code),
    };
  }

  private xmlText(xml: string, localName: string): string {
    const pattern = new RegExp(
      `<(?:[A-Za-z_][\\w.-]*:)?${localName}(?:\\s[^>]*)?>([^<]+)</(?:[A-Za-z_][\\w.-]*:)?${localName}>`,
      'u',
    );
    return pattern.exec(xml)?.[1]?.trim() ?? '';
  }

  private applicationResponseEvidence(
    xml: string,
    expectedDocumentKey: string,
  ): DianApplicationResponseEvidence | null {
    const applicationResponseNs =
      'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2' as const;
    const aggregateNs =
      'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
    const basicNs =
      'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
    const signatureNs = 'http://www.w3.org/2000/09/xmldsig#';
    const normalizedExpected = String(expectedDocumentKey ?? '').trim().toUpperCase();
    if (!/^[0-9A-F]{96}$/u.test(normalizedExpected)
        || !xml || /<!DOCTYPE|<!ENTITY/iu.test(xml)) {
      return null;
    }
    const parseErrors: string[] = [];
    const document = new DOMParser({
      errorHandler: {
        warning: () => undefined,
        error: (message: string) => parseErrors.push(message),
        fatalError: (message: string) => parseErrors.push(message),
      },
    }).parseFromString(xml, 'application/xml');
    const root = document.documentElement;
    if (parseErrors.length > 0 || !root
        || root.localName !== 'ApplicationResponse'
        || root.namespaceURI !== applicationResponseNs) {
      return null;
    }
    const signatures = root.getElementsByTagNameNS(signatureNs, 'Signature');
    if (signatures.length !== 1) return null;

    const directChildren = (parent: any, namespace: string, localName: string): any[] => {
      const values: any[] = [];
      for (let index = 0; index < parent.childNodes.length; index += 1) {
        const child = parent.childNodes.item(index);
        if (child?.nodeType === 1
            && child.namespaceURI === namespace
            && child.localName === localName) {
          values.push(child);
        }
      }
      return values;
    };
    const documentResponses = directChildren(root, aggregateNs, 'DocumentResponse');
    if (documentResponses.length === 0) return null;
    const referencedDocumentKeys: string[] = [];
    const responseCodes: string[] = [];
    for (const documentResponse of documentResponses) {
      const responses = directChildren(documentResponse, aggregateNs, 'Response');
      if (responses.length !== 1) return null;
      const codes = directChildren(responses[0], basicNs, 'ResponseCode');
      if (codes.length !== 1) return null;
      const responseCode = String(codes[0].textContent ?? '').trim();
      if (!responseCode) return null;
      responseCodes.push(responseCode);
      const references = directChildren(documentResponse, aggregateNs, 'DocumentReference');
      if (references.length !== 1) return null;
      const uuids = directChildren(references[0], basicNs, 'UUID');
      if (uuids.length !== 1) return null;
      const value = String(uuids[0].textContent ?? '').trim().toUpperCase();
      if (value !== normalizedExpected) return null;
      referencedDocumentKeys.push(value);
    }
    return {
      rootNamespace: applicationResponseNs,
      signatureCount: 1,
      referencedDocumentKeys: [...new Set(referencedDocumentKeys)],
      responseCodes,
    };
  }

  private async verifyAuthorityResponse(
    xml: string,
    config: DianConfig,
  ): Promise<boolean> {
    if (!config.authorityTrust) return false;
    return this.signer.verificarFirmaAutoridad(xml, config.authorityTrust);
  }

  private parseNumberRange(value: unknown): DianNumberRange | null {
    const prefijo = scalar(findFirstByKey(value, 'Prefix')).trim().toUpperCase();
    const desde = Number(scalar(findFirstByKey(value, 'FromNumber')));
    const hasta = Number(scalar(findFirstByKey(value, 'ToNumber')));
    const resolucion = scalar(findFirstByKey(value, 'ResolutionNumber'));
    const claveTecnica = scalar(findFirstByKey(value, 'TechnicalKey'));
    const fechaInicio = new Date(scalar(findFirstByKey(value, 'ValidDateFrom')));
    const fechaFin = new Date(scalar(findFirstByKey(value, 'ValidDateTo')));
    if (!/^[A-Z0-9]{0,4}$/.test(prefijo) || !resolucion || !claveTecnica || !Number.isSafeInteger(desde) || !Number.isSafeInteger(hasta) ||
        desde <= 0 || hasta < desde || !Number.isFinite(fechaInicio.getTime()) || !Number.isFinite(fechaFin.getTime())) {
      return null;
    }
    return { prefijo, desde, hasta, resolucion, fechaInicio, fechaFin, claveTecnica };
  }

  private createDianArchive(xmlContent: string, config: DianConfig): {
    zipFileName: string;
    contentBase64: string;
  } {
    if (!xmlContent || Buffer.byteLength(xmlContent, 'utf8') > 48 * 1024 * 1024 ||
        /<!DOCTYPE|<!ENTITY/i.test(xmlContent)) {
      throw new Error('Documento XML DIAN inválido o demasiado grande');
    }
    const names = this.buildOfficialArchiveNames(xmlContent, config);
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addFile(names.xmlFileName, Buffer.from(xmlContent, 'utf8'));
    const zipBuffer = zip.toBuffer() as Buffer;
    if (zipBuffer.length > 50 * 1024 * 1024) throw new Error('ZIP DIAN excede 50 MB');
    return { zipFileName: names.zipFileName, contentBase64: zipBuffer.toString('base64') };
  }

  private buildOfficialArchiveNames(xml: string, config: DianConfig): {
    xmlFileName: string;
    zipFileName: string;
  } {
    const sequence = Number(config.packageSequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 0xffffffff) {
      throw new Error('DIAN requiere el consecutivo anual inmutable del paquete (1..FFFFFFFF)');
    }
    const providerCode = String(config.providerCode || '000').trim();
    if (!/^\d{3}$/u.test(providerCode)) {
      throw new Error('Código DIAN del proveedor tecnológico inválido');
    }
    const identity = normalizeDianIdentity('31', config.nit);
    const nitWithoutDv = identity.xmlNumber.padStart(10, '0');
    const packageYear = Number(config.packageYear);
    if (!Number.isSafeInteger(packageYear) || packageYear < 2000 || packageYear > 9999) {
      throw new Error('DIAN requiere el año calendario reservado del paquete');
    }
    const root = xml.match(/^\s*(?:<\?xml[^>]*>\s*)?<(?:\w+:)?(Invoice|CreditNote|DebitNote|ApplicationResponse)\b/u)?.[1];
    const prefix = root === 'Invoice' ? 'fv' : root === 'CreditNote' ? 'nc' :
      root === 'DebitNote' ? 'nd' : root === 'ApplicationResponse' ? 'ar' : null;
    if (!prefix) throw new Error('Tipo UBL no soportado para nombre de archivo DIAN');
    const suffix = `${nitWithoutDv}${providerCode}${String(packageYear).slice(-2)}${sequence.toString(16).toUpperCase().padStart(8, '0')}`;
    return { xmlFileName: `${prefix}${suffix}.xml`, zipFileName: `z${suffix}.zip` };
  }

  private collectErrors(root: unknown): string[] {
    const values = [...findAllByKey(root, 'string'), ...findAllByKey(root, 'ProcessedMessage')]
      .flatMap((value) => Array.isArray(value) ? value : [value]);
    for (const entry of findAllByKey(root, 'XmlParamsResponseTrackId')
      .flatMap((value) => Array.isArray(value) ? value : [value])) {
      if (scalar(findFirstByKey(entry, 'Success')).toLowerCase() === 'false') {
        values.push(
          scalar(findFirstByKey(entry, 'ProcessedMessage')) ||
          scalar(findFirstByKey(entry, 'SenderCode')) ||
          'DIAN rechazó un documento del ZIP.',
        );
      }
    }
    return [...new Set(values.map(scalar).filter(Boolean))].slice(0, 100);
  }

  private fromFault(fault: { code: string; reason: string; detail?: string }): DianEnvioResponse {
    const message = `${fault.code}: ${fault.reason}`;
    return {
      success: false,
      pending: fault.code === 'DIAN_TIMEOUT_UNCERTAIN',
      authorityResponse: false,
      technical: true,
      uncertain: true,
      statusCode: fault.code,
      statusDescription: fault.reason,
      errors: [message],
    };
  }

  private fail(code: string, message: string, errors: string[] = [message]): DianEnvioResponse {
    return {
      success: false,
      authorityResponse: false,
      technical: true,
      uncertain: false,
      statusCode: code,
      statusDescription: message,
      errors,
    };
  }

  private isTrackId(value: string): boolean {
    const normalized = String(value || '').trim();
    return /^[A-Fa-f0-9]{64,128}$/u.test(normalized) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(normalized);
  }

  private normalizedNit(value: string): string {
    return String(value || '').replace(/\D/g, '');
  }

  private safeTimeout(value: unknown): number {
    const timeout = Number(value);
    return Number.isFinite(timeout) ? Math.min(60000, Math.max(5000, timeout)) : 30000;
  }

  private isBase64(value: string): boolean {
    return value.length <= 8 * 1024 * 1024 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/u.test(value);
  }
}
