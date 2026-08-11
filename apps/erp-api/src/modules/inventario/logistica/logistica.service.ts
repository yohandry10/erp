import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType, NotificationSeverity } from '../../notifications/notification.types';
import { AuditService } from '../../audit/audit.service';
import { PedidoLockService } from '../../../shared/locks/pedido-lock.service';
import { EstadoPedido } from '../../ventas/pedidos/entities';
import {
  PrepararPedidoDto,
  ConfirmarDespachoDto,
  ActualizarTrackingDto,
  RegistrarEventoLogisticoDto,
  TipoEventoLogisticoManual,
  ReprogramarBackorderDto,
} from './dto';

interface ConfigLogistica {
  usar_flujo_logistica: boolean;
  habilitar_multialmacen: boolean;
  requiere_ubicaciones_inventario: boolean;
  requiere_lotes_series: boolean;
  objetivo_otif?: number | null;
  habilitar_dashboards_otif?: boolean;
}

@Injectable()
export class LogisticaService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    private readonly pedidoLockService: PedidoLockService,
  ) {}

  /**
   * Obtiene las órdenes pendientes de preparación (pedidos confirmados)
   */
  async getOrdenesPendientes(tenantId: string): Promise<any[]> {
    const client = this.supabase.getClient();

    const config = await this.obtenerConfiguracion(tenantId);
    if (!config.usar_flujo_logistica) {
      return [];
    }

    const { data: pedidos, error } = await client
      .from('pedidos_venta')
      .select(`
        id,
        numero,
        fecha_pedido,
        cliente_id,
        clientes:clientes!pedidos_venta_cliente_id_fkey(id, razon_social, numero_documento),
        estado,
        total,
        created_at
      `)
      .eq('tenant_id', tenantId)
      .in('estado', [EstadoPedido.CONFIRMADO, EstadoPedido.DESPACHO_PARCIAL])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching ordenes pendientes:', error);
      throw new BadRequestException('Error al obtener órdenes pendientes');
    }

    const pedidosConItems = await Promise.all(
      (pedidos || []).map(async (pedido) => {
        const { data: detalle, error: detalleError } = await client
          .from('pedidos_venta_detalle')
          .select('id, producto_id, descripcion, cantidad')
          .eq('pedido_id', pedido.id);

        if (detalleError) {
          console.error('Error fetching pedido detalle:', detalleError);
          return {
            ...pedido,
            cantidad_items: 0,
            items: [],
          };
        }

        return {
          ...pedido,
          cantidad_items:
            (detalle || []).reduce((sum, d) => sum + Number(d.cantidad || 0), 0),
          items: detalle || [],
        };
      }),
    );

    const pedidosNormalizados = pedidosConItems.map((pedido) => {
      const clienteInfo = (pedido as any).clientes ?? (pedido as any).cliente ?? null;
      return {
        ...pedido,
        fecha: (pedido as any).fecha ?? (pedido as any).fecha_pedido ?? pedido.created_at,
        cliente: clienteInfo,
        detalle: (pedido as any).detalle ?? pedido.items ?? [],
      };
    });

    console.log(`✅ [LogisticaService] Órdenes pendientes obtenidas: ${pedidosNormalizados.length}`);

    return pedidosNormalizados;
  }

  /**
   * Obtiene las órdenes listas para despacho (estado LISTO_DESPACHO)
   */
  async getOrdenesListasDespacho(tenantId: string): Promise<any[]> {
    const client = this.supabase.getClient();

    const config = await this.obtenerConfiguracion(tenantId);
    if (!config.usar_flujo_logistica) {
      return [];
    }

    const { data: pedidos, error } = await client
      .from('pedidos_venta')
      .select(`
        id,
        numero,
        fecha_pedido,
        cliente_id,
        clientes:clientes!pedidos_venta_cliente_id_fkey(id, razon_social, numero_documento),
        estado,
        total,
        created_at
      `)
      .eq('tenant_id', tenantId)
      .in('estado', [EstadoPedido.LISTO_DESPACHO, EstadoPedido.DESPACHO_PARCIAL])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching órdenes listas despacho:', error);
      throw new BadRequestException('Error al obtener órdenes listas para despacho');
    }

    const pedidosConItems = await Promise.all(
      (pedidos || []).map(async (pedido) => {
        const { data: detalle, error: detalleError } = await client
          .from('pedidos_venta_detalle')
          .select('id, producto_id, descripcion, cantidad')
          .eq('pedido_id', pedido.id);

        if (detalleError) {
          console.error('Error fetching pedido detalle:', detalleError);
          return {
            ...pedido,
            cantidad_items: 0,
            items: [],
          };
        }

        return {
          ...pedido,
          cantidad_items: detalle?.length || 0,
          items: detalle || [],
        };
      }),
    );

    const pedidosNormalizados = pedidosConItems.map((pedido) => {
      const clienteInfo = (pedido as any).clientes ?? (pedido as any).cliente ?? null;
      return {
        ...pedido,
        fecha: (pedido as any).fecha ?? (pedido as any).fecha_pedido ?? pedido.created_at,
        cliente: clienteInfo,
        detalle: (pedido as any).detalle ?? pedido.items ?? [],
      };
    });

    console.log(`✅ [LogisticaService] Órdenes listas para despacho: ${pedidosNormalizados.length}`);
    return pedidosNormalizados;
  }

  /**
   * Inicia la preparación de un pedido (estado EN_PREPARACION)
   */
  async prepararPedido(
    pedidoId: string,
    tenantId: string,
    dto: PrepararPedidoDto,
    userId?: string,
  ): Promise<{ success: boolean }> {
    const config = await this.obtenerConfiguracion(tenantId);

    if (!config.usar_flujo_logistica) {
      throw new BadRequestException('El flujo logístico no está habilitado para este tenant');
    }

    return this.pedidoLockService.runWithLock(tenantId, pedidoId, async () => {
      const client = this.supabase.getClient();
      const pedido = await this.obtenerPedidoBasico(pedidoId, tenantId);

      if (![EstadoPedido.CONFIRMADO, EstadoPedido.DESPACHO_PARCIAL].includes(pedido.estado as EstadoPedido)) {
        throw new BadRequestException(`No se puede preparar un pedido en estado ${pedido.estado}`);
      }

      const timestamp = new Date().toISOString();

      const { error: updateError } = await client
        .from('pedidos_venta')
        .update({
          estado: EstadoPedido.EN_PREPARACION,
          tracking_estado: 'EN_PREPARACION',
          tracking_actualizado_en: timestamp,
          tracking_notas: dto.notas ?? null,
          updated_at: timestamp,
        })
        .eq('id', pedidoId)
        .eq('tenant_id', tenantId);

      if (updateError) {
        console.error('Error updating pedido estado:', updateError);
        throw new BadRequestException('Error al cambiar estado del pedido');
      }

      if (dto.notas) {
        const notasActualizadas = await this.concatenarNotas(
          pedidoId,
          tenantId,
          `[PREPARACIÓN] ${dto.notas}`,
        );

        await client
          .from('pedidos_venta')
          .update({ notas: notasActualizadas })
          .eq('id', pedidoId)
          .eq('tenant_id', tenantId);
      }

      await this.registrarEventoLogistico(tenantId, pedidoId, 'PICKING', {
        notas: dto.notas ?? null,
        responsable: dto.responsable ?? null,
        ubicacion: dto.ubicacion ?? null,
        items_preparados: dto.items_preparados ?? [],
      }, userId);

      await this.registrarAuditoria(pedidoId, tenantId, userId, {
        estado: EstadoPedido.EN_PREPARACION,
        tracking_estado: 'EN_PREPARACION',
      }, 'preparar_pedido');

      await this.enviarNotificacion(tenantId, {
        type: 'PEDIDO_EN_PREPARACION',
        severity: 'INFO',
        title: 'Pedido en preparación',
        message: `El pedido ${pedido.numero} está siendo preparado en almacén`,
        usuario_id: userId,
      });

      console.log(`✅ [LogisticaService] Pedido ${pedidoId} en preparación`);

      return { success: true };
    });
  }

  /**
   * Marca un pedido como listo para despacho (LISTO_DESPACHO)
   */
  async marcarListoDespacho(
    pedidoId: string,
    tenantId: string,
    userId?: string,
  ): Promise<{ success: boolean }> {
    const client = this.supabase.getClient();
    const config = await this.obtenerConfiguracion(tenantId);

    if (!config.usar_flujo_logistica) {
      throw new BadRequestException('El flujo logístico no está habilitado para este tenant');
    }

    const pedido = await this.obtenerPedidoBasico(pedidoId, tenantId);

    if (![EstadoPedido.EN_PREPARACION, EstadoPedido.DESPACHO_PARCIAL].includes(pedido.estado as EstadoPedido)) {
      throw new BadRequestException(`No se puede marcar como listo un pedido en estado ${pedido.estado}`);
    }

    const timestamp = new Date().toISOString();

    const { error: updateError } = await client
      .from('pedidos_venta')
      .update({
        estado: EstadoPedido.LISTO_DESPACHO,
        tracking_estado: 'LISTO_DESPACHO',
        tracking_actualizado_en: timestamp,
        updated_at: timestamp,
      })
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error updating pedido estado:', updateError);
      throw new BadRequestException('Error al cambiar estado del pedido');
    }

    await this.registrarEventoLogistico(tenantId, pedidoId, 'PACKING', {}, userId);

    await this.registrarAuditoria(pedidoId, tenantId, userId, {
      estado: EstadoPedido.LISTO_DESPACHO,
      tracking_estado: 'LISTO_DESPACHO',
    }, 'marcar_listo_despacho');

    await this.enviarNotificacion(tenantId, {
      type: 'PEDIDO_LISTO_DESPACHO',
      severity: 'INFO',
      title: 'Pedido listo para despacho',
      message: `El pedido ${pedido.numero} está listo para ser despachado`,
      usuario_id: userId,
    });

    console.log(`✅ [LogisticaService] Pedido ${pedidoId} listo para despacho`);

    return { success: true };
  }

  /**
   * Confirma el despacho del pedido. Descuenta stock y lo deja listo para facturar.
   */
  async confirmarDespacho(
    pedidoId: string,
    tenantId: string,
    dto: ConfirmarDespachoDto,
    userId?: string,
  ): Promise<{ success: boolean; data: Record<string, any> }> {
    if (!userId) {
      throw new BadRequestException('No se pudo determinar el actor del despacho');
    }

    return this.pedidoLockService.runWithLock(tenantId, pedidoId, async () => {
      // Se consulta antes del commit únicamente para mensajes de auditoría. La
      // RPC vuelve a validar y bloquear el pedido como autoridad transaccional.
      const pedido = await this.obtenerPedidoBasico(pedidoId, tenantId);
      const items = (dto.items_despachados ?? []).map((item) => ({
        detalle_id: item.detalle_id,
        cantidad: item.cantidad,
        almacen_id: item.almacen_id,
        ubicacion_id: item.ubicacion_id,
        lote: item.lote,
      }));
      const datosLogisticos = {
        almacen_id: dto.almacen_id,
        ubicacion_id: dto.ubicacion_id,
        lote: dto.lote,
        bultos: dto.bultos,
        peso_total: dto.peso_total,
        volumen_total: dto.volumen_total,
        transportista: dto.transportista,
        placa: dto.placa,
        conductor: dto.conductor,
      };

      const { data, error } = await this.supabase.getClient().rpc(
        'despachar_pedido_parcial_tx',
        {
          p_pedido_id: pedidoId,
          p_tenant_id: tenantId,
          p_idempotency_key: dto.idempotency_key,
          p_items: items,
          p_notas: dto.notas ?? null,
          p_registrado_por: userId,
          p_datos_logisticos: datosLogisticos,
        },
      );

      if (error || !data) {
        console.error('Error en despacho atómico:', error);
        throw new BadRequestException(
          error?.message || 'No se pudo confirmar el despacho',
        );
      }

      const resultado = data as Record<string, any>;
      const nuevoEstado = String(resultado.estado ?? EstadoPedido.DESPACHO_PARCIAL);
      const tipoNotificacion = nuevoEstado === EstadoPedido.LISTO_FACTURAR
        ? NotificationType.PEDIDO_LISTO_FACTURAR
        : NotificationType.PEDIDO_DESPACHO_PARCIAL;

      // Auditoría y notificación no son proyecciones financieras. Un fallo
      // posterior al commit no debe convertir un despacho confirmado en 500.
      await Promise.allSettled([
        this.registrarAuditoria(
          pedidoId,
          tenantId,
          userId,
          { estado: nuevoEstado, tracking_estado: 'EN_TRANSITO' },
          'confirmar_despacho',
        ),
        this.enviarNotificacion(tenantId, {
          type: tipoNotificacion,
          severity: nuevoEstado === EstadoPedido.LISTO_FACTURAR
            ? NotificationSeverity.INFO
            : NotificationSeverity.WARNING,
          title: nuevoEstado === EstadoPedido.LISTO_FACTURAR
            ? 'Pedido listo para facturar'
            : 'Pedido con despacho parcial',
          message: nuevoEstado === EstadoPedido.LISTO_FACTURAR
            ? `El pedido ${pedido.numero} fue despachado en su totalidad`
            : `El pedido ${pedido.numero} tiene unidades pendientes de despacho`,
          usuario_id: userId,
        }),
      ]);

      return { success: true, data: resultado };
    });
  }

  /**
   * Actualiza el tracking del pedido (EN_TRANSITO / ENTREGADO / INCIDENCIA)
   */
  async actualizarTracking(
    pedidoId: string,
    tenantId: string,
    dto: ActualizarTrackingDto,
    userId?: string,
  ): Promise<{ success: boolean }> {
    const client = this.supabase.getClient();

    const pedido = await this.obtenerPedidoBasico(pedidoId, tenantId);

    const timestamp = new Date().toISOString();

    const updateData: Record<string, any> = {
      tracking_estado: dto.estado,
      tracking_actualizado_en: timestamp,
      tracking_notas: dto.notas ?? null,
      updated_at: timestamp,
    };

    // Si el tracking marca ENTREGADO y el pedido ya está facturado, lo cerramos como COMPLETADO
    if (dto.estado === 'ENTREGADO' && pedido.estado === EstadoPedido.FACTURADO) {
      updateData.estado = EstadoPedido.COMPLETADO;
    }

    const { error: updateError } = await client
      .from('pedidos_venta')
      .update(updateData)
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error updating tracking:', updateError);
      throw new BadRequestException('No se pudo actualizar el tracking del pedido');
    }

    const tipoEvento =
      dto.estado === 'ENTREGADO' ? 'ENTREGA'
      : dto.estado === 'INCIDENCIA' ? 'TRANSITO'
      : 'TRANSITO';

    await this.registrarEventoLogistico(tenantId, pedidoId, tipoEvento, {
      estado: dto.estado,
      notas: dto.notas ?? null,
    }, userId);

    await this.registrarAuditoria(pedidoId, tenantId, userId, {
      tracking_estado: dto.estado,
      estado: updateData.estado ?? pedido.estado,
    }, 'actualizar_tracking');

    if (dto.estado === 'ENTREGADO') {
      await this.enviarNotificacion(tenantId, {
        type: 'PEDIDO_ENTREGADO',
        severity: 'SUCCESS',
        title: 'Pedido entregado',
        message: `El pedido ${pedido.numero} fue entregado al cliente`,
        usuario_id: userId,
      });
    }

    return { success: true };
  }

  /**
   * Obtener timeline de eventos logísticos registrados
   */
  async obtenerEventosLogisticos(
    pedidoId: string,
    tenantId: string,
  ): Promise<any[]> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('logistica_eventos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('pedido_id', pedidoId)
      .order('registrado_en', { ascending: false });

    if (error) {
      console.error('Error obteniendo eventos logísticos:', error);
      throw new BadRequestException('No se pudieron obtener los eventos logísticos del pedido');
    }

    return data || [];
  }

  /**
   * Registrar evento manual de logística (picking/packing/tracking adicional)
   */
  async registrarEventoManual(
    pedidoId: string,
    tenantId: string,
    dto: RegistrarEventoLogisticoDto,
    userId?: string,
  ): Promise<{ success: boolean }> {
    const client = this.supabase.getClient();

    const pedido = await this.obtenerPedidoBasico(pedidoId, tenantId);

    const payload = {
      notas: dto.notas ?? null,
      bultos: dto.bultos ?? null,
      peso_total: dto.peso_total ?? null,
      volumen_total: dto.volumen_total ?? null,
      transportista: dto.transportista ?? null,
      placa: dto.placa ?? null,
      conductor: dto.conductor ?? null,
      responsable: dto.responsable ?? null,
      ubicacion: dto.ubicacion ?? null,
      estado: dto.estado ?? null,
      ...(dto.datos_extra ?? {}),
    };

    await this.registrarEventoLogistico(tenantId, pedidoId, dto.tipo, payload, userId);

    // Actualizar tracking si aplica
    if (dto.tipo === TipoEventoLogisticoManual.ENTREGA) {
      const update: Record<string, any> = {
        tracking_estado: 'ENTREGADO',
        tracking_actualizado_en: new Date().toISOString(),
        tracking_notas: dto.notas ?? null,
        updated_at: new Date().toISOString(),
      };

      if (pedido.estado === EstadoPedido.FACTURADO) {
        update.estado = EstadoPedido.COMPLETADO;
      }

      await client
        .from('pedidos_venta')
        .update(update)
        .eq('id', pedidoId)
        .eq('tenant_id', tenantId);
    } else if (dto.estado) {
      await client
        .from('pedidos_venta')
        .update({
          tracking_estado: dto.estado,
          tracking_actualizado_en: new Date().toISOString(),
          tracking_notas: dto.notas ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pedidoId)
        .eq('tenant_id', tenantId);
    }

    await this.registrarAuditoria(
      pedidoId,
      tenantId,
      userId,
      {
        tracking_estado: dto.estado ?? undefined,
      },
      'registrar_evento_logistico_manual',
    );

    return { success: true };
  }

  /**
   * Obtiene el detalle de backorders pendientes para un pedido
   */
  async obtenerBackorders(
    pedidoId: string,
    tenantId: string,
  ): Promise<Array<Record<string, any>>> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('pedido_backorders')
      .select(`
        id,
        pedido_id,
        detalle_id,
        producto_id,
        cantidad_comprometida,
        cantidad_despachada,
        cantidad_pendiente,
        estado,
        notas,
        proxima_fecha_compromiso,
        ultimo_compromiso_en,
        prioridad,
        created_at,
        updated_at,
        detalle:pedidos_venta_detalle (
          descripcion,
          cantidad,
          cantidad_despachada
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('pedido_id', pedidoId)
      .order('proxima_fecha_compromiso', { ascending: true, nullsFirst: true })
      .order('prioridad', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error obteniendo backorders:', error);
      throw new BadRequestException('No se pudieron obtener los backorders del pedido');
    }

    return (data || []).map((item) => ({
      id: item.id,
      detalle_id: item.detalle_id,
      producto_id: item.producto_id,
      cantidad_comprometida: Number(item.cantidad_comprometida ?? 0),
      cantidad_despachada: Number(item.cantidad_despachada ?? 0),
      cantidad_pendiente: Number(item.cantidad_pendiente ?? 0),
      estado: item.estado,
      notas: item.notas ?? null,
      prioridad: item.prioridad ?? 3,
      proxima_fecha_compromiso: item.proxima_fecha_compromiso ?? null,
      ultimo_compromiso_en: item.ultimo_compromiso_en ?? null,
      descripcion: (item.detalle as any)?.descripcion ?? null,
      cantidad_total: Number((item.detalle as any)?.cantidad ?? 0),
      cantidad_despachada_total: Number((item.detalle as any)?.cantidad_despachada ?? 0),
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
  }

  /**
   * Reprograma un backorder con nueva fecha comprometida y prioridad
   */
  async reprogramarBackorder(
    pedidoId: string,
    detalleId: string,
    tenantId: string,
    dto: ReprogramarBackorderDto,
    userId?: string,
  ): Promise<{ success: boolean; data: Array<Record<string, any>> }> {
    return this.pedidoLockService.runWithLock(tenantId, pedidoId, async () => {
      const client = this.supabase.getClient();

      const { data: backorder, error } = await client
        .from('pedido_backorders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('pedido_id', pedidoId)
        .eq('detalle_id', detalleId)
        .single();

      if (error || !backorder) {
        throw new NotFoundException('Backorder no encontrado para el detalle indicado');
      }

      const prioridad = dto.prioridad ?? backorder.prioridad ?? 3;
      const timestamp = new Date().toISOString();
      const notas = this.buildBackorderNota(
        backorder.notas ?? null,
        dto.nota,
        dto.proxima_fecha_compromiso,
        userId,
      );

      const { error: updateError } = await client
        .from('pedido_backorders')
        .update({
          proxima_fecha_compromiso: dto.proxima_fecha_compromiso,
          prioridad,
          notas,
          ultimo_compromiso_en: timestamp,
          updated_at: timestamp,
        })
        .eq('id', backorder.id)
        .eq('tenant_id', tenantId);

      if (updateError) {
        console.error('Error actualizando backorder:', updateError);
        throw new BadRequestException('No se pudo reprogramar el backorder');
      }

      await this.registrarEventoLogistico(
        tenantId,
        pedidoId,
        'BACKORDER',
        {
          detalle_id: detalleId,
          proxima_fecha: dto.proxima_fecha_compromiso,
          prioridad,
          notas: dto.nota ?? null,
        },
        userId,
      );

      await this.enviarNotificacion(tenantId, {
        type: NotificationType.BACKORDER_REPROGRAMADO,
        severity: NotificationSeverity.WARNING,
        title: 'Backorder reprogramado',
        message: `Se reagendó la entrega pendiente del detalle ${detalleId} para el ${dto.proxima_fecha_compromiso}.`,
        usuario_id: userId ?? null,
      });

      const listadoActualizado = await this.obtenerBackorders(pedidoId, tenantId);

      return {
        success: true,
        data: listadoActualizado,
      };
    });
  }

  // =====================================================
  // Helpers
  // =====================================================

  private async obtenerConfiguracion(tenantId: string): Promise<ConfigLogistica> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('empresa_config')
      .select(
        'usar_flujo_logistica, habilitar_multialmacen, requiere_ubicaciones_inventario, requiere_lotes_series, objetivo_otif, habilitar_dashboards_otif',
      )
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      console.error('Error obteniendo configuración de logística:', error);
      throw new BadRequestException('No se pudo obtener configuración logística');
    }

    if (!data) {
      throw new BadRequestException('No se encontró configuración logística para el tenant');
    }

    return {
      usar_flujo_logistica: Boolean(data.usar_flujo_logistica),
      habilitar_multialmacen: Boolean(data.habilitar_multialmacen),
      requiere_ubicaciones_inventario: Boolean(data.requiere_ubicaciones_inventario),
      requiere_lotes_series: Boolean(data.requiere_lotes_series),
      objetivo_otif: data.objetivo_otif ?? null,
      habilitar_dashboards_otif: Boolean(data.habilitar_dashboards_otif),
    };
  }

  private async obtenerPedidoBasico(pedidoId: string, tenantId: string) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('pedidos_venta')
      .select('id, numero, estado')
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Pedido no encontrado');
    }

    return data;
  }

  private async registrarEventoLogistico(
    tenantId: string,
    pedidoId: string,
    tipo: 'PICKING' | 'PACKING' | 'DESPACHO' | 'TRANSITO' | 'ENTREGA' | 'BACKORDER',
    datos: Record<string, any>,
    userId?: string,
  ): Promise<void> {
    const client = this.supabase.getClient();

    const { error } = await client
      .from('logistica_eventos')
      .insert({
        tenant_id: tenantId,
        pedido_id: pedidoId,
        tipo,
        datos: datos ?? {},
        registrado_por: userId ?? null,
      });

    if (error) {
      console.error(`Error registrando evento logístico ${tipo}:`, error);
    }
  }

  private async registrarAuditoria(
    pedidoId: string,
    tenantId: string,
    userId: string | undefined,
    newValues: Record<string, any>,
    action: string,
  ): Promise<void> {
    try {
      await this.auditService.logAction({
        table_name: 'pedidos_venta',
        operation: 'UPDATE',
        record_id: pedidoId,
        tenant_id: tenantId,
        user_id: userId ?? undefined,
        new_values: newValues,
        metadata: { action },
      });
    } catch (error) {
      console.warn(`⚠️ No se pudo registrar auditoría ${action}`, error);
    }
  }

  private async enviarNotificacion(
    tenantId: string,
    payload: {
      type: any;
      severity: any;
      title: string;
      message: string;
      usuario_id?: string;
    },
  ): Promise<void> {
    try {
      await this.notificationsService.createNotification(tenantId, payload);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  private buildBackorderNota(
    notasActuales: string | null,
    notaNueva: string | undefined,
    proximaFecha: string,
    userId?: string,
  ): string {
    const encabezado = `[${new Date().toISOString()}] ${userId ?? 'sistema'} -> Reprogramado al ${proximaFecha}`;
    const cuerpo = notaNueva ? ` ${notaNueva.trim()}` : '';
    const nuevaLinea = `${encabezado}${cuerpo}`.trim();

    if (!notasActuales || notasActuales.length === 0) {
      return nuevaLinea;
    }

    return `${notasActuales}\n${nuevaLinea}`;
  }

  private async concatenarNotas(pedidoId: string, tenantId: string, nuevaNota: string): Promise<string> {
    const client = this.supabase.getClient();
    const { data } = await client
      .from('pedidos_venta')
      .select('notas')
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId)
      .single();

    if (data?.notas) {
      return `${data.notas}\n\n${nuevaNota}`;
    }
    return nuevaNota;
  }

}
