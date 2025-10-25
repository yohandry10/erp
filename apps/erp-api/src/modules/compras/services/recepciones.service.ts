import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { InventarioService } from '../../inventario/inventario.service';
import { CreateRecepcionDto, CerrarRecepcionDto, CalidadRecepcion } from '../dto';
import { EventBusService, RecepcionRegistradaEvent } from '../../../shared/events/event-bus.service';

@Injectable()
export class RecepcionesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly inventarioService: InventarioService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Obtiene todas las recepciones con filtros opcionales
   */
  async obtenerRecepciones(tenantId: string, filtros?: any): Promise<any[]> {
    try {
      console.log(`📦 [Recepciones] Obteniendo recepciones para tenant: ${tenantId}`);

      let query = this.supabase.getClient()
        .from('recepciones')
        .select(`
          *,
          orden:ordenes_compra(
            id,
            numero,
            proveedor:proveedores(id, razon_social, ruc)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (filtros?.estado) {
        query = query.eq('estado', filtros.estado);
      }

      if (filtros?.orden_id) {
        query = query.eq('orden_id', filtros.orden_id);
      }

      if (filtros?.fecha_desde) {
        query = query.gte('fecha_recepcion', filtros.fecha_desde);
      }

      if (filtros?.fecha_hasta) {
        query = query.lte('fecha_recepcion', filtros.fecha_hasta);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error obteniendo recepciones:', error);
        throw new BadRequestException(`Error al obtener recepciones: ${error.message}`);
      }

      console.log(`✅ Recepciones obtenidas: ${data?.length || 0}`);
      return data || [];
    } catch (error) {
      console.error('❌ Error en obtenerRecepciones:', error);
      throw error;
    }
  }

  /**
   * Obtiene una recepción específica por ID
   */
  async obtenerRecepcionPorId(recepcionId: string, tenantId: string): Promise<any> {
    try {
      console.log(`📦 [Recepciones] Obteniendo recepción ${recepcionId}`);

      const { data, error } = await this.supabase.getClient()
        .from('recepciones')
        .select(`
          *,
          orden:ordenes_compra(
            id,
            numero,
            proveedor:proveedores(id, razon_social, ruc)
          ),
          items:recepcion_items(
            *,
            producto:productos(id, codigo, nombre)
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('id', recepcionId)
        .single();

      if (error) {
        console.error('❌ Error obteniendo recepción:', error);
        throw new NotFoundException(`Recepción no encontrada: ${error.message}`);
      }

      console.log(`✅ Recepción obtenida: ${data.numero}`);
      return data;
    } catch (error) {
      console.error('❌ Error en obtenerRecepcionPorId:', error);
      throw error;
    }
  }

  /**
   * Crea una nueva recepción en estado BORRADOR
   */
  async crearRecepcion(tenantId: string, dto: CreateRecepcionDto, userId?: string): Promise<any> {
    try {
      console.log(`📦 [Recepciones] Creando recepción para orden ${dto.orden_id}`);

      // Validar que la orden existe y está en estado válido
      const { data: orden, error: ordenError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          detalles:orden_compra_detalles(*)
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

      // Crear recepción
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
        console.error('❌ Error creando recepción:', recepcionError);
        throw new BadRequestException(`Error al crear recepción: ${recepcionError.message}`);
      }

      // Crear items de recepción
      const itemsToInsert = [];
      for (const item of dto.items) {
        // Validar que el detalle existe en la orden
        const detalle = orden.detalles.find(d => d.id === item.detalle_id);
        if (!detalle) {
          throw new BadRequestException(`Detalle ${item.detalle_id} no encontrado en la orden`);
        }

        // Validar que no se exceda la cantidad pendiente
        const cantidadPendiente = Number(detalle.cantidad) - Number(detalle.cantidad_recibida || 0);
        if (item.cantidad_recibida > cantidadPendiente) {
          throw new BadRequestException(
            `La cantidad recibida (${item.cantidad_recibida}) excede la cantidad pendiente (${cantidadPendiente}) para el producto ${detalle.descripcion}`
          );
        }

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
          observaciones: item.observaciones || null,
        });
      }

      const { error: itemsError } = await this.supabase.getClient()
        .from('recepcion_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('❌ Error creando items de recepción:', itemsError);
        // Rollback: eliminar la recepción creada
        await this.supabase.getClient()
          .from('recepciones')
          .delete()
          .eq('id', recepcion.id);
        throw new BadRequestException(`Error al crear items de recepción: ${itemsError.message}`);
      }

      console.log(`✅ Recepción creada: ${recepcion.numero}`);

      // Retornar recepción completa con items
      return this.obtenerRecepcionPorId(recepcion.id, tenantId);
    } catch (error) {
      console.error('❌ Error en crearRecepcion:', error);
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
    try {
      console.log(`📦 [Recepciones] Cerrando recepción ${recepcionId}`);

      // Obtener recepción con todos sus datos
      const recepcion = await this.obtenerRecepcionPorId(recepcionId, tenantId);

      if (recepcion.estado !== 'BORRADOR') {
        throw new BadRequestException('Solo se pueden cerrar recepciones en estado BORRADOR');
      }

      if (!recepcion.items || recepcion.items.length === 0) {
        throw new BadRequestException('La recepción debe tener al menos un item');
      }

      // Procesar cada item de la recepción
      for (const item of recepcion.items) {
        // Solo procesar items con calidad OK u OBSERVADO
        if (item.calidad === CalidadRecepcion.OK || item.calidad === CalidadRecepcion.OBSERVADO) {
          // Crear movimiento de inventario (INGRESO_COMPRA)
          await this.inventarioService.registrarMovimientoAlmacen({
            tenantId,
            productoId: item.producto_id,
            almacenId: item.almacen_id,
            tipo: 'ENTRADA',
            cantidad: item.cantidad_recibida,
            referenciaTipo: 'RECEPCION',
            referenciaId: recepcionId,
            notas: `Recepción ${recepcion.numero} - OC ${recepcion.orden.numero}`,
            ubicacionId: item.ubicacion_id,
            lote: item.lote,
            fechaExpiracion: item.fecha_expiracion,
          });

          console.log(`✅ Movimiento de inventario creado para producto ${item.producto_id}`);
        }

        // Actualizar cantidad_recibida en orden_compra_detalles
        const { data: detalle, error: detalleError } = await this.supabase.getClient()
          .from('orden_compra_detalles')
          .select('cantidad, cantidad_recibida')
          .eq('id', item.detalle_id)
          .single();

        if (detalleError) {
          throw new BadRequestException(`Error al obtener detalle de orden: ${detalleError.message}`);
        }

        const nuevaCantidadRecibida = Number(detalle.cantidad_recibida || 0) + Number(item.cantidad_recibida);

        const { error: updateDetalleError } = await this.supabase.getClient()
          .from('orden_compra_detalles')
          .update({
            cantidad_recibida: nuevaCantidadRecibida,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.detalle_id);

        if (updateDetalleError) {
          throw new BadRequestException(`Error al actualizar detalle de orden: ${updateDetalleError.message}`);
        }

        console.log(`✅ Detalle de orden actualizado: ${item.detalle_id}`);
      }

      // Actualizar estado de la orden de compra
      await this.actualizarEstadoOrden(recepcion.orden_id, tenantId);

      // Cerrar la recepción
      const { error: cerrarError } = await this.supabase.getClient()
        .from('recepciones')
        .update({
          estado: 'CERRADA',
          observaciones: dto.observaciones || recepcion.observaciones,
          cerrado_por: userId || null,
          cerrado_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', recepcionId)
        .eq('tenant_id', tenantId);

      if (cerrarError) {
        throw new BadRequestException(`Error al cerrar recepción: ${cerrarError.message}`);
      }

      console.log(`✅ Recepción cerrada: ${recepcion.numero}`);

      // Emitir evento RecepcionRegistrada para integración con CxP
      await this.emitirEventoRecepcionRegistrada(recepcionId, tenantId);

      return this.obtenerRecepcionPorId(recepcionId, tenantId);
    } catch (error) {
      console.error('❌ Error en cerrarRecepcion:', error);
      throw error;
    }
  }

  /**
   * Actualiza el estado de la orden de compra según las cantidades recibidas
   */
  private async actualizarEstadoOrden(ordenId: string, tenantId: string): Promise<void> {
    try {
      // Obtener todos los detalles de la orden
      const { data: detalles, error: detallesError } = await this.supabase.getClient()
        .from('orden_compra_detalles')
        .select('cantidad, cantidad_recibida')
        .eq('orden_id', ordenId);

      if (detallesError) {
        throw new BadRequestException(`Error al obtener detalles de orden: ${detallesError.message}`);
      }

      // Calcular totales
      const totalPedido = detalles.reduce((sum, d) => sum + Number(d.cantidad), 0);
      const totalRecibido = detalles.reduce((sum, d) => sum + Number(d.cantidad_recibida || 0), 0);

      // Determinar nuevo estado
      let nuevoEstado = 'APROBADA';
      if (totalRecibido >= totalPedido) {
        nuevoEstado = 'RECIBIDA';
      } else if (totalRecibido > 0) {
        nuevoEstado = 'PARCIAL';
      }

      // Actualizar estado de la orden
      const { error: updateError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .update({
          estado: nuevoEstado,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ordenId)
        .eq('tenant_id', tenantId);

      if (updateError) {
        throw new BadRequestException(`Error al actualizar estado de orden: ${updateError.message}`);
      }

      console.log(`✅ Estado de orden actualizado a: ${nuevoEstado}`);
    } catch (error) {
      console.error('❌ Error en actualizarEstadoOrden:', error);
      throw error;
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
        console.error('❌ Error generando número de recepción:', error);
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
      console.error('❌ Error en generarNumeroRecepcion:', error);
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
      console.log(`📦 [Recepciones] Actualizando recepción ${recepcionId}`);

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

      console.log(`✅ Recepción actualizada: ${recepcionId}`);

      return this.obtenerRecepcionPorId(recepcionId, tenantId);
    } catch (error) {
      console.error('❌ Error en actualizarRecepcion:', error);
      throw error;
    }
  }

  /**
   * Emite el evento RecepcionRegistrada para integración con CxP y Contabilidad
   */
  private async emitirEventoRecepcionRegistrada(recepcionId: string, tenantId: string): Promise<void> {
    try {
      console.log(`📡 [Recepciones] Emitiendo evento RecepcionRegistrada para ${recepcionId}`);

      // Obtener datos completos de la recepción
      const recepcion = await this.obtenerRecepcionPorId(recepcionId, tenantId);

      // Obtener datos de la orden de compra
      const { data: orden, error: ordenError } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          proveedor:proveedores(
            id,
            razon_social,
            ruc,
            condiciones_pago,
            dias_credito
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('id', recepcion.orden_id)
        .single();

      if (ordenError) {
        console.error('❌ Error obteniendo orden de compra para evento:', ordenError);
        throw new Error(`Error obteniendo orden de compra: ${ordenError.message}`);
      }

      // Construir el payload del evento
      const eventData: RecepcionRegistradaEvent = {
        recepcionId: recepcion.id,
        numeroRecepcion: recepcion.numero,
        ordenId: orden.id,
        numeroOrden: orden.numero,
        proveedorId: orden.proveedor.id,
        proveedorNombre: orden.proveedor.razon_social,
        proveedorRuc: orden.proveedor.ruc,
        almacenId: recepcion.items[0]?.almacen_id || null,
        fechaRecepcion: recepcion.fecha_recepcion,
        subtotal: orden.subtotal,
        igv: orden.igv,
        total: orden.total,
        moneda: orden.moneda || 'PEN',
        diasCredito: orden.proveedor.dias_credito,
        condicionesPago: orden.proveedor.condiciones_pago,
        items: recepcion.items.map(item => ({
          productoId: item.producto_id,
          descripcion: item.producto?.nombre || 'Producto',
          cantidadRecibida: item.cantidad_recibida,
          precioUnitario: 0, // TODO: Obtener precio de orden_compra_detalles
          total: 0, // TODO: Calcular desde orden_compra_detalles
          calidad: item.calidad,
          lote: item.lote,
          serie: item.serie,
          ubicacionId: item.ubicacion_id,
        })),
        tenantId,
      };

      // Emitir el evento
      this.eventBus.emitRecepcionRegistrada(eventData);

      console.log(`✅ Evento RecepcionRegistrada emitido exitosamente`);
    } catch (error) {
      console.error('❌ Error emitiendo evento RecepcionRegistrada:', error);
      // No lanzamos el error para no bloquear el cierre de la recepción
      // En producción, esto debería ir a un sistema de monitoreo
    }
  }
}
