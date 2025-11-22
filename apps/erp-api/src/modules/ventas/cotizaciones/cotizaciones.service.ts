import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { NotificationType, NotificationSeverity } from '../../notifications/notification.types';
import { CreateCotizacionDto, UpdateCotizacionDto, ConvertirPedidoDto } from './dto';
import { Cotizacion, EstadoCotizacion, CotizacionDetalle } from './entities';
import { PedidosService } from '../pedidos/pedidos.service';
import { CreatePedidoDto } from '../pedidos/dto';

/**
 * CotizacionesService
 * Servicio para gestionar cotizaciones del módulo de ventas
 * Requirements: 3.1, 3.5, 3.6, 3.7, 4.2, 4.3, 4.4, 27.1, 27.2, 27.4
 */
@Injectable()
export class CotizacionesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    private readonly taxCalculator: TaxCalculatorService,
    private readonly pedidosService: PedidosService,
  ) {}

  /**
   * Crear una nueva cotización con cálculo de totales
   * Requirements: 3.2, 3.3, 15.6
   */
  async create(
    createCotizacionDto: CreateCotizacionDto,
    tenantId: string,
    userId?: string,
  ): Promise<Cotizacion & { detalle: CotizacionDetalle[] }> {
    const client = this.supabase.getClient();

    // Validar que el cliente existe
    const { data: cliente, error: clienteError } = await client
      .from('clientes')
      .select('id')
      .eq('id', createCotizacionDto.cliente_id)
      .eq('tenant_id', tenantId)
      .single();

    if (clienteError || !cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    // Validar stock disponible antes de crear cotización (bloqueo hard)
    for (const item of createCotizacionDto.detalle) {
      const { data: prodStock } = await client
        .from('productos')
        .select('stock, stock_reservado')
        .eq('id', item.producto_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const disponible =
        Number(prodStock?.stock ?? 0) - Number(prodStock?.stock_reservado ?? 0);

      if (Number(item.cantidad ?? 0) > disponible) {
        throw new BadRequestException({
          message: 'Stock insuficiente para uno o más productos',
          warnings: [
            {
              producto_id: item.producto_id,
              solicitado: Number(item.cantidad ?? 0),
              disponible,
            },
          ],
        });
      }
    }

    // Calcular totales
    const { subtotal, igv, total } = await this.calcularTotales(createCotizacionDto.detalle, tenantId);

    // Generar número de cotización
    const numero = await this.generarNumero(tenantId);

    // Obtener información del usuario para el campo vendedor
    let vendedorNombre = 'Sistema';
    if (userId) {
      const { data: usuario } = await client
        .from('usuarios')
        .select('nombre, apellido, email')
        .eq('id', userId)
        .single();
      
      if (usuario) {
        vendedorNombre = usuario.nombre && usuario.apellido 
          ? `${usuario.nombre} ${usuario.apellido}`
          : usuario.email;
      }
    }

    // Preparar items en formato JSON para la columna items
    const items = createCotizacionDto.detalle.map((item) => ({
      producto_id: item.producto_id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.cantidad * item.precio_unitario,
    }));

    // Crear cotización
    const { data: cotizacion, error: cotizacionError } = await client
      .from('cotizaciones')
      .insert({
        tenant_id: tenantId,
        numero,
        cliente_id: createCotizacionDto.cliente_id,
        fecha_cotizacion: new Date().toISOString().split('T')[0],
        fecha_vencimiento: createCotizacionDto.fecha_vencimiento || null,
        estado: EstadoCotizacion.BORRADOR,
        subtotal,
        igv,
        total,
        observaciones: createCotizacionDto.notas || null,
        vendedor: vendedorNombre, // Nombre del vendedor
        moneda: 'PEN', // Moneda por defecto
        items: items, // Items en formato JSON
        probabilidad: 50, // Probabilidad por defecto
      })
      .select()
      .single();

    if (cotizacionError) {
      console.error('Error creating cotizacion:', cotizacionError);
      throw new BadRequestException('Error al crear la cotización');
    }

    // Obtener información de productos para los detalles
    const productosIds = createCotizacionDto.detalle.map(d => d.producto_id);
    const { data: productos } = await client
      .from('productos')
      .select('id, codigo, nombre')
      .in('id', productosIds);

    const productosMap = new Map(productos?.map(p => [p.id, p]) || []);

    // Crear detalles
    const detalleData = createCotizacionDto.detalle.map((item, index) => {
      const producto = productosMap.get(item.producto_id);
      return {
        cotizacion_id: cotizacion.id,
        producto_id: item.producto_id,
        producto_codigo: producto?.codigo || '',
        producto_nombre: producto?.nombre || item.descripcion,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento_porcentaje: 0,
        descuento_monto: 0,
        subtotal: item.cantidad * item.precio_unitario,
        orden: index + 1,
      };
    });

    const { data: detalle, error: detalleError } = await client
      .from('cotizacion_detalles')
      .insert(detalleData)
      .select();

    if (detalleError) {
      console.error('Error creating cotizacion detalle:', detalleError);
      // Rollback: eliminar cotización
      await client.from('cotizaciones').delete().eq('id', cotizacion.id);
      throw new BadRequestException('Error al crear el detalle de la cotización');
    }

    console.log('✅ [CotizacionesService] Cotización creada:', cotizacion.id);

    return {
      ...cotizacion,
      detalle: detalle || [],
    };
  }

  /**
   * Listar cotizaciones con filtros por estado
   * Requirements: 3.1
   */
  async findAll(
    tenantId: string,
    filters?: {
      estado?: EstadoCotizacion;
      cliente_id?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: Cotizacion[]; pagination: any }> {
    const client = this.supabase.getClient();

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    let query = client
      .from('cotizaciones')
      .select(`
        *,
        cliente:cliente_id (
          id,
          razon_social,
          numero_documento,
          documento_tipo
        )
      `, { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Filtro por estado
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    // Filtro por cliente
    if (filters?.cliente_id) {
      query = query.eq('cliente_id', filters.cliente_id);
    }

    // Búsqueda por número
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.ilike('numero', searchTerm);
    }

    // Ordenar y paginar
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ [CotizacionesService] Error fetching cotizaciones:', error);
      throw new BadRequestException('Error al obtener cotizaciones');
    }

    console.log(`✅ [CotizacionesService] Cotizaciones encontradas: ${data?.length || 0} de ${count || 0} total`);

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
   * Obtener una cotización por ID con detalles y cliente
   * Requirements: 3.4
   */
  async findOne(
    id: string,
    tenantId: string,
  ): Promise<Cotizacion & { detalle: CotizacionDetalle[] }> {
    const client = this.supabase.getClient();

    const { data: cotizacion, error: cotizacionError } = await client
      .from('cotizaciones')
      .select(`
        *,
        cliente:cliente_id (
          id,
          razon_social,
          numero_documento,
          documento_tipo
        )
      `)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (cotizacionError || !cotizacion) {
      console.error('❌ [CotizacionesService] Error fetching cotizacion:', cotizacionError);
      throw new NotFoundException('Cotización no encontrada');
    }

    console.log('✅ [CotizacionesService] Cotización encontrada:', id);

    // Obtener detalle
    const { data: detalle, error: detalleError } = await client
      .from('cotizacion_detalles')
      .select('*')
      .eq('cotizacion_id', id)
      .order('created_at', { ascending: true });

    if (detalleError) {
      console.error('Error fetching cotizacion detalle:', detalleError);
      throw new BadRequestException('Error al obtener el detalle de la cotización');
    }

    return {
      ...cotizacion,
      detalle: detalle || [],
    };
  }

  /**
   * Actualizar una cotización con recálculo de totales
   * Requirements: 3.5
   */
  async update(
    id: string,
    updateCotizacionDto: UpdateCotizacionDto,
    tenantId: string,
  ): Promise<Cotizacion & { detalle: CotizacionDetalle[] }> {
    const client = this.supabase.getClient();

    // Verificar que la cotización existe
    const cotizacion = await this.findOne(id, tenantId);

    // Validar que se puede editar (solo BORRADOR)
    if (cotizacion.estado !== EstadoCotizacion.BORRADOR && updateCotizacionDto.detalle) {
      throw new BadRequestException(
        'Solo se pueden editar los productos de cotizaciones en estado BORRADOR',
      );
    }

    // Preparar datos de actualización
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updateCotizacionDto.cliente_id) {
      updateData.cliente_id = updateCotizacionDto.cliente_id;
    }

    if (updateCotizacionDto.fecha_vencimiento !== undefined) {
      updateData.fecha_vencimiento = updateCotizacionDto.fecha_vencimiento;
    }

    if (updateCotizacionDto.estado) {
      updateData.estado = updateCotizacionDto.estado;
    }

    if (updateCotizacionDto.notas !== undefined) {
      updateData.notas = updateCotizacionDto.notas;
    }

    // Si se actualiza el detalle, recalcular totales
    if (updateCotizacionDto.detalle) {
      const { subtotal, igv, total } = await this.calcularTotales(updateCotizacionDto.detalle, tenantId);
      updateData.subtotal = subtotal;
      updateData.igv = igv;
      updateData.total = total;

      // Eliminar detalle anterior
      await client.from('cotizaciones_detalle').delete().eq('cotizacion_id', id);

      // Crear nuevo detalle
      const detalleData = updateCotizacionDto.detalle.map((item) => ({
        cotizacion_id: id,
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.cantidad * item.precio_unitario,
      }));

      const { error: detalleError } = await client
        .from('cotizaciones_detalle')
        .insert(detalleData);

      if (detalleError) {
        console.error('Error updating cotizacion detalle:', detalleError);
        throw new BadRequestException('Error al actualizar el detalle de la cotización');
      }
    }

    // Actualizar cotización
    const { data, error } = await client
      .from('cotizaciones')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating cotizacion:', error);
      throw new BadRequestException('Error al actualizar la cotización');
    }

    console.log('✅ [CotizacionesService] Cotización actualizada:', id);

    // Retornar cotización actualizada con detalle
    return this.findOne(id, tenantId);
  }

  /**
   * Eliminar una cotización
   * Requirements: 3.1
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const client = this.supabase.getClient();

    // Verificar que la cotización existe
    const cotizacion = await this.findOne(id, tenantId);

    // Validar que no esté convertida
    if (cotizacion.estado === EstadoCotizacion.CONVERTIDA) {
      throw new BadRequestException(
        'No se puede eliminar una cotización que ya fue convertida a pedido',
      );
    }

    // Eliminar detalle (cascade debería hacerlo automáticamente)
    await client.from('cotizaciones_detalle').delete().eq('cotizacion_id', id);

    // Eliminar cotización
    const { error } = await client
      .from('cotizaciones')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting cotizacion:', error);
      throw new BadRequestException('Error al eliminar la cotización');
    }

    console.log('✅ [CotizacionesService] Cotización eliminada:', id);
  }

  /**
   * Convertir cotización a pedido
   * Requirements: 4.2, 4.3, 4.4
   * 
   * Nota: Este método prepara los datos para crear el pedido.
   * La creación real del pedido se hará cuando el PedidosService esté implementado.
   */
  async convertirAPedido(
    id: string,
    convertirPedidoDto: ConvertirPedidoDto,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    const client = this.supabase.getClient();

    // Obtener cotización con detalle
    const cotizacion = await this.findOne(id, tenantId);

    // Validar que se puede convertir
    if (cotizacion.estado === EstadoCotizacion.CONVERTIDA) {
      throw new BadRequestException('Esta cotización ya fue convertida a pedido');
    }

    if (
      cotizacion.estado !== EstadoCotizacion.BORRADOR &&
      cotizacion.estado !== EstadoCotizacion.ENVIADA &&
      cotizacion.estado !== EstadoCotizacion.APROBADA
    ) {
      throw new BadRequestException(
        'Solo se pueden convertir cotizaciones en estado BORRADOR, ENVIADA o APROBADA',
      );
    }

    if (!cotizacion.detalle || cotizacion.detalle.length === 0) {
      throw new BadRequestException('La cotización no tiene productos para convertir en pedido');
    }

    const pedidoDto: CreatePedidoDto = {
      cliente_id: cotizacion.cliente_id,
      cotizacion_id: id,
      detalle: cotizacion.detalle.map((item) => ({
        producto_id: item.producto_id,
        descripcion: item.descripcion || 'Producto sin descripción',
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
      })),
      notas: convertirPedidoDto.notas ?? cotizacion.observaciones ?? cotizacion.notas,
    };

    const pedido = await this.pedidosService.create(pedidoDto, tenantId, userId);

    const now = new Date().toISOString();
    const { error: updateError } = await client
      .from('cotizaciones')
      .update({
        estado: EstadoCotizacion.CONVERTIDA,
        fecha_conversion: now,
        convertido_por: userId || null,
        updated_at: now,
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('❌ [CotizacionesService] Error actualizando cotización tras convertir:', updateError);
      throw new BadRequestException('Cotización convertida pero no se pudo actualizar su estado');
    }

    const updatedCotizacion = await this.findOne(id, tenantId);

    // Emitir notificación
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.CONFIGURATION_INCOMPLETE, // TODO: Agregar tipo VENTAS al enum
        severity: NotificationSeverity.INFO,
        title: 'Cotización convertida',
        message: `La cotización ${cotizacion.numero} ha sido convertida al pedido ${pedido.numero}`,
        usuario_id: userId,
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      // No fallar si la notificación falla
    }

    console.log('✅ [CotizacionesService] Cotización convertida a pedido:', id);

    return {
      success: true,
      message: 'Cotización convertida exitosamente',
      data: {
        pedido_id: pedido.id,
        pedido_numero: pedido.numero,
        cotizacion: updatedCotizacion,
      },
    };
  }

  /**
   * Marcar cotizaciones vencidas automáticamente
   * Requirements: 3.7
   */
  async marcarVencidas(tenantId: string): Promise<number> {
    const client = this.supabase.getClient();

    const hoy = new Date().toISOString().split('T')[0];

    const { data, error } = await client
      .from('cotizaciones')
      .update({ estado: EstadoCotizacion.VENCIDA })
      .eq('tenant_id', tenantId)
      .in('estado', [EstadoCotizacion.BORRADOR, EstadoCotizacion.ENVIADA])
      .lt('fecha_vencimiento', hoy)
      .select();

    if (error) {
      console.error('Error marking cotizaciones as vencidas:', error);
      throw new BadRequestException('Error al marcar cotizaciones vencidas');
    }

    const count = data?.length || 0;
    if (count > 0) {
      console.log(`✅ [CotizacionesService] ${count} cotizaciones marcadas como vencidas`);
    }

    return count;
  }

  /**
   * Calcular totales (subtotal, IGV, total)
   * ✅ Usa TaxCalculatorService para obtener la tasa correcta según el país
   */
  private async calcularTotales(
    detalle: Array<{ cantidad: number; precio_unitario: number }>,
    tenantId: string,
  ) {
    const subtotal = detalle.reduce(
      (sum, item) => sum + item.cantidad * item.precio_unitario,
      0,
    );
    
    // ✅ CORRECCIÓN SRP: Usar TaxCalculatorService centralizado
    const taxResult = await this.taxCalculator.calcularImpuestos({
      subtotal,
      tenantId,
    });

    return {
      subtotal: Math.round(taxResult.subtotal * 100) / 100,
      igv: Math.round(taxResult.igv * 100) / 100,
      total: Math.round(taxResult.total * 100) / 100,
    };
  }

  /**
   * Generar número de cotización
   * Formato: COT-YYYY-NNNN
   */
  private async generarNumero(tenantId: string): Promise<string> {
    const client = this.supabase.getClient();
    const year = new Date().getFullYear();
    const prefix = `COT-${year}-`;

    // Obtener el último número del año
    const { data, error } = await client
      .from('cotizaciones')
      .select('numero')
      .eq('tenant_id', tenantId)
      .like('numero', `${prefix}%`)
      .order('numero', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error generating numero:', error);
      throw new BadRequestException('Error al generar número de cotización');
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
   * Obtener historial completo de cambios de la cotización
   * Requirements: 27.4
   */
  async getHistorial(id: string, tenantId: string) {
    // Verificar que la cotización existe
    const cotizacion = await this.findOne(id, tenantId);

    // Obtener logs de auditoría de la cotización
    const auditLogs = await this.auditService.getResourceAuditLogs(
      tenantId,
      'cotizaciones',
      id,
    );

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

    // Ordenar timeline por timestamp descendente
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      cotizacion: {
        id: cotizacion.id,
        numero: cotizacion.numero,
        estado: cotizacion.estado,
        cliente_id: cotizacion.cliente_id,
      },
      timeline,
      resumen: {
        total_eventos: timeline.length,
        eventos_auditoria: auditLogs.length,
      },
    };
  }

  /**
   * Eliminar una cotización
   * Solo se pueden eliminar cotizaciones en estado BORRADOR
   * Requirements: 3.1, 14.3
   */
  async remove(id: string, tenantId: string): Promise<void> {
    const client = this.supabase.getClient();

    // Verificar que la cotización existe
    const cotizacion = await this.findOne(id, tenantId);

    // Validar que se puede eliminar (solo BORRADOR)
    if (cotizacion.estado !== EstadoCotizacion.BORRADOR) {
      throw new BadRequestException(
        'Solo se pueden eliminar cotizaciones en estado BORRADOR',
      );
    }

    // Eliminar detalles primero
    const { error: detalleError } = await client
      .from('cotizacion_detalles')
      .delete()
      .eq('cotizacion_id', id);

    if (detalleError) {
      console.error('❌ [CotizacionesService] Error deleting cotizacion detalle:', detalleError);
      throw new BadRequestException('Error al eliminar el detalle de la cotización');
    }

    // Eliminar cotización
    const { error: cotizacionError } = await client
      .from('cotizaciones')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (cotizacionError) {
      console.error('❌ [CotizacionesService] Error deleting cotizacion:', cotizacionError);
      throw new BadRequestException('Error al eliminar la cotización');
    }

    console.log('✅ [CotizacionesService] Cotización eliminada:', id);
  }
}
