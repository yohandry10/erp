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
      .in('estado', [EstadoPedido.CONFIRMADO, EstadoPedido.EN_PREPARACION, EstadoPedido.DESPACHO_PARCIAL])
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
          .eq('pedido_id', pedido.id)
          .eq('tenant_id', tenantId);

        if (detalleError) {
          console.error('Error fetching pedido detalle:', detalleError);
          throw new BadRequestException('No se pudieron cargar las líneas del pedido; vuelve a intentarlo');
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
          .eq('pedido_id', pedido.id)
          .eq('tenant_id', tenantId);

        if (detalleError) {
          console.error('Error fetching pedido detalle:', detalleError);
          throw new BadRequestException('No se pudieron cargar las líneas del pedido; vuelve a intentarlo');
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
  async prepararPedido(pedidoId: string, tenantId: string, dto: PrepararPedidoDto, userId?: string) {
    return this.operarLogistica(pedidoId, tenantId, 'PREPARAR', dto, userId);
  }

  async marcarListoDespacho(pedidoId: string, tenantId: string, userId: string | undefined, dto: PrepararPedidoDto) {
    return this.operarLogistica(pedidoId, tenantId, 'LISTO', dto, userId);
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
  async actualizarTracking(pedidoId: string, tenantId: string, dto: ActualizarTrackingDto, userId?: string) {
    return this.operarLogistica(pedidoId, tenantId, 'TRACKING', dto, userId);
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
  async registrarEventoManual(pedidoId: string, tenantId: string, dto: RegistrarEventoLogisticoDto, userId?: string) {
    return this.operarLogistica(pedidoId, tenantId, 'EVENTO', dto, userId);
  }

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
  async reprogramarBackorder(pedidoId: string, detalleId: string, tenantId: string, dto: ReprogramarBackorderDto, userId?: string) {
    await this.operarLogistica(pedidoId, tenantId, 'BACKORDER', { ...dto, detalle_id: detalleId }, userId);
    return { success: true, data: await this.obtenerBackorders(pedidoId, tenantId) };
  }

  private async operarLogistica<T extends { idempotency_key: string }>(pedidoId: string, tenantId: string, accion: string,
    dto: T, userId?: string): Promise<{ success: boolean }> {
    if (!userId) throw new BadRequestException('No se pudo determinar el actor logístico');
    const { idempotency_key, ...payload } = dto;
    const { data, error } = await this.supabase.getClient().rpc('operar_logistica_tx', {
      p_tenant_id: tenantId, p_pedido_id: pedidoId, p_actor_id: userId,
      p_accion: accion, p_payload: payload, p_idempotency_key: idempotency_key,
    });
    if (error || data?.success !== true) {
      throw new BadRequestException(error?.message || 'No se pudo confirmar la operación logística');
    }
    const notification = {
      PREPARAR: { type: NotificationType.PEDIDO_EN_PREPARACION, title: 'Pedido en preparación' },
      LISTO: { type: NotificationType.PEDIDO_LISTO_DESPACHO, title: 'Pedido listo para despacho' },
      BACKORDER: { type: NotificationType.BACKORDER_REPROGRAMADO, title: 'Backorder reprogramado' },
    }[accion];
    if (!data.idempotent && notification) {
      await this.enviarNotificacion(tenantId, {
        ...notification, severity: NotificationSeverity.INFO,
        message: `${notification.title}: ${pedidoId}`, usuario_id: userId,
      });
    }
    return data;
  }

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

}
