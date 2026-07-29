import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreateRecepcionDto, CerrarRecepcionDto } from '../dto';
import { EventBusService, RecepcionRegistradaEvent, CompraEntregadaEvent } from '../../../shared/events/event-bus.service';
import { EventEmitterService } from '../../../shared/events/event-emitter.service';
import { AuditService } from '../../audit/audit.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RecepcionesService {
  private readonly logger = new Logger(RecepcionesService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly eventEmitter: EventEmitterService,
    private readonly auditService: AuditService,
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
      if (items.length === 0) {
        return data;
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
        return data;
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

      return {
        ...(data as any),
        items: items.map((item: any) => {
          const cantidadRecibida = Number(item.cantidad_recibida || 0);
          const cantidadDevuelta = devueltoPorItem.get(item.id) || 0;
          const cantidadDisponible = Math.max(cantidadRecibida - cantidadDevuelta, 0);

          return {
            ...item,
            cantidad_devuelta: cantidadDevuelta,
            cantidad_disponible_devolucion: cantidadDisponible,
          };
        }),
      };
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

      // Validar que la orden existe y está en estado válido
      const { data: orden, error: ordenError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          detalles:orden_compra_detalles!fk_orden_compra_detalles_orden_id(*)
        `)
        .eq('tenant_id', tenantId)
        .eq('id', dto.orden_id)
        .single();

      if (ordenError || !orden) {
        throw new NotFoundException('Orden de compra no encontrada');
      }

      if (!['APROBADA', 'PARCIAL'].includes(orden.estado)) {
        throw new BadRequestException(
          `La orden debe estar en estado APROBADA o PARCIAL para recibir mercancía. Estado actual: ${orden.estado}`
        );
      }

      // Generar número de recepción
      const numero = await this.generarNumeroRecepcion(tenantId);

      // Validar TODOS los items ANTES de insertar el header (evitar header huérfano)
      const validatedItems: Array<{ item: any; detalle: any }> = [];
      for (const item of dto.items) {
        const detalle = orden.detalles.find(d => d.id === item.detalle_id);
        if (!detalle) {
          throw new BadRequestException(`Detalle ${item.detalle_id} no encontrado en la orden`);
        }

        const cantidadPendiente = Number(detalle.cantidad) - Number(detalle.cantidad_recibida || 0);
        if (item.cantidad_recibida > cantidadPendiente) {
          throw new BadRequestException(
            `La cantidad recibida (${item.cantidad_recibida}) excede la cantidad pendiente (${cantidadPendiente}) para el producto ${detalle.descripcion}`
          );
        }

        validatedItems.push({ item, detalle });
      }

      // Crear recepción (header) — solo después de validar todos los items
      const { data: recepcion, error: recepcionError } = await this.supabase.getClient()
        .from('recepciones')
        .insert({
          tenant_id: tenantId,
          numero,
          orden_id: dto.orden_id,
          fecha_recepcion: new Date().toISOString(),
          estado: 'BORRADOR',
          observaciones: dto.observaciones || null,
          created_by: userId || null,
        })
        .select()
        .single();

      if (recepcionError) {
        this.logger.error('❌ Error creando recepción:', recepcionError);
        throw new BadRequestException(`Error al crear recepción: ${recepcionError.message}`);
      }

      // Crear items de recepción (ya validados)
      const itemsToInsert = [];
      for (const { item, detalle } of validatedItems) {
        itemsToInsert.push({
          recepcion_id: recepcion.id,
          detalle_id: item.detalle_id,
          producto_id: detalle.producto_id,
          cantidad_recibida: item.cantidad_recibida,
          calidad: item.calidad,
          almacen_id: item.almacen_id || dto.almacen_id || null,
          ubicacion_id: item.ubicacion_id || dto.ubicacion_id || null,
          lote: item.lote || dto.lote || null,
          serie: item.serie || null,
          fecha_expiracion: item.fecha_expiracion || null,
          metadata: {
            observaciones: item.observaciones || null,
          },
        });
      }

      const { error: itemsError } = await this.supabase.getClient()
        .from('recepcion_items')
        .insert(itemsToInsert);

      if (itemsError) {
        this.logger.error('❌ Error creando items de recepción:', itemsError);
        // Rollback: eliminar la recepción creada
        await this.supabase.getClient()
          .from('recepciones')
          .delete()
          .eq('id', recepcion.id);
        throw new BadRequestException(`Error al crear items de recepción: ${itemsError.message}`);
      }

      this.logger.log(`✅ Recepción creada: ${recepcion.numero}`);

      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.crear',
        correlacionId: recepcion.id,
        correlacionTipo: 'RECEPCION',
        status: 'SUCCESS',
        requestSummary: { ordenId: dto.orden_id, items: dto.items?.length ?? 0 },
        responseSummary: { numero: recepcion.numero },
        durationMs: Date.now() - startedAt,
      });

      // Retornar recepción completa con items
      return this.obtenerRecepcionPorId(recepcion.id, tenantId);
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

      // Obtener recepción con todos sus datos
      const recepcion = await this.obtenerRecepcionPorId(recepcionId, tenantId);
      const estadoAnteriorRecepcion = recepcion.estado;

      if (recepcion.estado !== 'BORRADOR') {
        throw new BadRequestException('Solo se pueden cerrar recepciones en estado BORRADOR');
      }

      if (!recepcion.items || recepcion.items.length === 0) {
        throw new BadRequestException('La recepción debe tener al menos un item');
      }

      // ATOMICIDAD (C-004): el cierre completo (entradas de stock por item +
      // cantidad_recibida en detalles + estado de OC + estado de recepción) se
      // ejecuta en una sola transacción vía RPC `cerrar_recepcion_tx`. Si algo
      // falla a mitad, ROLLBACK total — sin stock movido parcialmente.
      // La RPC reusa `registrar_movimiento_almacen` y mantiene la idempotencia
      // (omite items con movimiento ENTRADA ya registrado para esta recepción).
      const observaciones = dto.observaciones || recepcion.observaciones;
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

      this.logger.log(`✅ Recepción cerrada atómicamente: ${recepcion.numero} (${movimientosCreados.length} movimientos)`);

      // Obtener orden completa (ya con estado actualizado por la RPC) para el evento canónico.
      const { data: orden, error: ordenError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          proveedor:proveedores(
            id,
            razon_social,
            ruc
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('id', recepcion.orden_id)
        .single();

      if (ordenError) {
        this.logger.error('⚠️ Error obteniendo orden para eventos:', ordenError);
        // No bloquear el cierre de recepción si falla obtener orden
      }

      // POST-COMMIT: re-emitir MovimientoStockEvent por cada entrada creada.
      // Preserva el asiento contable de entrada (Mercaderías/Cargas) que antes
      // emitía `registrarEntradaStockAtomico`. Ahora se publica DESPUÉS de que la
      // transacción quedó committeada (orden correcto para el patrón outbox).
      await this.emitirEventosMovimientoEntrada(movimientosCreados, recepcion, tenantId);

      const auditor = userId ?? 'system';
      try {
        await this.auditService.registrarCambio(
          'recepciones',
          'UPDATE',
          auditor,
          {
            old: { estado: estadoAnteriorRecepcion },
            new: { estado: 'CERRADA', observaciones },
          },
          tenantId,
          recepcionId,
          {
            accion: 'CERRAR_RECEPCION',
            orden_id: recepcion.orden_id,
          },
        );
      } catch (auditError) {
        this.logger.warn('⚠️ [Recepciones] No se pudo registrar auditoría de cierre:', auditError);
      }

      // Emitir evento canónico de recepción. Este outbox alimenta CxP,
      // inventario, SIRE y contabilidad; no se debe duplicar con CompraEntregada.
      await this.emitirEventoRecepcionRegistrada(recepcion, orden ?? null, tenantId);

      await this.registrarIntegrationLog({
        tenantId,
        operacion: 'recepciones.cerrar',
        correlacionId: recepcionId,
        correlacionTipo: 'RECEPCION',
        status: 'SUCCESS',
        requestSummary: { observaciones },
        responseSummary: { numero: recepcion.numero },
        durationMs: Date.now() - startedAt,
      });

      return this.obtenerRecepcionPorId(recepcionId, tenantId);
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

  /**
   * Actualiza el estado de la orden de compra según las cantidades recibidas
   */
  /**
   * Re-emite MovimientoStockEvent por cada entrada de stock creada por la RPC
   * `cerrar_recepcion_tx`. Preserva el asiento contable de entrada que antes
   * generaba `InventarioService.registrarEntradaStockAtomico`. Best-effort:
   * la data ya está committeada, un fallo aquí no revierte el cierre.
   */
  private async emitirEventosMovimientoEntrada(
    movimientos: Array<{ movimiento_id?: string; producto_id: string; almacen_id: string; cantidad: number }>,
    recepcion: any,
    tenantId: string,
  ): Promise<void> {
    for (const mov of movimientos) {
      try {
        const { data: producto } = await this.supabase.getClient()
          .from('productos')
          .select('stock_actual, precio_compra')
          .eq('id', mov.producto_id)
          .eq('tenant_id', tenantId)
          .single();

        if (!producto) {
          continue;
        }

        const cantidad = Number(mov.cantidad);
        const stockNuevo = Number((producto as any).stock_actual || 0);
        const stockAnterior = stockNuevo - cantidad;
        const precioCompra = Number((producto as any).precio_compra || 0);

        await this.eventBus.emitMovimientoStock(
          {
            movimientoId: mov.movimiento_id,
            productoId: mov.producto_id,
            tipoMovimiento: 'ENTRADA',
            cantidad,
            stockAnterior,
            stockNuevo,
            motivo: `Recepción ${recepcion.numero ?? ''}${recepcion.orden?.numero ? ` - OC ${recepcion.orden.numero}` : ''}`.trim(),
            valor: precioCompra * cantidad,
            ventaId: undefined,
            tenantId,
          },
          tenantId,
        );
      } catch (error) {
        this.logger.error(
          `❌ [Recepciones] Error emitiendo MovimientoStockEvent para producto ${mov.producto_id}:`,
          error,
        );
        // No bloquear: el cierre ya está committeado; el evento es best-effort.
      }
    }
  }


  /**
   * Genera el siguiente número de recepción
   */
  private async generarNumeroRecepcion(tenantId: string): Promise<string> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('recepciones')
        .select('numero')
        .eq('tenant_id', tenantId)
        .like('numero', 'REC-%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        this.logger.error('❌ Error generando número de recepción:', error);
      }

      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastNumber = data[0].numero;
        const match = lastNumber.match(/REC-\d{4}-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const year = new Date().getFullYear();
      return `REC-${year}-${nextNumber.toString().padStart(4, '0')}`;
    } catch (error) {
      this.logger.error('❌ Error en generarNumeroRecepcion:', error);
      // Fallback
      return `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    }
  }

  /**
   * Actualiza una recepción en estado BORRADOR
   */
  async actualizarRecepcion(
    recepcionId: string,
    tenantId: string,
    dto: Partial<CreateRecepcionDto>,
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
        const { error: updateError } = await this.supabase.getClient()
          .from('recepciones')
          .update({
            observaciones: dto.observaciones,
            updated_at: new Date().toISOString(),
          })
          .eq('id', recepcionId)
          .eq('tenant_id', tenantId);

        if (updateError) {
          throw new BadRequestException(`Error al actualizar recepción: ${updateError.message}`);
        }
      }

      this.logger.log(`✅ Recepción actualizada: ${recepcionId}`);

      return this.obtenerRecepcionPorId(recepcionId, tenantId);
    } catch (error) {
      this.logger.error('❌ Error en actualizarRecepcion:', error);
      throw error;
    }
  }

  /**
   * Emite el evento RecepcionRegistrada para integración con CxP y Contabilidad
   */
  private async emitirEventoRecepcionRegistrada(
    recepcion: any,
    orden: any | null,
    tenantId: string,
  ): Promise<void> {
    const eventId = uuidv4();
    const idempotencyKey = `recepcion:${tenantId}:${recepcion.id}`;

    try {
      this.logger.log(`📡 [Recepciones] Emitiendo RecepcionRegistrada (${recepcion.id})`);

      let ordenData = orden ?? recepcion.orden ?? null;

      if (!ordenData) {
        const { data: ordenFromDb } = await this.supabase
          .getClient()
          .from('ordenes_compra')
          .select(
            `
              *,
              proveedor:proveedores(
                id,
                razon_social,
                ruc,
                documento_tipo,
                documento_numero,
                condiciones_pago,
                dias_credito
              )
            `,
          )
          .eq('tenant_id', tenantId)
          .eq('id', recepcion.orden_id)
          .maybeSingle();
        ordenData = ordenFromDb;
      }

      if (!ordenData) {
        this.logger.warn('⚠️ [Recepciones] No se encontró orden asociada para el evento RecepcionRegistrada');
        return;
      }

      let proveedor = ordenData.proveedor ?? {};

      // El `orden` recibido del caller puede no traer el join del proveedor; sin sus
      // condiciones de crédito, la CxP se generaría como CONTADO (vence el mismo día)
      // aunque el proveedor sea CREDITO_30. Se completa consultando el proveedor.
      const proveedorId = proveedor.id ?? ordenData.proveedor_id ?? null;
      if (!proveedor.condiciones_pago && proveedorId) {
        const { data: provDb } = await this.supabase
          .getClient()
          .from('proveedores')
          .select('id, razon_social, ruc, condiciones_pago, dias_credito')
          .eq('tenant_id', tenantId)
          .eq('id', proveedorId)
          .maybeSingle();
        if (provDb) proveedor = { ...proveedor, ...provDb };
      }

      // HARDENING: garantizamos que cada item tenga metadata de la orden para costeo y contabilidad.
      const fallbackDetalleIds = (recepcion.items || []).map((item: any) => item.detalle_id).filter(Boolean);
      const detalleMap = new Map<string, any>();

      if (fallbackDetalleIds.length > 0) {
        const missing = fallbackDetalleIds.filter(
          (detalleId) =>
            !(recepcion.items || []).some(
              (item: any) => item.detalle_id === detalleId && item.detalle && item.detalle.precio_unitario !== undefined,
            ),
        );

        if (missing.length > 0) {
          const { data: detalles } = await this.supabase
            .getClient()
            .from('orden_compra_detalles')
            .select('id, descripcion, cantidad, cantidad_recibida, precio_unitario')
            .in('id', missing);
          (detalles || []).forEach((detalle: any) => {
            detalleMap.set(detalle.id, detalle);
          });
        }
      }

      const items = (recepcion.items || []).map((item: any) => {
        const detalle = item.detalle ?? detalleMap.get(item.detalle_id) ?? null;
        const precioUnitario = Number(detalle?.precio_unitario ?? 0);
        const total = this.round2(precioUnitario * Number(item.cantidad_recibida || 0));
        return {
          productoId: item.producto_id,
          descripcion: detalle?.descripcion ?? item.producto?.nombre ?? 'Producto',
          cantidadRecibida: Number(item.cantidad_recibida || 0),
          precioUnitario: this.round2(precioUnitario),
          total,
          calidad: item.calidad,
          lote: item.lote || null,
          serie: item.serie || null,
          ubicacionId: item.ubicacion_id || null,
        };
      });

      // Totales parciales según lo efectivamente recibido (ignorando ítems rechazados arriba)
      const subtotalParcial = items.reduce((sum: number, i: any) => sum + (i.total || 0), 0);
      const igvParcial = this.round2(Number(ordenData.igv ?? 0) > 0 ? subtotalParcial * 0.18 : 0); // usa IGV 18% solo si la orden usa IGV
      const totalParcial = this.round2(subtotalParcial + igvParcial);

      const eventData: RecepcionRegistradaEvent = {
        tenantId,
        eventId,
        idempotencyKey,
        recepcionId: recepcion.id,
        numeroRecepcion: recepcion.numero,
        ordenId: ordenData.id,
        numeroOrden: ordenData.numero,
        proveedorId: proveedor.id,
        proveedorNombre: proveedor.razon_social,
        proveedorRuc: proveedor.ruc ?? null,
        almacenId: recepcion.items?.[0]?.almacen_id ?? null,
        fechaRecepcion: recepcion.fecha_recepcion,
        subtotal: this.round2(Number(ordenData.subtotal ?? 0)),
        igv: this.round2(Number(ordenData.igv ?? 0)),
        total: this.round2(Number(ordenData.total ?? 0)),
        subtotalParcial,
        igvParcial,
        totalParcial,
        moneda: ordenData.moneda ?? 'PEN',
        // Las condiciones pactadas en la ORDEN mandan sobre las del proveedor:
        // una OC CREDITO_30 no debe generar una CxP que vence el mismo día
        // solo porque el proveedor tiene CONTADO por defecto.
        diasCredito: this.resolverDiasCredito(ordenData.dias_credito, proveedor.dias_credito),
        condicionesPago: ordenData.condiciones_pago ?? proveedor.condiciones_pago ?? null,
        greProveedor: recepcion.gre_proveedor ?? null,
        items,
        emittedAt: new Date().toISOString(),
      };

      // Persistir en outbox (fuente de verdad) e igualmente emitir en caliente para compatibilidad
      try {
        await this.eventEmitter.emit({
          tenantId,
          eventType: 'recepcion.registrada',
          aggregateType: 'recepcion',
          aggregateId: recepcion.id,
          eventData: { ...eventData, idempotency_key: idempotencyKey },
          correlationId: idempotencyKey,
          idempotencyKey,
          eventId,
        });
        this.logger.log(`✅ [Recepciones] Evento recepcion.registrada guardado en outbox (${eventId})`);
      } catch (emitError) {
        this.logger.error('❌ [Recepciones] Error guardando outbox recepcion.registrada:', emitError);
      }

      // Emitimos en caliente para consumidores actuales (se puede retirar cuando todos lean outbox)
      this.eventBus.emitRecepcionRegistrada(eventData);
      this.logger.log(`✅ Evento RecepcionRegistrada emitido (${eventId})`);
    } catch (error) {
      this.logger.error('❌ Error emitiendo evento RecepcionRegistrada:', error);
    }
  }

  /**
   * 🔴 CRÍTICO FIX: Emite evento CompraEntregadaEvent para contabilidad
   * Se llama cuando se cierra una recepción para generar asientos contables automáticos
   */
  private async emitirEventoCompraEntregada(
    recepcion: any,
    orden: any,
    tenantId: string
  ): Promise<void> {
    try {
      const eventId = uuidv4();
      const idempotencyKey = `compra:${tenantId}:${orden.id}:${recepcion.id}`;

      // HARDENING: construimos payload enriquecido para contabilidad/inventario.
      const itemsWithPrices = [];
      for (const item of recepcion.items || []) {
        const detalle = item.detalle ?? null;
        let detalleOrden = detalle;

        if (!detalleOrden) {
          const { data: detalleFromDb } = await this.supabase
            .getClient()
            .from('orden_compra_detalles')
            .select('descripcion, precio_unitario')
            .eq('id', item.detalle_id)
            .maybeSingle();
          detalleOrden = detalleFromDb ?? null;
        }

        const precioUnitario = Number(detalleOrden?.precio_unitario ?? 0);
        itemsWithPrices.push({
          productoId: item.producto_id,
          descripcion: detalleOrden?.descripcion ?? item.producto?.nombre ?? 'Producto',
          cantidad: Number(item.cantidad_recibida || 0),
          precioUnitario: this.round2(precioUnitario),
          total: this.round2(precioUnitario * Number(item.cantidad_recibida || 0)),
          calidad: item.calidad,
          lote: item.lote ?? null,
          serie: item.serie ?? null,
          ubicacionId: item.ubicacion_id ?? null,
          recepcionId: recepcion.id,
        });
      }

      const proveedor = orden.proveedor ?? {};
      const eventData: CompraEntregadaEvent = {
        tenantId,
        eventId,
        idempotencyKey,
        ordenId: orden.id,
        numeroOrden: orden.numero,
        proveedorId: proveedor.id ?? orden.proveedor_id,
        proveedorNombre: proveedor.razon_social ?? 'Proveedor',
        proveedorRuc: proveedor.ruc ?? null,
        fechaEntrega: recepcion.fecha_recepcion,
        subtotal: this.round2(Number(orden.subtotal ?? 0)),
        igv: this.round2(Number(orden.igv ?? 0)),
        total: this.round2(Number(orden.total ?? 0)),
        moneda: orden.moneda ?? 'PEN',
        // Prevalecen las condiciones pactadas en la orden (ver evento recepcion.registrada).
        diasCredito: this.resolverDiasCredito(orden.dias_credito, proveedor.dias_credito),
        condicionesPago: orden.condiciones_pago ?? proveedor.condiciones_pago ?? null,
        almacenId: recepcion.items?.[0]?.almacen_id ?? null,
        observaciones: recepcion.observaciones ?? null,
        inventarioAplicado: true,
        items: itemsWithPrices,
        emittedAt: new Date().toISOString(),
      };

      await this.eventBus.emitCompraEntregada(eventData);
      this.logger.log(`✅ Evento CompraEntregadaEvent emitido para orden ${orden.numero}`);
    } catch (error) {
      this.logger.error('❌ Error emitiendo evento CompraEntregadaEvent', error as Error);
      // No lanzamos el error para no bloquear el cierre de la recepción
      // El outbox pattern garantizará que el evento se procese luego
    }
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Dias de credito aplicables a la cuenta por pagar.
   *
   * La orden solo manda si realmente pacto un plazo. El formulario no pide el
   * dato, asi que las ordenes nacen con 0 y el operador ?? no cae con 0: ese
   * cero pisaba los dias negociados con el proveedor y la deuda vencia el mismo
   * dia de emitirse, apareciendo como vencida desde el primer momento.
   */
  private resolverDiasCredito(
    diasOrden: unknown,
    diasProveedor: unknown,
  ): number | null {
    const dias = Number(diasOrden);
    if (Number.isFinite(dias) && dias > 0) return dias;

    const delProveedor = Number(diasProveedor);
    return Number.isFinite(delProveedor) && delProveedor > 0 ? delProveedor : null;
  }
}
