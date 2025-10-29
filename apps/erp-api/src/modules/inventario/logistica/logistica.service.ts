import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType, NotificationSeverity } from '../../notifications/notification.types';
import { AuditService } from '../../audit/audit.service';
import { PedidoLockService } from '../../../shared/locks/pedido-lock.service';
import { EstadoPedido } from '../../ventas/pedidos/entities';
import { AlmacenesService } from '../almacenes/almacenes.service';
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
    private readonly almacenesService: AlmacenesService,
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
        fecha,
        cliente_id,
        clientes!inner(id, razon_social, documento_numero),
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
          cantidad_items: detalle?.length || 0,
          items: detalle || [],
        };
      }),
    );

    console.log(`✅ [LogisticaService] Órdenes pendientes obtenidas: ${pedidosConItems.length}`);

    return pedidosConItems;
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
  ): Promise<{ success: boolean }> {
    const config = await this.obtenerConfiguracion(tenantId);

    if (!config.usar_flujo_logistica) {
      throw new BadRequestException('El flujo logístico no está habilitado para este tenant');
    }

    return this.pedidoLockService.runWithLock(tenantId, pedidoId, async () => {
      const client = this.supabase.getClient();
      const pedido = await this.obtenerPedidoBasico(pedidoId, tenantId);

      if (![EstadoPedido.LISTO_DESPACHO, EstadoPedido.DESPACHO_PARCIAL].includes(pedido.estado as EstadoPedido)) {
        throw new BadRequestException(`No se puede confirmar despacho de un pedido en estado ${pedido.estado}`);
      }

      const { data: detalle, error: detalleError } = await client
        .from('pedidos_venta_detalle')
        .select('id, producto_id, descripcion, cantidad, cantidad_despachada, estado_item')
        .eq('pedido_id', pedidoId);

      if (detalleError || !detalle) {
        throw new BadRequestException('Error al obtener detalle del pedido');
      }

      const despachoPlan = this.normalizarItemsDespachados(detalle, dto.items_despachados);
      let totalDespachado = 0;
      const timestamp = new Date().toISOString();

      const detalleActualizado: Array<{ id: string; cantidad_despachada: number; cantidad_enviada: number; estado_item: string }> = [];
      const despachosInsert: any[] = [];
      const backorderUpserts: any[] = [];
      const backorderDeletes: string[] = [];

      const almacenesCache = new Set<string>();
      const ubicacionesCache = new Set<string>();
      let almacenPorDefecto = dto.almacen_id ?? null;
      const ubicacionPorDefecto = dto.ubicacion_id ?? null;
      const lotePorDefecto = dto.lote ?? null;

      if (config.habilitar_multialmacen) {
        if (almacenPorDefecto) {
          await this.asegurarAlmacen(tenantId, almacenPorDefecto, almacenesCache);
        } else {
          const principal = await this.almacenesService.obtenerPrincipal(tenantId);
          if (!principal) {
            throw new BadRequestException('Debe configurar al menos un almacén antes de confirmar despachos.');
          }
          almacenPorDefecto = principal.id;
          almacenesCache.add(principal.id);
        }
      }

      if (config.requiere_ubicaciones_inventario && ubicacionPorDefecto) {
        await this.validarUbicacion(tenantId, ubicacionPorDefecto, ubicacionesCache);
      }

      for (const item of detalle) {
        const cantidadTotal = Number(item.cantidad);
        const cantidadDespachadaActual = Number(item.cantidad_despachada ?? 0);
        const cantidadPendiente = Math.max(cantidadTotal - cantidadDespachadaActual, 0);
        const cantidadSolicitada = despachoPlan.has(item.id)
          ? despachoPlan.get(item.id)!
          : (dto.items_despachados && dto.items_despachados.length > 0 ? 0 : cantidadPendiente);

        if (cantidadSolicitada < 0) {
          throw new BadRequestException(`Cantidad inválida para el item ${item.descripcion}`);
        }

        if (cantidadSolicitada === 0) {
          continue;
        }

        if (cantidadSolicitada > cantidadPendiente) {
          throw new BadRequestException(
            `Cantidad solicitada (${cantidadSolicitada}) supera el saldo pendiente (${cantidadPendiente}) para ${item.descripcion}`,
          );
        }

        const itemInput = this.buscarInputItem(dto.items_despachados, item.id);
        let itemAlmacenId: string | null = null;
        let itemUbicacionId: string | null = null;
        let itemLote: string | null = null;

        if (config.habilitar_multialmacen) {
          itemAlmacenId = itemInput?.almacen_id ?? almacenPorDefecto;

          if (!itemAlmacenId) {
            throw new BadRequestException('Debe especificar un almacén para cada despacho cuando multialmacén está habilitado.');
          }

          await this.asegurarAlmacen(tenantId, itemAlmacenId, almacenesCache);

          itemUbicacionId = itemInput?.ubicacion_id ?? ubicacionPorDefecto ?? null;
          if (config.requiere_ubicaciones_inventario && !itemUbicacionId) {
            throw new BadRequestException('Debe especificar una ubicación de almacén para completar el despacho.');
          }
          await this.validarUbicacion(tenantId, itemUbicacionId, ubicacionesCache);

          itemLote = itemInput?.lote ?? lotePorDefecto ?? null;
          if (config.requiere_lotes_series && !itemLote) {
            throw new BadRequestException('Debe especificar el lote o serie para completar el despacho.');
          }

          const { error: movimientoError } = await client.rpc('registrar_movimiento_almacen', {
            p_producto_id: item.producto_id,
            p_almacen_id: itemAlmacenId,
            p_tipo: 'SALIDA',
            p_cantidad: cantidadSolicitada,
            p_referencia_tipo: 'PEDIDO',
            p_referencia_id: pedidoId,
            p_notas: `Salida por despacho de pedido ${pedido.numero}`,
            p_ubicacion_id: itemUbicacionId,
            p_lote: itemLote,
            p_fecha_expiracion: null,
          });

          if (movimientoError) {
            console.error('Error registrando movimiento de almacén:', movimientoError);
            throw new BadRequestException('No se pudo confirmar el despacho por error de inventario');
          }
        } else {
          const { error: movimientoInsertError } = await client.from('movimientos_inventario').insert({
            tenant_id: tenantId,
            producto_id: item.producto_id,
            tipo: 'SALIDA',
            cantidad: cantidadSolicitada,
            referencia_tipo: 'PEDIDO',
            referencia_id: pedidoId,
            notas: `Salida por despacho de pedido ${pedido.numero}`,
          });

          if (movimientoInsertError) {
            console.error('Error registrando movimiento de inventario:', movimientoInsertError);
            throw new BadRequestException('No se pudo confirmar el despacho por error de inventario');
          }

          const { error: salidaError } = await client.rpc('descontar_stock_y_liberar_reserva', {
            p_producto_id: item.producto_id,
            p_cantidad: cantidadSolicitada,
          });

          if (salidaError) {
            console.error('Error descontando stock en despacho:', salidaError);
            throw new BadRequestException('No se pudo confirmar el despacho por error de inventario');
          }
        }

        const nuevoDespachado = cantidadDespachadaActual + cantidadSolicitada;
        const nuevoEstadoItem = nuevoDespachado >= cantidadTotal ? 'DESPACHADO' : 'PARCIAL';

        detalleActualizado.push({
          id: item.id,
          cantidad_despachada: nuevoDespachado,
          cantidad_enviada: cantidadSolicitada,
          estado_item: nuevoEstadoItem,
        });

        despachosInsert.push({
          tenant_id: tenantId,
          pedido_id: pedidoId,
          detalle_id: item.id,
          producto_id: item.producto_id,
          cantidad: cantidadSolicitada,
          registrado_por: userId ?? null,
          notas: dto.notas ?? null,
          almacen_id: itemAlmacenId ?? null,
          ubicacion_id: itemUbicacionId ?? null,
          lote: itemLote ?? null,
        });

        const restante = Math.max(cantidadTotal - nuevoDespachado, 0);
        if (restante > 0) {
          backorderUpserts.push({
            tenant_id: tenantId,
            pedido_id: pedidoId,
            detalle_id: item.id,
            producto_id: item.producto_id,
            cantidad_comprometida: cantidadTotal,
            cantidad_despachada: nuevoDespachado,
            cantidad_pendiente: restante,
            estado: nuevoEstadoItem === 'PARCIAL' ? 'PARCIAL' : 'PENDIENTE',
            updated_at: timestamp,
            almacen_id: itemAlmacenId ?? null,
          });
        } else {
          backorderDeletes.push(item.id);
        }

        item.cantidad_despachada = nuevoDespachado;
        item.estado_item = nuevoEstadoItem;
        totalDespachado += cantidadSolicitada;
      }

      if (totalDespachado <= 0) {
        throw new BadRequestException('Debe registrar al menos un item para despachar');
      }

      for (const update of detalleActualizado) {
        const { error: detalleUpdateError } = await client
          .from('pedidos_venta_detalle')
          .update({
            cantidad_despachada: update.cantidad_despachada,
            estado_item: update.estado_item,
          })
          .eq('id', update.id);

        if (detalleUpdateError) {
          console.error('Error actualizando detalle de pedido:', detalleUpdateError);
          throw new BadRequestException('No se pudo actualizar el detalle del pedido despachado');
        }
      }

      if (despachosInsert.length > 0) {
        const { error: despachosError } = await client
          .from('pedido_despachos')
          .insert(despachosInsert);
        if (despachosError) {
          console.error('Error registrando histórico de despachos:', despachosError);
        }
      }

      if (backorderUpserts.length > 0) {
        const { error: backorderError } = await client
          .from('pedido_backorders')
          .upsert(backorderUpserts, { onConflict: 'detalle_id' });
        if (backorderError) {
          console.error('Error actualizando backorders:', backorderError);
          throw new BadRequestException('No se pudieron actualizar los backorders del pedido');
        }
      }

      if (backorderDeletes.length > 0) {
        const { error: backorderDeleteError } = await client
          .from('pedido_backorders')
          .delete()
          .in('detalle_id', backorderDeletes);
        if (backorderDeleteError) {
          console.error('Error eliminando backorders:', backorderDeleteError);
          throw new BadRequestException('No se pudieron sincronizar los backorders del pedido');
        }
      }

      const allDespachado = detalle.every(
        (itemDetalle) => Number(itemDetalle.cantidad_despachada ?? 0) >= Number(itemDetalle.cantidad),
      );
      const nuevoEstado = allDespachado ? EstadoPedido.LISTO_FACTURAR : EstadoPedido.DESPACHO_PARCIAL;

      const { error: updateError } = await client
        .from('pedidos_venta')
        .update({
          estado: nuevoEstado,
          tracking_estado: 'EN_TRANSITO',
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
          `[DESPACHO] ${dto.notas}`,
        );

        await client
          .from('pedidos_venta')
          .update({ notas: notasActualizadas })
          .eq('id', pedidoId)
          .eq('tenant_id', tenantId);
      }

      await this.registrarEventoLogistico(
        tenantId,
        pedidoId,
        'DESPACHO',
        {
          notas: dto.notas ?? null,
          items_despachados: detalleActualizado.map((item) => ({
            detalle_id: item.id,
            cantidad_enviada: item.cantidad_enviada,
            cantidad_total_despachada: item.cantidad_despachada,
          })),
          bultos: dto.bultos ?? null,
          peso_total: dto.peso_total ?? null,
          volumen_total: dto.volumen_total ?? null,
          transportista: dto.transportista ?? null,
          placa: dto.placa ?? null,
          conductor: dto.conductor ?? null,
        },
        userId,
      );

      await this.registrarEventoLogistico(
        tenantId,
        pedidoId,
        'TRANSITO',
        {
          estado: 'EN_TRANSITO',
        },
        userId,
      );

      await this.registrarAuditoria(
        pedidoId,
        tenantId,
        userId,
        {
          estado: nuevoEstado,
          tracking_estado: 'EN_TRANSITO',
        },
        'confirmar_despacho',
      );

      if (nuevoEstado === EstadoPedido.LISTO_FACTURAR) {
        await this.enviarNotificacion(tenantId, {
          type: NotificationType.PEDIDO_LISTO_FACTURAR,
          severity: NotificationSeverity.INFO,
          title: 'Pedido listo para facturar',
          message: `El pedido ${pedido.numero} ha sido despachado en su totalidad`,
          usuario_id: userId,
        });
      } else {
        await this.enviarNotificacion(tenantId, {
          type: NotificationType.PEDIDO_DESPACHO_PARCIAL,
          severity: NotificationSeverity.WARNING,
          title: 'Pedido con despacho parcial',
          message: `El pedido ${pedido.numero} tiene unidades pendientes de despacho`,
          usuario_id: userId,
        });
      }

      console.log(`✅ [LogisticaService] Despacho registrado para pedido ${pedidoId} (estado: ${nuevoEstado})`);

      return { success: true };
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

  private buscarInputItem(items: Array<any> | undefined, detalleId: string) {
    if (!Array.isArray(items)) {
      return null;
    }
    return (
      items.find((raw) => {
        if (!raw) {
          return false;
        }
        const id = raw.detalle_id ?? raw.detalleId ?? raw.id;
        return id === detalleId;
      }) ?? null
    );
  }

  private async asegurarAlmacen(tenantId: string, almacenId: string | null, cache: Set<string>): Promise<void> {
    if (!almacenId || cache.has(almacenId)) {
      return;
    }
    await this.almacenesService.obtenerPorId(tenantId, almacenId);
    cache.add(almacenId);
  }

  private async validarUbicacion(tenantId: string, ubicacionId: string | null, cache: Set<string>): Promise<void> {
    if (!ubicacionId || cache.has(ubicacionId)) {
      return;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('almacen_ubicaciones')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', ubicacionId)
      .maybeSingle();

    if (error || !data) {
      throw new BadRequestException('La ubicación seleccionada no existe o no pertenece al tenant.');
    }

    cache.add(ubicacionId);
  }

  private normalizarItemsDespachados(
    detalle: Array<{ id: string; cantidad: number; cantidad_despachada?: number }>,
    items?: Array<any>,
  ): Map<string, number> {
    const plan = new Map<string, number>();

    if (!Array.isArray(items) || items.length === 0) {
      return plan;
    }

    for (const raw of items) {
      if (raw === null || raw === undefined) {
        continue;
      }

      if (typeof raw === 'string') {
        const item = detalle.find((d) => d.id === raw);
        if (!item) {
          continue;
        }
        const pendiente = Math.max(Number(item.cantidad) - Number(item.cantidad_despachada ?? 0), 0);
        plan.set(item.id, pendiente);
        continue;
      }

      if (typeof raw === 'object') {
        const detalleId = raw.detalle_id ?? raw.detalleId ?? raw.id;
        if (!detalleId) {
          continue;
        }
        const item = detalle.find((d) => d.id === detalleId);
        if (!item) {
          continue;
        }
        const pendiente = Math.max(Number(item.cantidad) - Number(item.cantidad_despachada ?? 0), 0);
        const cantidadRaw =
          raw.cantidad ?? raw.cantidad_enviada ?? raw.cantidadDespachada ?? raw.qty ?? pendiente;
        const cantidad = Number(cantidadRaw);
        if (Number.isFinite(cantidad) && cantidad >= 0) {
          plan.set(item.id, cantidad);
        }
      }
    }

    return plan;
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



