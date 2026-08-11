import { BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CacheInvalidationService } from '../../shared/cache/cache-invalidation.service';
import { CpeCertificateService } from './cpe-certificate.service';
import { DesktopSignedCpeDto } from './dto/desktop-signed-cpe.dto';
import {
  validateArgentinaCuit,
  validateColombiaNit,
  validatePeruRuc,
} from '../paises/initial-country';

/** Registra XML firmado por el escritorio y normaliza su payload de entrada. */
export class CpeRegistrationService {
  private readonly logger = new Logger(CpeRegistrationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly certificateService: CpeCertificateService,
  ) {}

async getEmpresaEmisorInfoStrict(tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia, pais, moneda_defecto, dian_regimen_fiscal, dian_tipo_contribuyente')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`No se pudo leer la configuracion fiscal de la empresa: ${error.message}`);
    }

    const typedData = data as any;
    const ruc = String(typedData?.ruc || '').trim();
    const razonSocial = String(typedData?.razon_social || '').trim();
    const pais = String(typedData?.pais || 'PE').trim().toUpperCase();
    const identificacionValida =
      pais === 'AR'
        ? validateArgentinaCuit(ruc)
        : pais === 'CO'
          ? validateColombiaNit(ruc)
          : validatePeruRuc(ruc);
    if (!identificacionValida || !razonSocial) {
      const documento = pais === 'AR' ? 'CUIT' : pais === 'CO' ? 'NIT' : 'RUC';
      throw new BadRequestException(
        `No se puede crear el comprobante: faltan ${documento} o razón social válidos en empresa_config`,
      );
    }

    return {
      ruc,
      razonSocial,
      direccion: typedData?.direccion_fiscal ?? '',
      ciudad: typedData?.provincia ?? '',
      departamento: typedData?.departamento ?? '',
      codigoUbigeo: typedData?.ubigeo ?? '',
      pais,
      moneda: typedData?.moneda_defecto || (pais === 'AR' ? 'ARS' : pais === 'CO' ? 'COP' : 'PEN'),
      regimenFiscal: typedData?.dian_regimen_fiscal ?? '',
      tipoContribuyente: typedData?.dian_tipo_contribuyente ?? '',
    };
  }

async registerDesktopSignedXml(payload: DesktopSignedCpeDto, tenantId: string, userId: string) {
    if (!userId) {
      throw new BadRequestException('El registro desktop exige un actor autenticado');
    }
    if (['07', '08'].includes(payload.tipo_documento)) {
      throw new BadRequestException(
        'Las notas 07/08 deben usar /cpe/notas-referenciadas (contrato atómico 472)',
      );
    }

    const signedXml = payload.signed_xml.trim();
    const hash = crypto.createHash('sha256').update(signedXml, 'utf8').digest('base64');
    if (payload.hash !== hash) {
      throw new BadRequestException('El hash SHA-256 del XML firmado no coincide con el contenido recibido');
    }

    const signer = await this.certificateService.getXmlSigner(tenantId);
    if (!signer.validateSignatureStrict(signedXml)) {
      throw new BadRequestException(
        'La firma XMLDSig no es válida para el certificado configurado del tenant',
      );
    }

    const parsed = this.parseInvoiceXml(signedXml);
    const emisor = await this.getEmpresaEmisorInfoStrict(tenantId);
    const invoiceId = this.xmlText(parsed.ID);
    const [xmlSerie, xmlNumero] = invoiceId.split('-', 2);
    const xmlTipo = this.xmlText(parsed.InvoiceTypeCode);
    const xmlMoneda = this.xmlText(parsed.DocumentCurrencyCode);
    const xmlFecha = this.xmlText(parsed.IssueDate);
    const supplierParty = parsed.AccountingSupplierParty?.Party;
    const customerParty = parsed.AccountingCustomerParty?.Party;
    const xmlEmisor = this.xmlText(supplierParty?.PartyIdentification?.ID);
    const xmlEmisorNombre = this.xmlText(supplierParty?.PartyLegalEntity?.RegistrationName);
    const xmlReceptor = this.xmlText(customerParty?.PartyIdentification?.ID);
    const xmlTipoReceptor = String(customerParty?.PartyIdentification?.ID?.['@_schemeID'] ?? '').trim();
    const xmlReceptorNombre = this.xmlText(customerParty?.PartyLegalEntity?.RegistrationName);
    const legalTotals = parsed.LegalMonetaryTotal ?? {};
    const xmlGravadas = this.money(this.xmlText(legalTotals.LineExtensionAmount));
    const xmlTotal = this.money(this.xmlText(legalTotals.PayableAmount));
    const xmlIgv = this.money(this.xmlText(parsed.TaxTotal?.TaxAmount));
    const xmlItems = this.parseInvoiceItems(parsed.InvoiceLine);

    if (
      xmlTipo !== payload.tipo_documento
      || xmlSerie !== payload.serie
      || Number(xmlNumero) !== payload.numero
      || invoiceId !== `${payload.serie}-${String(payload.numero).padStart(8, '0')}`
      || (payload.tipo_documento === '01' && !payload.serie.startsWith('F'))
      || (payload.tipo_documento === '03' && !payload.serie.startsWith('B'))
      || xmlFecha !== payload.fecha_emision.slice(0, 10)
      || xmlMoneda !== payload.moneda
      || xmlEmisor !== emisor.ruc
      || this.normalizedText(xmlEmisorNombre) !== this.normalizedText(emisor.razonSocial)
      || xmlReceptor !== payload.documento_receptor
      || xmlTipoReceptor !== payload.tipo_documento_receptor
      || this.normalizedText(xmlReceptorNombre) !== this.normalizedText(payload.razon_social_receptor)
      || !this.sameMoney(xmlGravadas, payload.total_gravadas)
      || !this.sameMoney(xmlIgv, payload.total_igv)
      || !this.sameMoney(xmlTotal, payload.total_venta)
      || JSON.stringify(xmlItems) !== JSON.stringify(this.canonicalDtoItems(payload.items))
    ) {
      throw new BadRequestException(
        'Los campos fiscales del XML no coinciden con serie, receptor, moneda, totales o ítems del snapshot desktop',
      );
    }

    const detalles = payload.items.map((item, index) => ({
      orden: index + 1,
      producto_id: item.producto_id ?? null,
      codigo_producto: item.codigo,
      descripcion: item.descripcion.trim(),
      unidad_medida: item.unidad,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      descuento_unitario: 0,
      valor_venta: item.valor_venta,
      impuesto_igv: item.igv,
      impuesto_isc: 0,
      total_item: item.precio_venta,
      afectacion_igv: item.igv > 0 ? '10' : '20',
    }));
    const rpcPayload = {
      cpe: {
        tipo_documento: payload.tipo_documento,
        serie: payload.serie,
        numero: String(payload.numero).padStart(8, '0'),
        fecha_emision: xmlFecha,
        fecha_vencimiento: xmlFecha,
        ruc_emisor: emisor.ruc,
        razon_social_emisor: emisor.razonSocial,
        direccion_emisor: emisor.direccion,
        tipo_documento_receptor: payload.tipo_documento_receptor,
        documento_receptor: payload.documento_receptor,
        razon_social_receptor: payload.razon_social_receptor,
        direccion_receptor: payload.direccion_receptor ?? '',
        cliente_id: payload.cliente_id ?? null,
        moneda: payload.moneda,
        total_gravadas: payload.total_gravadas,
        total_exoneradas: 0,
        total_inafectas: 0,
        total_exportacion: 0,
        total_igv: payload.total_igv,
        total_venta: payload.total_venta,
        items: payload.items,
        idempotency_key: payload.idempotency_key,
        estado: 'FIRMADO',
        estado_sunat: 'PENDIENTE',
        sunat_status: 'READY',
        hash,
        hash_firma: hash,
        xml_firmado: signedXml,
        metadata: {
          source: 'desktop_offline',
          local_fiscal_id: payload.local_fiscal_id,
          source_type: payload.source_type,
          source_id: payload.source_id ?? null,
        },
      },
      documento: {
        subtotal: payload.total_gravadas,
        impuesto_igv: payload.total_igv,
        impuesto_isc: 0,
        total: payload.total_venta,
        tipo_cambio: 1,
      },
      detalles,
    };
    const { data, error } = await this.supabaseService.getClient().rpc('registrar_cpe_desktop_tx', {
      p_tenant_id: tenantId,
      p_actor_id: userId,
      p_payload: rpcPayload,
      p_idempotency_key: payload.idempotency_key,
    });
    if (error) {
      throw new BadRequestException(`No se pudo registrar/reparar el CPE desktop: ${error.message}`);
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.cpe?.id || !result?.documento_id) {
      throw new BadRequestException('El registro desktop no devolvió CPE, documento y detalles completos');
    }

    try {
      await this.cacheInvalidation.onCpeCreated(tenantId);
    } catch (cacheError) {
      this.logger.warn('No se pudo invalidar cache después del commit desktop', cacheError);
    }
    return {
      success: true,
      data: { ...result.cpe, documento_id: result.documento_id },
      repaired: Boolean(result.repaired),
      message: 'XML desktop validado y registrado; el envío SUNAT/OSE continúa pendiente',
    };
  }

  private parseInvoiceXml(xml: string): any {
    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
      throw new BadRequestException('El XML firmado desktop no es XML bien formado');
    }
    const parsed = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      trimValues: true,
      parseTagValue: false,
      allowBooleanAttributes: false,
    }).parse(xml);
    if (!parsed?.Invoice || Object.keys(parsed).filter((key) => key !== '?xml').length !== 1) {
      throw new BadRequestException('El XML desktop debe contener exactamente una raíz UBL Invoice');
    }
    return parsed.Invoice;
  }

  private parseInvoiceItems(lines: any): any[] {
    const values = Array.isArray(lines) ? lines : lines ? [lines] : [];
    return values.map((line, index) => ({
      codigo: this.xmlText(line.Item?.SellersItemIdentification?.ID) || `ITEM-${index + 1}`,
      descripcion: this.xmlText(line.Item?.Description),
      unidad: String(line.InvoicedQuantity?.['@_unitCode'] ?? '').trim(),
      cantidad: this.money(this.xmlText(line.InvoicedQuantity), 6),
      precio_unitario: this.money(this.xmlText(line.Price?.PriceAmount), 6),
      valor_venta: this.money(this.xmlText(line.LineExtensionAmount)),
      igv: this.money(this.xmlText(line.TaxTotal?.TaxAmount)),
      precio_venta: this.money(this.xmlText(line.LineExtensionAmount))
        + this.money(this.xmlText(line.TaxTotal?.TaxAmount)),
    }));
  }

  private canonicalDtoItems(items: DesktopSignedCpeDto['items']): any[] {
    return items.map((item) => ({
      codigo: item.codigo,
      descripcion: item.descripcion.trim(),
      unidad: item.unidad,
      cantidad: this.money(item.cantidad, 6),
      precio_unitario: this.money(item.precio_unitario, 6),
      valor_venta: this.money(item.valor_venta),
      igv: this.money(item.igv),
      precio_venta: this.money(item.precio_venta),
    }));
  }

  private xmlText(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    return String(value['#text'] ?? '').trim();
  }

  private normalizedText(value: string): string {
    return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  private money(value: unknown, decimals = 2): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Number(numeric.toFixed(decimals)) : Number.NaN;
  }

  private sameMoney(left: number, right: number): boolean {
    return Number.isFinite(left) && Math.abs(left - Number(right)) <= 0.01;
  }

private extractXmlTag(xml: string, tag: string): string {
    const pattern = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]+)</(?:\\w+:)?${tag}>`, 'i');
    return pattern.exec(xml)?.[1]?.trim() ?? '';
  }

private extractXmlNumber(xml: string, tag: string): number | null {
    const value = Number(this.extractXmlTag(xml, tag));
    return Number.isFinite(value) ? value : null;
  }

defaultSerieForTipo(tipoDocumento: string): string {
    switch (tipoDocumento) {
      case '01':
        return 'F001';
      case '03':
        return 'B001';
      case '07':
        return 'FC01';
      case '08':
        return 'FD01';
      default:
        return 'F001';
    }
  }

async resolveNumeroCpe(
    tenantId: string,
    tipoDocumento: string,
    serie: string,
    provided?: any,
  ): Promise<number> {
    const numericProvided = Number(provided);
    if (Number.isFinite(numericProvided) && numericProvided > 0) {
      return Math.trunc(numericProvided);
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('obtener_siguiente_numero_documento', {
        p_tenant_id: tenantId,
        p_tipo_documento: tipoDocumento,
        p_serie: serie,
      });

    if (error) {
      throw new BadRequestException(`No se pudo obtener el correlativo CPE: ${error.message}`);
    }

    const next = Number(Array.isArray(data) ? data[0] : data);
    if (!Number.isFinite(next) || next <= 0) {
      throw new BadRequestException(`Correlativo CPE invalido para ${tipoDocumento}-${serie}: ${data}`);
    }

    return Math.trunc(next);
  }

resolveTipoDocumentoReceptor(
    tipoDocumentoCpe: string,
    provided: any,
    documentoReceptor: string,
    pais = 'PE',
  ): string {
    const normalized = String(provided || '').trim().toUpperCase();
    if (pais === 'CO') {
      const colombiaMap: Record<string, string> = {
        '13': '13',
        CC: '13',
        '31': '31',
        NIT: '31',
        '22': '22',
        CE: '22',
        '41': '41',
        PASAPORTE: '41',
        '12': '12',
        TI: '12',
      };
      return colombiaMap[normalized] || (documentoReceptor.length >= 9 ? '31' : '13');
    }
    const map: Record<string, string> = {
      '1': '1',
      DNI: '1',
      '6': '6',
      RUC: '6',
      '4': '4',
      CE: '4',
      CARNET_EXTRANJERIA: '4',
      '7': '7',
      PASAPORTE: '7',
    };
    const resolved = map[normalized] || (documentoReceptor.length === 11 ? '6' : '1');

    if (tipoDocumentoCpe === '01' && resolved !== '6') {
      throw new BadRequestException('La factura requiere receptor con RUC');
    }

    return resolved;
  }

normalizeComprobanteItems(items: any[]): any[] {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('El comprobante debe incluir al menos un item');
    }

    return items.map((item, index) => {
      const cantidad = this.roundMoney(item?.cantidad ?? 0, 6);
      const valorUnitario = this.roundMoney(
        item?.valor_unitario ?? item?.valorUnitario ?? item?.precio_unitario ?? item?.precioUnitario ?? 0,
        6,
      );
      const valorVenta = this.roundMoney(
        item?.valor_venta ?? item?.valorVenta ?? cantidad * valorUnitario,
      );
      const igv = this.roundMoney(item?.igv ?? item?.impuesto_igv ?? item?.total_impuestos ?? 0);
      const total = this.roundMoney(item?.total ?? item?.precio_venta ?? valorVenta + igv);
      const precioUnitario = this.roundMoney(item?.precio_unitario ?? item?.precioUnitario ?? valorUnitario, 6);

      if (cantidad <= 0) {
        throw new BadRequestException(`El item ${index + 1} debe tener cantidad > 0`);
      }
      if (!String(item?.descripcion || '').trim()) {
        throw new BadRequestException(`El item ${index + 1} requiere descripcion`);
      }

      return {
        codigo: String(item?.codigo ?? item?.codigo_producto ?? `ITEM-${index + 1}`).trim(),
        descripcion: String(item.descripcion).trim(),
        cantidad,
        unidad: String(item?.unidad ?? item?.unidad_medida ?? item?.unidadMedida ?? 'NIU').trim().toUpperCase(),
        precio_unitario: precioUnitario,
        valor_venta: valorVenta,
        igv,
        precio_venta: total,
        total,
      };
    });
  }

roundMoney(value: any, decimals = 2): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    return Number(numeric.toFixed(decimals));
  }
}
