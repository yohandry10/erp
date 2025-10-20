import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EstadoPedido } from '../../ventas/pedidos/entities';
import { PrepararPedidoDto, ConfirmarDespachoDto } from './dto';

/**
 * LogisticaService
 * Servicio para gestionar el flujo logístico de pedidos
 * Solo aplica cuando usar_flujo_logistica = true
 * Requirements: 9.1, 9.2, 9.6, 9.7, 21.5, 21.6, 21.7, 21.8
 */
@Injectable()
export class LogisticaService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Obtener órdenes pendientes de preparación
   * Lista pedidos en estado CONFIRMADO
   * Requirements: 9.1, 9.2
   */
  async getOrdenesPendientes(tenantId: string): Promise<any[]> {
    const client = this.supabase.getClient();

    // Verificar que el tenant usa flujo logístico
    const { data: config } = await client
      .from('empresa_config')
      .select('usar_flujo_logistica')
      .eq('tenant_id', tenantId)
      .single();

    if (!config || !config.usar_flujo_logistica) {
      return []; // Si no usa flujo logístico, no hay órdenes pendientes
    }

    // Obtener pedidos en estado CONFIRMADO
    const { data: pedidos, error } = await client
      .from('pedidos_venta')
      .select(`
        id,
        numero,
        fecha,
        cliente_id,
        clientes!inner(id, razon_social, documento_numero),
        estado,
        total,
        created_at
      `)
      .eq('tenant_id', tenantId)
      .eq('estado', EstadoPedido.CONFIRMADO)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching ordenes pendientes:', error);
      throw new BadRequestException('Error al obtener órdenes pendientes');
    }

    // Obtener cantidad de ítems por pedido
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

    console.log(`✅ [LogisticaService] Órdenes pendientes obtenidas: ${pedidosConItems.length}`);

    return pedidosConItems;
  }

  /**
   * Preparar pedido
   * Cambia estado a EN_PREPARACION
   * Requirements: 9.3, 9.4, 9.5, 21.5
   */
  async prepararPedido(
    pedidoId: string,
    tenantId: string,
    dto: PrepararPedidoDto,
    userId?: string,
  ): Promise<{ success: boolean }> {
    const client = this.supabase.getClient();

    // Verificar que el tenant usa flujo logístico
    const { data: config } = await client
      .from('empresa_config')
      .select('usar_flujo_logistica')
      .eq('tenant_id', tenantId)
      .single();

    if (!config || !config.usar_flujo_logistica) {
      throw new BadRequestException(
        'El flujo logístico no está habilitado para este tenant',
      );
    }

    // Obtener pedido
    const { data: pedido, error: pedidoError } = await client
      .from('pedidos_venta')
      .select('id, numero, estado')
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId)
      .single();

    if (pedidoError || !pedido) {
      throw new NotFoundException('Pedido no encontrado');
    }

    // Validar estado
    if (pedido.estado !== EstadoPedido.CONFIRMADO) {
      throw new BadRequestException(
        `No se puede preparar un pedido en estado ${pedido.estado}`,
      );
    }

    // Cambiar estado a EN_PREPARACION
    const { error: updateError } = await client
      .from('pedidos_venta')
      .update({
        estado: EstadoPedido.EN_PREPARACION,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error updating pedido estado:', updateError);
      throw new BadRequestException('Error al cambiar estado del pedido');
    }

    // Registrar notas si se proporcionaron
    if (dto.notas) {
      const { data: pedidoActual } = await client
        .from('pedidos_venta')
        .select('notas')
        .eq('id', pedidoId)
        .single();

      const notasActualizadas = pedidoActual?.notas
        ? `${pedidoActual.notas}\n\n[PREPARACIÓN] ${dto.notas}`
        : `[PREPARACIÓN] ${dto.notas}`;

      await client
        .from('pedidos_venta')
        .update({ notas: notasActualizadas })
        .eq('id', pedidoId);
    }

    // Notificar
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: 'PEDIDO_EN_PREPARACION' as any,
        severity: 'INFO' as any,
        title: 'Pedido en preparación',
        message: `El pedido ${pedido.numero} está siendo preparado en almacén`,
        usuario_id: userId,
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      // No fallar si la notificación falla
    }

    console.log(`✅ [LogisticaService] Pedido ${pedidoId} en preparación`);

    return { success: true };
  }

  /**
   * Marcar pedido como listo para despacho
   * Cambia estado a LISTO_DESPACHO
   * Requirements: 9.6, 21.6
   */
  async marcarListoDespacho(
    pedidoId: string,
    tenantId: string,
    userId?: string,
  ): Promise<{ success: boolean }> {
    const client = this.supabase.getClient();

    // Verificar que el tenant usa flujo logístico
    const { data: config } = await client
      .from('empresa_config')
      .select('usar_flujo_logistica')
      .eq('tenant_id', tenantId)
      .single();

    if (!config || !config.usar_flujo_logistica) {
      throw new BadRequestException(
        'El flujo logístico no está habilitado para este tenant',
      );
    }

    // Obtener pedido
    const { data: pedido, error: pedidoError } = await client
      .from('pedidos_venta')
      .select('id, numero, estado')
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId)
      .single();

    if (pedidoError || !pedido) {
      throw new NotFoundException('Pedido no encontrado');
    }

    // Validar estado
    if (pedido.estado !== EstadoPedido.EN_PREPARACION) {
      throw new BadRequestException(
        `No se puede marcar como listo un pedido en estado ${pedido.estado}`,
      );
    }

    // Cambiar estado a LISTO_DESPACHO
    const { error: updateError } = await client
      .from('pedidos_venta')
      .update({
        estado: EstadoPedido.LISTO_DESPACHO,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error updating pedido estado:', updateError);
      throw new BadRequestException('Error al cambiar estado del pedido');
    }

    // Notificar
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: 'PEDIDO_LISTO_DESPACHO' as any,
        severity: 'INFO' as any,
        title: 'Pedido listo para despacho',
        message: `El pedido ${pedido.numero} está listo para ser despachado`,
        usuario_id: userId,
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      // No fallar si la notificación falla
    }

    console.log(`✅ [LogisticaService] Pedido ${pedidoId} listo para despacho`);

    return { success: true };
  }

  /**
   * Confirmar despacho
   * Descuenta stock real (SALIDA), libera reserva y cambia a LISTO_FACTURAR
   * Requirements: 9.7, 21.7, 21.8
   */
  async confirmarDespacho(
    pedidoId: string,
    tenantId: string,
    dto: ConfirmarDespachoDto,
    userId?: string,
  ): Promise<{ success: boolean }> {
    const client = this.supabase.getClient();

    // Verificar que el tenant usa flujo logístico
    const { data: config } = await client
      .from('empresa_config')
      .select('usar_flujo_logistica')
      .eq('tenant_id', tenantId)
      .single();

    if (!config || !config.usar_flujo_logistica) {
      throw new BadRequestException(
        'El flujo logístico no está habilitado para este tenant',
      );
    }

    // Obtener pedido con detalles
    const { data: pedido, error: pedidoError } = await client
      .from('pedidos_venta')
      .select('id, numero, estado')
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId)
      .single();

    if (pedidoError || !pedido) {
      throw new NotFoundException('Pedido no encontrado');
    }

    // Validar estado
    if (pedido.estado !== EstadoPedido.LISTO_DESPACHO) {
      throw new BadRequestException(
        `No se puede confirmar despacho de un pedido en estado ${pedido.estado}`,
      );
    }

    // Obtener detalle del pedido
    const { data: detalle, error: detalleError } = await client
      .from('pedidos_venta_detalle')
      .select('*')
      .eq('pedido_id', pedidoId);

    if (detalleError || !detalle) {
      throw new BadRequestException('Error al obtener detalle del pedido');
    }

    // Descontar stock real (SALIDA) y liberar reserva para cada producto
    for (const item of detalle) {
      // Crear movimiento de SALIDA
      await client.from('movimientos_inventario').insert({
        tenant_id: tenantId,
        producto_id: item.producto_id,
        tipo: 'SALIDA',
        cantidad: item.cantidad,
        referencia_tipo: 'PEDIDO',
        referencia_id: pedidoId,
        notas: `Salida por despacho de pedido ${pedido.numero}`,
      });

      // Descontar stock_actual y liberar reserva
      await client.rpc('descontar_stock_y_liberar_reserva', {
        p_producto_id: item.producto_id,
        p_cantidad: item.cantidad,
      });
    }

    // Cambiar estado a LISTO_FACTURAR
    const { error: updateError } = await client
      .from('pedidos_venta')
      .update({
        estado: EstadoPedido.LISTO_FACTURAR,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error updating pedido estado:', updateError);
      throw new BadRequestException('Error al cambiar estado del pedido');
    }

    // Registrar notas si se proporcionaron
    if (dto.notas) {
      const { data: pedidoActual } = await client
        .from('pedidos_venta')
        .select('notas')
        .eq('id', pedidoId)
        .single();

      const notasActualizadas = pedidoActual?.notas
        ? `${pedidoActual.notas}\n\n[DESPACHO] ${dto.notas}`
        : `[DESPACHO] ${dto.notas}`;

      await client
        .from('pedidos_venta')
        .update({ notas: notasActualizadas })
        .eq('id', pedidoId);
    }

    // Notificar a Ventas que el pedido está listo para facturar
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: 'PEDIDO_LISTO_FACTURAR' as any,
        severity: 'SUCCESS' as any,
        title: 'Pedido listo para facturar',
        message: `El pedido ${pedido.numero} ha sido despachado y está listo para facturar`,
        usuario_id: userId,
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      // No fallar si la notificación falla
    }

    console.log(`✅ [LogisticaService] Despacho confirmado para pedido ${pedidoId}`);

    return { success: true };
  }
}
