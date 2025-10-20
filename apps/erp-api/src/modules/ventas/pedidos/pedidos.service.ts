import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { CreatePedidoDto, UpdatePedidoDto } from './dto';
import { PedidoVenta, EstadoPedido, PedidoDetalle } from './entities';

/**
 * PedidosService
 * Servicio para gestionar pedidos de venta
 * Requirements: 5.1, 5.2, 5.3, 27.1, 27.2, 27.4
 */
@Injectable()
export class PedidosService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Crear un nuevo pedido con cálculo de totales
   * Requirements: 5.2, 15.1, 15.2
   */
  async create(
    createPedidoDto: CreatePedidoDto,
    tenantId: string,
    userId?: string,
  ): Promise<PedidoVenta & { detalle: PedidoDetalle[] }> {
    const client = this.supabase.getClient();

    // Validar que el cliente existe
    const { data: cliente, error: clienteError } = await client
      .from('clientes')
      .select('id')
      .eq('id', createPedidoDto.cliente_id)
      .eq('tenant_id', tenantId)
      .single();

    if (clienteError || !cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    // Calcular totales
    const { subtotal, igv, total } = this.calcularTotales(createPedidoDto.detalle);

    // Generar número de pedido
    const numero = await this.generarNumero(tenantId);

    // Crear pedido
    const { data: pedido, error: pedidoError } = await client
      .from('pedidos_venta')
      .insert({
        tenant_id: tenantId,
        numero,
        cotizacion_id: createPedidoDto.cotizacion_id || null,
        cliente_id: createPedidoDto.cliente_id,
        fecha: new Date().toISOString().split('T')[0],
        estado: EstadoPedido.PENDIENTE,
        subtotal,
        igv,
        total,
        notas: createPedidoDto.notas || null,
        created_by: userId || null,
      })
      .select()
      .single();

    if (pedidoError) {
      console.error('Error creating pedido:', pedidoError);
      throw new BadRequestException('Error al crear el pedido');
    }

    // Crear detalles
    const detalleData = createPedidoDto.detalle.map((item) => ({
      pedido_id: pedido.id,
      producto_id: item.producto_id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.cantidad * item.precio_unitario,
    }));

    const { data: detalle, error: detalleError } = await client
      .from('pedidos_venta_detalle')
      .insert(detalleData)
      .select();

    if (detalleError) {
      console.error('Error creating pedido detalle:', detalleError);
      // Rollback: eliminar pedido
      await client.from('pedidos_venta').delete().eq('id', pedido.id);
      throw new BadRequestException('Error al crear el detalle del pedido');
    }

    console.log('✅ [PedidosService] Pedido creado:', pedido.id);

    return {
      ...pedido,
      detalle: detalle || [],
    };
  }

  /**
   * Listar pedidos con filtros por estado, cliente, fechas
   * Requirements: 5.1
   */
  async findAll(
    tenantId: string,
    filters?: {
      estado?: EstadoPedido;
      cliente_id?: string;
      fecha_desde?: string;
      fecha_hasta?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: PedidoVenta[]; pagination: any }> {
    const client = this.supabase.getClient();

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    let query = client
      .from('pedidos_venta')
      .select('*, clientes!inner(id, razon_social, documento_numero)', { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Filtro por estado
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    // Filtro por cliente
    if (filters?.cliente_id) {
      query = query.eq('cliente_id', filters.cliente_id);
    }

    // Filtro por rango de fechas
    if (filters?.fecha_desde) {
      query = query.gte('fecha', filters.fecha_desde);
    }
    if (filters?.fecha_hasta) {
      query = query.lte('fecha', filters.fecha_hasta);
    }

    // Búsqueda por número o cliente
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(
        `numero.ilike.${searchTerm},clientes.razon_social.ilike.${searchTerm}`,
      );
    }

    // Ordenar y paginar
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching pedidos:', error);
      throw new BadRequestException('Error al obtener pedidos');
    }

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Obtener un pedido por ID con detalles completos
   * Requirements: 5.3
   */
  async findOne(
    id: string,
    tenantId: string,
  ): Promise<PedidoVenta & { detalle: PedidoDetalle[] }> {
    const client = this.supabase.getClient();

    const { data: pedido, error: pedidoError } = await client
      .from('pedidos_venta')
      .select('*, clientes(*)')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (pedidoError || !pedido) {
      console.error('Error fetching pedido:', pedidoError);
      throw new NotFoundException('Pedido no encontrado');
    }

    // Obtener detalle
    const { data: detalle, error: detalleError } = await client
      .from('pedidos_venta_detalle')
      .select('*')
      .eq('pedido_id', id)
      .order('created_at', { ascending: true });

    if (detalleError) {
      console.error('Error fetching pedido detalle:', detalleError);
      throw new BadRequestException('Error al obtener el detalle del pedido');
    }

    return {
      ...pedido,
      detalle: detalle || [],
    };
  }

  /**
   * Actualizar un pedido
   * Requirements: 5.2, 5.3
   */
  async update(
    id: string,
    updatePedidoDto: UpdatePedidoDto,
    tenantId: string,
  ): Promise<PedidoVenta & { detalle: PedidoDetalle[] }> {
    const client = this.supabase.getClient();

    // Verificar que el pedido existe
    const pedido = await this.findOne(id, tenantId);

    // Validar que se puede editar (solo PENDIENTE)
    if (pedido.estado !== EstadoPedido.PENDIENTE && updatePedidoDto.detalle) {
      throw new BadRequestException(
        'Solo se pueden editar los productos de pedidos en estado PENDIENTE',
      );
    }

    // Preparar datos de actualización
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updatePedidoDto.cliente_id) {
      updateData.cliente_id = updatePedidoDto.cliente_id;
    }

    if (updatePedidoDto.notas !== undefined) {
      updateData.notas = updatePedidoDto.notas;
    }

    // Si se actualiza el detalle, recalcular totales
    if (updatePedidoDto.detalle) {
      const { subtotal, igv, total } = this.calcularTotales(updatePedidoDto.detalle);
      updateData.subtotal = subtotal;
      updateData.igv = igv;
      updateData.total = total;

      // Eliminar detalle anterior
      await client.from('pedidos_venta_detalle').delete().eq('pedido_id', id);

      // Crear nuevo detalle
      const detalleData = updatePedidoDto.detalle.map((item) => ({
        pedido_id: id,
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.cantidad * item.precio_unitario,
      }));

      const { error: detalleError } = await client
        .from('pedidos_venta_detalle')
        .insert(detalleData);

      if (detalleError) {
        console.error('Error updating pedido detalle:', detalleError);
        throw new BadRequestException('Error al actualizar el detalle del pedido');
      }
    }

    // Actualizar pedido
    const { data, error } = await client
      .from('pedidos_venta')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating pedido:', error);
      throw new BadRequestException('Error al actualizar el pedido');
    }

    console.log('✅ [PedidosService] Pedido actualizado:', id);

    // Retornar pedido actualizado con detalle
    return this.findOne(id, tenantId);
  }

  /**
   * Actualizar estado del pedido con validaciones de transición
   * Requirements: 5.3
   */
  async updateEstado(
    id: string,
    nuevoEstado: EstadoPedido,
    tenantId: string,
  ): Promise<PedidoVenta> {
    const client = this.supabase.getClient();

    // Verificar que el pedido existe
    const pedido = await this.findOne(id, tenantId);

    // Validar transición de estado
    this.validarTransicionEstado(pedido.estado, nuevoEstado);

    // Actualizar estado
    const { data, error } = await client
      .from('pedidos_venta')
      .update({
        estado: nuevoEstado,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating pedido estado:', error);
      throw new BadRequestException('Error al actualizar el estado del pedido');
    }

    console.log(`✅ [PedidosService] Estado del pedido ${id} actualizado a ${nuevoEstado}`);

    return data;
  }

  /**
   * Validar transición de estado
   * Requirements: 5.3
   */
  private validarTransicionEstado(estadoActual: EstadoPedido, nuevoEstado: EstadoPedido): void {
    const transicionesValidas: Record<EstadoPedido, EstadoPedido[]> = {
      [EstadoPedido.PENDIENTE]: [EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO],
      [EstadoPedido.CONFIRMADO]: [
        EstadoPedido.EN_PREPARACION,
        EstadoPedido.LISTO_FACTURAR,
        EstadoPedido.CANCELADO,
      ],
      [EstadoPedido.EN_PREPARACION]: [EstadoPedido.LISTO_DESPACHO, EstadoPedido.CANCELADO],
      [EstadoPedido.LISTO_DESPACHO]: [EstadoPedido.LISTO_FACTURAR, EstadoPedido.CANCELADO],
      [EstadoPedido.LISTO_FACTURAR]: [EstadoPedido.FACTURADO],
      [EstadoPedido.FACTURADO]: [EstadoPedido.COMPLETADO, EstadoPedido.COMPLETADO_CON_GRE],
      [EstadoPedido.COMPLETADO]: [],
      [EstadoPedido.COMPLETADO_CON_GRE]: [],
      [EstadoPedido.CANCELADO]: [],
    };

    const transicionesPermitidas = transicionesValidas[estadoActual] || [];

    if (!transicionesPermitidas.includes(nuevoEstado)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${estadoActual} a ${nuevoEstado}`,
      );
    }
  }

  /**
   * Calcular totales (subtotal, IGV, total)
   * IGV = 18%
   */
  private calcularTotales(detalle: Array<{ cantidad: number; precio_unitario: number }>) {
    const subtotal = detalle.reduce(
      (sum, item) => sum + item.cantidad * item.precio_unitario,
      0,
    );
    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      igv: Math.round(igv * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  /**
   * Confirmar pedido con reserva de stock
   * Requirements: 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 7.5, 8.1
   */
  async confirmarPedido(
    id: string,
    tenantId: string,
    forzarConfirmacion: boolean = false,
  ): Promise<{ success: boolean; warnings?: any[] }> {
    const client = this.supabase.getClient();

    // 1. Obtener pedido con detalles
    const pedido = await this.findOne(id, tenantId);

    // 2. Validar estado
    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new BadRequestException(
        `No se puede confirmar un pedido en estado ${pedido.estado}`,
      );
    }

    // 3. Verificar stock disponible para cada producto
    const stockWarnings = [];
    for (const item of pedido.detalle) {
      const stockDisponible = await this.getStockDisponible(item.producto_id, tenantId);

      if (stockDisponible < item.cantidad) {
        stockWarnings.push({
          producto_id: item.producto_id,
          descripcion: item.descripcion,
          disponible: stockDisponible,
          solicitado: item.cantidad,
        });
      }
    }

    // 4. Si hay warnings y no se fuerza, retornar warnings
    if (stockWarnings.length > 0 && !forzarConfirmacion) {
      return {
        success: false,
        warnings: stockWarnings,
      };
    }

    // 5. Crear movimientos de RESERVA y actualizar stock_reservado
    for (const item of pedido.detalle) {
      // Crear movimiento de inventario tipo RESERVA
      await client.from('movimientos_inventario').insert({
        tenant_id: tenantId,
        producto_id: item.producto_id,
        tipo: 'RESERVA',
        cantidad: item.cantidad,
        referencia_tipo: 'PEDIDO',
        referencia_id: id,
        notas: `Reserva para pedido ${pedido.numero}`,
      });

      // Actualizar stock_reservado en productos
      await client.rpc('incrementar_stock_reservado', {
        p_producto_id: item.producto_id,
        p_cantidad: item.cantidad,
      });
    }

    // 6. Cambiar estado del pedido a CONFIRMADO
    await this.updateEstado(id, EstadoPedido.CONFIRMADO, tenantId);

    // 7. Determinar siguiente estado según configuración
    const { data: config } = await client
      .from('empresa_config')
      .select('usar_flujo_logistica')
      .eq('tenant_id', tenantId)
      .single();

    if (config && !config.usar_flujo_logistica) {
      // Flujo simplificado: ir directo a LISTO_FACTURAR
      await this.updateEstado(id, EstadoPedido.LISTO_FACTURAR, tenantId);
    }

    // 8. Enviar notificación
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: 'PEDIDO_CONFIRMADO' as any,
        severity: 'INFO' as any,
        title: 'Pedido confirmado',
        message: `El pedido ${pedido.numero} ha sido confirmado y el stock reservado`,
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      // No fallar si la notificación falla
    }

    console.log('✅ [PedidosService] Pedido confirmado:', id);

    return {
      success: true,
      warnings: stockWarnings.length > 0 ? stockWarnings : undefined,
    };
  }

  /**
   * Cancelar pedido con liberación de stock
   * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
   */
  async cancelarPedido(
    id: string,
    tenantId: string,
    motivo?: string,
    userId?: string,
  ): Promise<{ success: boolean }> {
    const client = this.supabase.getClient();

    // 1. Obtener pedido
    const pedido = await this.findOne(id, tenantId);

    // 2. Validar que no esté facturado
    if (
      pedido.estado === EstadoPedido.FACTURADO ||
      pedido.estado === EstadoPedido.COMPLETADO ||
      pedido.estado === EstadoPedido.COMPLETADO_CON_GRE
    ) {
      throw new BadRequestException(
        'No se puede cancelar un pedido que ya está facturado o completado',
      );
    }

    // 3. Validar que no esté ya cancelado
    if (pedido.estado === EstadoPedido.CANCELADO) {
      throw new BadRequestException('El pedido ya está cancelado');
    }

    // 4. Si está confirmado o en proceso, liberar reservas
    if (
      pedido.estado === EstadoPedido.CONFIRMADO ||
      pedido.estado === EstadoPedido.EN_PREPARACION ||
      pedido.estado === EstadoPedido.LISTO_DESPACHO ||
      pedido.estado === EstadoPedido.LISTO_FACTURAR
    ) {
      for (const item of pedido.detalle) {
        // Crear movimiento de LIBERACION
        await client.from('movimientos_inventario').insert({
          tenant_id: tenantId,
          producto_id: item.producto_id,
          tipo: 'LIBERACION',
          cantidad: item.cantidad,
          referencia_tipo: 'PEDIDO',
          referencia_id: id,
          notas: `Liberación por cancelación de pedido ${pedido.numero}. Motivo: ${motivo || 'No especificado'}`,
        });

        // Decrementar stock_reservado
        await client.rpc('decrementar_stock_reservado', {
          p_producto_id: item.producto_id,
          p_cantidad: item.cantidad,
        });
      }
    }

    // 5. Cambiar estado a CANCELADO
    await this.updateEstado(id, EstadoPedido.CANCELADO, tenantId);

    // 6. Registrar motivo de cancelación en notas
    if (motivo) {
      const notasActualizadas = pedido.notas
        ? `${pedido.notas}\n\n[CANCELADO] ${motivo}`
        : `[CANCELADO] ${motivo}`;

      await client
        .from('pedidos_venta')
        .update({ notas: notasActualizadas })
        .eq('id', id)
        .eq('tenant_id', tenantId);
    }

    // 7. Notificar
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: 'PEDIDO_CANCELADO' as any,
        severity: 'WARNING' as any,
        title: 'Pedido cancelado',
        message: `El pedido ${pedido.numero} ha sido cancelado. ${motivo ? `Motivo: ${motivo}` : ''}`,
        usuario_id: userId,
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      // No fallar si la notificación falla
    }

    console.log('✅ [PedidosService] Pedido cancelado:', id);

    return { success: true };
  }

  /**
   * Generar factura desde pedido
   * Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
   */
  async generarFactura(
    id: string,
    tenantId: string,
    userId?: string,
  ): Promise<{ success: boolean; factura_id?: string; sugerir_gre?: boolean }> {
    const client = this.supabase.getClient();

    // 1. Obtener pedido
    const pedido = await this.findOne(id, tenantId);

    // 2. Validar estado
    if (pedido.estado !== EstadoPedido.LISTO_FACTURAR) {
      throw new BadRequestException(
        `No se puede generar factura para un pedido en estado ${pedido.estado}`,
      );
    }

    // 3. Obtener configuración
    const { data: config } = await client
      .from('empresa_config')
      .select('usar_flujo_logistica, gre_automatico_habilitado, umbral_gre_automatico')
      .eq('tenant_id', tenantId)
      .single();

    // 4. Si es flujo simplificado, descontar stock ahora
    if (config && !config.usar_flujo_logistica) {
      for (const item of pedido.detalle) {
        // Crear movimiento de SALIDA
        await client.from('movimientos_inventario').insert({
          tenant_id: tenantId,
          producto_id: item.producto_id,
          tipo: 'SALIDA',
          cantidad: item.cantidad,
          referencia_tipo: 'PEDIDO',
          referencia_id: id,
          notas: `Salida por facturación de pedido ${pedido.numero}`,
        });

        // Descontar stock_actual y liberar reserva
        await client.rpc('descontar_stock_y_liberar_reserva', {
          p_producto_id: item.producto_id,
          p_cantidad: item.cantidad,
        });
      }
    }

    // 5. Preparar datos para CPE
    // Nota: La integración real con CPE se hará en una tarea posterior
    // Por ahora, simulamos la creación de la factura
    const facturaData = {
      tenant_id: tenantId,
      tipo_documento: '01', // Factura
      cliente_id: pedido.cliente_id,
      fecha_emision: new Date().toISOString().split('T')[0],
      subtotal: pedido.subtotal,
      igv: pedido.igv,
      total: pedido.total,
      estado: 'PENDIENTE',
      created_by: userId,
    };

    // TODO: Integrar con CPEService cuando esté disponible
    // const factura = await this.cpeService.generarFactura(facturaData);
    
    // Por ahora, creamos un registro simulado
    const { data: factura, error: facturaError } = await client
      .from('documentos')
      .insert(facturaData)
      .select()
      .single();

    if (facturaError) {
      console.error('Error creating factura:', facturaError);
      throw new BadRequestException('Error al generar la factura');
    }

    // 6. Actualizar pedido con factura_id
    await client
      .from('pedidos_venta')
      .update({
        factura_id: factura.id,
        estado: EstadoPedido.FACTURADO,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    // 7. Verificar si debe sugerir GRE
    let sugerirGRE = false;
    if (config) {
      if (config.gre_automatico_habilitado && pedido.total > (config.umbral_gre_automatico || 0)) {
        sugerirGRE = true;
      }
    }

    // 8. Notificar
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: 'FACTURA_EMITIDA' as any,
        severity: 'SUCCESS' as any,
        title: 'Factura emitida',
        message: `La factura para el pedido ${pedido.numero} ha sido emitida exitosamente`,
        usuario_id: userId,
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      // No fallar si la notificación falla
    }

    console.log('✅ [PedidosService] Factura generada para pedido:', id);

    return {
      success: true,
      factura_id: factura.id,
      sugerir_gre: sugerirGRE,
    };
  }

  /**
   * Obtener stock disponible de un producto
   * Requirements: 6.1, 6.2
   */
  private async getStockDisponible(productoId: string, tenantId: string): Promise<number> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('productos')
      .select('stock_actual, stock_reservado')
      .eq('id', productoId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      console.error('Error fetching stock:', error);
      return 0;
    }

    const stockActual = data.stock_actual || 0;
    const stockReservado = data.stock_reservado || 0;

    return stockActual - stockReservado;
  }

  /**
   * Generar número de pedido
   * Formato: PV-YYYY-NNNN
   */
  private async generarNumero(tenantId: string): Promise<string> {
    const client = this.supabase.getClient();
    const year = new Date().getFullYear();
    const prefix = `PV-${year}-`;

    // Obtener el último número del año
    const { data, error } = await client
      .from('pedidos_venta')
      .select('numero')
      .eq('tenant_id', tenantId)
      .like('numero', `${prefix}%`)
      .order('numero', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error generating numero:', error);
      throw new BadRequestException('Error al generar número de pedido');
    }

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastNumero = data[0].numero;
      const lastNumber = parseInt(lastNumero.split('-')[2], 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Obtener historial completo de cambios del pedido
   * Requirements: 27.4
   */
  async getHistorial(id: string, tenantId: string) {
    // Verificar que el pedido existe
    const pedido = await this.findOne(id, tenantId);

    // Obtener logs de auditoría del pedido
    const auditLogs = await this.auditService.getResourceAuditLogs(
      tenantId,
      'pedidos_venta',
      id,
    );

    // Obtener logs de integración relacionados con el pedido
    const integrationLogs = await this.auditService.getIntegrationLogs(tenantId, {
      correlacion_id: id,
      correlacion_tipo: 'PEDIDO',
    });

    // Obtener movimientos de inventario relacionados
    const client = this.supabase.getClient();
    const { data: movimientos } = await client
      .from('movimientos_inventario')
      .select('*, productos(nombre, codigo)')
      .eq('tenant_id', tenantId)
      .eq('referencia_tipo', 'PEDIDO')
      .eq('referencia_id', id)
      .order('created_at', { ascending: false });

    // Construir timeline unificado
    const timeline = [];

    // Agregar eventos de auditoría
    for (const log of auditLogs) {
      timeline.push({
        tipo: 'AUDITORIA',
        timestamp: log.timestamp,
        operacion: log.operation,
        usuario_id: log.user_id,
        cambios: {
          old: log.old_values,
          new: log.new_values,
          changed_fields: log.changed_fields,
        },
        metadata: log.metadata,
      });
    }

    // Agregar eventos de integración
    for (const log of integrationLogs.data) {
      timeline.push({
        tipo: 'INTEGRACION',
        timestamp: log.timestamp,
        servicio: log.servicio,
        operacion: log.operacion,
        status: log.status,
        duration_ms: log.duration_ms,
        error_message: log.error_message,
      });
    }

    // Agregar movimientos de inventario
    if (movimientos) {
      for (const mov of movimientos) {
        timeline.push({
          tipo: 'INVENTARIO',
          timestamp: mov.created_at,
          movimiento_tipo: mov.tipo,
          producto: mov.productos,
          cantidad: mov.cantidad,
          notas: mov.notas,
        });
      }
    }

    // Ordenar timeline por timestamp descendente
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      pedido: {
        id: pedido.id,
        numero: pedido.numero,
        estado: pedido.estado,
        cliente_id: pedido.cliente_id,
      },
      timeline,
      resumen: {
        total_eventos: timeline.length,
        eventos_auditoria: auditLogs.length,
        eventos_integracion: integrationLogs.data.length,
        movimientos_inventario: movimientos?.length || 0,
      },
    };
  }
}
