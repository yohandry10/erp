import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { AuditService } from '../audit/audit.service';
import { CacheInvalidationService } from '../../shared/cache/cache-invalidation.service';
import { CpeOperationalDocumentService } from './cpe-operational-document.service';
import { CpeXmlBuilder } from './cpe-xml.builder';

/** Registra XML firmado por el escritorio y normaliza su payload de entrada. */
export class CpeRegistrationService {
  private readonly logger = new Logger(CpeRegistrationService.name);
  private readonly sunatStatuses = {
    NOT_SENT: 'NOT_SENT', READY: 'READY', SENDING: 'SENDING', ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED', ERROR: 'ERROR',
  } as const;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly auditService: AuditService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly operationalDocumentService: CpeOperationalDocumentService,
    private readonly xmlBuilder: CpeXmlBuilder,
  ) {}

  private ensureDocumentoParaCpe(cpe: any, tenantId: string) {
    return this.operationalDocumentService.ensureDocumentoParaCpe(cpe, tenantId);
  }

  private normalizeTipoDocumentoSunat(tipo: string | null | undefined, throwOnUnknown = true) {
    return this.xmlBuilder.normalizeTipoDocumentoSunat(tipo, throwOnUnknown);
  }

async getEmpresaEmisorInfoStrict(tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`No se pudo leer la configuracion fiscal de la empresa: ${error.message}`);
    }

    const typedData = data as any;
    const ruc = String(typedData?.ruc || '').trim();
    const razonSocial = String(typedData?.razon_social || '').trim();
    if (!/^\d{11}$/.test(ruc) || !razonSocial) {
      throw new BadRequestException('No se puede crear el CPE: faltan RUC o razon social reales en empresa_config');
    }

    return {
      ruc,
      razonSocial,
      direccion: typedData?.direccion_fiscal ?? '',
      ciudad: typedData?.provincia ?? '',
      departamento: typedData?.departamento ?? '',
      codigoUbigeo: typedData?.ubigeo ?? '',
    };
  }

async registerDesktopSignedXml(payload: any, tenantId: string, userId?: string) {
    const signedXml = String(payload?.signed_xml ?? payload?.signedXml ?? '').trim();
    if (!signedXml) {
      throw new BadRequestException('El XML firmado desktop es requerido');
    }

    const client = this.supabaseService.getClient();
    const hash = crypto.createHash('sha256').update(signedXml).digest('base64');
    const providedHash = String(payload?.hash ?? '').trim();
    if (providedHash && providedHash !== hash) {
      throw new BadRequestException('El hash del XML firmado no coincide con el contenido recibido');
    }

    const idempotencyKey = String(payload?.idempotency_key ?? payload?.idempotencyKey ?? `desktop.signed:${tenantId}:${hash}`).trim();
    const { data: existing, error: existingError } = await client
      .from('cpe')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingError && existingError.code && existingError.code !== 'PGRST116') {
      throw new BadRequestException('No se pudo validar idempotencia del XML desktop');
    }
    if (existing) {
      return { success: true, data: existing, message: 'XML firmado desktop ya registrado' };
    }

    const emisor = await this.getEmpresaEmisorInfoStrict(tenantId);
    const xmlId = this.extractXmlTag(signedXml, 'ID');
    const [serieFromXml, numeroFromXml] = xmlId.includes('-') ? xmlId.split('-', 2) : ['', ''];
    const tipoDocumento = this.normalizeTipoDocumentoSunat(
      payload?.tipo_documento ?? payload?.document_type ?? this.extractXmlTag(signedXml, 'InvoiceTypeCode') ?? '01',
    );
    const serie = String(payload?.serie ?? serieFromXml ?? this.defaultSerieForTipo(tipoDocumento)).trim().toUpperCase();
    const numero = Number(payload?.numero ?? numeroFromXml ?? 1);
    const totalVenta = this.roundMoney(
      payload?.total_venta ?? payload?.total ?? this.extractXmlNumber(signedXml, 'PayableAmount') ?? 0,
    );
    const totalIgv = this.roundMoney(payload?.total_igv ?? payload?.igv ?? 0);
    const totalGravadas = this.roundMoney(payload?.total_gravadas ?? payload?.subtotal ?? Math.max(totalVenta - totalIgv, 0));
    const documentoReceptor = String(payload?.documento_receptor ?? payload?.cliente_ruc ?? '00000000').replace(/\D/g, '');
    const tipoDocumentoReceptor = this.resolveTipoDocumentoReceptor(
      tipoDocumento,
      payload?.tipo_documento_receptor ?? payload?.clienteTipoDocumento,
      documentoReceptor,
    );
    const eventId = randomUUID();

    const cpePayload = {
      tenant_id: tenantId,
      tipo_documento: tipoDocumento,
      serie,
      numero: Number.isFinite(numero) && numero > 0 ? numero : 1,
      fecha_emision: new Date().toISOString(),
      fecha_vencimiento: new Date().toISOString(),
      ruc_emisor: emisor.ruc,
      razon_social_emisor: emisor.razonSocial,
      tipo_documento_receptor: tipoDocumentoReceptor,
      documento_receptor: documentoReceptor,
      razon_social_receptor: String(payload?.razon_social_receptor ?? payload?.cliente_nombre ?? 'Cliente desktop offline'),
      direccion_receptor: String(payload?.direccion_receptor ?? ''),
      moneda: String(payload?.moneda ?? 'PEN'),
      total_gravadas: totalGravadas,
      total_igv: totalIgv,
      total_venta: totalVenta,
      items: Array.isArray(payload?.items) ? payload.items : [],
      idempotency_key: idempotencyKey,
      event_id: eventId,
      estado: 'FIRMADO',
      hash,
      hash_firma: hash,
      sunat_status: this.sunatStatuses.NOT_SENT,
      xml_firmado: signedXml,
    };

    const { data, error } = await client
      .from('cpe')
      .insert(cpePayload)
      .select()
      .single();

    if (error) {
      this.logger.error(`❌ [CPE] Error registrando XML firmado desktop: ${error.message}`, error);
      throw new BadRequestException('No se pudo registrar el XML firmado desktop');
    }

    const createdCpe = Array.isArray(data) ? data[0] : data;
    const documentoId = await this.ensureDocumentoParaCpe(createdCpe, tenantId);
    if (documentoId) {
      (createdCpe as any).documento_id = documentoId;
    } else {
      throw new BadRequestException(`CPE desktop ${createdCpe.id} no tiene documento operativo asociado`);
    }

    await this.eventBus.emitComprobanteCreadoEvent({
      eventId: randomUUID(),
      tenantId,
      idempotencyKey: `desktop.cpe.creado:${tenantId}:${createdCpe.id}`,
      cpeId: createdCpe.id,
      tipoDocumento,
      serie,
      numero: createdCpe.numero,
      clienteId: createdCpe.documento_receptor,
      total: createdCpe.total_venta,
      esCredito: false,
      ventaId: undefined,
      requiereTransporte: false,
      moneda: createdCpe.moneda,
    });

    await this.eventBus.emitFacturaEmitidaEvent({
      eventId,
      tenantId,
      idempotencyKey,
      cpeId: createdCpe.id,
      facturaId: documentoId,
      serie,
      numero: String(createdCpe.numero),
      clienteId: createdCpe.documento_receptor,
      subtotal: createdCpe.total_gravadas,
      impuestos: createdCpe.total_igv,
      total: createdCpe.total_venta,
      moneda: createdCpe.moneda,
      fechaEmision: createdCpe.fecha_emision,
      fechaVencimiento: createdCpe.fecha_vencimiento,
      source: 'cpe.desktop',
      sunatStatus: this.sunatStatuses.NOT_SENT,
      hashFirma: hash,
      hash,
    });

    try {
      await this.auditService.registrarCambio(
        'cpe',
        'INSERT',
        userId ?? null,
        {
          new: {
            tipo_documento: tipoDocumento,
            serie,
            numero: createdCpe.numero,
            total_venta: createdCpe.total_venta,
            estado: 'FIRMADO',
            source: 'desktop_offline',
          },
        },
        tenantId,
        createdCpe.id,
        { accion: 'REGISTRAR_CPE_DESKTOP', tipo_documento: tipoDocumento },
      );
    } catch (auditError) {
      this.logger.warn('⚠️ No se pudo registrar auditoria de CPE desktop:', auditError);
    }

    try {
      await this.cacheInvalidation.onCpeCreated(tenantId);
    } catch (cacheError) {
      this.logger.warn('⚠️ No se pudo invalidar cache despues de CPE desktop:', cacheError);
    }

    return {
      success: true,
      data: createdCpe,
      message: 'XML firmado desktop registrado; envio SUNAT/OSE pendiente de confirmacion externa',
    };
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
  ): string {
    const normalized = String(provided || '').trim().toUpperCase();
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
