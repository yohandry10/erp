import { Injectable, Logger } from '@nestjs/common';
import { getActiveCountryByCode } from '../paises/initial-country';
import { perfilPaisDelTenant } from './pais-del-tenant';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { PdfFormatHelperService } from './pdf-format-helper.service';
import { buildSunatQrDataUrl } from './sunat-qr.util';
import { validateCountryTaxId } from '../paises/initial-country';

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

    return data;
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
      const fs = require('fs');
      const path = require('path');
      if (String(logoUrl).startsWith('http')) {
        const axios = require('axios');
        const resp = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 });
        return Buffer.from(resp.data);
      }

      return fs.readFileSync(path.resolve(logoUrl));
    } catch (error) {
      this.logger.warn(`No se pudo cargar logo para PDF CPE: ${(error as Error).message}`);
      return null;
    }
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
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

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

    // Dibujar encabezados
    headers.forEach(header => {
      doc.text(header.text, header.x, tableTop, { width: header.width, align: 'center' });
    });

    // Línea debajo de encabezados
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

    // Items
    doc.fontSize(8).font('Helvetica');
    let currentY = tableTop + 20;

    items.forEach((item: any, index: number) => {
      const cantidad = item.cantidad || 1;
      const descripcion = item.nombre_producto || item.descripcion || 'Producto';
      const precioUnitario = parseFloat(item.precio_unitario || 0);
      const total = cantidad * precioUnitario;

      doc.text(cantidad.toString(), 50, currentY, { width: 40, align: 'center' });
      doc.text(descripcion, 95, currentY, { width: 240 });
      doc.text(precioUnitario.toFixed(2), 340, currentY, { width: 60, align: 'right' });
      doc.text(total.toFixed(2), 405, currentY, { width: 60, align: 'right' });

      currentY += itemHeight;

      // Nueva página si es necesario
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
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
