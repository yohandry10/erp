import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import { FiscalServiceAbstract } from '../../shared/integration/fiscal-service.abstract';
import {
  fechaDeDocumentoEnPais,
  zonaHorariaDePais,
} from '../../shared/utils/fecha-peru.util';
import {
  ConsultaEstado,
  DocumentoElectronico,
  FiscalConfig,
  FiscalResponse,
  LibroContableFiscal,
  ValidacionDocumento,
} from '../../shared/integration/fiscal.interfaces';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { decryptBuffer, decryptText } from '../../shared/utils/secure-config.utils';
import {
  resolveArgentinaExplicitWsfeCode,
  resolveArgentinaFiscalDocument,
} from '../../shared/utils/argentina-fiscal-document.util';

export const ARCA_ENDPOINTS = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
} as const;

export type ArcaEnvironment = keyof typeof ARCA_ENDPOINTS;
export type ArcaEndpointKind = keyof (typeof ARCA_ENDPOINTS)['homologacion'];

export function resolveArcaEnvironment(value: unknown): ArcaEnvironment {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'homologacion') return 'homologacion';
  if (normalized === 'produccion') return 'produccion';
  throw new Error('Ambiente ARCA inválido: use homologacion o produccion');
}

/**
 * ARCA no ofrece endpoints configurables por contribuyente. Aceptar una URL
 * escrita por el tenant convertiría las llamadas SOAP (que incluyen CMS,
 * token y sign) en un canal SSRF/exfiltración. Por eso el valor persistido es
 * sólo una comprobación de integridad: el destino efectivo siempre se deriva
 * del ambiente y debe coincidir byte a byte con la URL oficial.
 */
export function resolveArcaOfficialEndpoint(
  environment: ArcaEnvironment,
  kind: ArcaEndpointKind,
  configuredValue?: unknown,
): string {
  const official = ARCA_ENDPOINTS[environment][kind];
  const configured = String(configuredValue ?? '').trim();
  if (!configured) return official;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`URL ${kind.toUpperCase()} de ARCA inválida`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`URL ${kind.toUpperCase()} de ARCA debe usar HTTPS y no incluir credenciales`);
  }
  const normalized = parsed.toString();
  if (
    parsed.port
    || parsed.search
    || parsed.hash
    || configured !== normalized
    || normalized !== official
  ) {
    throw new Error(
      `URL ${kind.toUpperCase()} no autorizada para ARCA ${environment}; debe usarse el endpoint oficial`,
    );
  }
  return official;
}

export function normalizeArcaEndpointConfiguration<T extends Record<string, unknown>>(
  input: T,
): T {
  const hasArcaEndpointConfiguration = [
    'arca_environment', 'arca_wsaa_url', 'arca_wsfe_url',
  ].some((key) => input[key] !== undefined && input[key] !== null && input[key] !== '');
  if (!hasArcaEndpointConfiguration) return input;

  const environment = resolveArcaEnvironment(input.arca_environment);
  return {
    ...input,
    arca_environment: environment,
    arca_wsaa_url: resolveArcaOfficialEndpoint(environment, 'wsaa', input.arca_wsaa_url),
    arca_wsfe_url: resolveArcaOfficialEndpoint(environment, 'wsfe', input.arca_wsfe_url),
  };
}

interface ArcaTenantConfig {
  environment: ArcaEnvironment;
  wsaaUrl: string;
  wsfeUrl: string;
  cuit: string;
  puntoVenta: number;
  condicionIva: string;
  certificate: Buffer;
  certificatePassword: string;
  activo: boolean;
}

interface ArcaTicket {
  token: string;
  sign: string;
  expirationTime: string;
}

export function normalizeArgentinaTaxId(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function validateArgentinaTaxId(value: unknown): boolean {
  const cuit = normalizeArgentinaTaxId(value);
  if (!/^\d{11}$/.test(cuit)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(cuit[index]) * weight, 0);
  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;
  return expected === Number(cuit[10]);
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function soapValue(xml: string, tag: string): string | null {
  const match = xml.match(
    new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'),
  );
  return match?.[1]?.trim() ?? null;
}

/**
 * `CbteFch` en el formato AAAAMMDD que espera WSFEv1.
 *
 * Usaba los getters UTC sobre `fecha_emision`, que es `timestamptz`. En
 * Argentina (UTC-3) una factura emitida entre las 00:00 y las 03:00 salía
 * fechada al día siguiente, y ARCA compara `CbteFch` contra su propia fecha.
 *
 * `CbteFch` es una fecha de calendario, no un instante: el día fiscal del
 * contribuyente. Como ARCA sólo emite para Argentina, la zona es fija.
 */
function resolveArcaDocumentDate(value: Date | string): string {
  const date = fechaDeDocumentoEnPais(value, zonaHorariaDePais('AR'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha inválida para ARCA');
  return date;
}

function formatArcaDate(value: Date | string): string {
  return resolveArcaDocumentDate(value).replace(/-/g, '');
}

function resolveArcaTaxBases(document: DocumentoElectronico): {
  taxable: number;
  exempt: number;
  nonTaxable: number;
} {
  const subtotal = Number(document.subtotal);
  const exempt = Number(document.totalExoneradas ?? 0);
  const nonTaxable = Number(document.totalInafectas ?? 0);
  const taxable = document.totalGravadas == null
    ? subtotal - exempt - nonTaxable
    : Number(document.totalGravadas);
  if (![subtotal, taxable, exempt, nonTaxable].every(Number.isFinite)
      || [taxable, exempt, nonTaxable].some((value) => value < -0.005)) {
    throw new Error('Las bases ARCA deben ser importes finitos no negativos');
  }
  if (Math.abs(taxable + exempt + nonTaxable - subtotal) > 0.02) {
    throw new Error('Las bases gravada, exenta y no gravada no coinciden con el subtotal');
  }
  return {
    taxable: Math.abs(taxable) < 0.005 ? 0 : taxable,
    exempt: Math.abs(exempt) < 0.005 ? 0 : exempt,
    nonTaxable: Math.abs(nonTaxable) < 0.005 ? 0 : nonTaxable,
  };
}

function resolveArcaIdentityType(type: string, number: string): number {
  const normalized = String(type ?? '').trim().toUpperCase();
  if (normalized === 'CUIT' || normalized === '80') return 80;
  if (normalized === 'CUIL' || normalized === '86') return 86;
  if (normalized === 'CDI' || normalized === '87') return 87;
  if (normalized === 'DNI' || normalized === '96') return 96;
  if ((normalized === 'CONSUMIDOR_FINAL' || normalized === '99')
      && (!number || /^0+$/.test(number))) return 99;
  throw new Error('Tipo de documento ARCA del receptor inválido');
}

function isValidArcaCompactDate(value: unknown): boolean {
  const normalized = String(value ?? '').trim();
  if (!/^\d{8}$/.test(normalized)) return false;
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const day = Number(normalized.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function resolveArcaVatCode(rate: number): number {
  const rounded = Math.round(rate * 100) / 100;
  if (rounded === 0) return 3;
  if (rounded === 2.5) return 9;
  if (rounded === 5) return 8;
  if (rounded === 10.5) return 4;
  if (rounded === 21) return 5;
  if (rounded === 27) return 6;
  throw new Error(`Alícuota de IVA no soportada por WSFEv1: ${rate}%`);
}

export function resolveArcaCurrencyCode(value: unknown): 'PES' | 'DOL' {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'ARS' || normalized === 'PES') return 'PES';
  if (normalized === 'USD' || normalized === 'DOL') return 'DOL';
  throw new Error('Moneda ARCA no soportada: use ARS o USD');
}

function resolveArcaPersistedCurrency(document: DocumentoElectronico): {
  code: 'PES' | 'DOL';
  exchangeRate: number;
  sameCurrencyPayment?: 'S' | 'N';
} {
  const code = resolveArcaCurrencyCode(document.moneda);
  if (code === 'PES') return { code, exchangeRate: 1 };
  const sameCurrencyPayment = String(document.arcaPagoMismaMoneda ?? '').trim().toUpperCase();
  if (!['S', 'N'].includes(sameCurrencyPayment)) {
    throw new Error('Moneda extranjera ARCA exige informar CanMisMonExt como S o N');
  }
  const exchangeRate = Number(document.arcaCotizacion);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error('Moneda extranjera ARCA exige una cotización oficial positiva persistida');
  }
  return {
    code,
    exchangeRate,
    sameCurrencyPayment: sameCurrencyPayment as 'S' | 'N',
  };
}

function resolveArcaConceptDates(document: DocumentoElectronico): {
  concept: 1 | 2 | 3;
  serviceFrom?: string;
  serviceUntil?: string;
  paymentDue?: string;
} {
  const concept = Number(document.arcaConcepto ?? 1);
  if (![1, 2, 3].includes(concept)) {
    throw new Error('Concepto ARCA inválido: use 1 productos, 2 servicios o 3 mixto');
  }
  const rawDates = [
    document.arcaFechaServicioDesde,
    document.arcaFechaServicioHasta,
    document.arcaFechaVencimientoPago,
  ];
  const hasAnyDate = rawDates.some((value) => value !== undefined && value !== null && value !== '');
  if ((concept === 2 || concept === 3 || hasAnyDate)
      && rawDates.some((value) => value === undefined || value === null || value === '')) {
    throw new Error(
      'Conceptos ARCA de servicios o mixtos exigen FchServDesde, FchServHasta y FchVtoPago',
    );
  }
  if (!hasAnyDate) return { concept: concept as 1 | 2 | 3 };

  const serviceFrom = formatArcaDate(rawDates[0] as Date | string);
  const serviceUntil = formatArcaDate(rawDates[1] as Date | string);
  const paymentDue = formatArcaDate(rawDates[2] as Date | string);
  const issueDate = formatArcaDate(document.fechaEmision);
  if (serviceFrom > serviceUntil) {
    throw new Error('FchServDesde no puede ser posterior a FchServHasta');
  }
  if (paymentDue < issueDate) {
    throw new Error('FchVtoPago no puede ser anterior a CbteFch');
  }
  return {
    concept: concept as 1 | 2 | 3,
    serviceFrom,
    serviceUntil,
    paymentDue,
  };
}

function resolveArcaTributes(document: DocumentoElectronico): {
  total: number;
  rows: NonNullable<DocumentoElectronico['arcaTributos']>;
} {
  const rawRows = document.arcaTributos ?? [];
  if (!Array.isArray(rawRows) || rawRows.length > 20) {
    throw new Error('Tributos ARCA debe contener hasta 20 registros');
  }
  const rows = rawRows.map((row, index) => {
    const id = Number(row?.id);
    const description = String(row?.descripcion ?? '').trim();
    const base = Number(row?.baseImponible);
    const rate = Number(row?.alicuota);
    const amount = Number(row?.importe);
    if (![1, 2, 3, 4, 99].includes(id)) {
      throw new Error(`Tipo de tributo ARCA inválido en la fila ${index + 1}`);
    }
    if (!description || description.length > 80) {
      throw new Error(`Descripción de tributo ARCA inválida en la fila ${index + 1}`);
    }
    if (![base, rate, amount].every(Number.isFinite)
        || base < 0 || rate < 0 || rate > 999.99 || amount < 0) {
      throw new Error(`Importes de tributo ARCA inválidos en la fila ${index + 1}`);
    }
    const calculated = Math.round(base * rate) / 100;
    if (Math.abs(calculated - amount) > 0.01) {
      throw new Error(`El tributo ARCA ${index + 1} no coincide con base por alícuota`);
    }
    return {
      id: id as 1 | 2 | 3 | 4 | 99,
      descripcion: description,
      baseImponible: base,
      alicuota: rate,
      importe: amount,
    };
  });
  const total = Number(rows.reduce((sum, row) => sum + row.importe, 0).toFixed(2));
  const declared = Number(document.totalTributos ?? total);
  if (!Number.isFinite(declared) || declared < 0 || Math.abs(declared - total) > 0.01) {
    throw new Error('ImpTrib no coincide con la suma del detalle de Tributos');
  }
  return { total, rows };
}

@Injectable()
export class ArcaFiscalService extends FiscalServiceAbstract {
  private tenantConfig: ArcaTenantConfig | null = null;
  private ticketCache = new Map<string, ArcaTicket>();

  constructor(
    private readonly configService: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService,
  ) {
    const environment = resolveArcaEnvironment(configService.get('ARCA_ENVIRONMENT'));
    const config: FiscalConfig = {
      url: resolveArcaOfficialEndpoint(
        environment,
        'wsfe',
        configService.get('ARCA_WSFE_URL'),
      ),
      usuario: '',
      password: '',
      empresaId: configService.get('EMPRESA_CUIT') || '',
      certificatePath: configService.get('ARCA_CERTIFICATE_PATH') || '',
      certificatePassword: configService.get('ARCA_CERTIFICATE_PASSWORD') || '',
      environment,
      pais: 'AR',
    };
    super(config);
  }

  override async verificarConfiguracion(): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const config = await this.loadTenantConfig();
      const errors: string[] = [];
      if (!config.activo) errors.push('Integración ARCA no activada');
      if (!validateArgentinaTaxId(config.cuit)) errors.push('CUIT representada inválida');
      if (!Number.isSafeInteger(config.puntoVenta) || config.puntoVenta < 1 || config.puntoVenta > 99998) {
        errors.push('Punto de venta ARCA inválido: debe estar entre 1 y 99998');
      }
      if (!['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO'].includes(
        String(config.condicionIva || '').toUpperCase(),
      )) errors.push('Condición IVA del emisor inválida o no configurada');
      if (!config.certificate.length) errors.push('Certificado digital ARCA no configurado');
      return { valid: errors.length === 0, errors };
    } catch (error) {
      return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async obtenerCotizacionOficial(
    moneda: string,
    fecha: Date | string,
  ): Promise<{ monedaArca: 'PES' | 'DOL'; cotizacion: number; fecha: string }> {
    const code = resolveArcaCurrencyCode(moneda);
    const issueDate = formatArcaDate(fecha);
    if (code === 'PES') return { monedaArca: code, cotizacion: 1, fecha: issueDate };
    const config = await this.loadTenantConfig();
    if (!config.activo) throw new Error('La integración ARCA está desactivada');
    const ticket = await this.getAccessTicket(config);
    const quote = await this.getOfficialExchangeRate(config, ticket, code, issueDate);
    return { monedaArca: code, cotizacion: quote, fecha: issueDate };
  }

  async enviarDocumento(documento: DocumentoElectronico): Promise<FiscalResponse> {
    try {
      const validation = await this.validarDocumento(documento);
      if (!validation.valido) {
        return {
          success: false,
          codigoRespuesta: 'ARCA_VALIDATION',
          descripcionRespuesta: validation.errores.join('; '),
          errores: validation.errores,
        };
      }

      const config = await this.loadTenantConfig();
      if (!config.activo) throw new Error('La integración ARCA está desactivada');
      const ticket = await this.getAccessTicket(config);
      const fiscalDocument = resolveArgentinaFiscalDocument({
        documentType: documento.tipoDocumento,
        issuerVatCondition: documento.emisor.condicionIva,
        receiverVatCondition: documento.receptor.condicionIva,
        authorizationVariant: documento.arcaAuthorizationVariant,
      });
      const tenantFiscalDocument = resolveArgentinaFiscalDocument({
        documentType: documento.tipoDocumento,
        issuerVatCondition: config.condicionIva,
        receiverVatCondition: documento.receptor.condicionIva,
        authorizationVariant: documento.arcaAuthorizationVariant,
      });
      if (tenantFiscalDocument.wsfeCode !== fiscalDocument.wsfeCode) {
        throw new Error('La condición IVA del emisor no coincide con la configuración ARCA del tenant');
      }
      const type = fiscalDocument.wsfeCode;
      const requestedNumber = Number(documento.numero);
      if (!Number.isSafeInteger(requestedNumber) || requestedNumber < 1) {
        throw new Error('Número de comprobante ARCA inválido');
      }

      const lastAuthorized = await this.getLastAuthorized(config, ticket, type);
      if (requestedNumber !== lastAuthorized + 1) {
        throw new Error(
          `Numeración ARCA fuera de secuencia: WSFE espera ${lastAuthorized + 1} y se recibió ${requestedNumber}`,
        );
      }

      const requestedIssueDate = formatArcaDate(documento.fechaEmision);
      const persistedCurrency = resolveArcaPersistedCurrency(documento);
      const officialExchangeRate = persistedCurrency.code === 'PES'
        ? 1
        : await this.getOfficialExchangeRate(
            config,
            ticket,
            persistedCurrency.code,
            requestedIssueDate,
          );
      if (Math.abs(officialExchangeRate - persistedCurrency.exchangeRate) > 0.000001) {
        throw new Error(
          'La cotización persistida no coincide con FEParamGetCotizacion de ARCA para la fecha fiscal',
        );
      }
      const currencyContext = {
        ...persistedCurrency,
        exchangeRate: officialExchangeRate,
      };
      const soap = this.buildAuthorizeRequest(
        config,
        ticket,
        documento,
        type,
        requestedNumber,
        fiscalDocument.receiverVatConditionId,
        requestedIssueDate,
        currencyContext,
      );
      const response = await this.postSoap(
        config.wsfeUrl,
        soap,
        'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
        config.environment,
        'wsfe',
      );
      const result = soapValue(response, 'Resultado');
      const cae = soapValue(response, 'CAE');
      const caeExpiration = soapValue(response, 'CAEFchVto');
      const authorizedIssueDate = soapValue(response, 'CbteFch');
      const errors = this.extractMessages(response, 'Err');
      const observations = this.extractMessages(response, 'Obs');

      if (result !== 'A' || !cae) {
        return {
          success: false,
          codigoRespuesta: soapValue(response, 'Code') || 'ARCA_REJECTED',
          descripcionRespuesta: errors[0] || observations[0] || 'Comprobante rechazado por ARCA',
          errores: errors,
          observaciones: observations,
          metadata: { resultado: result },
        };
      }
      if (!/^\d{14}$/.test(cae) || !isValidArcaCompactDate(caeExpiration)
          || !isValidArcaCompactDate(authorizedIssueDate)) {
        throw new Error('ARCA autorizó sin evidencia CAE, fecha fiscal o vencimiento válida y completa');
      }
      if (authorizedIssueDate !== requestedIssueDate) {
        throw new Error('ARCA devolvió una fecha fiscal distinta de la fecha solicitada');
      }

      const qrUrl = this.buildQrUrl(
        config,
        documento,
        type,
        requestedNumber,
        cae,
        authorizedIssueDate,
        currencyContext,
      );
      return {
        success: true,
        codigoRespuesta: 'A',
        descripcionRespuesta: 'Comprobante autorizado por ARCA',
        numeroComprobante: `${String(config.puntoVenta).padStart(5, '0')}-${String(requestedNumber).padStart(8, '0')}`,
        hashDocumento: cae,
        hash: cae,
        observaciones: observations,
        fechaProceso: new Date().toISOString(),
        metadata: {
          cae,
          caeVencimiento: caeExpiration,
          puntoVenta: config.puntoVenta,
          tipoComprobante: type,
          condicionIvaEmisor: fiscalDocument.issuerVatCondition,
          condicionIvaReceptorId: fiscalDocument.receiverVatConditionId,
          modalidadAutorizacion: fiscalDocument.authorizationVariant,
          fechaFiscalAutorizada: `${authorizedIssueDate.slice(0, 4)}-${authorizedIssueDate.slice(4, 6)}-${authorizedIssueDate.slice(6, 8)}`,
          moneda: currencyContext.code,
          cotizacion: currencyContext.exchangeRate,
          canMisMonExt: currencyContext.sameCurrencyPayment ?? null,
          qrUrl,
        },
      };
    } catch (error) {
      this.logError('enviarDocumento ARCA', error);
      return {
        success: false,
        codigoRespuesta: 'ARCA_TECHNICAL',
        descripcionRespuesta: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async consultarEstado(consulta: ConsultaEstado): Promise<FiscalResponse> {
    try {
      const config = await this.loadTenantConfig();
      const ticket = await this.getAccessTicket(config);
      const type = resolveArgentinaExplicitWsfeCode(consulta.tipoDocumento);
      const number = Number(consulta.numero);
      const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body><ar:FECompConsultar><ar:Auth>
    <ar:Token>${escapeXml(ticket.token)}</ar:Token><ar:Sign>${escapeXml(ticket.sign)}</ar:Sign>
    <ar:Cuit>${config.cuit}</ar:Cuit>
  </ar:Auth><ar:FeCompConsReq>
    <ar:CbteTipo>${type}</ar:CbteTipo><ar:CbteNro>${number}</ar:CbteNro>
    <ar:PtoVta>${config.puntoVenta}</ar:PtoVta>
  </ar:FeCompConsReq></ar:FECompConsultar></soap:Body>
</soap:Envelope>`;
      const response = await this.postSoap(
        config.wsfeUrl,
        body,
        'http://ar.gov.afip.dif.FEV1/FECompConsultar',
        config.environment,
        'wsfe',
      );
      const cae = soapValue(response, 'CodAutorizacion');
      const result = soapValue(response, 'Resultado');
      const caeExpiration = soapValue(response, 'FchVto');
      const errors = this.extractMessages(response, 'Err');
      const validAuthorization = result === 'A'
        && /^\d{14}$/.test(String(cae ?? ''))
        && isValidArcaCompactDate(caeExpiration);
      return {
        success: validAuthorization,
        codigoRespuesta: result === 'A' && !validAuthorization
          ? 'ARCA_INVALID_EVIDENCE'
          : result || soapValue(response, 'Code') || 'ARCA_UNKNOWN',
        descripcionRespuesta: validAuthorization
          ? 'Comprobante autorizado por ARCA'
          : result === 'A'
            ? 'ARCA respondió autorizado sin CAE/vencimiento fiscal válido'
          : errors[0] || 'ARCA no devolvió un comprobante autorizado',
        hash: cae ?? undefined,
        numeroComprobante: `${String(config.puntoVenta).padStart(5, '0')}-${String(number).padStart(8, '0')}`,
        errores: errors,
        metadata: {
          cae,
          caeVencimiento: caeExpiration,
          puntoVenta: config.puntoVenta,
          tipoComprobante: type,
          resultado: result,
        },
      };
    } catch (error) {
      return {
        success: false,
        codigoRespuesta: 'ARCA_TECHNICAL',
        descripcionRespuesta: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async validarDocumento(documento: DocumentoElectronico): Promise<ValidacionDocumento> {
    const errores: string[] = [];
    const advertencias: string[] = [];
    if (!validateArgentinaTaxId(documento.emisor.numeroDocumento)) {
      errores.push('CUIT del emisor inválida: debe tener 11 dígitos y dígito verificador correcto');
    }
    let fiscalDocument: ReturnType<typeof resolveArgentinaFiscalDocument> | null = null;
    try {
      fiscalDocument = resolveArgentinaFiscalDocument({
        documentType: documento.tipoDocumento,
        issuerVatCondition: documento.emisor.condicionIva,
        receiverVatCondition: documento.receptor.condicionIva,
        authorizationVariant: documento.arcaAuthorizationVariant,
      });
    } catch (error) {
      errores.push(error instanceof Error ? error.message : String(error));
    }
    try {
      resolveArcaPersistedCurrency(documento);
    } catch (error) {
      errores.push(error instanceof Error ? error.message : String(error));
    }
    let receiverIdentityType: number | null = null;
    try {
      receiverIdentityType = resolveArcaIdentityType(
        documento.receptor.tipoDocumento,
        normalizeArgentinaTaxId(documento.receptor.numeroDocumento),
      );
    } catch (error) {
      errores.push(error instanceof Error ? error.message : String(error));
    }
    if (receiverIdentityType != null && [80, 86, 87].includes(receiverIdentityType)
        && !validateArgentinaTaxId(documento.receptor.numeroDocumento)) {
      errores.push('CUIT/CUIL/CDI del receptor inválido: el dígito verificador no coincide');
    }
    if (fiscalDocument?.documentClass === 'A' && receiverIdentityType !== 80) {
      errores.push('Comprobante ARCA clase A exige receptor identificado con CUIT (DocTipo 80)');
    }
    if (fiscalDocument?.documentClass === 'C') {
      const hasVat = Math.abs(Number(documento.totalImpuestos || 0)) > 0.005
        || (documento.items || []).some((item) => {
          const rawRate = Number(item.tasaIgv ?? documento.tasaImpuesto ?? 0);
          return Math.abs(rawRate) > 0.0001 || Math.abs(Number(item.igv || 0)) > 0.005;
        });
      if (hasVat) errores.push('Comprobante ARCA clase C debe emitirse sin IVA discriminado');
    }
    if (documento.importeTotal <= 0) errores.push('El importe total debe ser mayor que cero');
    let tributeTotal = 0;
    try {
      tributeTotal = resolveArcaTributes(documento).total;
    } catch (error) {
      errores.push(error instanceof Error ? error.message : String(error));
    }
    if (Math.abs(
      documento.subtotal + documento.totalImpuestos + tributeTotal - documento.importeTotal,
    ) > 0.02) {
      errores.push('Subtotal + IVA + otros tributos no coincide con el total del comprobante');
    }
    try {
      resolveArcaConceptDates(documento);
    } catch (error) {
      errores.push(error instanceof Error ? error.message : String(error));
    }
    try {
      resolveArcaTaxBases(documento);
    } catch (error) {
      errores.push(error instanceof Error ? error.message : String(error));
    }
    for (const item of documento.items || []) {
      const rate = Number(item.tasaIgv ?? documento.tasaImpuesto ?? 21);
      try {
        resolveArcaVatCode(rate <= 1 ? rate * 100 : rate);
      } catch (error) {
        errores.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!documento.receptor.numeroDocumento) {
      advertencias.push('Receptor sin documento: se informará como Consumidor Final cuando corresponda');
    }
    return {
      valido: errores.length === 0,
      errores: [...new Set(errores)],
      advertencias,
      numeroDocumento: `${documento.serie}-${documento.numero}`,
      tipoDocumento: documento.tipoDocumento,
    };
  }

  async generarXML(documento: DocumentoElectronico): Promise<string> {
    const type = resolveArgentinaFiscalDocument({
      documentType: documento.tipoDocumento,
      issuerVatCondition: documento.emisor.condicionIva,
      receiverVatCondition: documento.receptor.condicionIva,
      authorizationVariant: documento.arcaAuthorizationVariant,
    }).wsfeCode;
    const conceptDates = resolveArcaConceptDates(documento);
    const tributes = resolveArcaTributes(documento);
    const currency = resolveArcaPersistedCurrency(documento);
    return `<ArcaComprobante><Tipo>${type}</Tipo><Numero>${escapeXml(documento.numero)}</Numero>` +
      `<Fecha>${formatArcaDate(documento.fechaEmision)}</Fecha><Moneda>${escapeXml(documento.moneda)}</Moneda>` +
      `<MonId>${currency.code}</MonId><MonCotiz>${currency.exchangeRate.toFixed(6)}</MonCotiz>` +
      `${currency.sameCurrencyPayment ? `<CanMisMonExt>${currency.sameCurrencyPayment}</CanMisMonExt>` : ''}` +
      `<Neto>${documento.subtotal.toFixed(2)}</Neto><IVA>${documento.totalImpuestos.toFixed(2)}</IVA>` +
      `<OtrosTributos>${tributes.total.toFixed(2)}</OtrosTributos><Concepto>${conceptDates.concept}</Concepto>` +
      `<Total>${documento.importeTotal.toFixed(2)}</Total></ArcaComprobante>`;
  }

  async firmarXML(xmlContent: string): Promise<string> {
    // WSFEv1 no recibe una factura XML firmada: la firma CMS se aplica al TRA de WSAA.
    return xmlContent;
  }

  async enviarLibroContable(_libro: LibroContableFiscal): Promise<FiscalResponse> {
    return {
      success: false,
      codigoRespuesta: 'NOT_APPLICABLE',
      descripcionRespuesta:
        'WSFEv1 autoriza comprobantes; los libros e impuestos provinciales se exportan desde Contabilidad.',
    };
  }

  private async loadTenantConfig(): Promise<ArcaTenantConfig> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant requerido para cargar configuración ARCA');
    const { data, error } = await this.supabase
      .getClient()
      .from('empresa_config')
      .select([
        'ruc', 'pais', 'certificado_pfx', 'certificado_password',
        'arca_activo', 'arca_environment', 'arca_wsaa_url', 'arca_wsfe_url',
        'arca_cuit_representada', 'arca_punto_venta', 'arca_condicion_iva',
      ].join(','))
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new Error(`No se pudo cargar configuración ARCA: ${error.message}`);
    const row = data as any;
    if (!row || String(row.pais).toUpperCase() !== 'AR') {
      throw new Error('El tenant no está configurado para Argentina');
    }
    const environment = resolveArcaEnvironment(row.arca_environment);
    const certificate = decryptBuffer(this.configService, row.certificado_pfx) ?? Buffer.alloc(0);
    const config: ArcaTenantConfig = {
      environment,
      wsaaUrl: resolveArcaOfficialEndpoint(environment, 'wsaa', row.arca_wsaa_url),
      wsfeUrl: resolveArcaOfficialEndpoint(environment, 'wsfe', row.arca_wsfe_url),
      cuit: normalizeArgentinaTaxId(row.arca_cuit_representada || row.ruc),
      puntoVenta: Number(row.arca_punto_venta || 0),
      condicionIva: row.arca_condicion_iva || '',
      certificate,
      certificatePassword: decryptText(this.configService, row.certificado_password),
      activo: row.arca_activo === true,
    };
    if (!Number.isSafeInteger(config.puntoVenta) || config.puntoVenta < 1 || config.puntoVenta > 99998) {
      throw new Error('Punto de venta ARCA inválido: debe estar entre 1 y 99998');
    }
    this.tenantConfig = config;
    return config;
  }

  private async getAccessTicket(config: ArcaTenantConfig): Promise<ArcaTicket> {
    const key = `${config.environment}:${config.cuit}`;
    const cached = this.ticketCache.get(key);
    if (cached && new Date(cached.expirationTime).getTime() > Date.now() + 5 * 60 * 1000) {
      return cached;
    }
    if (!config.certificate.length) throw new Error('Certificado X.509 de ARCA no configurado');
    const tra = this.buildLoginTicketRequest();
    const cms = this.signCms(tra, config.certificate, config.certificatePassword);
    const request = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soap:Body><wsaa:loginCms><wsaa:in0>${escapeXml(cms)}</wsaa:in0></wsaa:loginCms></soap:Body>
</soap:Envelope>`;
    const response = await this.postSoap(
      config.wsaaUrl,
      request,
      '',
      config.environment,
      'wsaa',
    );
    const loginCmsReturn = soapValue(response, 'loginCmsReturn');
    if (!loginCmsReturn) {
      throw new Error(soapValue(response, 'faultstring') || 'WSAA no devolvió Ticket de Acceso');
    }
    const decoded = loginCmsReturn
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const ticket: ArcaTicket = {
      token: soapValue(decoded, 'token') || '',
      sign: soapValue(decoded, 'sign') || '',
      expirationTime: soapValue(decoded, 'expirationTime') || '',
    };
    if (!ticket.token || !ticket.sign || !ticket.expirationTime) {
      throw new Error('Ticket de Acceso WSAA incompleto');
    }
    this.ticketCache.set(key, ticket);
    return ticket;
  }

  private buildLoginTicketRequest(): string {
    const now = Date.now();
    const generation = new Date(now - 10 * 60 * 1000).toISOString();
    const expiration = new Date(now + 10 * 60 * 1000).toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now / 1000)}</uniqueId>` +
      `<generationTime>${generation}</generationTime><expirationTime>${expiration}</expirationTime>` +
      `</header><service>wsfe</service></loginTicketRequest>`;
  }

  private signCms(content: string, pfxBuffer: Buffer, password: string): string {
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
    const keyBag =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ]?.[0] ??
      p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
    if (!certBag?.cert || !keyBag?.key) {
      throw new Error('El PFX no contiene certificado y clave privada utilizables por WSAA');
    }
    const signed = forge.pkcs7.createSignedData();
    signed.content = forge.util.createBuffer(content, 'utf8');
    signed.addCertificate(certBag.cert);
    signed.addSigner({
      key: keyBag.key as forge.pki.rsa.PrivateKey,
      certificate: certBag.cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
      ],
    });
    signed.sign({ detached: false });
    return forge.util.encode64(forge.asn1.toDer(signed.toAsn1()).getBytes());
  }

  private async getLastAuthorized(
    config: ArcaTenantConfig,
    ticket: ArcaTicket,
    type: number,
  ): Promise<number> {
    const request = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body><ar:FECompUltimoAutorizado><ar:Auth>
    <ar:Token>${escapeXml(ticket.token)}</ar:Token><ar:Sign>${escapeXml(ticket.sign)}</ar:Sign>
    <ar:Cuit>${config.cuit}</ar:Cuit>
  </ar:Auth><ar:PtoVta>${config.puntoVenta}</ar:PtoVta><ar:CbteTipo>${type}</ar:CbteTipo>
  </ar:FECompUltimoAutorizado></soap:Body>
</soap:Envelope>`;
    const response = await this.postSoap(
      config.wsfeUrl,
      request,
      'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
      config.environment,
      'wsfe',
    );
    const number = Number(soapValue(response, 'CbteNro'));
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new Error(this.extractMessages(response, 'Err')[0] || 'ARCA no devolvió último comprobante');
    }
    return number;
  }

  private async getOfficialExchangeRate(
    config: ArcaTenantConfig,
    ticket: ArcaTicket,
    currency: 'DOL',
    issueDate: string,
  ): Promise<number> {
    if (!isValidArcaCompactDate(issueDate)) {
      throw new Error('Fecha de cotización ARCA inválida');
    }
    const request = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body><ar:FEParamGetCotizacion><ar:Auth>
    <ar:Token>${escapeXml(ticket.token)}</ar:Token><ar:Sign>${escapeXml(ticket.sign)}</ar:Sign>
    <ar:Cuit>${config.cuit}</ar:Cuit>
  </ar:Auth><ar:MonId>${currency}</ar:MonId><ar:FchCotiz>${issueDate}</ar:FchCotiz>
  </ar:FEParamGetCotizacion></soap:Body>
</soap:Envelope>`;
    const response = await this.postSoap(
      config.wsfeUrl,
      request,
      'http://ar.gov.afip.dif.FEV1/FEParamGetCotizacion',
      config.environment,
      'wsfe',
    );
    const responseCurrency = String(soapValue(response, 'MonId') ?? '').trim().toUpperCase();
    const responseDate = String(soapValue(response, 'FchCotiz') ?? '').replace(/-/g, '');
    const exchangeRate = Number(String(soapValue(response, 'MonCotiz') ?? '').replace(',', '.'));
    if (responseCurrency !== currency || responseDate !== issueDate
        || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      throw new Error(
        this.extractMessages(response, 'Err')[0]
        || 'ARCA no devolvió una cotización oficial válida para moneda y fecha solicitadas',
      );
    }
    return exchangeRate;
  }

  private buildAuthorizeRequest(
    config: ArcaTenantConfig,
    ticket: ArcaTicket,
    document: DocumentoElectronico,
    type: number,
    number: number,
    receiverVatConditionId: number,
    fiscalIssueDate?: string,
    resolvedCurrency?: ReturnType<typeof resolveArcaPersistedCurrency>,
  ): string {
    const issueDate = fiscalIssueDate ?? formatArcaDate(document.fechaEmision);
    if (!isValidArcaCompactDate(issueDate)) {
      throw new Error('Fecha fiscal inválida para la solicitud ARCA');
    }
    const taxBases = resolveArcaTaxBases(document);
    const conceptDates = resolveArcaConceptDates(document);
    const tributeSummary = resolveArcaTributes(document);
    const receptorNumber = normalizeArgentinaTaxId(document.receptor.numeroDocumento);
    const receiverIdentityType = resolveArcaIdentityType(document.receptor.tipoDocumento, receptorNumber);
    if ([1, 2, 3, 51, 52, 53].includes(type) && receiverIdentityType !== 80) {
      throw new Error('Comprobante ARCA clase A exige receptor CUIT con DocTipo 80');
    }
    const vatRows = new Map<number, { base: number; tax: number }>();
    for (const item of document.items || []) {
      const rawRate = Number(item.tasaIgv ?? document.tasaImpuesto ?? 21);
      const rate = rawRate <= 1 ? rawRate * 100 : rawRate;
      const code = resolveArcaVatCode(rate);
      const current = vatRows.get(code) || { base: 0, tax: 0 };
      current.base += Number(item.valorVenta || 0);
      current.tax += Number(item.igv ?? item.valorVenta * (rate / 100));
      vatRows.set(code, current);
    }
    if (!vatRows.size && document.totalImpuestos > 0) {
      const rate = Number(document.tasaImpuesto ?? 21);
      vatRows.set(resolveArcaVatCode(rate <= 1 ? rate * 100 : rate), {
        base: taxBases.taxable,
        tax: document.totalImpuestos,
      });
    }
    const isClassC = [11, 12, 13].includes(type);
    if (isClassC && (Math.abs(document.totalImpuestos) > 0.005
        || [...vatRows.keys()].some((code) => code !== 3))) {
      throw new Error('Comprobante ARCA clase C no puede contener IVA discriminado');
    }
    const iva = isClassC ? '' : [...vatRows.entries()]
      .filter(([code]) => code !== 3)
      .map(([code, values]) =>
        `<ar:AlicIva><ar:Id>${code}</ar:Id><ar:BaseImp>${values.base.toFixed(2)}</ar:BaseImp>` +
        `<ar:Importe>${values.tax.toFixed(2)}</ar:Importe></ar:AlicIva>`,
      ).join('');
    const tributes = tributeSummary.rows.map((tribute) =>
      `<ar:Tributo><ar:Id>${tribute.id}</ar:Id><ar:Desc>${escapeXml(tribute.descripcion)}</ar:Desc>` +
      `<ar:BaseImp>${tribute.baseImponible.toFixed(2)}</ar:BaseImp>` +
      `<ar:Alic>${tribute.alicuota.toFixed(2)}</ar:Alic>` +
      `<ar:Importe>${tribute.importe.toFixed(2)}</ar:Importe></ar:Tributo>`,
    ).join('');
    const serviceDates = conceptDates.serviceFrom
      ? `<ar:FchServDesde>${conceptDates.serviceFrom}</ar:FchServDesde>` +
        `<ar:FchServHasta>${conceptDates.serviceUntil}</ar:FchServHasta>` +
        `<ar:FchVtoPago>${conceptDates.paymentDue}</ar:FchVtoPago>`
      : '';
    const currency = resolvedCurrency ?? resolveArcaPersistedCurrency(document);
    const isNote = [2, 3, 7, 8, 12, 13, 52, 53].includes(type);
    if (isNote && !document.documentoReferencia) {
      throw new Error('Nota ARCA sin comprobante asociado autorizado');
    }
    let reference = '';
    if (document.documentoReferencia) {
      const referenceType = resolveArgentinaExplicitWsfeCode(document.documentoReferencia.tipo);
      const referencePoint = Number(String(document.documentoReferencia.serie ?? '').replace(/\D/g, ''));
      const referenceNumber = Number(String(document.documentoReferencia.numero ?? '').replace(/\D/g, ''));
      if (!Number.isSafeInteger(referencePoint) || referencePoint < 1 || referencePoint > 99998
          || !Number.isSafeInteger(referenceNumber) || referenceNumber < 1) {
        throw new Error('Comprobante asociado ARCA sin tipo, punto o número fiscal válido');
      }
      reference = `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${referenceType}</ar:Tipo>` +
        `<ar:PtoVta>${referencePoint}</ar:PtoVta><ar:Nro>${referenceNumber}</ar:Nro>` +
        `</ar:CbteAsoc></ar:CbtesAsoc>`;
    }
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
<soap:Body><ar:FECAESolicitar><ar:Auth>
<ar:Token>${escapeXml(ticket.token)}</ar:Token><ar:Sign>${escapeXml(ticket.sign)}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit>
</ar:Auth><ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${config.puntoVenta}</ar:PtoVta>
<ar:CbteTipo>${type}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>
<ar:Concepto>${conceptDates.concept}</ar:Concepto><ar:DocTipo>${receiverIdentityType}</ar:DocTipo>
<ar:DocNro>${receptorNumber || 0}</ar:DocNro><ar:CondicionIVAReceptorId>${receiverVatConditionId}</ar:CondicionIVAReceptorId>
<ar:CbteDesde>${number}</ar:CbteDesde><ar:CbteHasta>${number}</ar:CbteHasta>
<ar:CbteFch>${issueDate}</ar:CbteFch><ar:ImpTotal>${document.importeTotal.toFixed(2)}</ar:ImpTotal>
<ar:ImpTotConc>${taxBases.nonTaxable.toFixed(2)}</ar:ImpTotConc>
<ar:ImpNeto>${taxBases.taxable.toFixed(2)}</ar:ImpNeto><ar:ImpOpEx>${taxBases.exempt.toFixed(2)}</ar:ImpOpEx>
<ar:ImpTrib>${tributeSummary.total.toFixed(2)}</ar:ImpTrib><ar:ImpIVA>${(isClassC ? 0 : document.totalImpuestos).toFixed(2)}</ar:ImpIVA>
${serviceDates}<ar:MonId>${currency.code}</ar:MonId><ar:MonCotiz>${currency.exchangeRate.toFixed(6)}</ar:MonCotiz>${
  currency.sameCurrencyPayment ? `<ar:CanMisMonExt>${currency.sameCurrencyPayment}</ar:CanMisMonExt>` : ''
}${reference}
${tributes ? `<ar:Tributos>${tributes}</ar:Tributos>` : ''}
${iva ? `<ar:Iva>${iva}</ar:Iva>` : ''}
</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq></ar:FECAESolicitar></soap:Body></soap:Envelope>`;
  }

  private buildQrUrl(
    config: ArcaTenantConfig,
    document: DocumentoElectronico,
    type: number,
    number: number,
    cae: string,
    authorizedIssueDate?: string,
    resolvedCurrency?: ReturnType<typeof resolveArcaPersistedCurrency>,
  ): string {
    const issueDate = authorizedIssueDate ?? formatArcaDate(document.fechaEmision);
    if (!isValidArcaCompactDate(issueDate)) {
      throw new Error('Fecha fiscal autorizada inválida para el QR ARCA');
    }
    const currency = resolvedCurrency ?? resolveArcaPersistedCurrency(document);
    const payload = {
      ver: 1,
      // El QR tiene que declarar la misma fecha que el XML, y por el mismo
      // motivo: el día fiscal argentino, no el día UTC.
      fecha: `${issueDate.slice(0, 4)}-${issueDate.slice(4, 6)}-${issueDate.slice(6, 8)}`,
      cuit: Number(config.cuit),
      ptoVta: config.puntoVenta,
      tipoCmp: type,
      nroCmp: number,
      importe: Number(document.importeTotal.toFixed(2)),
      moneda: currency.code,
      ctz: currency.exchangeRate,
      tipoDocRec: resolveArcaIdentityType(
        document.receptor.tipoDocumento,
        document.receptor.numeroDocumento,
      ),
      nroDocRec: Number(normalizeArgentinaTaxId(document.receptor.numeroDocumento) || 0),
      tipoCodAut: 'E',
      codAut: Number(cae),
    };
    return `https://www.arca.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
  }

  private extractMessages(xml: string, container: 'Err' | 'Obs'): string[] {
    const regex = new RegExp(
      `<(?:\\w+:)?${container}\\b[^>]*>[\\s\\S]*?<(?:\\w+:)?Msg\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?Msg>[\\s\\S]*?<\\/(?:\\w+:)?${container}>`,
      'gi',
    );
    return [...xml.matchAll(regex)].map((match) => match[1].trim());
  }

  private async postSoap(
    url: string,
    body: string,
    soapAction: string,
    environment: ArcaEnvironment,
    kind: ArcaEndpointKind,
  ): Promise<string> {
    // Segunda barrera, inmediatamente antes del I/O: ni una fila legacy
    // manipulada ni una mutación accidental del objeto config puede cambiar el
    // host, el ambiente o degradar HTTPS.
    const officialUrl = resolveArcaOfficialEndpoint(environment, kind, url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(officialUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: soapAction,
        },
        body,
        signal: controller.signal,
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error(`ARCA HTTP ${response.status}: redirección bloqueada`);
      }
      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `ARCA HTTP ${response.status}: ${soapValue(text, 'faultstring') || response.statusText}`,
        );
      }
      const fault = soapValue(text, 'faultstring');
      if (fault) throw new Error(`ARCA SOAP Fault: ${fault}`);
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}
