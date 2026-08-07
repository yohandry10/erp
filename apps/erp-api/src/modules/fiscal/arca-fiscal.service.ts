import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import { FiscalServiceAbstract } from '../../shared/integration/fiscal-service.abstract';
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

const ARCA_ENDPOINTS = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
} as const;

type ArcaEnvironment = keyof typeof ARCA_ENDPOINTS;

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

function formatArcaDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Fecha inválida para ARCA');
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');
}

function resolveArcaDocumentType(type: string): number {
  const normalized = String(type ?? '').trim().toUpperCase();
  // Compatibilidad con el contrato CPE histórico del ERP:
  // 01=factura, 03=venta a consumidor, 07/08=notas. Los catálogos AR nuevos
  // usan directamente los códigos numéricos WSFEv1.
  const legacy: Record<string, number> = {
    '01': 1,
    '03': 6,
    '07': 8,
    '08': 7,
  };
  if (legacy[normalized]) return legacy[normalized];
  const aliases: Record<string, number> = {
    FACTURA_A: 1,
    NOTA_DEBITO_A: 2,
    NOTA_CREDITO_A: 3,
    FACTURA_B: 6,
    NOTA_DEBITO_B: 7,
    NOTA_CREDITO_B: 8,
    FACTURA_C: 11,
    NOTA_DEBITO_C: 12,
    NOTA_CREDITO_C: 13,
    FACTURA_E: 19,
    FACTURA_M: 51,
    NOTA_DEBITO_M: 52,
    NOTA_CREDITO_M: 53,
  };
  const numeric = Number(normalized);
  const resolved = Number.isInteger(numeric) ? numeric : aliases[normalized];
  const supported = [1, 2, 3, 6, 7, 8, 11, 12, 13, 19, 20, 21, 51, 52, 53];
  if (!supported.includes(resolved)) {
    throw new Error(`Tipo de comprobante ARCA no soportado: ${type}`);
  }
  return resolved;
}

function resolveArcaIdentityType(type: string, number: string): number {
  const normalized = String(type ?? '').trim().toUpperCase();
  if (normalized === 'CUIT' || normalized === '6' || normalized === '80') return 80;
  if (normalized === 'CUIL') return 86;
  if (normalized === 'CDI') return 87;
  if (normalized === 'DNI' || normalized === '1' || normalized === '96') return 96;
  if (!number || /^0+$/.test(number)) return 99;
  return 99;
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

@Injectable()
export class ArcaFiscalService extends FiscalServiceAbstract {
  private tenantConfig: ArcaTenantConfig | null = null;
  private ticketCache = new Map<string, ArcaTicket>();

  constructor(
    private readonly configService: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService,
  ) {
    const environment: ArcaEnvironment =
      configService.get('ARCA_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion';
    const config: FiscalConfig = {
      url: configService.get('ARCA_WSFE_URL') || ARCA_ENDPOINTS[environment].wsfe,
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
      if (!config.puntoVenta) errors.push('Punto de venta ARCA no configurado');
      if (!config.certificate.length) errors.push('Certificado digital ARCA no configurado');
      return { valid: errors.length === 0, errors };
    } catch (error) {
      return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
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
      const type = resolveArcaDocumentType(documento.tipoDocumento);
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

      const soap = this.buildAuthorizeRequest(config, ticket, documento, type, requestedNumber);
      const response = await this.postSoap(config.wsfeUrl, soap, 'http://ar.gov.afip.dif.FEV1/FECAESolicitar');
      const result = soapValue(response, 'Resultado');
      const cae = soapValue(response, 'CAE');
      const caeExpiration = soapValue(response, 'CAEFchVto');
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

      const qrUrl = this.buildQrUrl(config, documento, type, requestedNumber, cae);
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
      const type = resolveArcaDocumentType(consulta.tipoDocumento);
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
      );
      const cae = soapValue(response, 'CodAutorizacion');
      const result = soapValue(response, 'Resultado');
      const errors = this.extractMessages(response, 'Err');
      return {
        success: result === 'A' && Boolean(cae),
        codigoRespuesta: result || soapValue(response, 'Code') || 'ARCA_UNKNOWN',
        descripcionRespuesta: result === 'A'
          ? 'Comprobante autorizado por ARCA'
          : errors[0] || 'ARCA no devolvió un comprobante autorizado',
        hash: cae ?? undefined,
        errores: errors,
        metadata: {
          cae,
          caeVencimiento: soapValue(response, 'FchVto'),
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
    try {
      resolveArcaDocumentType(documento.tipoDocumento);
    } catch (error) {
      errores.push(error instanceof Error ? error.message : String(error));
    }
    if (!['ARS', 'USD'].includes(String(documento.moneda).toUpperCase())) {
      errores.push('Moneda ARCA soportada: ARS o USD');
    }
    if (documento.importeTotal <= 0) errores.push('El importe total debe ser mayor que cero');
    if (Math.abs(documento.subtotal + documento.totalImpuestos - documento.importeTotal) > 0.02) {
      errores.push('Subtotal + IVA no coincide con el total del comprobante');
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
    const type = resolveArcaDocumentType(documento.tipoDocumento);
    return `<ArcaComprobante><Tipo>${type}</Tipo><Numero>${escapeXml(documento.numero)}</Numero>` +
      `<Fecha>${formatArcaDate(documento.fechaEmision)}</Fecha><Moneda>${escapeXml(documento.moneda)}</Moneda>` +
      `<Neto>${documento.subtotal.toFixed(2)}</Neto><IVA>${documento.totalImpuestos.toFixed(2)}</IVA>` +
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
    const environment: ArcaEnvironment =
      String(row.arca_environment).toLowerCase() === 'produccion' ? 'produccion' : 'homologacion';
    const certificate = decryptBuffer(this.configService, row.certificado_pfx) ?? Buffer.alloc(0);
    const config: ArcaTenantConfig = {
      environment,
      wsaaUrl: row.arca_wsaa_url || ARCA_ENDPOINTS[environment].wsaa,
      wsfeUrl: row.arca_wsfe_url || ARCA_ENDPOINTS[environment].wsfe,
      cuit: normalizeArgentinaTaxId(row.arca_cuit_representada || row.ruc),
      puntoVenta: Number(row.arca_punto_venta || 0),
      condicionIva: row.arca_condicion_iva || '',
      certificate,
      certificatePassword: decryptText(this.configService, row.certificado_password),
      activo: row.arca_activo === true,
    };
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
    const response = await this.postSoap(config.wsaaUrl, request, '');
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
    );
    const number = Number(soapValue(response, 'CbteNro'));
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new Error(this.extractMessages(response, 'Err')[0] || 'ARCA no devolvió último comprobante');
    }
    return number;
  }

  private buildAuthorizeRequest(
    config: ArcaTenantConfig,
    ticket: ArcaTicket,
    document: DocumentoElectronico,
    type: number,
    number: number,
  ): string {
    const receptorNumber = normalizeArgentinaTaxId(document.receptor.numeroDocumento);
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
        base: document.subtotal,
        tax: document.totalImpuestos,
      });
    }
    const iva = [...vatRows.entries()]
      .filter(([code]) => code !== 3)
      .map(([code, values]) =>
        `<ar:AlicIva><ar:Id>${code}</ar:Id><ar:BaseImp>${values.base.toFixed(2)}</ar:BaseImp>` +
        `<ar:Importe>${values.tax.toFixed(2)}</ar:Importe></ar:AlicIva>`,
      ).join('');
    const currency = String(document.moneda).toUpperCase() === 'USD' ? 'DOL' : 'PES';
    const reference = document.documentoReferencia
      ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${type}</ar:Tipo><ar:PtoVta>${config.puntoVenta}</ar:PtoVta>` +
        `<ar:Nro>${Number(String(document.documentoReferencia.numero).replace(/\D/g, ''))}</ar:Nro>` +
        `</ar:CbteAsoc></ar:CbtesAsoc>`
      : '';
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
<soap:Body><ar:FECAESolicitar><ar:Auth>
<ar:Token>${escapeXml(ticket.token)}</ar:Token><ar:Sign>${escapeXml(ticket.sign)}</ar:Sign><ar:Cuit>${config.cuit}</ar:Cuit>
</ar:Auth><ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${config.puntoVenta}</ar:PtoVta>
<ar:CbteTipo>${type}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>
<ar:Concepto>1</ar:Concepto><ar:DocTipo>${resolveArcaIdentityType(document.receptor.tipoDocumento, receptorNumber)}</ar:DocTipo>
<ar:DocNro>${receptorNumber || 0}</ar:DocNro><ar:CbteDesde>${number}</ar:CbteDesde><ar:CbteHasta>${number}</ar:CbteHasta>
<ar:CbteFch>${formatArcaDate(document.fechaEmision)}</ar:CbteFch><ar:ImpTotal>${document.importeTotal.toFixed(2)}</ar:ImpTotal>
<ar:ImpTotConc>${Number(document.totalInafectas || 0).toFixed(2)}</ar:ImpTotConc>
<ar:ImpNeto>${document.subtotal.toFixed(2)}</ar:ImpNeto><ar:ImpOpEx>${Number(document.totalExoneradas || 0).toFixed(2)}</ar:ImpOpEx>
<ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${document.totalImpuestos.toFixed(2)}</ar:ImpIVA>
<ar:MonId>${currency}</ar:MonId><ar:MonCotiz>1.000000</ar:MonCotiz>${reference}
${iva ? `<ar:Iva>${iva}</ar:Iva>` : ''}
</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq></ar:FECAESolicitar></soap:Body></soap:Envelope>`;
  }

  private buildQrUrl(
    config: ArcaTenantConfig,
    document: DocumentoElectronico,
    type: number,
    number: number,
    cae: string,
  ): string {
    const payload = {
      ver: 1,
      fecha: new Date(document.fechaEmision).toISOString().slice(0, 10),
      cuit: Number(config.cuit),
      ptoVta: config.puntoVenta,
      tipoCmp: type,
      nroCmp: number,
      importe: Number(document.importeTotal.toFixed(2)),
      moneda: String(document.moneda).toUpperCase() === 'USD' ? 'DOL' : 'PES',
      ctz: 1,
      tipoDocRec: resolveArcaIdentityType(
        document.receptor.tipoDocumento,
        document.receptor.numeroDocumento,
      ),
      nroDocRec: Number(normalizeArgentinaTaxId(document.receptor.numeroDocumento) || 0),
      tipoCodAut: 'E',
      codAut: Number(cae),
    };
    return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
  }

  private extractMessages(xml: string, container: 'Err' | 'Obs'): string[] {
    const regex = new RegExp(
      `<(?:\\w+:)?${container}\\b[^>]*>[\\s\\S]*?<(?:\\w+:)?Msg\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?Msg>[\\s\\S]*?<\\/(?:\\w+:)?${container}>`,
      'gi',
    );
    return [...xml.matchAll(regex)].map((match) => match[1].trim());
  }

  private async postSoap(url: string, body: string, soapAction: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: soapAction,
        },
        body,
        signal: controller.signal,
      });
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
