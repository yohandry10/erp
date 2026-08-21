import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { calcularDesgloseIgv } from '../../../shared/utils/igv-afectacion.util';
import { NotificationType, NotificationSeverity } from '../../notifications/notification.types';
import { CreateCotizacionDto, UpdateCotizacionDto, ConvertirPedidoDto } from './dto';
import { Cotizacion, EstadoCotizacion, CotizacionDetalle } from './entities';

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

    if (!userId) {
      throw new BadRequestException('No se pudo identificar al creador de la cotización');
    }

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

    // Calcular totales
    const { subtotal, igv, total } = await this.calcularTotales(createCotizacionDto.detalle, tenantId);
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
        .eq('tenant_id', tenantId)
        .single();
      
      if (usuario) {
        vendedorNombre = usuario.nombre && usuario.apellido 
          ? `${usuario.nombre} ${usuario.apellido}`
          : usuario.email;
      }
    }

    // Una cotización ofrece precios; no inmoviliza inventario. La reserva se
    // realiza al confirmar el pedido que nazca de ella.
    const detalleData = createCotizacionDto.detalle.map((item, index) => {
      return {
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        orden: index + 1,
      };
    });

    // La moneda queda escrita en la cotización; suponer soles la falsearía para
    // un contribuyente que no factura en PEN.
    const monedaCotizacion = String(empresaConfig?.moneda_defecto || '').trim().toUpperCase();
    if (!monedaCotizacion) {
      throw new BadRequestException(
        'La empresa no tiene moneda configurada; configúrela antes de emitir cotizaciones.',
      );
    }

    const { data: resultado, error: createError } = await client.rpc('crear_cotizacion_comercial_tx', {
      p_tenant_id: tenantId,
      p_created_by: userId,
      p_cliente_id: createCotizacionDto.cliente_id,
      p_fecha_vencimiento: createCotizacionDto.fecha_vencimiento || null,
      p_observaciones: createCotizacionDto.notas || null,
      p_vendedor: vendedorNombre,
      p_moneda: monedaCotizacion,
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_detalle: detalleData,
    });

    if (createError || !(resultado as any)?.cotizacion) {
      console.error('Error creating cotizacion atomically:', createError);
      throw new BadRequestException(createError?.message || 'Error al crear la cotización');
    }

    const cotizacion = (resultado as any).cotizacion as Cotizacion;
    const detalle = ((resultado as any).detalle || []) as CotizacionDetalle[];

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
      .eq('tenant_id', tenantId)
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
    const updateData: any = {};

    if (updateCotizacionDto.cliente_id) {
      updateData.cliente_id = updateCotizacionDto.cliente_id;
    }

    if (updateCotizacionDto.fecha_vencimiento !== undefined) {
      updateData.fecha_vencimiento = updateCotizacionDto.fecha_vencimiento;
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

    }

    const detalleData = updateCotizacionDto.detalle
      ? updateCotizacionDto.detalle.map((item, index) => ({
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        orden: index + 1,
      }))
      : null;

    // Cabecera y detalle se reemplazan dentro de una única transacción. Si
    // una línea falla, PostgreSQL conserva íntegra la cotización anterior.
    const { error } = await client.rpc('actualizar_cotizacion_comercial_tx', {
      p_cotizacion_id: id,
      p_tenant_id: tenantId,
      p_patch: updateData,
      p_detalle: detalleData,
    });

    if (error) {
      console.error('Error updating cotizacion atomically:', error);
      throw new BadRequestException(error.message || 'Error al actualizar la cotización');
    }

    console.log('✅ [CotizacionesService] Cotización actualizada:', id);

    // Retornar cotización actualizada con detalle
    return this.findOne(id, tenantId);
  }

  async cambiarEstado(
    id: string,
    tenantId: string,
    nuevoEstado: EstadoCotizacion.ENVIADA | EstadoCotizacion.APROBADA | EstadoCotizacion.RECHAZADA,
    actorId?: string,
    motivo?: string,
  ): Promise<Cotizacion & { detalle: CotizacionDetalle[] }> {
    if (!actorId) {
      throw new BadRequestException('No se pudo identificar al actor de la transición');
    }

    const { data: resultado, error } = await this.supabase.getClient().rpc('cambiar_estado_cotizacion_tx', {
      p_cotizacion_id: id,
      p_tenant_id: tenantId,
      p_nuevo_estado: nuevoEstado,
      p_actor_id: actorId,
      p_motivo: motivo ?? null,
    });

    if (error) {
      throw new BadRequestException(error.message || 'No se pudo cambiar el estado de la cotización');
    }

    try {
      return await this.findOne(id, tenantId);
    } catch (hydrationError) {
      // La transición ya quedó confirmada por PostgreSQL. Una lectura posterior
      // puede fallar de forma transitoria, pero no debe convertir ese commit en
      // un falso error ni provocar un retry de una transición ya consumida.
      console.warn(
        '⚠️ [CotizacionesService] Estado confirmado; no se pudo hidratar la cotización:',
        hydrationError,
      );
      return {
        id: resultado?.cotizacion_id ?? id,
        tenant_id: tenantId,
        estado: nuevoEstado,
        detalle: [],
      } as Cotizacion & { detalle: CotizacionDetalle[] };
    }
  }

  /**
   * Eliminar una cotización
   * Requirements: 3.1
   */
  async delete(id: string, tenantId: string): Promise<void> {
    return this.remove(id, tenantId);
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

    if (!cotizacion.detalle || cotizacion.detalle.length === 0) {
      throw new BadRequestException('La cotización no tiene productos para convertir en pedido');
    }

    // ✅ CORRECCIÓN BRECHA 2: Usar función RPC transaccional
    const { data: resultado, error: rpcError } = await client
      .rpc('convertir_cotizacion_comercial_a_pedido_tx', {
        p_cotizacion_id: id,
        p_tenant_id: tenantId,
        p_user_id: userId || null,
        p_notas: convertirPedidoDto.notas ?? cotizacion.observaciones ?? null,
      });

    if (rpcError) {
      console.error('❌ [CotizacionesService] Error en conversión transaccional:', rpcError);
      throw new BadRequestException(
        rpcError.message || 'Error al convertir cotización a pedido',
      );
    }

    if (!resultado?.success) {
      throw new BadRequestException('Error al convertir cotización a pedido');
    }

    console.log('✅ [CotizacionesService] Conversión transaccional exitosa:', resultado);

    // Obtener cotización actualizada
    let updatedCotizacion: Cotizacion & { detalle: CotizacionDetalle[] };
    try {
      updatedCotizacion = await this.findOne(id, tenantId);
    } catch (hydrationError) {
      // La conversión y el enlace al pedido ya hicieron commit dentro del RPC.
      // Reutilizamos la instantánea validada para responder de forma idempotente.
      console.warn(
        '⚠️ [CotizacionesService] Conversión confirmada; no se pudo hidratar la cotización:',
        hydrationError,
      );
      updatedCotizacion = {
        ...cotizacion,
        estado: EstadoCotizacion.CONVERTIDA,
        pedido_id: resultado.pedido_id,
      } as Cotizacion & { detalle: CotizacionDetalle[] };
    }

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

  /**
   * Marcar cotizaciones vencidas automáticamente
   * Requirements: 3.7
   */
  async marcarVencidas(tenantId: string): Promise<number> {
    const client = this.supabase.getClient();

    // La fecha comercial pertenece al tenant. Resolverla en PostgreSQL evita
    // vencer documentos un día antes/después por la zona horaria del proceso.
    const { data, error } = await client.rpc('marcar_cotizaciones_vencidas_tx', {
      p_tenant_id: tenantId,
    });

    if (error) {
      console.error('Error marking cotizaciones as vencidas:', error);
      throw new BadRequestException('Error al marcar cotizaciones vencidas');
    }

    const count = Number(data ?? 0);
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
    const bases = detalle.map(
      (item) => Math.round(item.cantidad * item.precio_unitario * 100) / 100,
    );
    const subtotal = bases.reduce((sum, base) => sum + base, 0);
    
    // La cotización debe ofrecer el mismo importe que después se facturará: si
    // grava bienes exonerados, el cliente ve un precio que no corresponde y el
    // pedido que nace de ella arrastra el error.
    const afectaciones = await this.obtenerAfectacionesProductos(detalle, tenantId);
    const tasaIgv = await this.taxCalculator.getTasaIgv(tenantId);

    const desglose = calcularDesgloseIgv(
      detalle.map((item, index) => ({
        baseImponible: bases[index],
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

    const { error } = await client.rpc('eliminar_cotizacion_tx', {
      p_cotizacion_id: id,
      p_tenant_id: tenantId,
    });

    if (error) {
      console.error('❌ [CotizacionesService] Error deleting cotizacion atomically:', error);
      throw new BadRequestException(error.message || 'Error al eliminar la cotización');
    }

    console.log('✅ [CotizacionesService] Cotización eliminada:', id);
  }
}
