import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { lookup as dnsLookup } from 'node:dns';
import { Agent as HttpsAgent } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { getActiveCountryByCode } from '../paises/initial-country';
import { perfilPaisDelTenant } from './pais-del-tenant';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { PdfFormatHelperService } from './pdf-format-helper.service';
import { buildSunatQrDataUrl } from './sunat-qr.util';
import {
  buildArcaQrRepresentation,
  buildDianQrRepresentation,
  resolveAcceptedDianEvidence,
} from './fiscal-qr.util';
import { validateCountryTaxId } from '../paises/initial-country';
import { resolveDianPrintedFiscalInfo, type DianPrintedFiscalInfo } from './dian-print.util';
import { resolveArcaPrintedFiscalInfo, type ArcaPrintedFiscalInfo } from './arca-print.util';
import { resolveHistoricalCpeCountry } from './historical-cpe-country.util';

export const CPE_PDF_PRINT_FORMAT = {
  size: 'A4' as const,
  widthMm: 210,
  heightMm: 297,
};

export const CPE_PDF_QR_SIZE_MM = 42;

export const CPE_PDF_PE_TAX_BOX_MIN_MM = { width: 80, height: 40 } as const;

export const CPE_PDF_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const CPE_PDF_LOGO_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg']);
const SUPABASE_PUBLIC_STORAGE_PATH = '/storage/v1/object/public/';

export function isPublicPdfLogoNetworkAddress(address: string): boolean {
  const normalized = String(address || '').trim().toLowerCase().split('%')[0];
  const family = isIP(normalized);

  if (family === 4) {
    const octets = normalized.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
      return false;
    }

    const [a, b] = octets;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (family === 6) {
    // No se aceptan loopback, direcciones IPv4-mapped ni mecanismos de
    // transición. Para logos remotos basta el espacio unicast global 2000::/3.
    if (normalized === '::' || normalized === '::1' || normalized.startsWith('::ffff:')) {
      return false;
    }
    const firstHextet = Number.parseInt(normalized.split(':')[0], 16);
    if (!Number.isFinite(firstHextet) || firstHextet < 0x2000 || firstHextet > 0x3fff) {
      return false;
    }
    return !(
      normalized.startsWith('2001:db8:') ||
      normalized.startsWith('2001:0:') ||
      normalized.startsWith('2002:')
    );
  }

  return false;
}

function hasExpectedPdfLogoSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }

  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  return false;
}

function validatePdfLogoBuffer(buffer: Buffer, mimeType: string): Buffer {
  const normalizedMimeType = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (!CPE_PDF_LOGO_ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
    throw new Error('El logo debe ser PNG o JPEG');
  }
  if (buffer.length === 0 || buffer.length > CPE_PDF_LOGO_MAX_BYTES) {
    throw new Error(`El logo excede el máximo de ${CPE_PDF_LOGO_MAX_BYTES} bytes`);
  }
  if (!hasExpectedPdfLogoSignature(buffer, normalizedMimeType)) {
    throw new Error('El contenido del logo no coincide con su tipo de imagen');
  }
  return buffer;
}

export function decodeCpePdfLogoDataUrl(value: string): Buffer {
  const match = /^data:(image\/(?:png|jpeg));base64,([a-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) {
    throw new Error('Data URL de logo no permitida');
  }

  const encoded = match[2];
  const maxEncodedLength = Math.ceil(CPE_PDF_LOGO_MAX_BYTES / 3) * 4;
  if (encoded.length > maxEncodedLength || encoded.length % 4 !== 0) {
    throw new Error('Data URL de logo demasiado grande o inválida');
  }

  const buffer = Buffer.from(encoded, 'base64');
  return validatePdfLogoBuffer(buffer, match[1]);
}

export function resolveAllowedCpePdfLogoUrl(value: string, supabaseUrl?: string): URL {
  const rawPath = value.split(/[?#]/, 1)[0];
  if (
    rawPath.includes('\\') ||
    /%2e|%5c/i.test(rawPath) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath)
  ) {
    throw new Error('Ruta de logo inválida');
  }

  let candidate: URL;
  let configuredStorage: URL;
  try {
    candidate = new URL(value);
    configuredStorage = new URL(String(supabaseUrl || ''));
  } catch {
    throw new Error('URL de logo inválida');
  }

  if (
    candidate.protocol !== 'https:' ||
    configuredStorage.protocol !== 'https:' ||
    candidate.origin !== configuredStorage.origin ||
    candidate.username ||
    candidate.password ||
    candidate.hash
  ) {
    throw new Error('El logo remoto debe pertenecer al Storage Supabase configurado');
  }
  const candidateHostname = candidate.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    candidateHostname === 'localhost' ||
    candidateHostname.endsWith('.localhost') ||
    isIP(candidateHostname) !== 0
  ) {
    throw new Error('El host del logo no es un dominio de Storage permitido');
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(candidate.pathname);
  } catch {
    throw new Error('Ruta de logo inválida');
  }
  const pathSegments = decodedPath.split('/');
  const objectPathSegments = decodedPath
    .slice(SUPABASE_PUBLIC_STORAGE_PATH.length)
    .split('/')
    .filter(Boolean);
  if (
    !decodedPath.startsWith(SUPABASE_PUBLIC_STORAGE_PATH) ||
    decodedPath.includes('\\') ||
    pathSegments.some((segment) => segment === '.' || segment === '..') ||
    objectPathSegments.length < 2
  ) {
    throw new Error('El logo remoto no es un objeto público permitido');
  }

  return candidate;
}

export function resolveCpePrintedLineTotal(item: Record<string, unknown>): number {
  // La tabla es una representación para el cliente: muestra el total bruto de
  // la línea. `valor_venta` es la base imponible SUNAT y no incluye IGV.
  const persisted = item.total_item ?? item.total ?? item.precio_venta
    ?? item.valor_venta ?? item.subtotal;
  if (persisted !== undefined && persisted !== null && Number.isFinite(Number(persisted))) {
    return Number(persisted);
  }

  const quantity = Number(item.cantidad ?? 1);
  const unitPrice = Number(item.precio_unitario ?? 0);
  return Number.isFinite(quantity * unitPrice) ? quantity * unitPrice : 0;
}

export function resolveCpePrintedUnitPrice(item: Record<string, unknown>): number {
  const quantity = Number(item.cantidad ?? 1);
  const grossLineTotal = resolveCpePrintedLineTotal(item);
  if (Number.isFinite(quantity) && quantity > 0 && Number.isFinite(grossLineTotal)) {
    return grossLineTotal / quantity;
  }

  const persisted = item.precio_venta ?? item.precio_unitario;
  return Number.isFinite(Number(persisted)) ? Number(persisted) : 0;
}

export function getCpeDemoPdfNotice(countryCode: string): string {
  const authority = getActiveCountryByCode(countryCode)?.autoridadFiscal ?? 'fiscal';
  return `MUESTRA DEMO · SIN ENVÍO NI VALIDEZ ${authority.toUpperCase()}`;
}

export function getCpeNonFiscalPdfNotice(countryCode: string, evidenceStatus: string): string {
  if (String(evidenceStatus).toUpperCase() === 'SIMULATED') return getCpeDemoPdfNotice(countryCode);
  if (String(evidenceStatus).toUpperCase() === 'LEGACY_UNVERIFIED') {
    return 'SIN VALIDEZ FISCAL · PROCEDENCIA LEGACY NO VERIFICABLE';
  }
  const authority = getActiveCountryByCode(countryCode)?.autoridadFiscal ?? 'fiscal';
  return `SIN ACEPTACIÓN NI VALIDEZ ${authority.toUpperCase()}`;
}

export interface CpePrintedNoteReference {
  noteType: '07' | '08';
  referenceType: string;
  referenceLabel: string;
  referenceNumber: string;
  reasonCode: string;
  reason: string;
}

export function resolveCpePrintedNoteReference(cpeData: any): CpePrintedNoteReference | null {
  const noteType = String(cpeData?.tipo_documento || '').trim();
  if (noteType !== '07' && noteType !== '08') return null;

  const metadata = cpeData?.metadata && typeof cpeData.metadata === 'object'
    ? cpeData.metadata
    : {};
  const referenceType = String(
    cpeData.documento_referencia_tipo || cpeData.documento_afectado_tipo
      || metadata.documento_referencia_tipo || '',
  ).trim();
  const referenceSeries = String(
    cpeData.documento_referencia_serie || cpeData.documento_afectado_serie
      || metadata.documento_referencia_serie || '',
  ).trim().toUpperCase();
  const rawReferenceNumber = String(
    cpeData.documento_referencia_numero || cpeData.documento_afectado_numero
      || metadata.documento_referencia_numero || '',
  ).trim();
  const paddedReferenceNumber = /^\d{1,8}$/.test(rawReferenceNumber)
    ? rawReferenceNumber.padStart(8, '0')
    : rawReferenceNumber;
  const reasonCode = String(
    noteType === '07'
      ? cpeData.tipo_nota_credito || cpeData.codigo_motivo_nota || cpeData.tipo_nota
        || metadata.codigo_motivo || ''
      : cpeData.tipo_nota_debito || cpeData.codigo_motivo_nota || cpeData.tipo_nota
        || metadata.codigo_motivo || '',
  ).trim();
  const reason = String(
    cpeData.motivo_nota || cpeData.motivo || cpeData.observaciones || metadata.motivo_nota || '',
  ).trim();
  const referenceLabel = referenceType === '03'
    ? 'BOLETA DE VENTA ELECTRÓNICA'
    : referenceType === '01'
      ? 'FACTURA ELECTRÓNICA'
      : 'COMPROBANTE ELECTRÓNICO';

  return {
    noteType,
    referenceType: referenceType || 'No consignado',
    referenceLabel,
    referenceNumber: referenceSeries && paddedReferenceNumber
      ? `${referenceSeries}-${paddedReferenceNumber}`
      : 'No consignado',
    reasonCode: reasonCode || 'No consignado',
    reason: reason || 'No consignado',
  };
}

/**
 * Servicio para generar la representación PDF A4 de comprobantes electrónicos.
 * Soporta múltiples países: Perú (SUNAT), Colombia (DIAN), etc.
 * 
 * CUMPLIMIENTO NORMATIVO:
 * ✅ Código QR obligatorio (SUNAT/DIAN)
 * ✅ Información mínima y leyendas según el país
 * ✅ Leyendas obligatorias según tipo de comprobante
 * ✅ Representación impresa del CPE
 */
@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly pdfFormatHelper: PdfFormatHelperService,
  ) {}

  /**
   * Genera una representación PDF A4 para un CPE (multi-país).
   * A4 es el formato físico elegido por el producto; no se presenta como un
   * tamaño de papel impuesto por SUNAT.
   */
  async generateSunatCompliantPdf(cpeId: string, tenantId: string): Promise<Buffer> {
    try {
      this.logger.log(`📄 Generando PDF para CPE: ${cpeId}`);

      // 1. Obtener datos del CPE
      const cpeData = await this.getCpeData(cpeId, tenantId);
      
      // 2. Obtener código de país y validar la empresa con su documento fiscal.
      const currentCountryCode = await this.getCountryCode(tenantId);
      const currentEmpresaConfig = await this.getEmpresaConfig(tenantId, currentCountryCode);
      const countryCode = resolveHistoricalCpeCountry(cpeData, currentCountryCode);
      const issuerSnapshot = cpeData.issuer_snapshot && typeof cpeData.issuer_snapshot === 'object'
        ? cpeData.issuer_snapshot
        : {};
      const empresaConfig = {
        ...currentEmpresaConfig,
        ruc: issuerSnapshot.tax_id || cpeData.ruc_emisor || currentEmpresaConfig.ruc,
        razon_social: issuerSnapshot.legal_name || cpeData.razon_social_emisor || currentEmpresaConfig.razon_social,
        direccion_fiscal: issuerSnapshot.address || currentEmpresaConfig.direccion_fiscal,
      };
      const simulatedOrigin = cpeData.simulated_origin !== false;
      const dianAccepted = countryCode === 'CO' ? Boolean(resolveAcceptedDianEvidence(cpeData)) : true;
      const allowUnofficialRepresentation = simulatedOrigin || (countryCode === 'CO' && !dianAccepted);
      const fiscalAuthority = this.pdfFormatHelper.getFiscalAuthorityName(countryCode);
      const printableCpeData = {
        ...cpeData,
        ...(countryCode === 'CO'
          ? { dian_print_info: resolveDianPrintedFiscalInfo(cpeData, empresaConfig, allowUnofficialRepresentation) }
          : {}),
        ...(countryCode === 'AR'
          ? {
              arca_print_info: resolveArcaPrintedFiscalInfo(cpeData, empresaConfig, simulatedOrigin),
            }
          : {}),
      } as any;
      if (countryCode === 'AR') {
        printableCpeData.tipo_documento_fiscal = printableCpeData.arca_print_info.documentType;
      }

      this.logger.log(`📄 Generando PDF con formato ${fiscalAuthority} (${countryCode})`);

      // 4. Generar código QR si es requerido. En Perú es un requisito de la
      // representación impresa: si no puede construirse, no se emite un PDF
      // que aparente ser válido.
      let qrCode: string | null = null;
      if (this.pdfFormatHelper.isQRCodeRequired(countryCode)) {
        qrCode = await this.generateQRCode(printableCpeData, countryCode, allowUnofficialRepresentation);
      }

      // 5. Generar PDF con formato específico del país
      const pdfBuffer = await this.buildPdfDocument(printableCpeData, empresaConfig, qrCode, countryCode);

      this.logger.log(`✅ PDF generado exitosamente para CPE: ${cpeId} (${fiscalAuthority})`);
      return pdfBuffer;

    } catch (error) {
      this.logger.error(`❌ Error generando PDF para CPE ${cpeId}:`, error);
      throw error;
    }
  }

  /**
   * Get country code for tenant
   */
  private async getCountryCode(tenantId: string): Promise<string> {
    // Devolvía 'PE' sin fila, sin `pais_id` y también desde el `catch`: un fallo
    // de lectura imprimía un comprobante argentino con formato peruano.
    return (await perfilPaisDelTenant(this.supabaseService.getClient(), tenantId)).codigo;
  }

  /**
   * Obtiene los datos del CPE desde la base de datos
   */
  private async getCpeData(cpeId: string, tenantId: string): Promise<any> {
    const { data, error } = await this.supabaseService.getClient()
      .from('cpe')
      .select('*')
      .eq('id', cpeId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      throw new Error(`CPE no encontrado: ${cpeId}`);
    }

    const cpeData = data as any;
    const persistedItems = Array.isArray(cpeData.items)
      ? cpeData.items.filter((item: unknown) => item && typeof item === 'object')
      : [];
    if (persistedItems.length > 0) {
      return { ...cpeData, items: persistedItems };
    }
    if (!cpeData.documento_id) {
      throw new Error(`CPE sin detalle representable: ${cpeId}`);
    }

    // Algunos CPE legados guardaron el detalle normalizado únicamente en
    // documento_detalles. El PDF debe poder representarlos sin inventar ni
    // recalcular líneas y siempre dentro del mismo tenant/documento.
    const { data: documentItems, error: detailError } = await this.supabaseService.getClient()
      .from('documento_detalles')
      .select([
        'orden',
        'producto_id',
        'codigo_producto',
        'descripcion',
        'unidad_medida',
        'cantidad',
        'precio_unitario',
        'descuento_unitario',
        'valor_venta',
        'impuesto_igv',
        'impuesto_isc',
        'total_item',
      ].join(','))
      .eq('tenant_id', tenantId)
      .eq('documento_id', cpeData.documento_id)
      .order('orden', { ascending: true });

    if (detailError) {
      this.logger.warn(
        `No se pudo resolver el detalle normalizado del CPE ${cpeId}: ${detailError.message}`,
      );
      throw new Error(`No se pudo cargar el detalle del CPE: ${cpeId}`);
    }

    if (!Array.isArray(documentItems) || documentItems.length === 0) {
      throw new Error(`CPE sin detalle representable: ${cpeId}`);
    }

    return { ...cpeData, items: documentItems };
  }

  /**
   * Obtiene la configuración de la empresa
   */
  private async getEmpresaConfig(tenantId: string, countryCode: string): Promise<any> {
    const { data, error } = await this.supabaseService.getClient()
      .from('empresa_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      throw new Error(`Configuracion de empresa no encontrada para generar PDF CPE: ${tenantId}`);
    }

    const typedData = data as any;
    if (
      !validateCountryTaxId(countryCode, typedData.ruc) ||
      !String(typedData.razon_social || '').trim()
    ) {
      const taxIdLabel = countryCode === 'AR' ? 'CUIT' : countryCode === 'CO' ? 'NIT' : 'RUC';
      throw new Error(
        `Configuracion de empresa incompleta para PDF CPE: ${taxIdLabel} válido y razón social son obligatorios`,
      );
    }

    return data;
  }

  /**
   * Genera el código QR según especificaciones SUNAT
   * 
   * Formato QR SUNAT:
   * RUC_EMISOR|TIPO_DOC|SERIE|NUMERO|IGV|TOTAL|FECHA_EMISION|TIPO_DOC_RECEPTOR|NUM_DOC_RECEPTOR|HASH
   */
  private async generateQRCode(
    cpeData: any,
    countryCode: string = 'PE',
    isDemo = false,
  ): Promise<string | null> {
    if (countryCode === 'CO') {
      const representation = await buildDianQrRepresentation(cpeData);
      if (!representation) {
        if (isDemo) return null;
        throw new Error(
          'No se puede generar la representación CPE sin QR DIAN válido: falta evidencia terminal 525',
        );
      }
      return representation.dataUrl;
    }
    if (countryCode === 'AR') {
      try {
        return (await buildArcaQrRepresentation(cpeData, {
          allowMissingAuthorization: isDemo,
        }))?.dataUrl ?? null;
      } catch (error) {
        throw new Error(
          `No se puede generar la representación CPE sin QR ARCA válido: ${(error as Error).message}`,
        );
      }
    }
    // Este constructor implementa exclusivamente payloads PE y CO. Otros
    // países no deben pasar sus identificadores por una validación SUNAT.
    if (countryCode !== 'PE') return null;
    try {
      return await buildSunatQrDataUrl(cpeData);
    } catch (error) {
      const detail = (error as Error).message;
      throw new Error(`No se puede generar la representación CPE sin QR SUNAT válido: ${detail}`);
    }
  }

  private async loadLogoBuffer(logoUrl?: string | null): Promise<Buffer | null> {
    if (!logoUrl) {
      return null;
    }

    try {
      const normalizedLogoUrl = String(logoUrl).trim();
      if (normalizedLogoUrl.startsWith('data:')) {
        return decodeCpePdfLogoDataUrl(normalizedLogoUrl);
      }

      const remoteUrl = resolveAllowedCpePdfLogoUrl(
        normalizedLogoUrl,
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      );
      const response = await axios.get<ArrayBuffer>(remoteUrl.toString(), {
        responseType: 'arraybuffer',
        timeout: 5000,
        maxRedirects: 0,
        maxContentLength: CPE_PDF_LOGO_MAX_BYTES,
        maxBodyLength: CPE_PDF_LOGO_MAX_BYTES,
        decompress: false,
        httpsAgent: this.createPdfLogoHttpsAgent(),
        validateStatus: (status) => status === 200,
      });

      if (response.status !== 200) {
        throw new Error('Respuesta no válida al cargar el logo');
      }

      const declaredLength = Number(response.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > CPE_PDF_LOGO_MAX_BYTES) {
        throw new Error('El servidor declaró un logo demasiado grande');
      }

      return validatePdfLogoBuffer(
        Buffer.from(response.data),
        String(response.headers['content-type'] || ''),
      );
    } catch (error) {
      this.logger.warn(`No se pudo cargar logo para PDF CPE: ${(error as Error).message}`);
      return null;
    }
  }

  private createPdfLogoHttpsAgent(): HttpsAgent {
    const safeLookup: LookupFunction = (hostname, options, callback) => {
      dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
        if (error) {
          callback(error, '', 0);
          return;
        }

        if (!addresses.length || addresses.some(({ address }) => !isPublicPdfLogoNetworkAddress(address))) {
          callback(new Error('El host del logo resolvió a una red no pública'), '', 0);
          return;
        }

        const selected = addresses[0];
        if (options.all) {
          callback(null, addresses);
        } else {
          callback(null, selected.address, selected.family);
        }
      });
    };

    return new HttpsAgent({
      keepAlive: false,
      lookup: safeLookup,
    });
  }

  /** Construye la representación A4 compatible con los requisitos del país. */
  private async buildPdfDocument(
    cpeData: any,
    empresaConfig: any,
    qrCode: string | null,
    countryCode: string = 'PE',
  ): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    const chunks: Buffer[] = [];
    const logoBuffer = await this.loadLogoBuffer(empresaConfig.logo_url);
    const acceptedDianEvidence = countryCode === 'CO'
      ? resolveAcceptedDianEvidence(cpeData)
      : null;
    // Nunca renderizar un QR entregado por el llamador como DIAN si el CPE no
    // posee evidencia terminal dedicada. Esto evita promocionar hashes XML o
    // URLs históricas arbitrarias a un QR fiscal oficial.
    const effectiveQrCode = countryCode === 'CO' && !acceptedDianEvidence
      ? null
      : qrCode;
    if (countryCode === 'CO' && !cpeData.dian_print_info) {
      const allowUnofficial = cpeData.simulated_origin !== false
        || !resolveAcceptedDianEvidence(cpeData);
      cpeData.dian_print_info = resolveDianPrintedFiscalInfo(
        cpeData, empresaConfig, allowUnofficial,
      );
    }
    if (countryCode === 'AR' && !cpeData.arca_print_info) {
      cpeData.arca_print_info = resolveArcaPrintedFiscalInfo(
        cpeData, empresaConfig, cpeData.simulated_origin !== false,
      );
      cpeData.tipo_documento_fiscal = cpeData.arca_print_info.documentType;
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: CPE_PDF_PRINT_FORMAT.size,
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const simulatedOrigin = cpeData.simulated_origin !== false;
        const lacksDianAcceptance = countryCode === 'CO' && !acceptedDianEvidence;
        if (simulatedOrigin || lacksDianAcceptance) {
          const evidenceStatus = String(cpeData.fiscal_authority_evidence?.status || 'LEGACY_UNVERIFIED');
          const addDemoMark = () => this.addNonFiscalWatermark(doc, countryCode, evidenceStatus);
          addDemoMark();
          doc.on('pageAdded', addDemoMark);
        }

        if (effectiveQrCode && countryCode === 'CO') {
          this.addRepeatedPageQRCode(doc, effectiveQrCode, 'DIAN');
          doc.on('pageAdded', () => this.addRepeatedPageQRCode(doc, effectiveQrCode, 'DIAN'));
        }
        doc.on('pageAdded', () => {
          this.addContinuationHeader(doc, empresaConfig, cpeData, countryCode);
        });

        // Capturar el PDF en memoria
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ===== ENCABEZADO =====
        this.addHeader(doc, empresaConfig, cpeData, countryCode, logoBuffer);

        // ===== INFORMACIÓN DEL COMPROBANTE =====
        this.addComprobanteInfo(doc, cpeData, countryCode);

        if (countryCode === 'CO') {
          this.addDianFiscalInfo(doc, cpeData.dian_print_info);
        }
        if (countryCode === 'AR') {
          this.addArcaAuthorizationInfo(doc, cpeData.arca_print_info);
        }

        // ===== DATOS DEL CLIENTE =====
        this.addClienteInfo(doc, cpeData, countryCode);

        // ===== COMPROBANTE MODIFICADO (NOTAS 07/08) =====
        this.addNoteReferenceInfo(doc, cpeData, countryCode);

        // ===== DETALLE DE ITEMS =====
        this.addItemsTable(doc, cpeData);

        // ===== TOTALES =====
        this.addTotales(doc, cpeData, countryCode);

        // ===== CÓDIGO QR =====
        if (effectiveQrCode && countryCode !== 'CO') {
          this.addQRCode(doc, effectiveQrCode);
        }

        // ===== LEYENDAS OBLIGATORIAS =====
        this.addLeyendasObligatorias(doc, cpeData, countryCode);

        // ===== PIE DE PÁGINA =====
        this.addFooter(doc, cpeData, countryCode);

        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Agrega el encabezado del documento
   */
  private formatPrintedDocumentNumber(cpeData: any, countryCode: string): string {
    const series = String(cpeData?.serie ?? '').trim().toUpperCase();
    const rawNumber = String(cpeData?.numero ?? '').trim();
    if (countryCode === 'CO') {
      const numeric = Number(rawNumber);
      const consecutive = Number.isSafeInteger(numeric) && numeric >= 0
        ? String(numeric)
        : rawNumber;
      return `${series}${consecutive}`;
    }
    return `${series}-${rawNumber.padStart(8, '0')}`;
  }

  private addHeader(
    doc: any,
    empresaConfig: any,
    cpeData: any,
    countryCode: string,
    logoBuffer?: Buffer | null,
  ): void {
    const startY = 50;
    const taxIdLabel = countryCode === 'AR' ? 'CUIT' : countryCode === 'CO' ? 'NIT' : 'RUC';
    const boxWidth = countryCode === 'PE' ? 80 * 72 / 25.4 : 165;
    const boxHeight = countryCode === 'PE' ? 40 * 72 / 25.4 : 90;
    const boxX = 545 - boxWidth;
    const boxY = startY;

    const companyTextX = logoBuffer ? 145 : 50;
    const companyTextWidth = boxX - companyTextX - 12;

    // Logo (si existe). Se reserva una columna propia para que nunca se
    // superponga con la razón social o el domicilio fiscal.
    if (logoBuffer) {
      doc.image(logoBuffer, 50, startY, { fit: [80, 62], align: 'center', valign: 'center' });
    }

    // Información de la empresa (lado izquierdo)
    doc.fontSize(12).font('Helvetica-Bold')
      .text(empresaConfig.razon_social, companyTextX, startY, { width: companyTextWidth });

    let companyY = startY + Math.max(
      15,
      this.measureTextHeight(doc, empresaConfig.razon_social, companyTextWidth, 12),
    );

    doc.fontSize(9).font('Helvetica')
      .text(`${taxIdLabel}: ${empresaConfig.ruc}`, companyTextX, companyY, { width: companyTextWidth });
    companyY += 13;
    const address = empresaConfig.direccion_fiscal || empresaConfig.direccion || 'Dirección no especificada';
    doc.text(address, companyTextX, companyY, { width: companyTextWidth });
    companyY += Math.max(13, this.measureTextHeight(doc, address, companyTextWidth, 9));
    doc.text(`Tel: ${empresaConfig.telefono || 'N/A'}`, companyTextX, companyY, { width: companyTextWidth });
    companyY += 13;
    doc.text(`Email: ${empresaConfig.email || 'N/A'}`, companyTextX, companyY, { width: companyTextWidth });
    companyY += 12;

    // Cuadro del comprobante (lado derecho)
    // Borde del cuadro
    doc.rect(boxX, boxY, boxWidth, boxHeight).stroke();

    // Tipo de comprobante
    const tipoDoc = this.pdfFormatHelper.getHeaderText(
      countryCode,
      String(cpeData.tipo_documento_fiscal || cpeData.tipo_documento || ''),
    );
    const typeY = boxY + 8;
    doc.fontSize(11).font('Helvetica-Bold');
    const typeHeight = Math.max(
      13,
      this.measureTextHeight(doc, tipoDoc.toUpperCase(), boxWidth - 12, 11),
    );
    doc.text(tipoDoc.toUpperCase(), boxX + 6, typeY, {
        width: boxWidth - 12,
        align: 'center'
      });

    // Identificador fiscal del emisor
    const taxIdY = typeY + typeHeight + 3;
    doc.fontSize(10).font('Helvetica')
      .text(`${taxIdLabel}: ${cpeData.ruc_emisor}`, boxX, taxIdY, {
        width: boxWidth,
        align: 'center'
      });

    // Serie y número
    const numberY = taxIdY + 16;
    doc.fontSize(12).font('Helvetica-Bold')
      .text(this.formatPrintedDocumentNumber(cpeData, countryCode), boxX, numberY, {
        width: boxWidth,
        align: 'center'
      });

    doc.y = Math.max(companyY, startY + (logoBuffer ? 70 : 0), boxY + boxHeight) + 8;
  }

  /**
   * Agrega información del comprobante
   */
  private addComprobanteInfo(doc: any, cpeData: any, countryCode: string): void {
    this.ensureVerticalSpace(doc, 48);
    const y = doc.y + 5;

    doc.fontSize(9).font('Helvetica')
      .text(`Fecha de Emisión: ${this.formatDate(cpeData.fecha_emision, countryCode)}`, 50, y)
      .text(`Fecha de Vencimiento: ${this.formatDate(cpeData.fecha_vencimiento, countryCode)}`, 300, y)
      .text(`Moneda: ${cpeData.moneda || 'PEN'}`, 50, y + 15);

    doc.y = y + 34;
  }

  private addDianFiscalInfo(doc: any, info: DianPrintedFiscalInfo): void {
    if (!info) throw new Error('Representación DIAN incompleta: falta bloque fiscal');
    const qualities = info.taxQualities.length ? info.taxQualities.join(' · ') : 'No aplican calidades adicionales';
    const qualitiesHeight = Math.max(12, this.measureTextHeight(doc, qualities, 475, 8));
    this.ensureVerticalSpace(doc, 92 + qualitiesHeight);
    const y = doc.y + 6;

    doc.fontSize(10).font('Helvetica-Bold')
      .text('INFORMACIÓN FISCAL DIAN', 50, y, { width: 495 });
    doc.fontSize(8).font('Helvetica')
      .text(`Autorización de numeración: ${info.authorizationNumber}`, 60, y + 16, { width: 235 })
      .text(`Prefijo y rango: ${info.authorizationPrefix || 'Sin prefijo'} · ${info.rangeFrom} a ${info.rangeTo}`, 300, y + 16, { width: 235 })
      .text(`Vigencia: ${info.validFrom} a ${info.validTo}`, 60, y + 30, { width: 235 })
      .text(`Consecutivo: ${info.consecutive}`, 300, y + 30, { width: 235 })
      .text(`Generación/expedición: ${info.generatedAt}`, 60, y + 44, { width: 475 })
      .text(`Pago: ${info.paymentForm} · ${info.paymentTerm} · ${info.paymentMethod}`, 60, y + 58, { width: 475 })
      .text(`Calidades tributarias: ${qualities}`, 60, y + 72, { width: 475 })
      .text(`Software DIAN: ${info.softwareId}`, 60, y + 72 + qualitiesHeight, { width: 475 });
    doc.y = y + 88 + qualitiesHeight;
  }

  private addArcaAuthorizationInfo(doc: any, info: ArcaPrintedFiscalInfo): void {
    if (!info) throw new Error('Representación ARCA incompleta: falta bloque de autorización');
    const extraHeight = info.specialLegend ? 15 : 0;
    this.ensureVerticalSpace(doc, 62 + extraHeight);
    const y = doc.y + 6;
    doc.fontSize(10).font('Helvetica-Bold')
      .text('COMPROBANTE AUTORIZADO', 50, y, { width: 495, align: 'center' });
    doc.fontSize(9).font('Helvetica')
      .text(`${info.authorizationLabel}: ${info.authorizationCode}`, 60, y + 17, { width: 225 })
      .text(`Vencimiento ${info.authorizationLabel}: ${this.formatCompactFiscalDate(info.authorizationExpiry)}`, 300, y + 17, { width: 235 })
      .text(
        `Punto de venta: ${String(info.pointOfSale).padStart(5, '0')} · Comprobante: ${String(info.documentNumber).padStart(8, '0')}`,
        60, y + 32, { width: 475, align: 'center' },
      );
    if (info.specialLegend) {
      doc.fontSize(9).font('Helvetica-Bold')
        .text(info.specialLegend, 60, y + 47, { width: 475, align: 'center' });
    }
    doc.y = y + 50 + extraHeight;
  }

  private formatCompactFiscalDate(value: string): string {
    const normalized = String(value || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(normalized)) return value;
    return `${normalized.slice(6, 8)}/${normalized.slice(4, 6)}/${normalized.slice(0, 4)}`;
  }

  /**
   * Agrega información del cliente
   */
  private addClienteInfo(doc: any, cpeData: any, countryCode: string): void {
    const clientName = cpeData.razon_social_receptor || 'Cliente General';
    const clientAddress = cpeData.direccion_receptor || 'No especificada';
    const nameHeight = Math.max(13, this.measureTextHeight(doc, `Señor(es): ${clientName}`, 495, 9));
    const addressHeight = Math.max(13, this.measureTextHeight(doc, `Dirección: ${clientAddress}`, 495, 9));
    this.ensureVerticalSpace(doc, 22 + nameHeight + 13 + addressHeight);
    const y = doc.y + 5;

    // Título
    doc.fontSize(10).font('Helvetica-Bold')
      .text('DATOS DEL CLIENTE', 50, y);

    // Datos
    doc.fontSize(9).font('Helvetica')
      .text(`Señor(es): ${clientName}`, 50, y + 15, { width: 495 });
    const documentY = y + 15 + nameHeight;
    doc.text(`${this.getTipoDocumentoReceptorText(cpeData.tipo_documento_receptor, countryCode)}: ${cpeData.documento_receptor || 'N/A'}`, 50, documentY, { width: 495 });
    const addressY = documentY + 13;
    doc.text(`Dirección: ${clientAddress}`, 50, addressY, { width: 495 });
    doc.y = addressY + addressHeight + 4;
  }

  private addContinuationHeader(
    doc: any,
    empresaConfig: any,
    cpeData: any,
    countryCode: string,
  ): void {
    const top = Number(doc.page.margins?.top || 50);
    const taxIdLabel = countryCode === 'AR' ? 'CUIT' : countryCode === 'CO' ? 'NIT' : 'RUC';
    const issuer = String(empresaConfig.razon_social || 'EMISOR').trim();
    const issuerTaxId = String(empresaConfig.ruc || cpeData.ruc_emisor || 'No consignado').trim();
    const documentTitle = this.pdfFormatHelper.getHeaderText(
      countryCode,
      String(cpeData.tipo_documento_fiscal || cpeData.tipo_documento || ''),
    );
    const documentNumber = this.formatPrintedDocumentNumber(cpeData, countryCode);

    doc.fontSize(8).font('Helvetica-Bold')
      .text(issuer, 50, top, { width: 235, lineBreak: false, ellipsis: true })
      .text(`${documentTitle} ${documentNumber}`, 300, top, {
        width: 245, align: 'right', lineBreak: false, ellipsis: true,
      });
    doc.fontSize(7).font('Helvetica')
      .text(`${taxIdLabel}: ${issuerTaxId}`, 50, top + 12, { width: 235, lineBreak: false })
      .text('PÁGINA DE CONTINUACIÓN', 300, top + 12, {
        width: 245, align: 'right', lineBreak: false,
      });
    doc.moveTo(50, top + 25).lineTo(545, top + 25).stroke();
    doc._cpeContentTop = top + 33;
    doc.y = doc._cpeContentTop;
  }

  private addNoteReferenceInfo(doc: any, cpeData: any, countryCode: string): void {
    if (countryCode !== 'PE') return;
    const reference = resolveCpePrintedNoteReference(cpeData);
    if (!reference) return;

    const documentText = `${reference.referenceLabel} ${reference.referenceNumber}`;
    const reasonText = `Motivo o sustento: ${reference.reason}`;
    const reasonHeight = Math.max(13, this.measureTextHeight(doc, reasonText, 475, 9));
    const sectionHeight = 55 + reasonHeight;
    this.ensureVerticalSpace(doc, sectionHeight);
    const y = doc.y + 6;

    doc.fontSize(10).font('Helvetica-Bold')
      .text('INFORMACIÓN DE LA NOTA', 50, y, { width: 495 });
    doc.fontSize(9).font('Helvetica')
      .text(`Comprobante modificado: ${documentText}`, 60, y + 16, { width: 475 })
      .text(`Código de motivo de la nota: ${reference.reasonCode}`, 60, y + 31, { width: 475 })
      .text(reasonText, 60, y + 46, { width: 475 });

    doc.y = y + 46 + reasonHeight + 5;
  }

  /**
   * Agrega la tabla de items
   */
  private addItemsTable(doc: any, cpeData: any): void {
    const items = Array.isArray(cpeData.items) ? cpeData.items : [];
    // El encabezado y, como mínimo, una fila deben permanecer juntos. Sin
    // esta guarda un bloque anterior podía dejar sólo el encabezado al pie.
    this.ensureVerticalSpace(doc, 50);
    const tableTop = doc.y + 8;
    const minimumItemHeight = 20;

    // Encabezados de la tabla
    doc.fontSize(9).font('Helvetica-Bold');
    
    const headers = [
      { text: 'CANT.', x: 50, width: 38 },
      { text: 'UND.', x: 88, width: 48 },
      { text: 'DESCRIPCIÓN', x: 136, width: 224 },
      { text: 'P. UNIT.', x: 360, width: 82 },
      { text: 'TOTAL', x: 442, width: 103 }
    ];

    const drawHeaders = (y: number): number => {
      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach(header => {
        doc.text(header.text, header.x, y, { width: header.width, align: 'center' });
      });
      doc.moveTo(50, y + 15).lineTo(545, y + 15).stroke();
      doc.fontSize(8).font('Helvetica');
      return y + 22;
    };

    let currentY = drawHeaders(tableTop);
    const bottomY = () => this.getContentBottom(doc);

    items.forEach((item: any) => {
      const cantidad = item.cantidad || 1;
      const unidad = String(item.unidad_medida || item.unidad || 'NIU').trim().toUpperCase();
      const rawDescription = String(item.nombre_producto || item.descripcion || '').trim();
      let descripcionPendiente = rawDescription || 'Producto';
      // La representación impresa muestra importes brutos para que cada línea
      // concilie visualmente con el total a pagar; la base/IGV siguen intactos
      // en el XML y en la contabilidad.
      const precioUnitario = resolveCpePrintedUnitPrice(item);
      const total = resolveCpePrintedLineTotal(item);
      let firstFragment = true;

      // Un ítem de altura normal debe permanecer unido. Antes se aprovechaba
      // cualquier remanente al pie para imprimir sólo el inicio de la
      // descripción; la página siguiente quedaba con texto huérfano, sin
      // cantidad ni precio. Sólo se fragmentan descripciones que no caben ni
      // siquiera en una página de continuación completa.
      const completeDescriptionHeight = this.measureTextHeight(
        doc,
        descripcionPendiente,
        224,
        8,
      );
      const completeRowHeight = Math.max(
        minimumItemHeight,
        Math.ceil(completeDescriptionHeight) + 8,
      );
      const continuationRowsTop = Number(doc._cpeContentTop || 50) + 8 + 22;
      const completePageCapacity = bottomY() - continuationRowsTop;
      if (
        completeRowHeight <= completePageCapacity
        // `takeTextChunk` conserva ocho puntos adicionales para absorber el
        // redondeo interno de PDFKit. La misma reserva debe participar en la
        // decisión de mover la fila completa; de lo contrario una última
        // línea podía quedar sola al inicio de la hoja siguiente.
        && currentY + completeRowHeight + 8 > bottomY()
      ) {
        doc.addPage();
        currentY = drawHeaders(Number(doc._cpeContentTop || 50) + 8);
      }

      while (descripcionPendiente) {
        if (currentY + minimumItemHeight > bottomY()) {
          doc.addPage();
          currentY = drawHeaders(Number(doc._cpeContentTop || 50) + 8);
        }

        // Se deja una guarda adicional además del padding de la fila: PDFKit
        // trabaja con alturas fraccionarias y una fila calculada exactamente al
        // borde puede disparar una página automática.
        const maxTextHeight = Math.max(10, bottomY() - currentY - 16);
        const { chunk, rest } = this.takeTextChunk(
          doc,
          descripcionPendiente,
          224,
          maxTextHeight,
          8,
        );
        const descriptionHeight = this.measureTextHeight(doc, chunk, 224, 8);
        const rowHeight = Math.max(minimumItemHeight, Math.ceil(descriptionHeight) + 8);

        if (currentY + rowHeight > bottomY()) {
          doc.addPage();
          currentY = drawHeaders(Number(doc._cpeContentTop || 50) + 8);
          continue;
        }

        if (firstFragment) {
          doc.text(cantidad.toString(), 50, currentY + 3, { width: 38, align: 'center' });
          doc.text(unidad || 'NIU', 88, currentY + 3, { width: 48, align: 'center' });
          doc.text(precioUnitario.toFixed(2), 360, currentY + 3, { width: 82, align: 'right' });
          doc.text(total.toFixed(2), 442, currentY + 3, { width: 103, align: 'right' });
        }
        doc.text(chunk, 136, currentY + 3, { width: 224 });
        currentY += rowHeight;
        doc.moveTo(50, currentY - 2).lineTo(545, currentY - 2).stroke();
        descripcionPendiente = rest;
        firstFragment = false;
      }
    });

    // Línea final de la tabla
    doc.moveTo(50, currentY).lineTo(545, currentY).stroke();

    doc.y = currentY + 10;
  }

  /**
   * Agrega los totales del comprobante
   */
  private addTotales(doc: any, cpeData: any, countryCode: string): void {
    const totalValue = Number(cpeData.total_venta ?? cpeData.total ?? 0);
    const otherTaxLabel = countryCode === 'AR'
      ? 'Otros tributos'
      : countryCode === 'CO' ? 'INC' : 'ISC';
    const conditionalRows = [
      { label: 'Op. Gravadas', value: cpeData.total_gravadas },
      { label: 'Op. Exoneradas', value: cpeData.total_exoneradas },
      { label: 'Op. Inafectas', value: cpeData.total_inafectas },
      { label: 'Op. Gratuitas', value: cpeData.total_gratuitas },
      { label: 'Descuentos', value: cpeData.total_descuentos ?? cpeData.descuentos },
      { label: otherTaxLabel, value: cpeData.total_isc },
      { label: 'ICBPER', value: cpeData.total_icbper },
      { label: this.getTaxLabel(cpeData, countryCode), value: cpeData.total_igv },
    ].filter((row) => Number.isFinite(Number(row.value)) && Math.abs(Number(row.value)) >= 0.005);
    const sectionHeight = conditionalRows.length * 15 + 58 + (countryCode === 'AR' ? 48 : 0);
    this.ensureVerticalSpace(doc, sectionHeight + 10);
    const startY = doc.y + 8;
    const labelX = 350;
    const valueX = 455;

    doc.fontSize(9).font('Helvetica');

    let currentY = startY;
    conditionalRows.forEach((row) => {
      doc.text(`${row.label}:`, labelX, currentY, { width: 100, align: 'right' })
        .text(`${cpeData.moneda || 'PEN'} ${this.formatMoney(Number(row.value))}`, valueX, currentY, { width: 90, align: 'right' });
      currentY += 15;
    });

    // Total
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('TOTAL:', labelX, currentY + 3, { width: 100, align: 'right' })
      .text(`${cpeData.moneda || 'PEN'} ${this.formatMoney(totalValue)}`, valueX, currentY + 3, { width: 90, align: 'right' });

    // Monto en letras
    doc.fontSize(9).font('Helvetica-Oblique');
    const montoEnLetras = this.numeroALetras(totalValue, cpeData.moneda);
    const wordsY = currentY + 25;
    doc.text(`SON: ${montoEnLetras}`, 50, wordsY, { width: 315 });
    doc.y = wordsY + Math.max(14, this.measureTextHeight(doc, `SON: ${montoEnLetras}`, 315, 9)) + 4;

    if (countryCode === 'AR') {
      const metadata = cpeData.metadata && typeof cpeData.metadata === 'object'
        ? cpeData.metadata
        : {};
      const tributes = Array.isArray(metadata.arca_tributos) ? metadata.arca_tributos : [];
      const nationalIndirectTaxes = tributes
        .filter((tribute: any) => [1, 4].includes(Number(tribute?.id)))
        .reduce((sum: number, tribute: any) => {
          const amount = Number(tribute?.importe ?? 0);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);
      const transparencyY = doc.y + 3;
      doc.fontSize(8).font('Helvetica-Bold')
        .text('Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', 50, transparencyY, {
          width: 300,
        });
      doc.fontSize(8).font('Helvetica')
        .text(`IVA Contenido: ${cpeData.moneda || 'ARS'} ${this.formatMoney(Number(cpeData.total_igv || 0))}`, 50, transparencyY + 13, { width: 300 })
        .text(`Otros Impuestos Nacionales Indirectos: ${cpeData.moneda || 'ARS'} ${this.formatMoney(nationalIndirectTaxes)}`, 50, transparencyY + 26, { width: 300 });
      doc.y = transparencyY + 41;
    }
  }

  /**
   * Agrega el código QR
   */
  private addQRCode(doc: any, qrCodeDataUrl: string): void {
    const qrSize = CPE_PDF_QR_SIZE_MM * 72 / 25.4;
    const lowerPageY = doc.page.height * 0.54;
    let qrY = Math.max(doc.y + 8, lowerPageY);
    const requiredAfterQr = 82;

    if (qrY + qrSize + requiredAfterQr > this.getContentBottom(doc)) {
      doc.addPage();
      qrY = Math.max(58, doc.page.height * 0.54);
    }
    
    // Título
    doc.fontSize(8).font('Helvetica-Bold')
      .text('CÓDIGO QR', 50, qrY);

    // QR Code
    const encoded = /^data:image\/png;base64,([a-z0-9+/]+={0,2})$/i.exec(qrCodeDataUrl)?.[1];
    if (!encoded) {
      throw new Error('El código QR fiscal no es una imagen PNG válida');
    }
    const qrBuffer = Buffer.from(encoded, 'base64');
    doc.image(qrBuffer, 50, qrY + 15, { width: qrSize, height: qrSize });

    doc.y = qrY + 15 + qrSize + 6;
  }

  private addRepeatedPageQRCode(doc: any, qrCodeDataUrl: string, authority: string): void {
    const encoded = /^data:image\/png;base64,([a-z0-9+/]+={0,2})$/i.exec(qrCodeDataUrl)?.[1];
    if (!encoded) throw new Error('El código QR fiscal no es una imagen PNG válida');
    const qrBuffer = Buffer.from(encoded, 'base64');
    const qrSize = 68;
    const rightMargin = Number(doc.page.margins?.right || 50);
    const bottomMargin = Number(doc.page.margins?.bottom || 50);
    const qrX = doc.page.width - rightMargin - qrSize;
    const qrY = doc.page.height - bottomMargin - qrSize - 12;
    const currentY = doc.y;

    // DIAN exige que el QR acompañe cada página de la representación
    // gráfica. Se reserva esta franja para que nunca tape el detalle.
    doc._cpeRepeatedQrBottomReserve = qrSize + 24;
    doc.fontSize(6).font('Helvetica-Bold')
      .text(`QR ${authority}`, qrX, qrY - 9, { width: qrSize, align: 'center', lineBreak: false });
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc.y = currentY;
  }

  /**
   * Agrega leyendas obligatorias según SUNAT
   */
  private addLeyendasObligatorias(doc: any, cpeData: any, countryCode: string): void {
    const leyendasEspecificas = this.getLeyendasEspecificas(cpeData);
    this.ensureVerticalSpace(doc, 58 + leyendasEspecificas.length * 10);
    const y = doc.y + 10;

    doc.fontSize(7).font('Helvetica');

    // Leyenda exacta de la representación impresa
    doc.text(
      this.getPrintedRepresentationLegend(
        cpeData.tipo_documento_fiscal || cpeData.tipo_documento,
        countryCode,
      ),
      50, y,
      { width: 495, align: 'center' }
    );

    // Leyenda de consulta
    const consultaUrl = this.getFiscalConsultUrl(countryCode);
    doc.text(
      `Consulte su comprobante en: ${consultaUrl}`,
      50, y + 12,
      { width: 495, align: 'center' }
    );

    // Hash del documento
    if (cpeData.hash_firma || cpeData.hash) {
      doc.fontSize(6).font('Helvetica')
        .text(
          `Hash: ${cpeData.hash_firma || cpeData.hash}`,
          50, y + 24,
          { width: 495, align: 'center' }
        );
    }

    // Leyendas específicas declaradas por la operación
    if (leyendasEspecificas.length > 0) {
      let currentY = y + 36;
      leyendasEspecificas.forEach(leyenda => {
        doc.fontSize(7).font('Helvetica-Bold')
          .text(leyenda, 50, currentY, { width: 495, align: 'center' });
        currentY += 10;
      });
    }

    doc.y = Math.max(doc.y, y + 48);
  }

  private getContentBottom(doc: any): number {
    const bottomMargin = Number(doc.page.margins?.bottom || 50);
    const repeatedQrReserve = Number(doc._cpeRepeatedQrBottomReserve || 0);
    return doc.page.height - bottomMargin - 18 - repeatedQrReserve;
  }

  private ensureVerticalSpace(doc: any, requiredHeight: number): void {
    if (doc.y + requiredHeight > this.getContentBottom(doc)) {
      doc.addPage();
      doc.y = Number(doc._cpeContentTop || 50);
    }
  }

  private measureTextHeight(
    doc: any,
    value: unknown,
    width: number,
    fontSize: number,
  ): number {
    const text = String(value ?? '');
    if (typeof doc.heightOfString === 'function') {
      doc.fontSize(fontSize);
      return Number(doc.heightOfString(text, { width })) || fontSize + 2;
    }
    const approximateCharactersPerLine = Math.max(1, Math.floor(width / (fontSize * 0.55)));
    return Math.max(1, Math.ceil(text.length / approximateCharactersPerLine)) * (fontSize + 2);
  }

  private takeTextChunk(
    doc: any,
    value: string,
    width: number,
    maxHeight: number,
    fontSize: number,
  ): { chunk: string; rest: string } {
    if (this.measureTextHeight(doc, value, width, fontSize) <= maxHeight) {
      return { chunk: value, rest: '' };
    }

    let low = 1;
    let high = value.length;
    let best = 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = value.slice(0, middle);
      if (this.measureTextHeight(doc, candidate, width, fontSize) <= maxHeight) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    let splitAt = best;
    if (best < value.length) {
      const whitespace = value.lastIndexOf(' ', best);
      if (whitespace > 0) splitAt = whitespace;
    }
    const chunk = value.slice(0, Math.max(1, splitAt)).trimEnd();
    const rest = value.slice(Math.max(1, splitAt)).trimStart();
    return { chunk, rest };
  }

  private getPrintedRepresentationLegend(tipo: string, countryCode: string): string {
    return this.pdfFormatHelper.getPrintedRepresentationLegend(countryCode, String(tipo || ''));
  }

  private getFiscalConsultUrl(countryCode: string): string {
    if (countryCode === 'CO') return 'catalogo-vpfe.dian.gov.co';
    if (countryCode === 'AR') return 'www.arca.gob.ar/fe/qr';
    return 'www.sunat.gob.pe';
  }

  /**
   * Agrega pie de página
   */
  private addFooter(doc: any, cpeData: any, countryCode: string): void {
    const pageHeight = doc.page.height;
    const bottomMargin = Number(doc.page.margins?.bottom || 50);
    // Escribir exactamente en `pageHeight - 50` deja la línea fuera del área
    // útil de una hoja con margen inferior de 50 pt. PDFKit autoagregaba una
    // segunda página casi vacía sólo para terminar el pie.
    const footerY = pageHeight - bottomMargin - 12;

    const authority = getActiveCountryByCode(countryCode)?.autoridadFiscal ?? 'SUNAT';
    const locale = countryCode === 'AR' ? 'es-AR' : countryCode === 'CO' ? 'es-CO' : 'es-PE';
    const status =
      cpeData.dian_status ||
      cpeData.arca_status ||
      cpeData.sunat_status ||
      cpeData.estado ||
      'PENDIENTE';
    doc.fontSize(7).font('Helvetica')
      .text(
        `Estado ${authority}: ${status} | ` +
        `Generado: ${new Date().toLocaleString(locale)}`,
        50, footerY,
        { width: 495, align: 'center', lineBreak: false }
      );
  }

  private addNonFiscalWatermark(doc: any, countryCode: string, evidenceStatus: string): void {
    const currentY = doc.y;
    const explicitDemo = String(evidenceStatus).toUpperCase() === 'SIMULATED';

    doc.save();
    doc.opacity(0.1)
      .fillColor('#b45309')
      .font('Helvetica-Bold')
      .fontSize(44)
      .rotate(-34, { origin: [doc.page.width / 2, doc.page.height / 2] })
      .text(explicitDemo ? 'MUESTRA DEMO' : 'SIN VALIDEZ FISCAL', 70, doc.page.height / 2 - 25, {
        width: doc.page.width - 140,
        align: 'center',
      });
    doc.restore();

    doc.save();
    doc.opacity(1)
      .fillColor('#92400e')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(
        getCpeNonFiscalPdfNotice(countryCode, evidenceStatus),
        50,
        28,
        { width: doc.page.width - 100, align: 'center' },
      );
    doc.restore();
    doc.y = currentY;
  }

  // ===== MÉTODOS AUXILIARES =====

  private getTipoDocumentoReceptorText(tipo: string, countryCode: string = 'PE'): string {
    const normalized = String(tipo || '').toUpperCase();
    if (countryCode === 'CO') {
      const colombia: Record<string, string> = {
        '13': 'CC',
        '12': 'TI',
        '31': 'NIT',
        CC: 'CC',
        TI: 'TI',
        NIT: 'NIT',
      };
      return colombia[normalized] || 'DOCUMENTO';
    }
    if (countryCode === 'AR') {
      return normalized === 'CUIT' || normalized === '80' ? 'CUIT' : normalized === 'DNI' ? 'DNI' : 'DOCUMENTO';
    }
    const tipos: Record<string, string> = {
      '1': 'DNI',
      '4': 'CARNET DE EXTRANJERÍA',
      '6': 'RUC',
      '7': 'PASAPORTE'
    };
    return tipos[normalized] || 'DOCUMENTO';
  }

  private getTaxLabel(cpeData: any, countryCode: string = 'PE'): string {
    const defaultTaxName = countryCode === 'PE' ? 'IGV' : 'IVA';
    const defaultRate = countryCode === 'AR' ? 21 : countryCode === 'CO' ? 19 : 18;
    const taxName = cpeData.impuesto_nombre || cpeData.tax_name || defaultTaxName;
    const explicitRate = Number(cpeData.tasa_igv ?? cpeData.tasa_impuesto ?? cpeData.tax_rate);
    const derivedRate = Number(cpeData.total_gravadas) > 0
      ? (Number(cpeData.total_igv || 0) / Number(cpeData.total_gravadas)) * 100
      : defaultRate;
    const rate = Number.isFinite(explicitRate) && explicitRate > 0
      ? (explicitRate <= 1 ? explicitRate * 100 : explicitRate)
      : derivedRate;

    return `${taxName} (${Number(rate.toFixed(2))}%)`;
  }

  private formatDate(dateString: string, countryCode: string = 'PE'): string {
    if (!dateString) return 'N/A';
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateString));
    if (dateOnly) {
      return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    }
    const date = new Date(dateString);
    const locale = countryCode === 'AR' ? 'es-AR' : countryCode === 'CO' ? 'es-CO' : 'es-PE';
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  private formatMoney(amount: number): string {
    return Number(amount || 0).toFixed(2);
  }

  /**
   * Convierte un número a letras en la moneda fiscal del comprobante.
   */
  private numeroALetras(numero: number, moneda: string = 'PEN'): string {
    const monedas: Record<string, string> = {
      PEN: 'SOLES',
      ARS: 'PESOS ARGENTINOS',
      COP: 'PESOS COLOMBIANOS',
      USD: 'DÓLARES AMERICANOS',
      EUR: 'EUROS',
    };
    const monedaTexto =
      monedas[String(moneda || 'PEN').toUpperCase()] ||
      String(moneda || 'PEN').toUpperCase();
    
    const unidades = ['CERO','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE'];
    const decenas = ['VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
    const centenas = ['CIEN','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];

    const aLetras = (n: number): string => {
      if (n <= 20) return unidades[n];
      if (n < 30) return `VEINTI${unidades[n - 20].toLowerCase()}`;
      if (n < 100) {
        const d = decenas[Math.floor(n / 10) - 2];
        const u = n % 10;
        return u ? `${d} Y ${unidades[u]}` : d;
      }
      if (n < 1000) {
        const c = Math.floor(n / 100);
        const resto = n % 100;
        const pref = c === 1 && resto > 0 ? 'CIENTO' : centenas[c - 1];
        return resto ? `${pref} ${aLetras(resto)}` : pref;
      }
      if (n < 1_000_000) {
        const miles = Math.floor(n / 1000);
        const resto = n % 1000;
        const pref = miles === 1 ? 'MIL' : `${aLetras(miles)} MIL`;
        return resto ? `${pref} ${aLetras(resto)}` : pref;
      }
      if (n < 1_000_000_000) {
        const millones = Math.floor(n / 1_000_000);
        const resto = n % 1_000_000;
        const pref = millones === 1 ? 'UN MILLÓN' : `${aLetras(millones)} MILLONES`;
        return resto ? `${pref} ${aLetras(resto)}` : pref;
      }
      return n.toString();
    };

    const entero = Math.floor(numero);
    const decimales = Math.round((numero - entero) * 100);
    
    return `${aLetras(entero)} CON ${decimales.toString().padStart(2, '0')}/100 ${monedaTexto}`;
  }

  /**
   * Obtiene leyendas específicas según tipo de comprobante
   */
  private getLeyendasEspecificas(cpeData: any): string[] {
    const rawLeyendas = cpeData.leyendas || cpeData.leyendas_especificas || cpeData.legends;
    const leyendas = Array.isArray(rawLeyendas)
      ? rawLeyendas
      : typeof rawLeyendas === 'string'
        ? rawLeyendas.split(/\r?\n|;/)
        : [];

    const normalized = leyendas
      .map((leyenda) => String(leyenda || '').trim())
      .filter(Boolean);

    if (String(cpeData.tipo_operacion || '').trim() === '0200') {
      normalized.push('TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE');
    }

    if (Number(cpeData.monto_detraccion || cpeData.detraccion_monto || 0) > 0) {
      normalized.push('OPERACIÓN SUJETA AL SISTEMA DE PAGO DE OBLIGACIONES TRIBUTARIAS');
    }

    return Array.from(new Set(normalized));
  }
}
