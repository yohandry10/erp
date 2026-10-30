import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventBusService, ERPEvent } from '../../shared/events/event-bus.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { SireApiClientService, SireLibro } from './sire-api-client.service';


import { fechaHoyDelTenant, rangoDelDiaDelTenant } from '../../shared/utils/fecha-tenant.util';
type SireReportType = 'REG_VEN' | 'REG_COM';

interface SireGenerationRequest {
  tipoReporte: 'REGISTRO_VENTAS' | 'REGISTRO_COMPRAS' | SireReportType;
  periodo: string;
  formato?: 'TXT';
  incluirAnulados?: boolean;
}

interface SireReportFilters {
  periodo?: string;
  tipoReporte?: 'REGISTRO_VENTAS' | 'REGISTRO_COMPRAS' | SireReportType;
  estado?: 'GENERANDO' | 'GENERADO' | 'PENDIENTE' | 'ENVIADO' | 'ERROR';
}

interface SireWorkflowResult {
  claimed?: boolean;
  idempotent?: boolean;
  reason?: string;
  terminado?: boolean;
  con_errores?: boolean;
  report?: Record<string, any>;
  operation?: Record<string, any>;
  detail?: Record<string, any>;
  incident?: Record<string, any>;
}

@Injectable()
export class SireService {
  private readonly logger = new Logger(SireService.name);
  private readonly uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly tenantContext: TenantContextService,
    private readonly sireApiClient: SireApiClientService,
  ) {
    this.initializeEventListeners();
  }

  /**
   * El outbox worker usa emitAndAwait. Un error durante ese replay debe subir para
   * que la fila quede FAILED y vuelva a intentarse; el evento caliente sólo deja
   * diagnóstico porque la copia durable ya existe.
   */
  private initializeEventListeners(): void {
    this.eventBus.onComprobanteCreadoEvent(async (event: ERPEvent) => {
      try {
        await this.procesarComprobanteParaSire(event.data);
      } catch (error) {
        this.logger.error('No se pudo proyectar comprobante.creado en SIRE', error);
        if (event.module === 'outbox-worker') {
          throw error;
        }
      }
    });
  }

  async procesarComprobanteParaSire(comprobante: Record<string, any>): Promise<void> {
    const tenantId = this.ensureTenant(comprobante?.tenant_id ?? comprobante?.tenantId);
    const cpeId = this.requireUuid(comprobante?.cpeId ?? comprobante?.cpe_id, 'cpeId');
    const eventId = this.requireUuid(comprobante?.eventId ?? comprobante?.event_id, 'eventId');

    const registration = await this.rpcOrThrow<SireWorkflowResult>(
      'registrar_comprobante_sire_tx',
      {
        p_tenant_id: tenantId,
        p_cpe_id: cpeId,
        p_event_id: eventId,
      },
      'No se pudo registrar el comprobante en SIRE',
    );

    const reportId = registration.report?.id;
    if (!reportId) {
      throw new BadRequestException({
        code: 'SIRE_REPORT_ID_MISSING',
        message: 'La proyección SIRE no devolvió el reporte asociado',
      });
    }

    await this.rpcOrThrow(
      'finalizar_generacion_sire_evento_tx',
      { p_tenant_id: tenantId, p_reporte_id: reportId },
      'No se pudo congelar la instantánea SIRE del comprobante',
    );
  }

  async getStats(tenantId?: string) {
    const currentTenantId = this.ensureTenant(tenantId);
    const client = this.supabaseService.getClient();
    const currentMonth = (await fechaHoyDelTenant(client, currentTenantId)).slice(0, 7);
    const nextMonth = this.getNextMonth(currentMonth);
    const [start, end] = await Promise.all([
      rangoDelDiaDelTenant(client, currentTenantId, new Date(`${currentMonth}-01T12:00:00Z`)),
      rangoDelDiaDelTenant(client, currentTenantId, new Date(`${nextMonth}-01T12:00:00Z`)),
    ]);
    const [reports, details] = await Promise.all([
      this.readSireRows('sire_files', 'id,tenant_id,total_registros,estado,created_at', currentTenantId),
      client.from('sire_registros_detalle').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId),
    ]);
    if (details.error || !Number.isSafeInteger(details.count) || details.count < 0 ||
        reports.some(r => !Number.isSafeInteger(r.total_registros) || r.total_registros < 0 ||
          typeof r.created_at !== 'string' || !Number.isFinite(Date.parse(r.created_at)) ||
          !['GENERANDO','GENERADO','PENDIENTE','ENVIADO','ERROR'].includes(r.estado))) {
      throw new ServiceUnavailableException('No se pudieron completar las estadísticas SIRE. Reintente la consulta.');
    }
    const registrosTotales = reports.reduce((sum, r) => sum + r.total_registros, 0);
    if (!Number.isSafeInteger(registrosTotales)) throw new ServiceUnavailableException('Las estadísticas SIRE están fuera de rango.');
    return { success: true, complete: true, tenant_id: currentTenantId, data: {
      periodoActual: currentMonth,
      reportesDelMes: reports.filter(r => Date.parse(r.created_at) >= Date.parse(start.desde) && Date.parse(r.created_at) < Date.parse(end.desde)).length,
      registrosTotales, totalDetalles: details.count,
      enviadosASunat: reports.filter(r => r.estado === 'ENVIADO').length,
      pendientes: reports.filter(r => ['GENERADO','GENERANDO','PENDIENTE'].includes(r.estado)).length,
    }};
  }

  async getReportes(filters: SireReportFilters = {}, tenantId?: string) {
    const currentTenantId = this.ensureTenant(tenantId);
    const conditions: Record<string,string> = {};
    if (filters.periodo) conditions.periodo = this.normalizePeriodo(filters.periodo);
    if (filters.tipoReporte) conditions.tipo = this.mapTipoReporte(filters.tipoReporte);
    if (filters.estado) conditions.estado = filters.estado;
    const data = await this.readSireRows('sire_files', '*', currentTenantId, conditions);
    return { success: true, complete: true, total: data.length, tenant_id: currentTenantId,
      data: data.map(report => ({ ...report, tipo_display: this.getTipoReporteFullName(report.tipo), periodo_display: report.periodo })) };
  }

  private async readSireRows(table: string, selection: string, tenantId: string, filters: Record<string,string> = {}) {
    const rows: any[] = []; const ids = new Set<string>(); let total: number | undefined;
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      let query: any = this.supabaseService.getClient().from(table).select(selection, { count: 'exact' })
        .eq('tenant_id', tenantId).order('created_at', { ascending: false }).order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      for (const [key,value] of Object.entries(filters)) query = query.eq(key,value);
      const {data,error,count} = await query;
      if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 ||
          (total !== undefined && count !== total) || data.length !== Math.min(pageSize,Math.max(0,count-offset))) {
        throw new ServiceUnavailableException('No se pudo completar la lectura SIRE. Reintente la consulta.');
      }
      total = count;
      for (const row of data) {
        if (!row || typeof row.id !== 'string' || !row.id || row.tenant_id !== tenantId || ids.has(row.id) ||
            Object.entries(filters).some(([key,value]) => row[key] !== value)) {
          throw new ServiceUnavailableException('La lectura SIRE contiene datos incompletos, ajenos o cambió durante la consulta.');
        }
        ids.add(row.id); rows.push(row);
      }
      if (rows.length === total) return rows;
    }
  }

  async generarReporte(
    reportData: SireGenerationRequest,
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
  ) {
    const currentTenantId = this.ensureTenant(tenantId);
    const actor = this.requireUuid(actorId, 'actorId');
    const key = this.requireIdempotencyKey(idempotencyKey);
    const tipo = this.mapTipoReporte(reportData.tipoReporte);
    const periodo = this.normalizePeriodo(reportData.periodo);

    const report = await this.rpcOrThrow<Record<string, any>>(
      'generar_reporte_sire_tx',
      {
        p_tenant_id: currentTenantId,
        p_actor_id: actor,
        p_tipo: tipo,
        p_periodo: periodo,
        p_metadata: {
          formato: reportData.formato ?? 'TXT',
          incluirAnulados: reportData.incluirAnulados === true,
        },
        p_idempotency_key: key,
      },
      'No se pudo generar la instantánea SIRE',
    );

    return {
      success: true,
      data: report,
      message: report.idempotent
        ? 'El reporte SIRE ya había sido generado con esta solicitud'
        : 'Reporte SIRE generado con una instantánea consistente',
    };
  }

  async downloadReporte(id: string, tenantId?: string) {
    const currentTenantId = this.ensureTenant(tenantId);
    const reportId = this.requireUuid(id, 'reporteId');
    const { data, error } = await this.supabaseService
      .getClient()
      .from('sire_files')
      .select('id,filename,estado,contenido_local,contenido_sha256,source_cutoff_at,source_fingerprint')
      .eq('id', reportId)
      .eq('tenant_id', currentTenantId)
      .maybeSingle();

    if (error) throw new BadRequestException(`No se pudo descargar el reporte SIRE: ${error.message}`);
    if (!data) throw new NotFoundException('Reporte SIRE no encontrado');
    if (typeof data.contenido_local !== 'string' || !data.contenido_sha256) {
      throw new BadRequestException('El reporte aún no tiene una instantánea local congelada');
    }

    return {
      success: true,
      data: data.contenido_local,
      filename: data.filename,
      contentType: 'text/plain; charset=utf-8',
      metadata: {
        sha256: data.contenido_sha256,
        sourceCutoffAt: data.source_cutoff_at,
        sourceFingerprint: data.source_fingerprint,
      },
    };
  }

  async enviarSunat(
    id: string,
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
  ) {
    const currentTenantId = this.ensureTenant(tenantId);
    const reportId = this.requireUuid(id, 'reporteId');
    const actor = this.requireUuid(actorId, 'actorId');
    const key = this.requireIdempotencyKey(idempotencyKey);

    const reservation = await this.rpcOrThrow<SireWorkflowResult>(
      'reservar_aceptacion_sire_tx',
      {
        p_tenant_id: currentTenantId,
        p_actor_id: actor,
        p_reporte_id: reportId,
        p_idempotency_key: key,
      },
      'No se pudo reservar la aceptación de la propuesta SIRE',
    );

    if (!reservation.claimed) {
      return this.workflowResponse(reservation, 'La aceptación SIRE ya estaba registrada o en proceso');
    }

    const operation = this.requireClaim(reservation);
    const report = reservation.report!;
    try {
      const external = await this.sireApiClient.aceptarPropuesta(
        currentTenantId,
        this.getLibroSunat(report.tipo),
        this.toSunatPeriodo(report.periodo),
      );

      let finalized: SireWorkflowResult;
      try {
        finalized = await this.rpcOrThrow<SireWorkflowResult>(
          'finalizar_aceptacion_sire_tx',
          {
            p_tenant_id: currentTenantId,
            p_operation_id: operation.id,
            p_claim_token: operation.claim_token,
            p_ticket: external.ticket,
            p_http_status: external.httpStatus,
            p_response_summary: external.responseSummary,
          },
          'SUNAT devolvió un ticket, pero no se pudo persistir su evidencia',
        );
      } catch (error) {
        throw new BadRequestException({
          code: 'SIRE_TICKET_PERSISTENCE_PENDING',
          message: 'SUNAT devolvió un ticket que requiere conciliación antes de reintentar la aceptación',
          ticket: external.ticket,
          operationId: operation.id,
          cause: this.extractErrorDetails(error).message,
        });
      }
      return this.workflowResponse(finalized, 'SUNAT recibió la aceptación; el ticket queda pendiente de consulta');
    } catch (error) {
      const details = this.extractErrorDetails(error);
      if (details.code !== 'SIRE_TICKET_PERSISTENCE_PENDING') {
        await this.failOperationBestEffort(currentTenantId, operation, details);
      }
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException({ code: details.code, message: details.message });
    }
  }

  async consultarTicket(
    id: string,
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
  ) {
    const currentTenantId = this.ensureTenant(tenantId);
    const reportId = this.requireUuid(id, 'reporteId');
    const actor = this.requireUuid(actorId, 'actorId');
    const key = this.requireIdempotencyKey(idempotencyKey);

    const reservation = await this.rpcOrThrow<SireWorkflowResult>(
      'reservar_consulta_sire_tx',
      {
        p_tenant_id: currentTenantId,
        p_actor_id: actor,
        p_reporte_id: reportId,
        p_idempotency_key: key,
      },
      'No se pudo reservar la consulta del ticket SIRE',
    );

    if (!reservation.claimed) {
      return this.workflowResponse(reservation, 'La consulta SIRE ya estaba registrada o en proceso');
    }

    const operation = this.requireClaim(reservation);
    const report = reservation.report!;
    try {
      const external = await this.sireApiClient.consultarTicket(
        currentTenantId,
        this.getLibroSunat(report.tipo),
        this.toSunatPeriodo(report.periodo),
        report.sunat_ticket,
      );
      if (!external.codigoEstado || !['01', '02', '03', '04', '05', '06', '07'].includes(external.codigoEstado)) {
        throw new BadRequestException({
          code: 'SIRE_TICKET_STATUS_INVALID',
          message: 'SUNAT no devolvió un código de estado SIRE reconocido',
        });
      }

      const finalized = await this.rpcOrThrow<SireWorkflowResult>(
        'finalizar_consulta_sire_tx',
        {
          p_tenant_id: currentTenantId,
          p_operation_id: operation.id,
          p_claim_token: operation.claim_token,
          p_codigo_estado: external.codigoEstado,
          p_descripcion: external.descripcionEstado,
          p_http_status: external.httpStatus,
          p_response_summary: external.responseSummary,
        },
        'No se pudo persistir la respuesta del ticket SIRE',
      );
      return this.workflowResponse(
        finalized,
        finalized.terminado
          ? 'SUNAT confirmó la propuesta SIRE como terminada'
          : finalized.con_errores
            ? 'SUNAT reportó errores en la propuesta SIRE'
            : 'La propuesta SIRE continúa en proceso',
      );
    } catch (error) {
      const details = this.extractErrorDetails(error);
      await this.failOperationBestEffort(currentTenantId, operation, details);
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException({ code: details.code, message: details.message });
    }
  }

  async getOperaciones(id: string, tenantId?: string) {
    const currentTenantId = this.ensureTenant(tenantId);
    const reportId = this.requireUuid(id, 'reporteId');
    const owner = await this.supabaseService.getClient().from('sire_files').select('id,tenant_id')
      .eq('tenant_id', currentTenantId).eq('id', reportId).maybeSingle();
    if (owner.error) throw new ServiceUnavailableException('No se pudo verificar el reporte de la bitácora.');
    if (!owner.data) throw new NotFoundException('Reporte SIRE no encontrado');
    if (owner.data.id !== reportId || owner.data.tenant_id !== currentTenantId) throw new ServiceUnavailableException('El reporte de la bitácora no está confirmado.');
    const data = await this.readSireRows('sire_operaciones',
      'id,tenant_id,reporte_id,accion,tipo_libro,periodo,ticket,estado,codigo_estado_sunat,descripcion_estado_sunat,http_status,intentos,error_code,error_message,solicitado_at,ultima_consulta_at,completado_at',
      currentTenantId, {reporte_id:reportId});
    return {success:true,complete:true,total:data.length,tenant_id:currentTenantId,reporte_id:reportId,data};
  }

  private workflowResponse(result: SireWorkflowResult, message: string) {
    const report = result.report ?? {};
    const operation = result.operation ?? {};
    return {
      success: true,
      data: {
        reporteId: report.id,
        operacionId: operation.id,
        ticket: report.sunat_ticket ?? operation.ticket ?? null,
        estado: report.estado,
        codigoEstadoSunat: report.sunat_codigo_estado ?? operation.codigo_estado_sunat ?? null,
        descripcionEstadoSunat: report.sunat_estado ?? operation.descripcion_estado_sunat ?? null,
        terminado: result.terminado ?? report.estado === 'ENVIADO',
        conErrores: result.con_errores ?? report.estado === 'ERROR',
        idempotent: result.idempotent === true,
        reason: result.reason ?? null,
      },
      message,
    };
  }

  private requireClaim(result: SireWorkflowResult): { id: string; claim_token: string } {
    const operation = result.operation;
    if (!operation?.id || !operation?.claim_token || !result.report?.id) {
      throw new BadRequestException({
        code: 'SIRE_CLAIM_INVALID',
        message: 'La reserva SIRE no devolvió una operación ejecutable',
      });
    }
    return { id: operation.id, claim_token: operation.claim_token };
  }

  private async failOperationBestEffort(
    tenantId: string,
    operation: { id: string; claim_token: string },
    details: { code: string; message: string },
  ): Promise<void> {
    try {
      await this.rpcOrThrow(
        'fallar_operacion_sire_tx',
        {
          p_tenant_id: tenantId,
          p_operation_id: operation.id,
          p_claim_token: operation.claim_token,
          p_error_code: details.code,
          p_error_message: details.message,
        },
        'No se pudo registrar el fallo de la operación SIRE',
      );
    } catch (persistenceError) {
      this.logger.error('No se pudo persistir el fallo SIRE', persistenceError);
    }
  }

  private async rpcOrThrow<T = Record<string, any>>(
    functionName: string,
    args: Record<string, unknown>,
    context: string,
  ): Promise<T> {
    const { data, error } = await this.supabaseService.getClient().rpc(functionName, args);
    if (error) {
      if (String(error.message).includes('SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED')) {
        throw new BadRequestException({
          code: 'SIRE_RCE_ORIGINAL_AMOUNTS_REQUIRED',
          message: 'Una compra con devoluciones no conserva evidencia verificable de los importes originales. Reconcilie el comprobante del proveedor antes de generar el RCE.',
        });
      }
      throw new BadRequestException({
        code: error.code ?? 'SIRE_RPC_ERROR',
        message: `${context}: ${error.message}`,
      });
    }
    if (data === null || data === undefined) {
      throw new BadRequestException({ code: 'SIRE_RPC_EMPTY', message: `${context}: respuesta vacía` });
    }
    return data as T;
  }

  private getNextMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number);
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  }

  private mapTipoReporte(value: string): SireReportType {
    const normalized = String(value ?? '').toUpperCase();
    if (normalized === 'REGISTRO_VENTAS' || normalized === 'REG_VEN') return 'REG_VEN';
    if (normalized === 'REGISTRO_COMPRAS' || normalized === 'REG_COM') return 'REG_COM';
    throw new BadRequestException('SIRE sólo admite Registro de Ventas (RVIE) o Registro de Compras (RCE)');
  }

  private getTipoReporteFullName(tipo: string): string {
    return tipo === 'REG_VEN'
      ? 'Registro de Ventas'
      : tipo === 'REG_COM'
        ? 'Registro de Compras'
        : tipo;
  }

  private normalizePeriodo(periodo: string): string {
    const value = String(periodo ?? '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
      throw new BadRequestException('Período SIRE inválido. Use YYYY-MM.');
    }
    return value;
  }

  private toSunatPeriodo(periodo: string): string {
    return this.normalizePeriodo(periodo).replace('-', '');
  }

  private getLibroSunat(tipo: string): SireLibro {
    return this.mapTipoReporte(tipo);
  }

  private requireIdempotencyKey(value: string): string {
    const key = String(value ?? '').trim();
    if (key.length < 8 || key.length > 200) {
      throw new BadRequestException('Idempotency-Key SIRE es obligatorio y debe tener entre 8 y 200 caracteres');
    }
    return key;
  }

  private requireUuid(value: unknown, field: string): string {
    const normalized = String(value ?? '').trim();
    if (!this.uuidPattern.test(normalized)) {
      throw new BadRequestException(`${field} debe ser un UUID válido`);
    }
    return normalized;
  }

  private extractErrorDetails(error: any): { code: string; message: string } {
    const response = error?.getResponse?.() ?? error?.response ?? {};
    const body = response && typeof response === 'object' ? response : {};
    return {
      code: String(body.code ?? body.error ?? error?.code ?? 'SIRE_ERROR').slice(0, 100),
      message: String(body.message ?? error?.message ?? 'Error SIRE').slice(0, 1_000),
    };
  }

  private ensureTenant(tenantId?: string): string {
    const resolvedTenant = tenantId ?? this.tenantContext.getTenantId();
    if (!resolvedTenant) {
      throw new BadRequestException('[SIRE] Tenant requerido para esta operación');
    }
    return resolvedTenant;
  }
}
