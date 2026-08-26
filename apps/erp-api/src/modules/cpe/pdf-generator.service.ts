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
import { validateCountryTaxId } from '../paises/initial-country';

export const CPE_PDF_PRINT_FORMAT = {
  size: 'A4' as const,
  widthMm: 210,
  heightMm: 297,
};

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

/**
 * Servicio para generar PDFs de comprobantes electrónicos con formato oficial
 * Soporta múltiples países: Perú (SUNAT), Colombia (DIAN), etc.
 * 
 * CUMPLIMIENTO NORMATIVO:
 * ✅ Código QR obligatorio (SUNAT/DIAN)
 * ✅ Diseño visual estándar por país
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
   * Genera PDF con formato oficial para un CPE (multi-país)
   * Detecta automáticamente el país y aplica el formato correspondiente
   */
  async generateSunatCompliantPdf(cpeId: string, tenantId: string): Promise<Buffer> {
    try {
      this.logger.log(`📄 Generando PDF para CPE: ${cpeId}`);

      // 1. Obtener datos del CPE
      const cpeData = await this.getCpeData(cpeId, tenantId);
      
      // 2. Obtener código de país y validar la empresa con su documento fiscal.
      const countryCode = await this.getCountryCode(tenantId);
      const empresaConfig = await this.getEmpresaConfig(tenantId, countryCode);
      const fiscalAuthority = this.pdfFormatHelper.getFiscalAuthorityName(countryCode);

      this.logger.log(`📄 Generando PDF con formato ${fiscalAuthority} (${countryCode})`);

      // 4. Generar código QR si es requerido
      let qrCode: string | null = null;
      if (this.pdfFormatHelper.isQRCodeRequired(countryCode)) {
        qrCode = await this.generateQRCode(cpeData);
      }

      // 5. Generar PDF con formato específico del país
      const pdfBuffer = await this.buildPdfDocument(cpeData, empresaConfig, qrCode, countryCode);

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
  private async generateQRCode(cpeData: any): Promise<string> {
    try {
      return await buildSunatQrDataUrl(cpeData);
    } catch (error) {
      this.logger.warn('⚠️ Error generando QR, usando placeholder:', error);
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
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

  /**
   * Construye el documento PDF con formato oficial SUNAT
   */
  private async buildPdfDocument(
    cpeData: any,
    empresaConfig: any,
    qrCode: string,
    countryCode: string = 'PE',
  ): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    const chunks: Buffer[] = [];
    const logoBuffer = await this.loadLogoBuffer(empresaConfig.logo_url);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: CPE_PDF_PRINT_FORMAT.size,
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        if (empresaConfig.is_demo === true) {
          const addDemoMark = () => this.addDemoWatermark(doc, countryCode);
          addDemoMark();
          doc.on('pageAdded', addDemoMark);
        }

        // Capturar el PDF en memoria
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ===== ENCABEZADO =====
        this.addHeader(doc, empresaConfig, cpeData, countryCode, logoBuffer);

        // ===== INFORMACIÓN DEL COMPROBANTE =====
        this.addComprobanteInfo(doc, cpeData, countryCode);

        // ===== DATOS DEL CLIENTE =====
        this.addClienteInfo(doc, cpeData, countryCode);

        // ===== DETALLE DE ITEMS =====
        this.addItemsTable(doc, cpeData);

        // ===== TOTALES =====
        this.addTotales(doc, cpeData, countryCode);

        // ===== CÓDIGO QR =====
        this.addQRCode(doc, qrCode);

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
  private addHeader(
    doc: any,
    empresaConfig: any,
    cpeData: any,
    countryCode: string,
    logoBuffer?: Buffer | null,
  ): void {
    const startY = 50;
    const taxIdLabel = countryCode === 'AR' ? 'CUIT' : countryCode === 'CO' ? 'NIT' : 'RUC';

    // Logo (si existe)
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, startY, { width: 80 });
      } catch {
        // Ignorar si falla carga del logo
      }
    }

    // Información de la empresa (lado izquierdo)
    doc.fontSize(12).font('Helvetica-Bold')
      .text(empresaConfig.razon_social, 50, startY);

    doc.fontSize(9).font('Helvetica')
      .text(`${taxIdLabel}: ${empresaConfig.ruc}`, 50, startY + 15)
      .text(empresaConfig.direccion_fiscal || empresaConfig.direccion || 'Dirección no especificada', 50, startY + 28)
      .text(`Tel: ${empresaConfig.telefono || 'N/A'}`, 50, startY + 41)
      .text(`Email: ${empresaConfig.email || 'N/A'}`, 50, startY + 54);

    // Cuadro del comprobante (lado derecho)
    const boxX = 380;
    const boxY = startY;
    const boxWidth = 165;
    const boxHeight = 80;

    // Borde del cuadro
    doc.rect(boxX, boxY, boxWidth, boxHeight).stroke();

    // Tipo de comprobante
    const tipoDoc = this.getTipoDocumentoText(cpeData.tipo_documento);
    doc.fontSize(14).font('Helvetica-Bold')
      .text(tipoDoc.toUpperCase(), boxX, boxY + 10, {
        width: boxWidth,
        align: 'center'
      });

    // Identificador fiscal del emisor
    doc.fontSize(10).font('Helvetica')
      .text(`${taxIdLabel}: ${cpeData.ruc_emisor}`, boxX, boxY + 30, {
        width: boxWidth,
        align: 'center'
      });

    // Serie y número
    doc.fontSize(12).font('Helvetica-Bold')
      .text(`${cpeData.serie}-${String(cpeData.numero).padStart(8, '0')}`, boxX, boxY + 50, {
        width: boxWidth,
        align: 'center'
      });

    doc.moveDown(6);
  }

  /**
   * Agrega información del comprobante
   */
  private addComprobanteInfo(doc: any, cpeData: any, countryCode: string): void {
    const y = doc.y + 10;

    doc.fontSize(9).font('Helvetica')
      .text(`Fecha de Emisión: ${this.formatDate(cpeData.fecha_emision, countryCode)}`, 50, y)
      .text(`Fecha de Vencimiento: ${this.formatDate(cpeData.fecha_vencimiento, countryCode)}`, 300, y)
      .text(`Moneda: ${cpeData.moneda || 'PEN'}`, 50, y + 15);

    doc.moveDown(2);
  }

  /**
   * Agrega información del cliente
   */
  private addClienteInfo(doc: any, cpeData: any, countryCode: string): void {
    const y = doc.y + 5;

    // Título
    doc.fontSize(10).font('Helvetica-Bold')
      .text('DATOS DEL CLIENTE', 50, y);

    // Datos
    doc.fontSize(9).font('Helvetica')
      .text(`Señor(es): ${cpeData.razon_social_receptor || 'Cliente General'}`, 50, y + 15)
      .text(`${this.getTipoDocumentoReceptorText(cpeData.tipo_documento_receptor, countryCode)}: ${cpeData.documento_receptor || 'N/A'}`, 50, y + 28)
      .text(`Dirección: ${cpeData.direccion_receptor || 'No especificada'}`, 50, y + 41);

    doc.moveDown(3);
  }

  /**
   * Agrega la tabla de items
   */
  private addItemsTable(doc: any, cpeData: any): void {
    const items = Array.isArray(cpeData.items) ? cpeData.items : [];
    const tableTop = doc.y + 10;
    const itemHeight = 20;

    // Encabezados de la tabla
    doc.fontSize(9).font('Helvetica-Bold');
    
    const headers = [
      { text: 'CANT.', x: 50, width: 40 },
      { text: 'DESCRIPCIÓN', x: 95, width: 240 },
      { text: 'P. UNIT.', x: 340, width: 60 },
      { text: 'TOTAL', x: 405, width: 60 }
    ];

    const drawHeaders = (y: number): number => {
      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach(header => {
        doc.text(header.text, header.x, y, { width: header.width, align: 'center' });
      });
      doc.moveTo(50, y + 15).lineTo(545, y + 15).stroke();
      doc.fontSize(8).font('Helvetica');
      return y + 20;
    };

    let currentY = drawHeaders(tableTop);

    items.forEach((item: any) => {
      if (currentY + itemHeight > 700) {
        doc.addPage();
        currentY = drawHeaders(50);
      }

      const cantidad = item.cantidad || 1;
      const descripcion = item.nombre_producto || item.descripcion || 'Producto';
      // La representación impresa muestra importes brutos para que cada línea
      // concilie visualmente con el total a pagar; la base/IGV siguen intactos
      // en el XML y en la contabilidad.
      const precioUnitario = resolveCpePrintedUnitPrice(item);
      const total = resolveCpePrintedLineTotal(item);

      doc.text(cantidad.toString(), 50, currentY, { width: 40, align: 'center' });
      doc.text(descripcion, 95, currentY, { width: 240 });
      doc.text(precioUnitario.toFixed(2), 340, currentY, { width: 60, align: 'right' });
      doc.text(total.toFixed(2), 405, currentY, { width: 60, align: 'right' });

      currentY += itemHeight;
    });

    // Línea final de la tabla
    doc.moveTo(50, currentY).lineTo(545, currentY).stroke();

    doc.y = currentY + 10;
  }

  /**
   * Agrega los totales del comprobante
   */
  private addTotales(doc: any, cpeData: any, countryCode: string): void {
    const startY = doc.y + 10;
    const labelX = 380;
    const valueX = 480;

    doc.fontSize(9).font('Helvetica');

    // Subtotal (Gravadas)
    doc.text('Op. Gravadas:', labelX, startY)
      .text(`${cpeData.moneda || 'PEN'} ${this.formatMoney(cpeData.total_gravadas)}`, valueX, startY, { align: 'right' });

    const taxLabel = this.getTaxLabel(cpeData, countryCode);

    // Impuesto principal
    doc.text(`${taxLabel}:`, labelX, startY + 15)
      .text(`${cpeData.moneda || 'PEN'} ${this.formatMoney(cpeData.total_igv)}`, valueX, startY + 15, { align: 'right' });

    // Total
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('TOTAL:', labelX, startY + 35)
      .text(`${cpeData.moneda || 'PEN'} ${this.formatMoney(cpeData.total_venta)}`, valueX, startY + 35, { align: 'right' });

    // Monto en letras
    doc.fontSize(9).font('Helvetica-Oblique');
    const montoEnLetras = this.numeroALetras(cpeData.total_venta, cpeData.moneda);
    doc.text(`SON: ${montoEnLetras}`, 50, startY + 60, { width: 300 });

    doc.moveDown(5);
  }

  /**
   * Agrega el código QR
   */
  private addQRCode(doc: any, qrCodeDataUrl: string): void {
    const qrY = doc.y + 10;
    
    // Título
    doc.fontSize(8).font('Helvetica-Bold')
      .text('CÓDIGO QR', 50, qrY);

    // QR Code
    try {
      const qrBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
      doc.image(qrBuffer, 50, qrY + 15, { width: 100, height: 100 });
    } catch (error) {
      this.logger.warn('⚠️ No se pudo agregar código QR al PDF:', error);
    }

    doc.y = qrY + 120;
  }

  /**
   * Agrega leyendas obligatorias según SUNAT
   */
  private addLeyendasObligatorias(doc: any, cpeData: any, countryCode: string): void {
    const y = doc.y + 10;

    doc.fontSize(7).font('Helvetica');

    // Leyenda de representación impresa
    doc.text(
      'Representación impresa del Comprobante de Pago Electrónico.',
      50, y,
      { width: 495, align: 'center' }
    );

    // Leyenda de consulta
    const consultaUrl =
      countryCode === 'CO'
        ? 'catalogo-vpfe.dian.gov.co'
        : countryCode === 'AR'
          ? 'www.afip.gob.ar/fe/qr'
          : 'www.sunat.gob.pe';
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
    const leyendasEspecificas = this.getLeyendasEspecificas(cpeData);
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

  /**
   * Agrega pie de página
   */
  private addFooter(doc: any, cpeData: any, countryCode: string): void {
    const pageHeight = doc.page.height;
    const footerY = pageHeight - 50;

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
        { width: 495, align: 'center' }
      );
  }

  private addDemoWatermark(doc: any, countryCode: string): void {
    const currentY = doc.y;

    doc.save();
    doc.opacity(0.1)
      .fillColor('#b45309')
      .font('Helvetica-Bold')
      .fontSize(44)
      .rotate(-34, { origin: [doc.page.width / 2, doc.page.height / 2] })
      .text('MUESTRA DEMO', 70, doc.page.height / 2 - 25, {
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
        getCpeDemoPdfNotice(countryCode),
        50,
        28,
        { width: doc.page.width - 100, align: 'center' },
      );
    doc.restore();
    doc.y = currentY;
  }

  // ===== MÉTODOS AUXILIARES =====

  private getTipoDocumentoText(tipo: string): string {
    const tipos: Record<string, string> = {
      '01': 'FACTURA ELECTRÓNICA',
      '03': 'BOLETA DE VENTA ELECTRÓNICA',
      '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
      '08': 'NOTA DE DÉBITO ELECTRÓNICA'
    };
    return tipos[tipo] || 'COMPROBANTE ELECTRÓNICO';
  }

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
