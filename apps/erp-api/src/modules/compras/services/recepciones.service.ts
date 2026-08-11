import { Injectable, BadRequestException, NotFoundException, Logger, Optional } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreateRecepcionDto, CerrarRecepcionDto, UpdateRecepcionDto } from '../dto';
import { AuditService } from '../../audit/audit.service';
import { CacheInvalidationService } from '../../../shared/cache/cache-invalidation.service';

@Injectable()
export class RecepcionesService {
  private readonly logger = new Logger(RecepcionesService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditService: AuditService,
    @Optional() private readonly cacheInvalidation?: CacheInvalidationService,
  ) {}

  private async registrarIntegrationLog(entry: {
    tenantId: string;
    operacion: string;
    correlacionId?: string | null;
    correlacionTipo?: string | null;
    status: 'SUCCESS' | 'ERROR';
    requestSummary?: Record<string, any>;
    responseSummary?: Record<string, any>;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<void> {
    try {
      await this.supabase
        .getClient()
        .from('integration_logs')
        .insert({
          tenant_id: entry.tenantId,
          servicio: 'COMPRAS',
          operacion: entry.operacion,
          correlacion_id: entry.correlacionId ?? null,
          correlacion_tipo: entry.correlacionTipo ?? null,
          status: entry.status,
          request_summary: entry.requestSummary ?? null,
          response_summary: entry.responseSummary ?? null,
          error_message: entry.errorMessage ?? null,
          duration_ms: entry.durationMs ?? null,
        });
    } catch (error) {
      this.logger.error('❌ [Recepciones] Error registrando integration_log:', error);
    }
  }

  private normalizeDateFilter(value?: string, boundary: 'start' | 'end' = 'start'): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const isoCandidate = trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00Z`;
    const parsed = new Date(isoCandidate);
    if (Number.isNaN(parsed.getTime())) {
      this.logger.warn(`⚠️ [Recepciones] Fecha inválida recibida: "${value}"`);
      return null;
    }

    if (boundary === 'end') {
      parsed.setUTCHours(23, 59, 59, 999);
    } else {
      parsed.setUTCHours(0, 0, 0, 0);
    }

    return parsed.toISOString();
  }

  private sanitizeSearchTerm(value?: string | null): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.replace(/[%_]/g, '');
  }

  /**
   * Obtiene todas las recepciones con filtros opcionales
   */
  async obtenerRecepciones(tenantId: string, filtros: any = {}): Promise<any[]> {
    const startedAt = Date.now();
    try {
      this.logger.log(`📦 [Recepciones] Listando recepciones para tenant ${tenantId}`);

      const estado = filtros?.estado ? String(filtros.estado).toUpperCase() : undefined;
      const ordenId = filtros?.orden_id ?? filtros?.ordenId ?? null;
      const fechaDesde = this.normalizeDateFilter(filtros?.fecha_desde ?? filtros?.desde, 'start');
      const fechaHasta = this.normalizeDateFilter(filtros?.fecha_hasta ?? filtros?.hasta, 'end');
      const search = this.sanitizeSearchTerm(filtros?.search ?? filtros?.numero);

      let query = this.supabase
        .getClient()
        .from('recepciones')
        .select(
          `
            *,
            orden:ordenes_compra!recepciones_orden_id_fkey_runtime(
              id,
              numero,
              proveedor:proveedores!fk_ordenes_compra_proveedor_id(id, razon_social, ruc)
            )
          `,
        )
        .eq('tenant_id', tenantId)
        .order('fecha_recepcion', { ascending: false })
        .order('created_at', { ascending: false });

      if (estado) {
        query = query.eq('estado', estado);
      }

      if (ordenId) {
        query = query.eq('orden_id', ordenId);
      }

      if (fechaDesde) {
        query = query.gte('fecha_recepcion', fechaDesde);
      }

      if (fechaHasta) {
        query = query.lte('fecha_recepcion', fechaHasta);
      }

      if (search) {
        query = query.ilike('numero', `%${search}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw new BadRequestException(`Error al obtener recepciones: ${error.message}`);
      }

      const results = data || [];

      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.listar',
        status: 'SUCCESS',
        requestSummary: { estado, ordenId, fechaDesde, fechaHasta, search },
        responseSummary: { total: results.length },
        durationMs: Date.now() - startedAt,
      });

      return results;
    } catch (error) {
      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.listar',
        status: 'ERROR',
        requestSummary: filtros,
        errorMessage: error?.message ?? 'Error inesperado',
        durationMs: Date.now() - startedAt,
      });
      this.logger.error('❌ Error en obtenerRecepciones:', error);
      throw error;
    }
  }

  /**
   * Obtiene una recepción específica por ID
   */
  async obtenerRecepcionPorId(recepcionId: string, tenantId: string): Promise<any> {
    const startedAt = Date.now();
    try {
      this.logger.log(`📦 [Recepciones] Obteniendo recepción ${recepcionId}`);

      const { data, error } = await this.supabase.getClient()
        .from('recepciones')
        .select(`
          *,
          orden:ordenes_compra!recepciones_orden_id_fkey_runtime(
            id,
            numero,
            subtotal,
            igv,
            total,
            moneda,
            proveedor:proveedores(id, razon_social, ruc, documento_tipo, documento_numero, condiciones_pago, dias_credito)
          ),
          items:recepcion_items!recepcion_items_recepcion_id_fkey_runtime(
            *,
            producto:productos!recepcion_items_producto_id_fkey_runtime(id, codigo, nombre, sku),
            almacen:almacenes!fk_recepcion_items_almacen_id_v2(id, codigo, nombre),
            ubicacion:almacen_ubicaciones!fk_recepcion_items_ubicacion_id_v2(id, codigo, nombre),
            detalle:orden_compra_detalles!recepcion_items_detalle_id_fkey_runtime(
              id,
              descripcion,
              cantidad,
              cantidad_recibida,
              precio_unitario
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('id', recepcionId)
        .maybeSingle();

      if (error || !data) {
        if (error) {
          this.logger.error('❌ Error obteniendo recepción:', error);
        }
        throw new NotFoundException('Recepción no encontrada');
      }

      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.detalle',
        correlacionId: recepcionId,
        correlacionTipo: 'RECEPCION',
        status: 'SUCCESS',
        responseSummary: {
          numero: (data as any).numero,
          items: (data as any).items?.length ?? 0,
        },
        durationMs: Date.now() - startedAt,
      });

      this.logger.log(`✅ Recepción obtenida: ${(data as any).numero}`);
      const items = Array.isArray((data as any).items) ? (data as any).items : [];
      const normalizarDetalle = (devueltoPorItem = new Map<string, number>()) => ({
        ...(data as any),
        orden: (data as any).orden
          ? {
              ...(data as any).orden,
              proveedores: (data as any).orden.proveedor ?? (data as any).orden.proveedores,
            }
          : null,
        almacenes: items[0]?.almacen ?? null,
        ubicaciones: items[0]?.ubicacion ?? null,
        items: items.map((item: any) => {
          const cantidadRecibida = Number(item.cantidad_recibida || item.cantidad || 0);
          const cantidadDevuelta = devueltoPorItem.get(item.id) || 0;
          const calidadRaw = String(item.calidad || '').toUpperCase();
          const calidad = calidadRaw === 'CONFORME' ? 'OK' : calidadRaw;

          return {
            ...item,
            cantidad: cantidadRecibida,
            calidad,
            productos: item.producto ?? item.productos,
            observaciones: item.observaciones ?? item.metadata?.observaciones ?? null,
            cantidad_devuelta: cantidadDevuelta,
            cantidad_disponible_devolucion: Math.max(cantidadRecibida - cantidadDevuelta, 0),
          };
        }),
      });
      if (items.length === 0) {
        return normalizarDetalle();
      }

      const itemIds = items.map((item: any) => item.id).filter(Boolean);
      const { data: devolucionesPrevias, error: devolucionesPreviasError } = await this.supabase
        .getClient()
        .from('devolucion_items')
        .select(`
          recepcion_item_id,
          cantidad,
          devolucion:devoluciones_proveedor!inner(
            id,
            estado,
            tenant_id,
            recepcion_id
          )
        `)
        .in('recepcion_item_id', itemIds);

      if (devolucionesPreviasError) {
        this.logger.warn(
          `⚠️ No se pudo calcular disponibilidad de devolución para recepción ${recepcionId}: ${devolucionesPreviasError.message}`,
        );
        return normalizarDetalle();
      }

      const devueltoPorItem = new Map<string, number>();
      for (const row of devolucionesPrevias || []) {
        const devolucion = Array.isArray((row as any).devolucion)
          ? (row as any).devolucion[0]
          : (row as any).devolucion;

        if (
          devolucion?.tenant_id !== tenantId ||
          devolucion?.recepcion_id !== recepcionId ||
          devolucion?.estado === 'ANULADA'
        ) {
          continue;
        }

        const itemId = (row as any).recepcion_item_id;
        devueltoPorItem.set(itemId, (devueltoPorItem.get(itemId) || 0) + Number((row as any).cantidad || 0));
      }

      return normalizarDetalle(devueltoPorItem);
    } catch (error) {
      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.detalle',
        correlacionId: recepcionId,
        correlacionTipo: 'RECEPCION',
        status: 'ERROR',
        errorMessage: error?.message ?? 'Error inesperado',
        durationMs: Date.now() - startedAt,
      });
      this.logger.error('❌ Error en obtenerRecepcionPorId:', error);
      throw error;
    }
  }

  /**
   * Crea una nueva recepción en estado BORRADOR
   */
  async crearRecepcion(tenantId: string, dto: CreateRecepcionDto, userId?: string): Promise<any> {
    const startedAt = Date.now();
    try {
      this.logger.log(`📦 [Recepciones] Creando recepción para orden ${dto.orden_id}`);

      const items = dto.items.map((item) => ({
        detalle_id: item.detalle_id,
        cantidad_recibida: item.cantidad_recibida,
        calidad: item.calidad,
        almacen_id: item.almacen_id ?? dto.almacen_id ?? null,
        ubicacion_id: item.ubicacion_id ?? dto.ubicacion_id ?? null,
        lote: item.lote ?? dto.lote ?? null,
        serie: item.serie ?? null,
        fecha_expiracion: item.fecha_expiracion ?? null,
        observaciones: item.observaciones ?? null,
      }));

      const { data: rpcResult, error: rpcError } = await this.supabase.getClient()
        .rpc('crear_recepcion_tx', {
          p_tenant_id: tenantId,
          p_orden_id: dto.orden_id,
          p_items: items,
          p_observaciones: dto.observaciones ?? null,
          p_created_by: userId ?? null,
          p_idempotency_key: dto.idempotency_key,
        });

      if (rpcError) {
        throw new BadRequestException(`Error al crear recepción: ${rpcError.message}`);
      }

      const recepcion = rpcResult as any;
      const recepcionId = recepcion?.id ?? recepcion?.recepcion_id;
      if (!recepcionId) {
        throw new BadRequestException('La creación de recepción no devolvió una identidad válida');
      }

      this.logger.log(
        `✅ Recepción ${recepcion.idempotent ? 'reutilizada' : 'creada'}: ${recepcion.numero}`,
      );

      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.crear',
        correlacionId: recepcionId,
        correlacionTipo: 'RECEPCION',
        status: 'SUCCESS',
        requestSummary: { ordenId: dto.orden_id, items: dto.items?.length ?? 0 },
        responseSummary: { numero: recepcion.numero, idempotent: Boolean(recepcion.idempotent) },
        durationMs: Date.now() - startedAt,
      });

      return this.hidratarRecepcionPostCommit(recepcionId, tenantId, recepcion);
    } catch (error) {
      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.crear',
        correlacionId: dto?.orden_id ?? null,
        correlacionTipo: 'RECEPCION',
        status: 'ERROR',
        requestSummary: { ordenId: dto?.orden_id },
        errorMessage: error?.message ?? 'Error inesperado',
        durationMs: Date.now() - startedAt,
      });
      this.logger.error('❌ Error en crearRecepcion:', error);
      throw error;
    }
  }

  /**
   * Cierra una recepción y actualiza el inventario
   */
  async cerrarRecepcion(
    recepcionId: string,
    tenantId: string,
    dto: CerrarRecepcionDto,
    userId?: string
  ): Promise<any> {
    const startedAt = Date.now();
    try {
      this.logger.log(`📦 [Recepciones] Cerrando recepción ${recepcionId}`);

      // ATOMICIDAD (C-004): el cierre completo (entradas de stock por item +
      // cantidad_recibida en detalles + estado de OC + estado de recepción) se
      // ejecuta en una sola transacción vía RPC `cerrar_recepcion_tx`. Si algo
      // falla a mitad, ROLLBACK total — sin stock movido parcialmente.
      // La RPC usa el writer canónico del ledger y mantiene la idempotencia del
      // cierre, de sus movimientos y del evento durable.
      const observaciones = dto.observaciones ?? null;
      const { data: rpcResult, error: rpcError } = await this.supabase.getClient()
        .rpc('cerrar_recepcion_tx', {
          p_recepcion_id: recepcionId,
          p_tenant_id: tenantId,
          p_user_id: userId ?? null,
          p_observaciones: observaciones ?? null,
        });

      if (rpcError) {
        throw new BadRequestException(`Error al cerrar recepción: ${rpcError.message}`);
      }

      const movimientosCreados = ((rpcResult as any)?.movimientos ?? []) as Array<{
        movimiento_id: string;
        producto_id: string;
        almacen_id: string;
        cantidad: number;
      }>;

      const cierre = rpcResult as any;
      this.logger.log(
        `✅ Recepción ${cierre?.idempotent ? 'ya cerrada' : 'cerrada atómicamente'}: ` +
        `${cierre?.numero ?? recepcionId} (${movimientosCreados.length} movimientos)`,
      );

      if (!cierre?.idempotent && movimientosCreados.length > 0) {
        try {
          await this.cacheInvalidation?.onInventarioUpdated(tenantId);
        } catch (cacheError) {
          this.logger.warn('⚠️ [Recepciones] No se pudo invalidar caché post-cierre:', cacheError);
        }
      }

      if (!cierre?.idempotent) {
        const auditor = userId ?? 'system';
        try {
          await this.auditService.registrarCambio(
            'recepciones',
            'UPDATE',
            auditor,
            {
              old: { estado: 'BORRADOR' },
              new: { estado: 'CERRADA', observaciones },
            },
            tenantId,
            recepcionId,
            {
              accion: 'CERRAR_RECEPCION',
              orden_id: cierre?.orden_id ?? null,
            },
          );
        } catch (auditError) {
          this.logger.warn('⚠️ [Recepciones] No se pudo registrar auditoría de cierre:', auditError);
        }
      }

      // `cerrar_recepcion_tx` cambia el estado y el trigger 440 inserta
      // `recepcion.registrada` en el mismo commit. No se vuelve a persistir aquí:
      // el listener contable consume esa única fila durable con reintentos.

      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.cerrar',
        correlacionId: recepcionId,
        correlacionTipo: 'RECEPCION',
        status: 'SUCCESS',
        requestSummary: { observaciones },
        responseSummary: {
          numero: cierre?.numero,
          idempotent: Boolean(cierre?.idempotent),
          movimientos: movimientosCreados.length,
        },
        durationMs: Date.now() - startedAt,
      });

      return this.hidratarRecepcionPostCommit(recepcionId, tenantId, {
        id: recepcionId,
        tenant_id: tenantId,
        estado: 'CERRADA',
        ...cierre,
      });
    } catch (error) {
      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.cerrar',
        correlacionId: recepcionId,
        correlacionTipo: 'RECEPCION',
        status: 'ERROR',
        errorMessage: error?.message ?? 'Error inesperado',
        durationMs: Date.now() - startedAt,
      });
      this.logger.error('❌ Error en cerrarRecepcion:', error);
      throw error;
    }
  }

  private async hidratarRecepcionPostCommit(
    recepcionId: string,
    tenantId: string,
    fallback: Record<string, any>,
  ): Promise<any> {
    try {
      return await this.obtenerRecepcionPorId(recepcionId, tenantId);
    } catch (error) {
      // La mutación ya fue confirmada por PostgreSQL. Un fallo de lectura o de
      // join no debe inducir al cliente a reintentar como si el commit fallara.
      this.logger.warn(
        `⚠️ [Recepciones] Commit confirmado, pero no se pudo hidratar ${recepcionId}:`,
        error,
      );
      return { ...fallback, id: recepcionId, tenant_id: tenantId };
    }
  }

  /**
   * Actualiza una recepción en estado BORRADOR
   */
  async actualizarRecepcion(
    recepcionId: string,
    tenantId: string,
    dto: UpdateRecepcionDto,
    userId?: string
  ): Promise<any> {
    try {
      this.logger.log(`📦 [Recepciones] Actualizando recepción ${recepcionId}`);

      const recepcion = await this.obtenerRecepcionPorId(recepcionId, tenantId);

      if (recepcion.estado !== 'BORRADOR') {
        throw new BadRequestException('Solo se pueden actualizar recepciones en estado BORRADOR');
      }

      // Actualizar observaciones si se proporcionan
      if (dto.observaciones !== undefined) {
        const { data: updated, error: updateError } = await this.supabase.getClient()
          .from('recepciones')
          .update({
            observaciones: dto.observaciones,
            updated_at: new Date().toISOString(),
          })
          .eq('id', recepcionId)
          .eq('tenant_id', tenantId)
          .eq('estado', 'BORRADOR')
          .select('id')
          .maybeSingle();

        if (updateError) {
          throw new BadRequestException(`Error al actualizar recepción: ${updateError.message}`);
        }
        if (!updated) {
          throw new BadRequestException(
            'La recepción dejó de estar en BORRADOR antes de completar la actualización',
          );
        }
      }

      this.logger.log(`✅ Recepción actualizada: ${recepcionId}`);

      return this.obtenerRecepcionPorId(recepcionId, tenantId);
    } catch (error) {
      this.logger.error('❌ Error en actualizarRecepcion:', error);
      throw error;
    }
  }

}
