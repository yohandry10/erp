import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CondicionPago, CreateFacturaDto, TipoDocumento } from '@erp-suite/dtos';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { CacheInvalidationService } from '../shared/cache/cache-invalidation.service';
import { CpeService } from './cpe/cpe.service';
import { validateArgentinaTaxId } from './fiscal/arca-fiscal.service';
import { getActiveCountryById, validateColombiaNit } from './paises/initial-country';
import {
  ActualizarDocumentoManualDto,
  CrearDocumentoManualDto,
  CrearSerieDocumentoDto,
  DocumentoFiltrosDto,
} from './documentos/dto/documentos.dto';

type DocumentoConDetalles = Record<string, any> & {
  documento_detalles?: Array<Record<string, any>>;
};

type CpeVinculado = {
  id: string;
  estado?: string | null;
  sunat_status?: string | null;
  xml_firmado?: string | null;
  hash?: string | null;
  hash_firma?: string | null;
  idempotency_key?: string | null;
};

/**
 * Centro de documentos operativos.
 *
 * Los únicos writers de documentos manuales son los RPC 461. La emisión
 * fiscal se delega al agregado CPE, que firma y ejecuta 443; la anulación de
 * un CPE se delega a 448. Este servicio no vuelve a implementar correlativos,
 * impuestos, CxC, outbox ni XML UBL.
 */
@Injectable()
export class DocumentosService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly cpeService: CpeService,
  ) {}

  private requireTenantId(tenantId?: string): string {
    const tenant = String(tenantId ?? '').trim();
    if (!tenant) {
      throw new BadRequestException('tenantId requerido para la operación de documentos');
    }
    return tenant;
  }

  private requireActorId(userId?: string): string {
    const actor = String(userId ?? '').trim();
    if (!actor) {
      throw new BadRequestException('La operación de documentos requiere un actor autenticado');
    }
    return actor;
  }

  private async rpc(name: string, args: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.supabaseService.getClient().rpc(name, args);
    if (error) {
      const message = String(error.message ?? 'Error transaccional desconocido');
      if (message.includes('IDEMPOTENCY') || error.code === '23505') {
        throw new ConflictException(message);
      }
      if (error.code === 'P0002' || message.includes('NOT_FOUND')) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
    return Array.isArray(data) ? data[0] : data;
  }

  private async invalidateDocumentoCache(tenantId: string): Promise<void> {
    try {
      await this.cacheInvalidation.onDocumentoCreated(tenantId);
    } catch (error) {
      // La invalidación no forma parte de la transacción de dominio.
      console.warn('No se pudo invalidar la caché de documentos:', error);
    }
  }

  private assertCpeFirmadoCompleto(cpe: CpeVinculado): void {
    const xml = String(cpe.xml_firmado ?? '').trim();
    const hash = String(cpe.hash_firma ?? cpe.hash ?? '').trim();
    const estado = String(cpe.estado ?? '').trim().toUpperCase();
    const signaturePresent = /<(?:[A-Za-z0-9_-]+:)?Signature\b/.test(xml);
    const missing: string[] = [];
    if (!xml) missing.push('xml_firmado');
    else if (!signaturePresent) missing.push('firma XML');
    if (!hash) missing.push('hash de firma');
    if (!['FIRMADO', 'ENVIADO', 'ACEPTADO'].includes(estado)) {
      missing.push(`estado fiscal válido (actual: ${estado || 'VACÍO'})`);
    }
    if (missing.length === 0) return;

    const persistedKey = String(cpe.idempotency_key ?? '').trim();
    throw new ConflictException(
      `CPE_LINKED_INCOMPLETE: el CPE ${cpe.id} carece de ${missing.join(', ')}. `
      + `No se devolvió éxito; reconcilie la intención persistida ${persistedKey || '(sin key legacy)'} mediante 443 antes de reintentar.`,
    );
  }

  async getStats(tenantId?: string) {
    const tenant = this.requireTenantId(tenantId);
    const client = this.supabaseService.getClient();
    const [total, facturas, boletas, notasCredito, contratos, pendientes] = await Promise.all([
      client.from('documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant),
      client.from('documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).eq('tipo_documento', 'FACTURA'),
      client.from('documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).eq('tipo_documento', 'BOLETA'),
      client.from('documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).eq('tipo_documento', 'NOTA_CREDITO'),
      client.from('documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).eq('tipo_documento', 'CONTRATO'),
      client.from('documentos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).in('estado', ['BORRADOR', 'EMITIDO']),
    ]);
    const firstError = [total, facturas, boletas, notasCredito, contratos, pendientes]
      .find((result) => result.error)?.error;
    if (firstError) {
      throw new BadRequestException(`No se pudieron calcular las estadísticas: ${firstError.message}`);
    }
    return {
      success: true,
      data: {
        totalDocumentos: total.count ?? 0,
        facturas: facturas.count ?? 0,
        boletas: boletas.count ?? 0,
        notasCredito: notasCredito.count ?? 0,
        contratos: contratos.count ?? 0,
        pendientesEnvio: pendientes.count ?? 0,
      },
    };
  }

  async getDocumentos(filters: DocumentoFiltrosDto = {}, tenantId?: string) {
    const tenant = this.requireTenantId(tenantId);
    let query = this.supabaseService
      .getClient()
      .from('documentos')
      .select('*, documento_detalles(*)')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false });
    if (filters.tipo_documento) query = query.eq('tipo_documento', filters.tipo_documento);
    if (filters.estado) query = query.eq('estado', filters.estado);
    if (filters.fecha_desde) query = query.gte('fecha_emision', filters.fecha_desde);
    if (filters.fecha_hasta) query = query.lte('fecha_emision', filters.fecha_hasta);
    if (filters.receptor_numero_doc) {
      query = query.ilike('receptor_numero_doc', `%${filters.receptor_numero_doc}%`);
    }
    if (filters.serie) query = query.eq('serie', filters.serie);
    const { data, error } = await query;
    if (error) throw new BadRequestException(`No se pudieron obtener los documentos: ${error.message}`);
    return { success: true, data: data ?? [] };
  }

  async getDocumento(id: string, tenantId?: string) {
    const tenant = this.requireTenantId(tenantId);
    const { data, error } = await this.supabaseService
      .getClient()
      .from('documentos')
      .select('*, documento_detalles(*), documento_archivos(*)')
      .eq('id', id)
      .eq('tenant_id', tenant)
      .maybeSingle();
    if (error) throw new BadRequestException(`No se pudo obtener el documento: ${error.message}`);
    if (!data) throw new NotFoundException('Documento no encontrado');
    return { success: true, data };
  }

  async crearDocumento(
    documentoData: CrearDocumentoManualDto,
    tenantId?: string,
    userId?: string,
  ) {
    const tenant = this.requireTenantId(tenantId);
    const actor = this.requireActorId(userId);
    const { detalles, idempotency_key, ...payload } = documentoData;
    const result = await this.rpc('crear_documento_manual_tx', {
      p_tenant_id: tenant,
      p_actor_id: actor,
      p_payload: payload,
      p_detalles: detalles,
      p_idempotency_key: idempotency_key,
    });
    await this.invalidateDocumentoCache(tenant);
    return {
      success: true,
      data: { ...result.documento, documento_detalles: result.detalles ?? [] },
      idempotent: result.idempotent === true,
      message: result.idempotent
        ? 'El borrador ya existía y fue reutilizado'
        : 'Borrador creado con correlativo, impuestos y detalle calculados por el servidor',
    };
  }

  /** Writer retirado: los pedidos se facturan exclusivamente mediante 446. */
  async crearDocumentoDesdePedido(..._args: unknown[]): Promise<never> {
    throw new ConflictException(
      'El writer legacy fue retirado; use el flujo canónico de facturación de pedidos (446)',
    );
  }

  private tipoReceptorFiscal(tipo: unknown, pais: string): string {
    const normalized = String(tipo ?? '').trim().toUpperCase();
    if (/^\d{1,2}$/.test(normalized)) return normalized;
    if (pais === 'CO') {
      return ({ NIT: '31', CC: '13', CE: '22', PASAPORTE: '41' } as Record<string, string>)[normalized] ?? normalized;
    }
    if (pais === 'AR') {
      return ({ CUIT: '80', DNI: '96', PASAPORTE: '94' } as Record<string, string>)[normalized] ?? normalized;
    }
    return ({ RUC: '6', DNI: '1', CE: '4', PASAPORTE: '7', OTRO: '0' } as Record<string, string>)[normalized] ?? normalized;
  }

  private async buildCpeDto(
    documento: DocumentoConDetalles,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<CreateFacturaDto> {
    if (!['FACTURA', 'BOLETA'].includes(String(documento.tipo_documento).toUpperCase())) {
      if (String(documento.tipo_documento).toUpperCase() === 'CONTRATO') {
        throw new BadRequestException('Un contrato es operativo y no genera CPE/XML fiscal');
      }
      throw new ConflictException(
        'Las notas de crédito/débito se emiten desde el flujo CPE referenciado, no desde el alta manual',
      );
    }
    if (String(documento.estado).toUpperCase() !== 'BORRADOR') {
      throw new ConflictException('Sólo un borrador puede emitirse por primera vez');
    }
    const detalles = documento.documento_detalles ?? [];
    if (detalles.length === 0) throw new BadRequestException('El documento no tiene detalle');
    const contexto = await this.obtenerContextoPaisTenant(tenantId);
    const tipoDocumento = documento.tipo_documento === 'FACTURA'
      ? TipoDocumento.FACTURA
      : TipoDocumento.BOLETA;
    const numero = Number(documento.numero);
    if (!Number.isInteger(numero) || numero < 1) {
      throw new BadRequestException('El correlativo del documento no es válido');
    }
    const dto: CreateFacturaDto = {
      tipo_documento: tipoDocumento,
      serie: String(documento.serie),
      numero,
      ruc_emisor: String(documento.emisor_ruc),
      razon_social_emisor: String(documento.emisor_razon_social),
      tipo_documento_receptor: this.tipoReceptorFiscal(documento.receptor_tipo_doc, contexto.pais),
      documento_receptor: String(documento.receptor_numero_doc ?? documento.receptor_documento),
      razon_social_receptor: String(documento.receptor_razon_social ?? documento.receptor_nombre),
      cliente_id: documento.cliente_id ?? undefined,
      direccion_receptor: documento.receptor_direccion ?? undefined,
      moneda: String(documento.moneda),
      tipo_cambio: Number(documento.tipo_cambio ?? 1),
      fecha_emision: new Date(documento.fecha_emision).toISOString(),
      fecha_vencimiento: documento.fecha_vencimiento
        ? new Date(documento.fecha_vencimiento).toISOString()
        : undefined,
      condicion_pago: String(documento.metodo_pago).toUpperCase() === 'CREDITO'
        ? CondicionPago.CREDITO
        : CondicionPago.CONTADO,
      items: detalles
        .slice()
        .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
        .map((item) => ({
          producto_id: item.producto_id ?? undefined,
          codigo: String(item.codigo_producto ?? ''),
          descripcion: String(item.descripcion),
          cantidad: Number(item.cantidad),
          unidad: String(item.unidad_medida ?? 'NIU'),
          precio_unitario: Number(item.precio_unitario),
          descuento_unitario: Number(item.descuento_unitario ?? 0),
          valor_venta: Number(item.valor_venta),
          igv: Number(item.impuesto_igv ?? 0),
          impuesto_isc: Number(item.impuesto_isc ?? 0),
          precio_venta: Number(item.total_item),
          tipo_afectacion_igv: String(item.metadata?.afectacion_igv ?? '10'),
          afectacion_igv: String(item.metadata?.afectacion_igv ?? '10'),
        })),
      total_gravadas: Number(documento.total_gravadas ?? documento.subtotal ?? 0),
      total_exoneradas: Number(documento.total_exoneradas ?? 0),
      total_inafectas: Number(documento.total_inafectas ?? 0),
      total_exportacion: Number(documento.total_exportacion ?? 0),
      total_igv: Number(documento.impuesto_igv ?? 0),
      total_isc: Number(documento.impuesto_isc ?? 0),
      total_venta: Number(documento.total ?? 0),
      idempotency_key: idempotencyKey,
    };
    return dto;
  }

  async generarXML(
    id: string,
    idempotencyKey: string,
    tenantId?: string,
    userId?: string,
  ) {
    const tenant = this.requireTenantId(tenantId);
    const actor = this.requireActorId(userId);
    await this.assertLegacyFiscalEndpointAllowed(tenant);
    const existing = await this.resolveCpeVinculado(id, tenant);
    if (existing) {
      const persisted = await this.cpeService.findOne(existing.id, tenant);
      const cpe = { ...existing, ...(persisted as any) } as CpeVinculado;
      this.assertCpeFirmadoCompleto(cpe);
      return {
        success: true,
        data: { cpe_id: cpe.id, documento_id: id, xml_content: cpe.xml_firmado, codigo_hash: cpe.hash },
        idempotent: true,
        message: 'El CPE firmado ya existía y fue reutilizado',
      };
    }
    const documento = (await this.getDocumento(id, tenant)).data as DocumentoConDetalles;
    const dto = await this.buildCpeDto(documento, tenant, idempotencyKey);
    const cpe = await this.cpeService.create(dto, tenant, actor);
    const xmlFirmado = cpe.id && !cpe.xml_firmado
      ? await this.cpeService.getSignedXml(cpe.id, tenant)
      : cpe.xml_firmado;
    if (!cpe.id || !xmlFirmado) {
      throw new BadRequestException('La emisión no devolvió un CPE firmado');
    }
    await this.invalidateDocumentoCache(tenant);
    return {
      success: true,
      data: {
        cpe_id: cpe.id,
        documento_id: (cpe as any).documento_id ?? id,
        xml_content: xmlFirmado,
        codigo_hash: cpe.hash,
      },
      idempotent: false,
      message: 'CPE creado y XML firmado con las credenciales del cliente',
    };
  }

  async enviarSUNAT(
    id: string,
    idempotencyKey: string,
    tenantId?: string,
    userId?: string,
  ) {
    const tenant = this.requireTenantId(tenantId);
    this.requireActorId(userId);
    await this.assertLegacyFiscalEndpointAllowed(tenant);
    const cpe = await this.resolveCpeVinculado(id, tenant);
    if (!cpe) throw new ConflictException('El documento no tiene un CPE firmado vinculado');
    const result = await this.cpeService.resendToOse(cpe.id, tenant, {
      idempotencyKey,
      actorId: userId,
      origin: 'USER',
    });
    const { data: fiscal, error } = await this.supabaseService
      .getClient()
      .from('cpe')
      .select('id, estado, sunat_status, error_message')
      .eq('id', cpe.id)
      .eq('tenant_id', tenant)
      .maybeSingle();
    if (error || !fiscal) {
      throw new BadRequestException(
        `No se pudo confirmar el estado fiscal posterior al envío${error ? `: ${error.message}` : ''}`,
      );
    }
    if (String(fiscal.sunat_status).toUpperCase() === 'ERROR') {
      throw new BadRequestException(
        fiscal.error_message || 'El proveedor fiscal tuvo un fallo técnico; reintente la misma intención',
      );
    }
    if (
      String(fiscal.estado).toUpperCase() === 'RECHAZADO'
      || String(fiscal.sunat_status).toUpperCase() === 'REJECTED'
    ) {
      throw new ConflictException(fiscal.error_message || 'La autoridad fiscal rechazó el CPE');
    }
    return {
      success: true,
      data: { cpe_id: cpe.id, estado: fiscal.estado, sunat_status: fiscal.sunat_status },
      message: (result as any)?.message ?? 'CPE enviado al proveedor fiscal',
    };
  }

  async actualizarDocumento(
    id: string,
    documentoData: ActualizarDocumentoManualDto,
    tenantId?: string,
    userId?: string,
  ) {
    const tenant = this.requireTenantId(tenantId);
    const actor = this.requireActorId(userId);
    const { detalles, idempotency_key, ...payload } = documentoData;
    const result = await this.rpc('actualizar_documento_manual_tx', {
      p_documento_id: id,
      p_tenant_id: tenant,
      p_actor_id: actor,
      p_payload: payload,
      p_detalles: detalles,
      p_idempotency_key: idempotency_key,
    });
    await this.invalidateDocumentoCache(tenant);
    return {
      success: true,
      data: { ...result.documento, documento_detalles: result.detalles ?? [] },
      idempotent: result.idempotent === true,
      message: result.idempotent ? 'La actualización ya se había aplicado' : 'Borrador actualizado atómicamente',
    };
  }

  async anularDocumento(
    id: string,
    motivo: string,
    idempotencyKey: string,
    tenantId?: string,
    userId?: string,
  ) {
    const tenant = this.requireTenantId(tenantId);
    const actor = this.requireActorId(userId);
    const cpe = await this.resolveCpeVinculado(id, tenant);
    if (cpe) {
      throw new ConflictException(
        `El documento ya tiene el CPE ${cpe.id}; solicite la anulación desde el módulo CPE, que exige cpe.comprobantes.anular`,
      );
    }
    const result = await this.rpc('anular_documento_borrador_tx', {
      p_documento_id: id,
      p_tenant_id: tenant,
      p_actor_id: actor,
      p_motivo: motivo,
      p_idempotency_key: idempotencyKey,
    });
    await this.invalidateDocumentoCache(tenant);
    return {
      success: true,
      data: result,
      idempotent: result.idempotent === true,
      message: result.idempotent ? 'El borrador ya estaba anulado' : 'Borrador anulado',
    };
  }

  private async resolveCpeVinculado(
    documentoId: string,
    tenantId: string,
  ): Promise<CpeVinculado | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('cpe')
      .select('id, estado, sunat_status, xml_firmado, hash, hash_firma, idempotency_key')
      .eq('tenant_id', tenantId)
      .eq('documento_id', documentoId)
      .maybeSingle();
    if (error) throw new BadRequestException(`No se pudo resolver el CPE vinculado: ${error.message}`);
    return data ?? null;
  }

  async generarPDF(id: string, tenantId?: string) {
    const tenant = this.requireTenantId(tenantId);
    await this.getDocumento(id, tenant);
    const cpe = await this.resolveCpeVinculado(id, tenant);
    if (!cpe) throw new ConflictException('Genere primero el CPE firmado asociado');
    return {
      success: true,
      data: { cpe_id: cpe.id, pdf_endpoint: `/api/cpe/comprobantes/${cpe.id}/pdf` },
      message: 'Descargue la representación impresa desde el agregado CPE',
    };
  }

  async descargarXML(id: string, tenantId?: string) {
    const tenant = this.requireTenantId(tenantId);
    await this.getDocumento(id, tenant);
    const cpe = await this.resolveCpeVinculado(id, tenant);
    if (!cpe) throw new ConflictException('El documento no tiene un CPE firmado');
    return {
      success: true,
      data: await this.cpeService.getSignedXml(cpe.id, tenant),
      message: 'XML firmado recuperado desde el agregado CPE',
    };
  }

  async validarRUC(ruc: string, tenantId?: string) {
    const tenant = this.requireTenantId(tenantId);
    const { pais } = await this.obtenerContextoPaisTenant(tenant);
    const value = String(ruc ?? '').replace(/[^0-9]/g, '');
    const valido = pais === 'AR'
      ? validateArgentinaTaxId(value)
      : pais === 'CO'
        ? validateColombiaNit(value)
        : this.validarRucPeru(value);
    return {
      success: valido,
      data: { valido, numero: value, pais },
      ...(valido ? {} : { error: `Identificador fiscal inválido para ${pais}` }),
    };
  }

  async validarDocumento(documentoData: Partial<CrearDocumentoManualDto>, tenantId?: string) {
    this.requireTenantId(tenantId);
    const errores: string[] = [];
    if (!documentoData.tipo_documento) errores.push('Tipo de documento requerido');
    if (!documentoData.receptor_numero_doc) errores.push('Documento del receptor requerido');
    if (!documentoData.receptor_razon_social) errores.push('Nombre o razón social del receptor requerido');
    if (!Array.isArray(documentoData.detalles) || documentoData.detalles.length === 0) {
      errores.push('Al menos un detalle es requerido');
    }
    return { success: errores.length === 0, data: { valido: errores.length === 0, errores } };
  }

  private validarRucPeru(ruc: string): boolean {
    if (!/^\d{11}$/.test(ruc) || !['10', '15', '17', '20'].includes(ruc.slice(0, 2))) return false;
    const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const suma = factores.reduce((total, factor, index) => total + factor * Number(ruc[index]), 0);
    const resto = 11 - (suma % 11);
    const verificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
    return verificador === Number(ruc[10]);
  }

  private async obtenerContextoPaisTenant(
    tenantId: string,
    requireConfigured = false,
  ): Promise<{ pais: 'PE' | 'AR' | 'CO' }> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('pais, pais_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new BadRequestException(`No se pudo resolver el país fiscal: ${error.message}`);
    const raw = String(data?.pais ?? '').trim().toUpperCase();
    const byCode = ['PE', 'AR', 'CO'].includes(raw) ? raw as 'PE' | 'AR' | 'CO' : null;
    const byId = getActiveCountryById(data?.pais_id)?.codigo ?? null;
    if (byCode && byId && byCode !== byId) {
      throw new ConflictException('La configuración fiscal tiene país y pais_id inconsistentes');
    }
    const pais = byCode ?? byId;
    if (pais) return { pais };
    if (requireConfigured) {
      throw new ConflictException(
        'No se pudo determinar el país fiscal del tenant; la operación fiscal legacy queda bloqueada',
      );
    }
    // Compatibilidad de lecturas/validaciones históricas no fiscales. Las rutas
    // de emisión y envío invocan este resolver en modo estricto.
    return { pais: 'PE' };
  }

  private async assertLegacyFiscalEndpointAllowed(tenantId: string): Promise<void> {
    const { pais } = await this.obtenerContextoPaisTenant(tenantId, true);
    if (pais === 'CO') {
      throw new ConflictException(
        'En Colombia la emisión y transmisión DIAN se realizan exclusivamente desde el Centro CPE; '
        + 'el endpoint fiscal legado de Documentos está deshabilitado',
      );
    }
  }

  async getSeries(tenantId?: string) {
    const tenant = this.requireTenantId(tenantId);
    const { data, error } = await this.supabaseService
      .getClient()
      .from('documento_series')
      .select('*')
      .eq('tenant_id', tenant)
      .eq('activo', true)
      .order('tipo_documento')
      .order('serie');
    if (error) throw new BadRequestException(`No se pudieron obtener las series: ${error.message}`);
    return { success: true, data: data ?? [] };
  }

  async crearSerie(serieData: CrearSerieDocumentoDto, tenantId?: string, userId?: string) {
    const tenant = this.requireTenantId(tenantId);
    const actor = this.requireActorId(userId);
    const result = await this.rpc('crear_serie_documento_tx', {
      p_tenant_id: tenant,
      p_actor_id: actor,
      p_tipo_documento: serieData.tipo_documento,
      p_serie: serieData.serie,
      p_correlativo_maximo: serieData.correlativo_maximo ?? 99999999,
      p_idempotency_key: serieData.idempotency_key,
    });
    return {
      success: true,
      data: result.serie,
      idempotent: result.idempotent === true,
      message: result.idempotent ? 'La serie ya había sido creada' : 'Serie creada atómicamente',
    };
  }

  async getAuditoria(documentoId: string, tenantId?: string) {
    const tenant = this.requireTenantId(tenantId);
    const { data, error } = await this.supabaseService
      .getClient()
      .from('documento_auditoria')
      .select('*')
      .eq('documento_id', documentoId)
      .eq('tenant_id', tenant)
      .order('timestamp', { ascending: false });
    if (error) throw new BadRequestException(`No se pudo obtener la auditoría: ${error.message}`);
    return { success: true, data: data ?? [] };
  }
}
