import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DOMParser } from '@xmldom/xmldom';
import { FacturaDto } from '@erp-suite/dtos';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { FiscalAdapterService } from './fiscal-adapter.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { CpeCertificateService } from './cpe-certificate.service';
import { buildSunatQrContent, buildSunatQrDataUrl } from './sunat-qr.util';
import {
  buildArcaQrRepresentation,
  buildDianQrRepresentation,
  resolveAcceptedDianEvidence,
} from './fiscal-qr.util';
import { assertExternalFiscalTransportAllowed } from '../../shared/utils/fiscal-transport-guard';
import { perfilPaisDelTenant } from './pais-del-tenant';
import {
  DianReceiverTaxProfile,
  DocumentoElectronico,
} from '../../shared/integration/fiscal.interfaces';
import { resolveDianPrintedFiscalInfo } from './dian-print.util';
import { resolveArcaPrintedFiscalInfo } from './arca-print.util';
import { resolveHistoricalCpeCountry } from './historical-cpe-country.util';

function firstDefined(source: Record<string, any>, keys: string[]): unknown {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') {
      return source[key];
    }
  }
  return undefined;
}

function finiteFiscalNumber(value: unknown, field: string, options: { min?: number; positive?: boolean } = {}): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`Dato fiscal inválido: ${field} debe ser finito`);
  if (options.positive && numeric <= 0) throw new Error(`Dato fiscal inválido: ${field} debe ser mayor que cero`);
  if (options.min !== undefined && numeric < options.min) {
    throw new Error(`Dato fiscal inválido: ${field} no puede ser menor que ${options.min}`);
  }
  return numeric;
}

export function normalizeFiscalRate(value: unknown, field = 'tasa de impuesto'): number {
  const numeric = finiteFiscalNumber(value, field, { min: 0 });
  const rate = numeric > 1 ? numeric / 100 : numeric;
  if (rate > 1) throw new Error(`Dato fiscal inválido: ${field} debe estar entre 0 y 100%`);
  return rate;
}

function normalizeDianTaxCategory(value: unknown):
  DocumentoElectronico['items'][number]['dianTaxCategory'] {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return undefined;
  if (normalized === 'GRAVADO' || normalized.startsWith('1')) return 'GRAVADO';
  if (['EXENTO', 'EXONERADO'].includes(normalized) || normalized.startsWith('2')) return 'EXENTO';
  if (['EXCLUIDO', 'INAFECTO'].includes(normalized) || normalized.startsWith('3')) return 'EXCLUIDO';
  // Exportaciones (40) y códigos ajenos a 10/20/30 siguen su flujo fiscal
  // propio; no se reclasifican silenciosamente como exentos o excluidos DIAN.
  return undefined;
}

/** Convierte el JSON snake_case persistido en el contrato fiscal camelCase. */
export function normalizePersistedFiscalItems(
  rawItems: unknown,
  fallbackRate: unknown,
): DocumentoElectronico['items'] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Dato fiscal inválido: el comprobante no contiene ítems');
  }
  const defaultRate = normalizeFiscalRate(fallbackRate);
  return rawItems.map((raw, index) => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
    const label = `ítem ${index + 1}`;
    const descripcion = String(firstDefined(item, ['descripcion', 'description']) ?? '').trim();
    if (!descripcion) throw new Error(`Dato fiscal inválido: ${label} sin descripción`);
    const cantidad = finiteFiscalNumber(firstDefined(item, ['cantidad', 'quantity']), `${label}.cantidad`, { positive: true });
    const rawUnitPrice = firstDefined(item, ['precioUnitario', 'precio_unitario', 'valorUnitario', 'valor_unitario']);
    const rawLineValue = firstDefined(item, ['valorVenta', 'valor_venta', 'subtotal']);
    if (rawUnitPrice === undefined && rawLineValue === undefined) {
      throw new Error(`Dato fiscal inválido: ${label} sin precio ni valor de venta`);
    }
    const valorVenta = rawLineValue === undefined
      ? finiteFiscalNumber(rawUnitPrice, `${label}.precioUnitario`, { min: 0 }) * cantidad
      : finiteFiscalNumber(rawLineValue, `${label}.valorVenta`, { min: 0 });
    const precioUnitario = rawUnitPrice === undefined
      ? valorVenta / cantidad
      : finiteFiscalNumber(rawUnitPrice, `${label}.precioUnitario`, { min: 0 });
    const rawTax = firstDefined(item, ['igv', 'impuestoIgv', 'impuesto_igv', 'totalImpuestos', 'total_impuestos']);
    const rawLineTotal = firstDefined(item, ['precioVenta', 'precio_venta', 'totalItem', 'total_item', 'total']);
    if (rawTax === undefined && rawLineTotal === undefined) {
      throw new Error(`Dato fiscal inválido: ${label} sin impuesto ni total de línea`);
    }
    const igv = rawTax === undefined
      ? finiteFiscalNumber(rawLineTotal, `${label}.total`, { min: 0 }) - valorVenta
      : finiteFiscalNumber(rawTax, `${label}.impuesto`, { min: 0 });
    if (igv < -0.000001) throw new Error(`Dato fiscal inválido: ${label}.impuesto no puede ser negativo`);
    const rawRate = firstDefined(item, ['tasaIgv', 'tasa_igv', 'tasaImpuesto', 'tasa_impuesto']);
    const tasaIgv = rawRate === undefined
      ? (valorVenta > 0 ? igv / valorVenta : defaultRate)
      : normalizeFiscalRate(rawRate, `${label}.tasaIgv`);
    if (!Number.isFinite(tasaIgv) || tasaIgv < 0 || tasaIgv > 1) {
      throw new Error(`Dato fiscal inválido: ${label}.tasaIgv debe ser finita`);
    }
    if (rawLineTotal !== undefined) {
      const lineTotal = finiteFiscalNumber(rawLineTotal, `${label}.total`, { min: 0 });
      if (Math.abs(lineTotal - (valorVenta + igv)) > 0.02) {
        throw new Error(`Dato fiscal inválido: ${label} no cuadra valor de venta + impuesto`);
      }
    }
    return {
      descripcion,
      cantidad,
      unidadMedida: String(firstDefined(item, ['unidadMedida', 'unidad_medida', 'unidad']) ?? 'NIU').trim().toUpperCase(),
      precioUnitario,
      valorVenta,
      igv,
      tasaIgv,
      codigoProducto: String(firstDefined(item, ['codigoProducto', 'codigo_producto', 'codigo']) ?? `ITEM-${index + 1}`).trim(),
      dianTaxCategory: normalizeDianTaxCategory(firstDefined(item, [
        'dianTaxCategory', 'dian_tax_category', 'afectacionIgv', 'afectacion_igv',
        'tipoAfectacionIgv', 'tipo_afectacion_igv',
      ])),
    };
  });
}

export function normalizePersistedFiscalTotals(cpe: Record<string, any>) {
  const baseParts = ['total_gravadas', 'total_exoneradas', 'total_inafectas', 'total_exportacion']
    .map((field) => cpe[field] === undefined || cpe[field] === null || cpe[field] === ''
      ? 0
      : finiteFiscalNumber(cpe[field], field, { min: 0 }));
  const explicitSubtotal = firstDefined(cpe, ['subtotal']);
  const subtotal = explicitSubtotal === undefined
    ? baseParts.reduce((sum, value) => sum + value, 0)
    : finiteFiscalNumber(explicitSubtotal, 'subtotal', { min: 0 });
  const totalImpuestos = finiteFiscalNumber(
    firstDefined(cpe, ['total_igv', 'igv', 'totalImpuestos', 'total_impuestos']),
    'total de impuestos', { min: 0 },
  );
  const importeTotal = finiteFiscalNumber(
    firstDefined(cpe, ['total_venta', 'total', 'importeTotal']),
    'importe total', { positive: true },
  );
  if (Math.abs(subtotal + totalImpuestos - importeTotal) > 0.02) {
    throw new Error('Dato fiscal inválido: subtotal + impuestos no coincide con el importe total');
  }
  return { subtotal, totalImpuestos, importeTotal };
}

/** Firma, consulta, representa y entrega CPE al proveedor fiscal. */
export class CpeDeliveryService {
  private readonly logger = new Logger(CpeDeliveryService.name);
  private readonly sunatStatuses = {
    NOT_SENT: 'NOT_SENT', READY: 'READY', SENDING: 'SENDING', ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED', ERROR: 'ERROR',
  } as const;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly fiscalAdapter: FiscalAdapterService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly certificateService: CpeCertificateService,
  ) {}

  private readonly defaultDeliveryOptions = {
    origin: 'USER' as const,
  };

  private getXmlSigner(tenantId: string) {
    return this.certificateService.getXmlSigner(tenantId);
  }

async getEmpresaEmisorInfo(tenantId: string) {
    const { data } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select([
        'ruc',
        'razon_social',
        'direccion_fiscal',
        'ubigeo',
        'departamento',
        'provincia',
        'dian_regimen_fiscal',
        'dian_tipo_contribuyente',
        'is_demo',
        'arca_condicion_iva',
        'arca_punto_venta',
      ].join(','))
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const typedData = data as any;
    return {
      ruc: typedData?.ruc ?? '',
      razonSocial: typedData?.razon_social ?? '',
      direccion: typedData?.direccion_fiscal ?? '',
      ciudad: typedData?.provincia ?? '',
      departamento: typedData?.departamento ?? '',
      codigoUbigeo: typedData?.ubigeo ?? '',
      codigoDepartamento: /^\d{5}$/.test(String(typedData?.ubigeo ?? ''))
        ? String(typedData.ubigeo).slice(0, 2)
        : '',
      regimenFiscal: typedData?.dian_regimen_fiscal ?? '',
      tipoContribuyente: typedData?.dian_tipo_contribuyente ?? '',
      condicionIva: typedData?.arca_condicion_iva ?? '',
      puntoVenta: typedData?.arca_punto_venta ?? null,
      isDemo: typedData?.is_demo === true,
    };
  }

async findOne(id: string, tenantId: string): Promise<FacturaDto> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('cpe')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) {
        throw new NotFoundException('CPE not found');
      }

      return this.mapToDto(data);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Error fetching CPE');
    }
  }

async getCpeById(id: string, tenantId: string): Promise<any> {
    try {
      this.logger.debug(`Obteniendo representación del CPE ${id}`);
      
      const { data: cpeData, error } = await this.supabaseService.getClient()
        .from('cpe')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !cpeData) {
        throw new Error('CPE no encontrado');
      }

      // La vista previa HTML necesita los mismos datos visibles que el PDF.
      // Se resuelven siempre por tenant para no mezclar emisores.
      const { data: empresaConfig } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select([
          'logo_url', 'ruc', 'razon_social', 'direccion_fiscal', 'telefono', 'email', 'is_demo',
          'arca_condicion_iva',
          'dian_resolucion_numero', 'dian_resolucion_prefijo',
          'dian_resolucion_desde', 'dian_resolucion_hasta',
          'dian_resolucion_fecha_inicio', 'dian_resolucion_fecha_fin',
          'dian_software_id', 'dian_tipo_contribuyente', 'dian_regimen_fiscal',
        ].join(','))
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const typedEmpresaConfig = empresaConfig as any;
      const typedCpeData = cpeData as any;
      const currentCountryCode = (await perfilPaisDelTenant(
        this.supabaseService.getClient(),
        tenantId,
      )).codigo;
      const countryCode = resolveHistoricalCpeCountry(typedCpeData, currentCountryCode);
      const isSimulatedOrigin = typedCpeData.simulated_origin !== false;
      let fiscalQrContent: string | null = null;
      let fiscalQrDataUrl: string | null = null;
      let fiscalPrintInfo: Record<string, unknown> | null = null;
      let fiscalDocumentType: string | null = null;

      if (countryCode === 'PE') {
        // En una representación peruana el QR es obligatorio. No se devuelve
        // una vista aparentemente válida si sus datos críticos no permiten
        // construirlo.
        fiscalQrContent = buildSunatQrContent(typedCpeData);
        fiscalQrDataUrl = await buildSunatQrDataUrl(typedCpeData);
      } else if (countryCode === 'CO') {
        const dianEvidence = resolveAcceptedDianEvidence(typedCpeData);
        fiscalPrintInfo = resolveDianPrintedFiscalInfo(
          typedCpeData,
          typedEmpresaConfig || {},
          isSimulatedOrigin || !dianEvidence,
        ) as unknown as Record<string, unknown>;
        const dianQr = await buildDianQrRepresentation(typedCpeData);
        fiscalQrContent = dianQr?.content ?? null;
        fiscalQrDataUrl = dianQr?.dataUrl ?? null;
      } else if (countryCode === 'AR') {
        const arcaInfo = resolveArcaPrintedFiscalInfo(
          typedCpeData,
          typedEmpresaConfig || {},
          isSimulatedOrigin,
        );
        fiscalPrintInfo = arcaInfo as unknown as Record<string, unknown>;
        fiscalDocumentType = arcaInfo.documentType;
        const arcaQr = await buildArcaQrRepresentation({
          ...typedCpeData,
          tipo_documento_fiscal: arcaInfo.documentType,
        }, {
          allowMissingAuthorization: isSimulatedOrigin,
        });
        fiscalQrContent = arcaQr?.content ?? null;
        fiscalQrDataUrl = arcaQr?.dataUrl ?? null;
      }

      this.logger.debug(`Representación del CPE ${id} preparada (${countryCode})`);
      return {
        ...cpeData,
        simulated: typedCpeData.simulated_origin !== false
          || (countryCode === 'CO' && !resolveAcceptedDianEvidence(typedCpeData)),
        simulated_origin: typedCpeData.simulated_origin !== false,
        fiscal_acceptance_status: String(
          typedCpeData.fiscal_authority_evidence?.status || 'LEGACY_UNVERIFIED',
        ).toUpperCase(),
        pais_codigo: countryCode,
        tipo_documento_fiscal: fiscalDocumentType,
        fiscal_print_info: fiscalPrintInfo,
        logo_url: typedEmpresaConfig?.logo_url || null,
        emisor: {
          ruc: typedCpeData.issuer_snapshot?.tax_id || typedCpeData.ruc_emisor || typedEmpresaConfig?.ruc || null,
          razon_social: typedCpeData.issuer_snapshot?.legal_name || typedCpeData.razon_social_emisor || typedEmpresaConfig?.razon_social || null,
          direccion_fiscal: typedCpeData.issuer_snapshot?.address || typedEmpresaConfig?.direccion_fiscal || null,
          telefono: typedEmpresaConfig?.telefono || null,
          email: typedEmpresaConfig?.email || null,
          logo_url: typedEmpresaConfig?.logo_url || null,
        },
        fiscal_qr_content: fiscalQrContent,
        fiscal_qr_data_url: fiscalQrDataUrl,
        // Alias transitorios para consumidores PE existentes. Nunca se
        // publican como si fueran un QR SUNAT para otro país.
        sunat_qr_content: countryCode === 'PE' ? fiscalQrContent : null,
        sunat_qr_data_url: countryCode === 'PE' ? fiscalQrDataUrl : null,
        valor_resumen: typedCpeData.valor_resumen || typedCpeData.hash_firma || typedCpeData.hash || null,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`No se pudo preparar la representación del CPE ${id}: ${detail}`);
      throw new Error(`Error obteniendo CPE: ${detail}`);
    }
  }

async generatePdf(id: string, tenantId: string): Promise<Buffer> {
    try {
      this.logger.log(`Generando representación PDF A4 para CPE: ${id}`);
      
      // Representación A4 compatible con los requisitos fiscales aplicables.
      // A4 es una opción de salida del ERP, no un tamaño único impuesto por SUNAT.
      const pdfBuffer = await this.pdfGenerator.generateSunatCompliantPdf(id, tenantId);
      
      this.logger.log(`✅ PDF generado exitosamente para CPE: ${id}`);
      return pdfBuffer;
      
    } catch (error) {
      this.logger.error(`❌ Error generando PDF para CPE ${id}:`, error);
      throw new Error(`Error generando PDF: ${error.message}`);
    }
  }

async getSignedXml(id: string, tenantId: string): Promise<string> {
    const cpe = await this.findOne(id, tenantId);
    
    if (!cpe.xml_firmado) {
      throw new BadRequestException('XML not available for this CPE');
    }

    return cpe.xml_firmado;
  }

async resendToOse(
    id: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    return this.sendToOse(id, tenantId, options);
  }

async sendToOseManual(
    id: string,
    _xmlFirmado: string,
    _fileName: string,
    options: {
      tenantId: string;
      idempotencyKey?: string;
      actorId?: string;
      origin?: 'USER' | 'WORKER' | 'SYSTEM';
    },
  ) {
    return this.sendToOse(id, options.tenantId, options);
  }

async checkOseStatus(
    id: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    await assertExternalFiscalTransportAllowed(this.supabaseService, tenantId);
    const origin = options?.origin ?? this.defaultDeliveryOptions.origin;
    const idempotencyKey = String(options?.idempotencyKey ?? '').trim()
      || `cpe.query:${tenantId}:${id}:${Math.floor(Date.now() / 300_000)}`;
    const currentCountryCode = (await this.fiscalAdapter.obtenerCodigoPais(tenantId)).toUpperCase();
    const dianRecovery = currentCountryCode === 'CO'
      ? await this.findDianRecoveryCandidate(id, tenantId)
      : null;
    const reserveRpc = dianRecovery
      ? 'reservar_recuperacion_dian_tx'
      : 'reservar_consulta_cpe_tx';
    const finalizeRpc = dianRecovery
      ? 'finalizar_recuperacion_dian_tx'
      : 'finalizar_consulta_cpe_tx';
    const claim = await this.reserveOperation(reserveRpc, {
      p_tenant_id: tenantId,
      p_actor_id: options?.actorId ?? null,
      p_cpe_id: id,
      p_idempotency_key: idempotencyKey,
      p_origin: origin,
    });
    if (!claim.claimed) {
      return this.deliveryResult(claim);
    }

    const cpe = claim.cpe;
    try {
      const countryCode = resolveHistoricalCpeCountry(cpe, currentCountryCode);
      if (countryCode !== currentCountryCode) {
        throw new Error(
          `El CPE pertenece fiscalmente a ${countryCode}, pero el tenant está configurado en ${currentCountryCode}`,
        );
      }
      const cpeMetadata = cpe.metadata && typeof cpe.metadata === 'object' ? cpe.metadata : {};
      const dianEvidence = countryCode === 'CO' ? resolveAcceptedDianEvidence(cpe) : null;
      const dianUniqueCode = countryCode === 'CO'
        ? String(
            dianEvidence?.uniqueCode
            ?? claim.dian_unique_code
            ?? claim.operation?.request_summary?.dian_unique_code
            ?? '',
          ).trim()
        : '';
      const dianQueryKind = countryCode === 'CO'
        ? String(
            dianRecovery
              ? claim.dian_query_kind ?? claim.operation?.request_summary?.dian_query_kind
              : 'CUFE_CUDE',
          ).trim().toUpperCase()
        : '';
      const dianQueryKey = countryCode === 'CO'
        ? String(
            dianRecovery
              ? claim.dian_query_key ?? claim.operation?.request_summary?.dian_query_key
              : dianUniqueCode,
          ).trim()
        : '';
      if (countryCode === 'CO') {
        if (!['CUFE_CUDE', 'ZIP_TRACK_ID'].includes(dianQueryKind)) {
          throw new Error('La recuperación DIAN no declara el tipo de clave de consulta');
        }
        const validQueryKey = dianQueryKind === 'CUFE_CUDE'
          ? /^[0-9a-f]{96}$/i.test(dianQueryKey)
          : this.isDianZipTrackId(dianQueryKey);
        if (!validQueryKey) {
          throw new Error(`La clave DIAN ${dianQueryKind} persistida no es válida`);
        }
      }
      const queryDocumentType = countryCode === 'AR'
        ? String(cpeMetadata.arca_cbte_tipo ?? cpe.tipo_documento).padStart(3, '0')
        : cpe.tipo_documento;
      const response = await this.fiscalAdapter.consultarEstado(
        tenantId,
        queryDocumentType,
        cpe.serie,
        String(cpe.numero),
        countryCode === 'CO' ? dianQueryKey : cpe.hash,
        countryCode,
        countryCode === 'CO'
          ? dianQueryKind as 'CUFE_CUDE' | 'ZIP_TRACK_ID'
          : undefined,
      );
      const explicitNotFound = countryCode === 'CO' && this.isDianExplicitNotFound(response);
      const resultKind = countryCode === 'CO'
        ? this.classifyDianResult(response, dianUniqueCode, explicitNotFound)
        : response.success
          ? (countryCode === 'AR'
            ? (/^\d{14}$/.test(String(response.hash ?? response.metadata?.cae ?? '').trim())
              ? 'ACCEPTED'
              : 'TECHNICAL_ERROR')
            : (String(response.cdr ?? '').trim() ? 'ACCEPTED' : 'PENDING'))
          : (this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta)
            ? 'TECHNICAL_ERROR'
            : 'REJECTED');
      const finalized = await this.finalizeOperation(
        finalizeRpc, claim, resultKind, response, countryCode,
      );
      if (resultKind === 'REJECTED') {
        const authority = countryCode === 'CO'
          ? 'DIAN'
          : countryCode === 'AR'
            ? 'ARCA'
            : 'SUNAT/OSE';
        throw new BadRequestException(
          `${authority} rechazó la consulta: ${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
        );
      }
      if (resultKind === 'TECHNICAL_ERROR') {
        throw new ServiceUnavailableException(response.descripcionRespuesta || 'Consulta fiscal temporalmente no disponible');
      }
      return this.deliveryResult(finalized);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      await this.finalizeTechnicalException(finalizeRpc, claim, error, currentCountryCode);
      throw new ServiceUnavailableException(`No se pudo consultar SUNAT/OSE: ${this.errorMessage(error)}`);
    }
  }

async retrySendToOse(
    cpeId: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    const currentCountryCode = (await this.fiscalAdapter.obtenerCodigoPais(tenantId)).toUpperCase();
    const recovery = currentCountryCode === 'CO'
      ? await this.findDianRecoveryCandidate(cpeId, tenantId)
      : null;
    if (!recovery) return this.sendToOse(cpeId, tenantId, options);

    const recoveryResult = await this.checkOseStatus(cpeId, tenantId, {
      ...options,
      idempotencyKey: `dian.recovery:${recovery.id}`,
    });
    if (recoveryResult.resultKind !== 'NOT_FOUND') return recoveryResult;
    return this.sendToOse(cpeId, tenantId, options);
  }

  async sendToOse(
    cpeId: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    await assertExternalFiscalTransportAllowed(this.supabaseService, tenantId);
    const origin = options?.origin ?? this.defaultDeliveryOptions.origin;
    const idempotencyKey = String(options?.idempotencyKey ?? '').trim()
      || `cpe.send:${tenantId}:${cpeId}`;
    const claim = await this.reserveOperation('reservar_envio_cpe_tx', {
      p_tenant_id: tenantId,
      p_actor_id: options?.actorId ?? null,
      p_cpe_id: cpeId,
      p_idempotency_key: idempotencyKey,
      p_origin: origin,
    });
    if (!claim.claimed) {
      return this.deliveryResult(claim);
    }

    const cpeData = claim.cpe;
    let deliveryCountryCode: string | undefined;
    try {
      if (cpeData.simulated_origin !== false) {
        throw new Error(
          'El CPE nació como demo o es legacy sin procedencia verificable; no puede enviarse a una autoridad fiscal',
        );
      }
      const currentCountryCode = (await this.fiscalAdapter.obtenerCodigoPais(tenantId)).toUpperCase();
      deliveryCountryCode = currentCountryCode;
      const paisCodigo = resolveHistoricalCpeCountry(cpeData, currentCountryCode);
      if (paisCodigo !== currentCountryCode) {
        throw new Error(
          `El CPE pertenece fiscalmente a ${paisCodigo}, pero el tenant está configurado en ${currentCountryCode}`,
        );
      }
      const servicioFiscal = await this.fiscalAdapter.obtenerNombreServicioFiscal(tenantId);
      this.logger.log(`Enviando CPE ${cpeId} a ${servicioFiscal} (claim ${claim.operation.id})`);
      const fiscalConfig = await this.fiscalAdapter.obtenerConfiguracionFiscal(tenantId);
      const emisorInfo = await this.getEmpresaEmisorInfo(tenantId);
      const metadata = cpeData.metadata && typeof cpeData.metadata === 'object'
        ? cpeData.metadata as Record<string, any>
        : {};
      let arcaReceiverVatCondition = String(
        metadata.arca_condicion_iva_receptor
        ?? cpeData.arca_condicion_iva_receptor
        ?? '',
      ).trim();
      if (paisCodigo === 'AR' && !arcaReceiverVatCondition && cpeData.cliente_id) {
        const { data: fiscalCustomer, error: fiscalCustomerError } = await this.supabaseService
          .getClient()
          .from('clientes')
          .select('arca_condicion_iva')
          .eq('tenant_id', tenantId)
          .eq('id', cpeData.cliente_id)
          .maybeSingle();
        if (fiscalCustomerError) {
          throw new Error(`No se pudo leer la condición IVA del receptor: ${fiscalCustomerError.message}`);
        }
        arcaReceiverVatCondition = String((fiscalCustomer as any)?.arca_condicion_iva ?? '').trim();
      }
      if (paisCodigo === 'AR') {
        const persistedPoint = Number(String(cpeData.serie ?? '').replace(/\D/g, ''));
        const configuredPoint = Number(emisorInfo.puntoVenta);
        if (!Number.isInteger(configuredPoint) || configuredPoint < 1 || configuredPoint > 99998) {
          throw new Error('Punto de venta ARCA inválido o no configurado');
        }
        if (persistedPoint !== configuredPoint) {
          throw new Error(
            `Evidencia ARCA inconsistente: la serie ${cpeData.serie} no coincide con el punto de venta ${configuredPoint}`,
          );
        }
      }
      const emisorTipoDocumento = paisCodigo === 'CO' ? '31' : paisCodigo === 'AR' ? '80' : '6';
      const receptorTipoDocumento =
        cpeData.tipo_documento_receptor ||
        cpeData.tipo_documento_cliente ||
        (paisCodigo === 'CO' ? '' : paisCodigo === 'AR' ? '99' : '6');
      const emisorNumeroDocumento = this.pickFirstNonEmpty(
        [cpeData.ruc_emisor, emisorInfo.ruc],
        paisCodigo === 'CO' ? '' : '20000000000',
      );
      const emisorRazonSocial = this.pickFirstNonEmpty(
        [cpeData.razon_social_emisor, emisorInfo.razonSocial],
        'Emisor',
      );
      const emisorDireccion = this.pickFirstNonEmpty(
        [cpeData.direccion_emisor, emisorInfo.direccion],
        '',
      );
      const totals = normalizePersistedFiscalTotals(cpeData);
      const taxRate = normalizeFiscalRate(fiscalConfig?.tasaImpuesto ?? 0);
      const items = normalizePersistedFiscalItems(cpeData.items, taxRate);
      const itemBase = items.reduce((sum, item) => sum + item.valorVenta, 0);
      const itemTaxes = items.reduce((sum, item) => sum + Number(item.igv ?? 0), 0);
      if (Math.abs(itemBase - totals.subtotal) > 0.02) {
        throw new Error('Dato fiscal inválido: la base de los ítems no coincide con el subtotal');
      }
      if (Math.abs(itemTaxes - totals.totalImpuestos) > 0.02) {
        throw new Error('Dato fiscal inválido: los impuestos de los ítems no coinciden con la cabecera');
      }
      const authorizedArcaReference = paisCodigo === 'AR'
        ? await this.resolveAuthorizedArcaReference(cpeData, tenantId)
        : undefined;
      const authorizedDianReference = paisCodigo === 'CO'
        ? await this.resolveAuthorizedDianReference(cpeData, tenantId)
        : undefined;
      const dianDiscrepancy = paisCodigo === 'CO'
        ? this.resolveDianDiscrepancy(cpeData)
        : undefined;
      const dianReceiverTaxProfile = paisCodigo === 'CO'
        ? this.resolveDianReceiverTaxProfile(cpeData)
        : undefined;
      const documento: DocumentoElectronico = {
        id: cpeData.id,
        tipoDocumento: cpeData.tipo_documento,
        serie: cpeData.serie,
        numero: cpeData.numero?.toString() || '',
        fechaEmision: cpeData.fecha_emision,
        fechaVencimiento: cpeData.fecha_vencimiento,
        emisor: {
          tipoDocumento: emisorTipoDocumento,
          numeroDocumento: emisorNumeroDocumento,
          razonSocial: emisorRazonSocial,
          direccion: paisCodigo === 'CO'
            ? String(metadata.dian_direccion_emisor ?? emisorDireccion).trim()
            : emisorDireccion,
          ciudad: paisCodigo === 'CO'
            ? String(metadata.dian_municipio_emisor ?? emisorInfo.ciudad ?? '').trim()
            : emisorInfo.ciudad || '',
          departamento: paisCodigo === 'CO'
            ? String(metadata.dian_departamento_emisor ?? emisorInfo.departamento ?? '').trim()
            : emisorInfo.departamento || '',
          codigoUbigeo: paisCodigo === 'CO'
            ? String(metadata.dian_codigo_dane_emisor ?? emisorInfo.codigoUbigeo ?? '').trim()
            : emisorInfo.codigoUbigeo || '',
          codigoDepartamento: paisCodigo === 'CO'
            ? String(
                metadata.dian_codigo_departamento_emisor
                ?? emisorInfo.codigoDepartamento
                ?? '',
              ).trim()
            : emisorInfo.codigoDepartamento || '',
          regimenFiscal: paisCodigo === 'CO'
            ? String(metadata.dian_regimen_fiscal ?? emisorInfo.regimenFiscal ?? '').trim()
            : emisorInfo.regimenFiscal || '',
          tipoContribuyente: paisCodigo === 'CO'
            ? String(metadata.dian_tipo_contribuyente ?? emisorInfo.tipoContribuyente ?? '').trim()
            : emisorInfo.tipoContribuyente || '',
          condicionIva: paisCodigo === 'AR'
            ? String(metadata.arca_condicion_iva_emisor ?? emisorInfo.condicionIva ?? '').trim()
            : undefined,
        },
        receptor: {
          tipoDocumento: receptorTipoDocumento,
          numeroDocumento: cpeData.documento_receptor || cpeData.numero_documento_cliente || '',
          razonSocial: cpeData.razon_social_receptor || cpeData.razon_social_cliente || 'Cliente',
          direccion: cpeData.direccion_receptor || cpeData.direccion_cliente || '',
          condicionIva: paisCodigo === 'AR'
            ? arcaReceiverVatCondition
            : undefined,
          dianTaxProfile: dianReceiverTaxProfile,
        },
        moneda: cpeData.moneda || 'PEN',
        subtotal: totals.subtotal,
        totalGravadas: Number(cpeData.total_gravadas ?? totals.subtotal),
        totalExoneradas: Number(cpeData.total_exoneradas ?? 0),
        totalInafectas: Number(cpeData.total_inafectas ?? 0),
        totalImpuestos: totals.totalImpuestos,
        importeTotal: totals.importeTotal,
        tasaImpuesto: taxRate,
        formaPago: String(
          metadata.dian_forma_pago
          ?? cpeData.forma_pago
          ?? cpeData.condicion_pago
          ?? '',
        ).trim() || undefined,
        plazoPagoDias: cpeData.plazo_pago_dias == null
          ? undefined
          : finiteFiscalNumber(cpeData.plazo_pago_dias, 'plazo de pago', { min: 0 }),
        medioPago: String(
          metadata.dian_medio_pago
          ?? cpeData.medio_pago
          ?? cpeData.metodo_pago
          ?? '',
        ).trim() || undefined,
        fiscalContext: paisCodigo === 'CO'
          ? {
              isDemo: metadata.dian_is_demo === true && emisorInfo.isDemo === true,
              simulated: metadata.dian_simulado === true,
              fixtureSource: String(metadata.dian_fixture_source ?? '').trim() || undefined,
              deliveryOperation: {
                tenantId,
                operationId: String(claim.operation.id),
                claimToken: String(claim.operation.claim_token),
              },
            }
          : undefined,
        arcaAuthorizationVariant: paisCodigo === 'AR'
          ? String(metadata.arca_modalidad_autorizacion ?? 'NORMAL').trim().toUpperCase() as DocumentoElectronico['arcaAuthorizationVariant']
          : undefined,
        items,
        documentoReferencia: authorizedArcaReference ?? authorizedDianReference
          ?? (!['AR', 'CO'].includes(paisCodigo) && cpeData.documento_referencia_numero
          ? {
              tipo: String(cpeData.documento_referencia_tipo ?? '').trim(),
              serie: String(cpeData.documento_referencia_serie ?? '').trim(),
              numero: String(cpeData.documento_referencia_numero).trim(),
              fecha: cpeData.fecha_documento_referencia ?? cpeData.fecha_emision,
          }
          : undefined),
        dianDiscrepancy,
        xmlContent: cpeData.xml_firmado,
      };

      const response = await this.fiscalAdapter.enviarDocumento(documento, tenantId, paisCodigo);
      const expectedDianCode = paisCodigo === 'CO'
        ? await this.loadSealedDianCode(claim)
        : '';
      const resultKind = paisCodigo === 'CO'
        ? this.classifyDianResult(response, expectedDianCode, false)
        : response.success
          ? (paisCodigo === 'AR'
            ? (/^\d{14}$/.test(String(response.hash ?? response.metadata?.cae ?? '').trim())
              ? 'ACCEPTED'
              : 'TECHNICAL_ERROR')
            : (String(response.cdr ?? '').trim() ? 'ACCEPTED' : 'PENDING'))
          : (this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta)
            ? 'TECHNICAL_ERROR'
            : 'REJECTED');
      const finalized = await this.finalizeOperation(
        'finalizar_envio_cpe_tx', claim, resultKind, response, paisCodigo,
      );
      if (resultKind === 'REJECTED') {
        throw new BadRequestException(
          `${servicioFiscal} rechazó el comprobante: ${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
        );
      }
      if (resultKind === 'TECHNICAL_ERROR') {
        throw new ServiceUnavailableException(response.descripcionRespuesta || `${servicioFiscal} no está disponible`);
      }
      return this.deliveryResult(finalized);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      await this.finalizeTechnicalException(
        'finalizar_envio_cpe_tx', claim, error, deliveryCountryCode,
      );
      throw new ServiceUnavailableException(`No se pudo enviar a SUNAT/OSE: ${this.errorMessage(error)}`);
    }
  }

  private async resolveAuthorizedArcaReference(
    cpeData: Record<string, any>,
    tenantId: string,
  ): Promise<DocumentoElectronico['documentoReferencia'] | undefined> {
    const rawReference = [
      cpeData.documento_referencia_tipo,
      cpeData.documento_referencia_serie,
      cpeData.documento_referencia_numero,
    ].map((value) => String(value ?? '').trim());
    if (rawReference.every((value) => !value)) return undefined;
    if (rawReference.some((value) => !value)) {
      throw new Error('Nota ARCA con referencia fiscal incompleta');
    }
    const [referenceType, referenceSeries, referenceNumber] = rawReference;
    if (!/^\d{1,8}$/.test(referenceNumber) || Number(referenceNumber) < 1) {
      throw new Error('Nota ARCA con número de referencia inválido');
    }
    const { data, error } = await this.supabaseService.getClient()
      .from('cpe')
      .select('id,tipo_documento,serie,numero,fecha_emision,hash,metadata')
      .eq('tenant_id', tenantId)
      .eq('tipo_documento', referenceType)
      .eq('serie', referenceSeries)
      .eq('numero', String(Number(referenceNumber)))
      .maybeSingle();
    if (error) {
      throw new Error(`No se pudo resolver el comprobante ARCA asociado: ${error.message}`);
    }
    if (!data) {
      throw new Error('No existe el comprobante ARCA asociado dentro del tenant');
    }
    const original = data as any;
    const authorization = resolveArcaPrintedFiscalInfo(original, {}, false);
    if (!/^\d{14}$/.test(authorization.authorizationCode)) {
      throw new Error('El comprobante ARCA asociado no tiene CAE autorizado');
    }
    return {
      tipo: authorization.documentType,
      serie: String(authorization.pointOfSale).padStart(5, '0'),
      numero: String(authorization.documentNumber),
      fecha: original.fecha_emision,
    };
  }

  private async resolveAuthorizedDianReference(
    cpeData: Record<string, any>,
    tenantId: string,
  ): Promise<DocumentoElectronico['documentoReferencia'] | undefined> {
    const noteType = String(cpeData.tipo_documento ?? '').trim();
    if (!['91', '92'].includes(noteType)) return undefined;

    const sourceDocumentId = String(
      cpeData.documento_referencia_id
      ?? (cpeData.metadata && typeof cpeData.metadata === 'object'
        ? cpeData.metadata.source_document_id
        : '')
      ?? '',
    ).trim();
    if (!sourceDocumentId) {
      throw new Error('Nota DIAN sin vínculo inmutable al documento de origen');
    }

    const { data, error } = await this.supabaseService.getClient()
      .from('cpe')
      .select(
        'id,documento_id,tipo_documento,serie,numero,fecha_emision,simulated_origin,fiscal_authority_evidence',
      )
      .eq('tenant_id', tenantId)
      .eq('documento_id', sourceDocumentId)
      .maybeSingle();
    if (error) {
      throw new Error(`No se pudo resolver el CPE DIAN asociado: ${error.message}`);
    }
    if (!data) {
      throw new Error('No existe el CPE DIAN asociado dentro del tenant');
    }

    const source = data as Record<string, any>;
    const evidence = resolveAcceptedDianEvidence(source);
    if (!evidence) {
      throw new Error('El CPE DIAN asociado no tiene CUFE/CUDE aceptado');
    }

    const persistedReference = {
      tipo: String(cpeData.documento_referencia_tipo ?? '').trim(),
      serie: String(cpeData.documento_referencia_serie ?? '').trim(),
      numero: String(cpeData.documento_referencia_numero ?? '').trim(),
    };
    const sourceReference = {
      tipo: String(source.tipo_documento ?? '').trim(),
      serie: String(source.serie ?? '').trim(),
      numero: String(source.numero ?? '').trim(),
    };
    if (!persistedReference.tipo || !persistedReference.serie || !persistedReference.numero) {
      throw new Error('Nota DIAN con referencia fiscal incompleta');
    }
    const sameNumber = this.normalizeReferenceNumber(persistedReference.numero)
      === this.normalizeReferenceNumber(sourceReference.numero);
    if (persistedReference.tipo !== sourceReference.tipo
        || persistedReference.serie.toUpperCase() !== sourceReference.serie.toUpperCase()
        || !sameNumber) {
      throw new Error('La referencia fiscal de la nota DIAN no coincide con el CPE origen aceptado');
    }

    return {
      ...sourceReference,
      fecha: source.fecha_emision,
      uuid: evidence.uniqueCode,
      uuidSchemeName: evidence.kind === 'CUFE' ? 'CUFE-SHA384' : 'CUDE-SHA384',
    };
  }

  private resolveDianDiscrepancy(
    cpeData: Record<string, any>,
  ): DocumentoElectronico['dianDiscrepancy'] | undefined {
    const noteType = String(cpeData.tipo_documento ?? '').trim();
    if (!['91', '92'].includes(noteType)) return undefined;
    const metadata = cpeData.metadata && typeof cpeData.metadata === 'object'
      ? cpeData.metadata as Record<string, unknown>
      : {};
    const responseCode = String(
      (noteType === '91' ? cpeData.tipo_nota_credito : cpeData.tipo_nota_debito)
      ?? metadata.codigo_motivo
      ?? '',
    ).trim();
    const description = String(
      cpeData.motivo_nota
      ?? metadata.motivo_nota
      ?? metadata.motivo
      ?? '',
    ).trim();
    if (!responseCode || !description) {
      throw new Error('Nota DIAN sin código y descripción de discrepancia persistidos');
    }
    return { responseCode, description };
  }

  private resolveDianReceiverTaxProfile(
    cpeData: Record<string, any>,
  ): DianReceiverTaxProfile {
    const metadata = cpeData.metadata && typeof cpeData.metadata === 'object'
      ? cpeData.metadata as Record<string, unknown>
      : {};
    const snapshot = metadata.dian_receptor_tax_profile;
    if (snapshot && typeof snapshot === 'object') {
      return this.validateDianReceiverTaxProfile(snapshot as Record<string, unknown>);
    }
    // Nunca reconstruir este dato desde el maestro mutable al transmitir. La
    // migración 526 lo fotografía al crear el CPE; un legado sin fotografía se
    // bloquea para que editar al cliente no cambie después el XML fiscal.
    throw new Error('DIAN: el CPE no conserva el perfil tributario inmutable del receptor');
  }

  private validateDianReceiverTaxProfile(
    value: Record<string, unknown>,
  ): DianReceiverTaxProfile {
    const profile = String(value.profile ?? '').trim().toUpperCase();
    const taxLevelCode = String(value.taxLevelCode ?? '').trim().toUpperCase();
    const taxLevelListName = String(value.taxLevelListName ?? '').trim();
    const taxSchemeId = String(value.taxSchemeId ?? '').trim().toUpperCase();
    const taxSchemeName = String(value.taxSchemeName ?? '').trim();
    if (profile === 'CONSUMIDOR_FINAL'
        && taxLevelCode === 'R-99-PN'
        && taxLevelListName === '49'
        && taxSchemeId === 'ZY'
        && taxSchemeName === 'No causa') {
      return { profile, taxLevelCode, taxLevelListName, taxSchemeId, taxSchemeName };
    }
    if (profile === 'ADQUIRIENTE_NIT_B2B'
        && taxLevelCode === 'O-99'
        && taxLevelListName === '04'
        && taxSchemeId === '01'
        && taxSchemeName === 'IVA') {
      return { profile, taxLevelCode, taxLevelListName, taxSchemeId, taxSchemeName };
    }
    throw new Error('DIAN: perfil tributario del receptor ausente o inconsistente');
  }

  private normalizeReferenceNumber(value: unknown): string {
    const normalized = String(value ?? '').trim();
    return /^\d+$/.test(normalized)
      ? normalized.replace(/^0+(?=\d)/u, '')
      : normalized.toUpperCase();
  }

  private async findDianRecoveryCandidate(cpeId: string, tenantId: string): Promise<any | null> {
    const { data: cpe, error: cpeError } = await this.supabaseService.getClient()
      .from('cpe')
      .select('id,estado,sunat_status,simulated_origin,issuer_snapshot')
      .eq('id', cpeId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (cpeError) throw new Error(`No se pudo revisar recuperación DIAN: ${cpeError.message}`);
    const typedCpe = cpe as any;
    if (!typedCpe
       || typedCpe.simulated_origin !== false
       || String(typedCpe.issuer_snapshot?.country_code ?? '').toUpperCase() !== 'CO'
       || ['ACEPTADO', 'ANULADO', 'MIGRADO', 'RECHAZADO'].includes(
         String(typedCpe.estado ?? '').toUpperCase(),
       )) {
      return null;
    }

    const { data, error } = await this.supabaseService.getClient()
      .from('cpe_operaciones')
      .select('id,state,result_kind,lease_expires_at,request_summary,response_summary,created_at')
      .eq('tenant_id', tenantId)
      .eq('cpe_id', cpeId)
      .eq('action', 'SEND')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(`No se pudo revisar el envío DIAN previo: ${error.message}`);
    const now = Date.now();
    for (const operation of (data || []) as any[]) {
      const recoverableState = operation.state === 'TECHNICAL_ERROR'
        || (operation.state === 'COMPLETED' && operation.result_kind === 'PENDING')
        || (operation.state === 'CLAIMED'
          && Number.isFinite(Date.parse(operation.lease_expires_at))
          && Date.parse(operation.lease_expires_at) <= now);
      if (!recoverableState) continue;
      const summary = operation.request_summary || {};
      const sealed = String(summary.country_code ?? '').toUpperCase() === 'CO'
        && ['CUFE', 'CUDE'].includes(String(summary.dian_evidence_kind ?? '').toUpperCase())
        && /^[0-9a-f]{96}$/i.test(String(summary.dian_unique_code ?? ''));
      const responseSummary = operation.response_summary || {};
      const retryDisposition = String(responseSummary.retryDisposition ?? '').trim().toUpperCase();
      if (retryDisposition === 'RETRY_SEND'
          && responseSummary.dianSealed === false
          && responseSummary.dianIoAttempted === false) {
        continue;
      }
      const queryKind = String(responseSummary.dianQueryKind ?? '').trim().toUpperCase();
      const queryKey = String(responseSummary.dianQueryKey ?? '').trim();
      const queryable = queryKind === 'CUFE_CUDE'
        ? /^[0-9a-f]{96}$/i.test(queryKey) && queryKey.toLowerCase() === String(summary.dian_unique_code).toLowerCase()
        : queryKind === 'ZIP_TRACK_ID' && this.isDianZipTrackId(queryKey);
      if (!sealed || !queryable) {
        throw new ServiceUnavailableException(
          'El envío DIAN anterior tiene resultado incierto pero no conserva una clave de consulta tipada; se bloquea el reenvío automático.',
        );
      }
      return operation;
    }
    return null;
  }

  private isDianExplicitNotFound(response: any): boolean {
    const metadata = response?.metadata && typeof response.metadata === 'object'
      ? response.metadata as Record<string, any>
      : {};
    const status = String(
      metadata.status
      ?? metadata.estado
      ?? response?.codigoRespuesta
      ?? '',
    ).trim().toUpperCase();
    const queryKind = String(metadata.dianQueryKind ?? '').trim().toUpperCase();
    const authorityStatusCode = String(metadata.authorityStatusCode ?? '').trim();
    const expectedNotFoundCode = queryKind === 'CUFE_CUDE'
      ? '66'
      : queryKind === 'ZIP_TRACK_ID'
        ? '90'
        : '';
    return ['NOT_FOUND', 'DIAN_NOT_FOUND'].includes(status)
      && metadata.explicitNotFound === true
      && metadata.authorityResponse === true
      && metadata.technical === false
      && metadata.uncertain === false
      && authorityStatusCode === expectedNotFoundCode;
  }

  private isDianZipTrackId(value: unknown): boolean {
    const normalized = String(value ?? '').trim();
    return /^[A-Fa-f0-9]{64,128}$/u.test(normalized)
      || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(normalized);
  }

  private classifyDianResult(
    response: any,
    expectedDianCode: string,
    explicitNotFound: boolean,
  ): 'ACCEPTED' | 'PENDING' | 'TECHNICAL_ERROR' | 'REJECTED' | 'NOT_FOUND' {
    if (explicitNotFound) return 'NOT_FOUND';
    const metadata = response?.metadata && typeof response.metadata === 'object'
      ? response.metadata as Record<string, any>
      : {};
    const state = String(metadata.estado ?? metadata.status ?? '').trim().toUpperCase();
    const statusCode = String(
      metadata.authorityStatusCode ?? response?.codigoRespuesta ?? '',
    ).trim();
    const expected = String(expectedDianCode ?? '').trim().toUpperCase();
    const authorityDocumentKey = String(
      metadata.authorityDocumentKey ?? metadata.cufe ?? metadata.cude ?? '',
    ).trim().toUpperCase();
    const authorityEvidence = this.dianAuthorityResponse(response);
    const trustedEvidence = /^[0-9A-F]{96}$/u.test(expected)
      && authorityDocumentKey === expected
      && statusCode.length > 0
      && metadata.authoritySignatureTrusted === true
      && authorityEvidence?.signatureCount === 1
      && authorityEvidence.referencedDocumentKey === expected;

    if (response?.pending === true || metadata.pending === true
        || state === 'PENDIENTE' || statusCode === 'DIAN_ASYNC_SUBMITTED') {
      return 'PENDING';
    }
    if (response?.success === true && statusCode === '00'
        && authorityEvidence?.responseCode === '02'
        && trustedEvidence && String(response?.cdr ?? '').trim()) {
      return 'ACCEPTED';
    }
    if (response?.success === true) return 'TECHNICAL_ERROR';
    if (statusCode !== '00' && authorityEvidence?.responseCode === '04' && trustedEvidence
        && metadata.authorityResponse === true
        && metadata.technical !== true && metadata.uncertain !== true) {
      return 'REJECTED';
    }
    return 'TECHNICAL_ERROR';
  }

  private dianAuthorityResponse(response: any): {
    xml: string;
    rootNamespace: 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2';
    signatureCount: 1;
    referencedDocumentKey: string;
    responseCode: string;
  } | null {
    const metadata = response?.metadata && typeof response.metadata === 'object'
      ? response.metadata as Record<string, any>
      : {};
    for (const candidate of [
      metadata.applicationResponse,
      metadata.authorityResponse,
      response?.xmlResponse,
      response?.cdr,
    ]) {
      const xml = String(candidate ?? '').trim();
      if (!xml || Buffer.byteLength(xml, 'utf8') > 8 * 1024 * 1024
          || /<!DOCTYPE|<!ENTITY/iu.test(xml)) continue;
      const parseErrors: string[] = [];
      const document = new DOMParser({
        errorHandler: {
          warning: () => undefined,
          error: (message: string) => parseErrors.push(message),
          fatalError: (message: string) => parseErrors.push(message),
        },
      }).parseFromString(xml, 'application/xml');
      const root = document.documentElement;
      const applicationResponseNamespace =
        'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2' as const;
      const aggregateNamespace =
        'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
      const basicNamespace =
        'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
      const signatureNamespace = 'http://www.w3.org/2000/09/xmldsig#';
      if (parseErrors.length > 0 || !root
          || root.localName !== 'ApplicationResponse'
          || root.namespaceURI !== applicationResponseNamespace) continue;

      const directChildren = (parent: any, namespace: string, localName: string): any[] => {
        const values: any[] = [];
        for (let index = 0; index < parent.childNodes.length; index += 1) {
          const child = parent.childNodes.item(index);
          if (child?.nodeType === 1
              && child.namespaceURI === namespace
              && child.localName === localName) values.push(child);
        }
        return values;
      };
      const signatures = root.getElementsByTagNameNS(signatureNamespace, 'Signature');
      const responses = directChildren(root, aggregateNamespace, 'DocumentResponse');
      if (signatures.length !== 1 || responses.length !== 1) continue;
      const responseNodes = directChildren(responses[0], aggregateNamespace, 'Response');
      if (responseNodes.length !== 1) continue;
      const responseCodes = directChildren(responseNodes[0], basicNamespace, 'ResponseCode');
      if (responseCodes.length !== 1) continue;
      const responseCode = String(responseCodes[0].textContent ?? '').trim();
      if (!/^\d{2,3}$/u.test(responseCode)) continue;
      const references = directChildren(responses[0], aggregateNamespace, 'DocumentReference');
      if (references.length !== 1) continue;
      const uuids = directChildren(references[0], basicNamespace, 'UUID');
      if (uuids.length !== 1) continue;
      const referencedDocumentKey = String(uuids[0].textContent ?? '').trim().toUpperCase();
      if (!/^[0-9A-F]{96}$/u.test(referencedDocumentKey)) continue;
      return {
        xml,
        rootNamespace: applicationResponseNamespace,
        signatureCount: 1,
        referencedDocumentKey,
        responseCode,
      };
    }
    return null;
  }

  private async reserveOperation(rpc: string, args: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.supabaseService.getClient().rpc(rpc, args);
    if (error) {
      throw new BadRequestException(`No se pudo reservar la operación fiscal: ${error.message}`);
    }
    const claim = Array.isArray(data) ? data[0] : data;
    if (!claim?.cpe || (claim.claimed && (!claim.operation?.id || !claim.operation?.claim_token))) {
      throw new BadRequestException('La reserva fiscal devolvió una respuesta incompleta');
    }
    return claim;
  }

  private async finalizeOperation(
    rpc: string,
    claim: any,
    resultKind: 'ACCEPTED' | 'PENDING' | 'TECHNICAL_ERROR' | 'REJECTED' | 'NOT_FOUND',
    response: any,
    countryCode?: string,
  ): Promise<any> {
    let sealedDianCode = String(
      claim?.operation?.request_summary?.dian_unique_code ?? '',
    ).trim();
    const responseTrackId = String(response?.metadata?.trackId ?? '').trim();
    const persistedDianQueryKind = String(
      claim?.dian_query_kind
      ?? claim?.operation?.request_summary?.dian_query_kind
      ?? '',
    ).trim().toUpperCase();
    const persistedDianQueryKey = String(
      claim?.dian_query_key
      ?? claim?.operation?.request_summary?.dian_query_key
      ?? '',
    ).trim();
    if (countryCode === 'CO'
        && !responseTrackId
        && !persistedDianQueryKey
        && !/^[0-9a-f]{96}$/i.test(sealedDianCode)) {
      sealedDianCode = await this.loadSealedDianCode(claim);
    }
    const dianSealed = countryCode === 'CO' && /^[0-9a-f]{96}$/i.test(sealedDianCode);
    const operationWasQuery = rpc === 'finalizar_recuperacion_dian_tx'
      || rpc === 'finalizar_consulta_cpe_tx';
    const dianIoAttempted = countryCode === 'CO'
      ? response?.metadata?.dianIoAttempted === true
        || Boolean(responseTrackId)
        || operationWasQuery
      : null;
    const hasDianQueryEvidence = countryCode === 'CO'
      && dianIoAttempted === true
      && (Boolean(responseTrackId) || Boolean(persistedDianQueryKey) || dianSealed);
    const dianQueryKind = hasDianQueryEvidence
      ? (persistedDianQueryKind || (responseTrackId ? 'ZIP_TRACK_ID' : 'CUFE_CUDE'))
      : null;
    const dianQueryKey = hasDianQueryEvidence
      ? (persistedDianQueryKey || responseTrackId || sealedDianCode || null)
      : null;
    const authorityEvidence = countryCode === 'CO'
      ? this.dianAuthorityResponse(response)
      : null;
    const authorityResponse = authorityEvidence?.xml ?? '';
    const authorityDocumentKey = countryCode === 'CO'
      ? String(
          response?.metadata?.authorityDocumentKey
          ?? response?.metadata?.cufe
          ?? response?.metadata?.cude
          ?? '',
        ).trim().toUpperCase()
      : '';
    const authorityStatusCode = countryCode === 'CO'
      ? String(response?.metadata?.authorityStatusCode ?? response?.codigoRespuesta ?? '').trim()
      : '';
    const requestEvidenceKind = String(
      claim?.operation?.request_summary?.dian_evidence_kind ?? '',
    ).trim().toUpperCase();
    const responseSummary = {
      success: Boolean(response?.success),
      hasCdr: Boolean(String(response?.cdr ?? '').trim()),
      resultKind,
      countryCode: countryCode || null,
      explicitNotFound: resultKind === 'NOT_FOUND' && this.isDianExplicitNotFound(response),
      dianEvidenceKind: countryCode === 'CO'
        ? (requestEvidenceKind || null)
        : null,
      dianUniqueCode: countryCode === 'CO'
        ? (authorityDocumentKey || null)
        : null,
      authority: countryCode === 'CO' ? 'DIAN' : null,
      dianAcceptanceContractVersion: countryCode === 'CO' ? 528 : null,
      authorityStatusCode: countryCode === 'CO' ? (authorityStatusCode || null) : null,
      authoritySignatureTrusted: countryCode === 'CO'
        ? response?.metadata?.authoritySignatureTrusted === true
        : null,
      authorityDocumentKey: countryCode === 'CO' ? (authorityDocumentKey || null) : null,
      expectedDianUniqueCode: countryCode === 'CO' ? (sealedDianCode || null) : null,
      authorityResponseCount: countryCode === 'CO'
        ? (authorityEvidence ? 1 : 0)
        : null,
      authorityResponseRoot: countryCode === 'CO' && authorityEvidence
        ? 'ApplicationResponse'
        : null,
      authorityResponseRootNamespace: countryCode === 'CO'
        ? authorityEvidence?.rootNamespace ?? null
        : null,
      authorityResponseSignatureCount: countryCode === 'CO'
        ? authorityEvidence?.signatureCount ?? 0
        : null,
      authorityResponseDocumentKey: countryCode === 'CO'
        ? authorityEvidence?.referencedDocumentKey ?? null
        : null,
      authorityApplicationResponseCode: countryCode === 'CO'
        ? authorityEvidence?.responseCode ?? null
        : null,
      authorityResponse: countryCode === 'CO' ? (authorityResponse || null) : null,
      authorityResponseSha256: countryCode === 'CO' && authorityResponse
        ? createHash('sha256').update(authorityResponse, 'utf8').digest('hex')
        : null,
      cdrSha256: countryCode === 'CO' && String(response?.cdr ?? '').trim()
        ? createHash('sha256').update(String(response.cdr), 'utf8').digest('hex')
        : null,
      dianQueryKind,
      dianQueryKey,
      retryDisposition: countryCode === 'CO'
        ? (hasDianQueryEvidence ? 'QUERY_BEFORE_RESEND' : 'RETRY_SEND')
        : null,
      dianDeliveryStage: countryCode === 'CO'
        ? response?.metadata?.dianDeliveryStage ?? null
        : null,
      dianSealed: countryCode === 'CO' ? dianSealed : null,
      dianIoAttempted,
      caeVencimiento: response?.metadata?.caeVencimiento ?? null,
      puntoVenta: response?.metadata?.puntoVenta ?? null,
      tipoComprobante: response?.metadata?.tipoComprobante ?? null,
      numeroComprobante: response?.numeroComprobante ?? null,
      qrUrl: response?.metadata?.qrUrl ?? null,
      condicionIvaEmisor: response?.metadata?.condicionIvaEmisor ?? null,
      condicionIvaReceptorId: response?.metadata?.condicionIvaReceptorId ?? null,
      fechaFiscalAutorizada: response?.metadata?.fechaFiscalAutorizada ?? null,
    };
    const commonArgs = {
      p_tenant_id: claim.cpe.tenant_id,
      p_operation_id: claim.operation.id,
      p_claim_token: claim.operation.claim_token,
      p_result_kind: resultKind,
      p_response_code: String(
        (countryCode === 'CO'
          ? authorityStatusCode || response?.codigoRespuesta
          : response?.codigoRespuesta)
        ?? (resultKind === 'PENDING' ? 'PENDING' : 'UNKNOWN'),
      ),
      p_description: String(response?.descripcionRespuesta ?? resultKind),
      p_cdr: response?.cdr ?? null,
      p_response_summary: responseSummary,
    };
    const args = rpc === 'finalizar_recuperacion_dian_tx'
      ? commonArgs
      : {
          ...commonArgs,
      // En Colombia `cpe.hash` conserva su semántica de hash XML. CUFE/CUDE
      // viaja únicamente en la evidencia DIAN dedicada del contrato 525.
      p_external_hash: countryCode === 'CO' ? null : response?.hash ?? null,
      p_external_number: response?.numeroComprobante ?? null,
        };
    const { data, error } = await this.supabaseService.getClient().rpc(rpc, args);
    if (error) {
      throw new Error(`No se pudo finalizar la operación fiscal: ${error.message}`);
    }
    return Array.isArray(data) ? data[0] : data;
  }

  private async loadSealedDianCode(claim: any): Promise<string> {
    const operationId = String(claim?.operation?.id ?? '').trim();
    const tenantId = String(claim?.cpe?.tenant_id ?? '').trim();
    if (!operationId || !tenantId) return '';
    const { data, error } = await this.supabaseService.getClient()
      .from('cpe_operaciones')
      .select('request_summary')
      .eq('id', operationId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new Error(`No se pudo recuperar el CUFE/CUDE sellado: ${error.message}`);
    const code = String((data as any)?.request_summary?.dian_unique_code ?? '').trim();
    return /^[0-9a-f]{96}$/i.test(code) ? code : '';
  }

  private async finalizeTechnicalException(
    rpc: string,
    claim: any,
    error: unknown,
    countryCode?: string,
  ): Promise<void> {
    await this.finalizeOperation(rpc, claim, 'TECHNICAL_ERROR', {
      success: false,
      codigoRespuesta: 'EXTERNAL_EXCEPTION',
      descripcionRespuesta: this.errorMessage(error),
      metadata: countryCode === 'CO'
        ? {
            dianDeliveryStage: 'PREFLIGHT',
            dianSealed: false,
            dianIoAttempted: false,
          }
        : undefined,
    }, countryCode);
  }

  private deliveryResult(payload: any) {
    const operation = payload?.operation ?? null;
    const cpe = payload?.cpe ?? null;
    return {
      success: true,
      claimed: Boolean(payload?.claimed),
      idempotent: Boolean(payload?.idempotent),
      reason: payload?.reason ?? null,
      operationId: operation?.id ?? null,
      resultKind: operation?.result_kind ?? null,
      cpe,
      estado: cpe?.estado ?? null,
      codigoSunat: operation?.response_code ?? null,
      descripcionSunat: operation?.error_message ?? null,
      timestamp: new Date(),
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'Error fiscal desconocido');
  }

private isTechnicalError(codigoRespuesta: string, descripcionRespuesta: string): boolean {
    // Códigos de error técnicos de SUNAT que se pueden reintentar
    const technicalErrorCodes = ['99', '98', '97', 'ARCA_INVALID_EVIDENCE']; // Errores técnicos genéricos
    const normalizedCode = String(codigoRespuesta ?? '').trim().toUpperCase();
    
    // Si el código indica error técnico
    if (technicalErrorCodes.includes(normalizedCode)
        || normalizedCode.startsWith('DIAN_TRANSPORT_')
        || normalizedCode.startsWith('DIAN_WS_SECURITY_')
        || normalizedCode.startsWith('DIAN_TIMEOUT_')
        || normalizedCode.startsWith('HTTP_')
        || normalizedCode === 'DIAN_RESPONSE_INCOMPLETE') {
      return true;
    }

    // Si el mensaje indica error técnico de red/conexión
    const errorMessage = descripcionRespuesta?.toLowerCase() || '';
    const technicalKeywords = [
      'timeout',
      'connection',
      'network',
      'técnico',
      'servicio no disponible',
      'temporalmente',
      'unavailable',
    ];

    return technicalKeywords.some(keyword => errorMessage.includes(keyword));
  }

mapToDto(cpeData: any): FacturaDto {
    const dto: FacturaDto & { documento_id?: string | null; documentoId?: string | null } = {
      id: cpeData.id,
      documento_id: cpeData.documento_id ?? null,
      documentoId: cpeData.documento_id ?? null,
      tipo_documento: cpeData.tipo_documento,
      serie: cpeData.serie,
      numero: cpeData.numero,
      ruc_emisor: cpeData.ruc_emisor,
      razon_social_emisor: cpeData.razon_social_emisor,
      tipo_documento_receptor: cpeData.tipo_documento_receptor,
      documento_receptor: cpeData.documento_receptor,
      razon_social_receptor: cpeData.razon_social_receptor,
      direccion_receptor: cpeData.direccion_receptor,
      moneda: cpeData.moneda,
      items: cpeData.items,
      total_gravadas: parseFloat(cpeData.total_gravadas),
      total_igv: parseFloat(cpeData.total_igv),
      total_venta: parseFloat(cpeData.total_venta),
      estado: cpeData.estado,
      hash: cpeData.hash,
      xml_firmado: cpeData.xml_firmado,
      cdr_sunat: cpeData.cdr_sunat,
      error_message: cpeData.error_message,
      tenant_id: cpeData.tenant_id,
      created_at: new Date(cpeData.created_at),
      updated_at: new Date(cpeData.updated_at),
    };

    return dto;
  }

pickFirstNonEmpty(values: Array<string | null | undefined>, fallback = ''): string {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
    return fallback;
  }
}
