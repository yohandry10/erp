import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { calcularDesgloseIgv } from '../../../shared/utils/igv-afectacion.util';
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
        .select('stock_actual, stock_reservado')
        .eq('id', item.producto_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const disponible =
        Number((prodStock as any)?.stock_actual ?? 0) - Number(prodStock?.stock_reservado ?? 0);

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
    const { data: empresaConfig } = await client
      .from('empresa_config')
      .select('moneda_defecto')
      .eq('tenant_id', tenantId)
      .maybeSingle();

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
        moneda: empresaConfig?.moneda_defecto || 'PEN',
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
        tenant_id: tenantId,
        cotizacion_id: cotizacion.id,
        producto_id: item.producto_id,
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

    // ✅ CORRECCIÓN BRECHA 1: Reservar stock para la cotización
    try {
      const { data: reservaResult, error: reservaError } = await client
        .rpc('reservar_stock_cotizacion', {
          p_cotizacion_id: cotizacion.id,
          p_tenant_id: tenantId,
        });

      if (reservaError) {
        console.error('⚠️ [CotizacionesService] Error reservando stock:', reservaError);
        // No fallar la creación, solo loguear (el stock ya fue validado arriba)
      } else {
        console.log('✅ [CotizacionesService] Stock reservado:', reservaResult);
      }
    } catch (reservaErr) {
      console.error('⚠️ [CotizacionesService] Error en reserva de stock:', reservaErr);
      // Continuar sin fallar - la validación de stock ya se hizo
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
        cliente:clientes!cotizaciones_cliente_id_fkey (
          id,
          razon_social,
          documento_numero:codigo,
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
        cliente:clientes!cotizaciones_cliente_id_fkey (
          id,
          razon_social,
          documento_numero:codigo,
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
      // Columna real en `cotizaciones`: `observaciones` (no `notas`).
      updateData.observaciones = updateCotizacionDto.notas;
    }

    // Si se actualiza el detalle, recalcular totales
    if (updateCotizacionDto.detalle) {
      const { subtotal, igv, total } = await this.calcularTotales(updateCotizacionDto.detalle, tenantId);
      updateData.subtotal = subtotal;
      updateData.igv = igv;
      updateData.total = total;

      // Eliminar detalle anterior
      const { error: deleteDetalleError } = await client
        .from('cotizacion_detalles')
        .delete()
        .eq('cotizacion_id', id);

      if (deleteDetalleError) {
        console.error('Error deleting cotizacion detalle:', deleteDetalleError);
        throw new BadRequestException('Error al eliminar el detalle anterior de la cotización');
      }

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
        .from('cotizacion_detalles')
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

    // Eliminar detalle (por nombre de tabla real: cotizacion_detalles)
    await client.from('cotizacion_detalles').delete().eq('cotizacion_id', id);

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
   * ✅ CORRECCIÓN BRECHA 2: Usa función RPC transaccional para garantizar atomicidad
   * - Si falla la creación del pedido, no se actualiza la cotización
   * - Si falla la actualización de la cotización, se hace rollback del pedido
   * - Todo en una sola transacción de base de datos
   */
  async convertirAPedido(
    id: string,
    convertirPedidoDto: ConvertirPedidoDto,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    const client = this.supabase.getClient();

    // Obtener cotización para validaciones previas y datos de respuesta
    const cotizacion = await this.findOne(id, tenantId);

    // Validaciones previas (también se hacen en la función RPC, pero mejor fallar rápido)
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

    if (cotizacion.fecha_vencimiento) {
      const hoy = new Date().toISOString().split('T')[0];
      const fechaVencimiento = String(cotizacion.fecha_vencimiento).split('T')[0];

      if (fechaVencimiento < hoy) {
        throw new BadRequestException('No se puede convertir una cotización vencida');
      }
    }

    if (!cotizacion.detalle || cotizacion.detalle.length === 0) {
      throw new BadRequestException('La cotización no tiene productos para convertir en pedido');
    }

    // ✅ CORRECCIÓN BRECHA 2: Usar función RPC transaccional
    let resultado: any;
    const { data: resultadoRpc, error: rpcError } = await client
      .rpc('convertir_cotizacion_a_pedido', {
        p_cotizacion_id: id,
        p_tenant_id: tenantId,
        p_user_id: userId || null,
        p_notas: convertirPedidoDto.notas ?? cotizacion.observaciones ?? null,
      });

    if (rpcError) {
      console.error('❌ [CotizacionesService] Error en conversión transaccional:', rpcError);
      const esDuplicado =
        rpcError.code === '23505' ||
        String(rpcError.message ?? '').toLowerCase().includes('duplicate key value') ||
        String(rpcError.message ?? '').toLowerCase().includes('unique constraint');

      if (!esDuplicado) {
        throw new BadRequestException(
          rpcError.message || 'Error al convertir cotización a pedido',
        );
      }

      resultado = await this.convertirAPedidoConCorrelativoSeguro(
        cotizacion,
        convertirPedidoDto,
        tenantId,
        userId,
      );
    } else {
      resultado = resultadoRpc;
    }

    if (!resultado?.success) {
      throw new BadRequestException('Error al convertir cotización a pedido');
    }

    console.log('✅ [CotizacionesService] Conversión transaccional exitosa:', resultado);

    // Obtener cotización actualizada
    const updatedCotizacion = await this.findOne(id, tenantId);

    // Emitir notificación (no crítico, no falla si hay error)
    try {
      await this.notificationsService.createNotification(tenantId, {
        type: NotificationType.CONFIGURATION_INCOMPLETE,
        severity: NotificationSeverity.INFO,
        title: 'Cotización convertida',
        message: `La cotización ${cotizacion.numero} ha sido convertida al pedido ${resultado.pedido_numero}`,
        usuario_id: userId,
      });
    } catch (error) {
      console.error('Error creating notification:', error);
    }

    console.log('✅ [CotizacionesService] Cotización convertida a pedido:', id);

    return {
      success: true,
      message: 'Cotización convertida exitosamente',
      data: {
        pedido_id: resultado.pedido_id,
        pedido_numero: resultado.pedido_numero,
        cotizacion: updatedCotizacion,
      },
    };
  }

  private async convertirAPedidoConCorrelativoSeguro(
    cotizacion: any,
    convertirPedidoDto: ConvertirPedidoDto,
    tenantId: string,
    userId?: string,
  ): Promise<any> {
    const client = this.supabase.getClient();
    let pedidoCreado: any = null;
    let ultimoError: any = null;

    for (let intento = 1; intento <= 2; intento += 1) {
      const numero = await this.generarNumeroPedidoSeguro(tenantId);

      const { data: pedido, error: pedidoError } = await client
        .from('pedidos_venta')
        .insert({
          tenant_id: tenantId,
          numero,
          cotizacion_id: cotizacion.id,
          cliente_id: cotizacion.cliente_id,
          fecha_pedido: new Date().toISOString().split('T')[0],
          fecha: new Date().toISOString().split('T')[0],
          estado: 'PENDIENTE',
          subtotal: cotizacion.subtotal ?? 0,
          igv: cotizacion.igv ?? 0,
          total: cotizacion.total ?? 0,
          moneda: cotizacion.moneda ?? 'PEN',
          observaciones: convertirPedidoDto.notas ?? cotizacion.observaciones ?? null,
          notas: convertirPedidoDto.notas ?? cotizacion.observaciones ?? null,
          created_by: userId ?? null,
        })
        .select('id, numero')
        .single();

      if (!pedidoError) {
        pedidoCreado = pedido;
        break;
      }

      ultimoError = pedidoError;
      const esDuplicado =
        pedidoError.code === '23505' ||
        String(pedidoError.message ?? '').toLowerCase().includes('duplicate key value') ||
        String(pedidoError.message ?? '').toLowerCase().includes('unique constraint');

      if (!esDuplicado || intento === 2) {
        throw new BadRequestException(pedidoError.message || 'Error al crear pedido desde cotización');
      }
    }

    if (!pedidoCreado) {
      throw new BadRequestException(ultimoError?.message || 'Error al crear pedido desde cotización');
    }

    const detalles = (cotizacion.detalle ?? []).map((item: any) => ({
      tenant_id: tenantId,
      pedido_id: pedidoCreado.id,
      producto_id: item.producto_id,
      descripcion: item.descripcion ?? item.producto_nombre ?? 'Producto',
      cantidad: item.cantidad ?? 0,
      precio_unitario: item.precio_unitario ?? 0,
      subtotal: item.subtotal ?? Number(item.cantidad ?? 0) * Number(item.precio_unitario ?? 0),
      estado_item: 'PENDIENTE',
    }));

    const { error: detalleError } = await client
      .from('pedidos_venta_detalle')
      .insert(detalles);

    if (detalleError) {
      await client.from('pedidos_venta').delete().eq('id', pedidoCreado.id).eq('tenant_id', tenantId);
      throw new BadRequestException(detalleError.message || 'Error al crear detalle del pedido');
    }

    const { error: cotizacionError } = await client
      .from('cotizaciones')
      .update({
        estado: EstadoCotizacion.CONVERTIDA,
        fecha_conversion: new Date().toISOString(),
        convertido_por: userId ?? null,
        pedido_id: pedidoCreado.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cotizacion.id)
      .eq('tenant_id', tenantId);

    if (cotizacionError) {
      await client.from('pedidos_venta_detalle').delete().eq('pedido_id', pedidoCreado.id);
      await client.from('pedidos_venta').delete().eq('id', pedidoCreado.id).eq('tenant_id', tenantId);
      throw new BadRequestException(cotizacionError.message || 'Error al actualizar cotización convertida');
    }

    return {
      success: true,
      pedido_id: pedidoCreado.id,
      pedido_numero: pedidoCreado.numero,
      cotizacion_id: cotizacion.id,
    };
  }

  private async generarNumeroPedidoSeguro(tenantId: string): Promise<string> {
    const client = this.supabase.getClient();
    const year = new Date().getFullYear();
    const prefix = `PED-${year}-`;

    const { data, error } = await client
      .from('pedidos_venta')
      .select('numero')
      .eq('tenant_id', tenantId)
      .like('numero', `${prefix}%`)
      .order('numero', { ascending: false })
      .limit(50);

    if (error) {
      throw new BadRequestException('Error al generar número de pedido');
    }

    const maxSuffix = (data ?? []).reduce((max: number, row: any) => {
      const match = String(row.numero ?? '').match(/^PED-\d{4}-(\d+)$/);
      const suffix = match ? Number.parseInt(match[1], 10) : 0;
      return Number.isFinite(suffix) && suffix > max ? suffix : max;
    }, 0);

    return `${prefix}${String(maxSuffix + 1).padStart(4, '0')}`;
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
    detalle: Array<{ producto_id?: string; cantidad: number; precio_unitario: number }>,
    tenantId: string,
  ) {
    const subtotal = detalle.reduce(
      (sum, item) => sum + item.cantidad * item.precio_unitario,
      0,
    );
    
    // La cotización debe ofrecer el mismo importe que después se facturará: si
    // grava bienes exonerados, el cliente ve un precio que no corresponde y el
    // pedido que nace de ella arrastra el error.
    const afectaciones = await this.obtenerAfectacionesProductos(detalle, tenantId);
    const tasaIgv = await this.taxCalculator.getTasaIgv(tenantId);

    const desglose = calcularDesgloseIgv(
      detalle.map((item) => ({
        baseImponible: Math.round(item.cantidad * item.precio_unitario * 100) / 100,
        afectacionIgv: item.producto_id ? afectaciones.get(item.producto_id) : undefined,
      })),
      tasaIgv,
    );

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      igv: desglose.igv,
      total: Math.round((subtotal + desglose.igv) * 100) / 100,
    };
  }

  /** Afectación del IGV por producto, para no depender de lo que envíe el cliente. */
  private async obtenerAfectacionesProductos(
    detalle: Array<{ producto_id?: string }>,
    tenantId: string,
  ): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    const ids = Array.from(new Set(detalle.map((item) => item.producto_id).filter(Boolean))) as string[];
    if (ids.length === 0) return mapa;

    try {
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('id, afectacion_igv')
        .eq('tenant_id', tenantId)
        .in('id', ids);

      if (error) {
        console.warn('⚠️ [CotizacionesService] No se pudo leer la afectación IGV de los productos:', error.message);
        return mapa;
      }

      for (const producto of data || []) {
        mapa.set((producto as any).id, (producto as any).afectacion_igv);
      }
    } catch (lecturaError: any) {
      // Sin afectación conocida se asume gravado, que es el default del Catálogo
      // 07 y el que no sub-declara IGV.
      console.warn('⚠️ [CotizacionesService] No se pudo resolver la afectación IGV:', lecturaError?.message ?? lecturaError);
    }

    return mapa;
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

    // ✅ CORRECCIÓN: Liberar stock reservado antes de eliminar
    try {
      const { error: liberarError } = await client
        .rpc('liberar_stock_cotizacion', {
          p_cotizacion_id: id,
          p_tenant_id: tenantId,
        });

      if (liberarError) {
        console.error('⚠️ [CotizacionesService] Error liberando stock:', liberarError);
        // Continuar con la eliminación aunque falle la liberación
      } else {
        console.log('✅ [CotizacionesService] Stock liberado para cotización:', id);
      }
    } catch (liberarErr) {
      console.error('⚠️ [CotizacionesService] Error en liberación de stock:', liberarErr);
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
