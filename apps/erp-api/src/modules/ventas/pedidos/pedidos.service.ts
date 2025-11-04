import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { CPEIntegrationService } from './cpe-integration.service';
import { GREIntegrationService } from './gre-integration.service';
import { CreatePedidoDto, UpdatePedidoDto, DecisionAprobacion } from './dto';
import { PedidoVenta, EstadoPedido, PedidoDetalle } from './entities';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

interface ConfiguracionEmpresa {
  usar_flujo_logistica: boolean;
  monto_maximo_sin_aprobacion?: number;
  porcentaje_descuento_maximo?: number;
  requiere_aprobacion_descuento?: boolean;
  aplicar_limite_credito?: boolean;
  dias_vencimiento_factura?: number;
  gre_automatico_habilitado?: boolean;
  umbral_gre_automatico?: number;
  aplicar_retencion?: boolean;
  retencion_tasa?: number;
  aplicar_percepcion?: boolean;
  percepcion_tasa?: number;
  aplicar_detraccion?: boolean;
  detraccion_tasa?: number;
  detraccion_codigo?: string | null;
}

interface EvaluacionPoliticas {
  requiereAprobacion: boolean;
  motivos: string[];
  estadoCredito: string;
}

export interface ResumenCredito {
  limite: number;
  pendiente: number;
  tieneVencidos: boolean;
  permiteMorosidad: boolean;
}

interface AjustesTributarios {
  retencion: number;
  percepcion: number;
  detraccion: number;
  anticipo: number;
}

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
    private readonly cpeIntegrationService: CPEIntegrationService,
    private readonly greIntegrationService: GREIntegrationService,
    private readonly eventBus: EventBusService,
    private readonly taxCalculator: TaxCalculatorService,
    private readonly tenantContext: TenantContextService,
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
    const { subtotal, igv, total } = await this.calcularTotales(createPedidoDto.detalle);

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
   * Obtener pedidos pendientes de aprobación
   */
  async listarPendientesAprobacion(
    tenantId: string,
  ): Promise<{ success: boolean; data: Array<PedidoVenta & { motivos: string[]; resumen_credito: ResumenCredito | null }> }> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('pedidos_venta')
      .select(
        `
          *,
          clientes!inner(id, razon_social, documento_numero, limite_credito, permite_morosidad)
        `,
      )
      .eq('tenant_id', tenantId)
      .or('estado.eq.PENDIENTE_APROBACION,requiere_aprobacion.eq.true')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching aprobaciones pendientes:', error);
      throw new BadRequestException('Error al obtener pedidos pendientes de aprobación');
    }

    const pedidos = (data || []) as (PedidoVenta & {
      motivo_requiere_aprobacion?: string | null;
    })[];

    const enriquecidos = await Promise.all(
      pedidos.map(async (pedido) => {
        const motivos = pedido.motivo_requiere_aprobacion
          ? String(pedido.motivo_requiere_aprobacion)
              .split(';')
              .map((motivo) => motivo.trim())
              .filter(Boolean)
          : [];

        let resumenCredito: ResumenCredito | null = null;
        try {
          resumenCredito = await this.obtenerResumenCredito(pedido.cliente_id, tenantId);
        } catch (resumenError) {
          console.warn(
            'No se pudo obtener resumen de crédito para cliente',
            pedido.cliente_id,
            resumenError,
          );
        }

        return {
          ...pedido,
          motivos,
          resumen_credito: resumenCredito,
        };
      }),
    );

    return {
      success: true,
      data: enriquecidos,
    };
  }

  /**
   * Obtener historial de decisiones de aprobación de un pedido
   */
  async obtenerHistorialAprobaciones(
    pedidoId: string,
    tenantId: string,
  ): Promise<
    Array<{
      id: string;
      decision: DecisionAprobacion;
      motivos: string[];
      aprobado_por: string | null;
      aprobado_en: string;
      created_at: string;
      aprobador: { id: string; nombres?: string | null; apellidos?: string | null; email?: string | null } | null;
    }>
  > {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('pedido_aprobaciones')
      .select('id, decision, motivos, aprobado_por, aprobado_en, created_at')
      .eq('tenant_id', tenantId)
      .eq('pedido_id', pedidoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching historial aprobaciones:', error);
      throw new BadRequestException('Error al obtener historial de aprobaciones del pedido');
    }

    const aprobaciones = data || [];

    const aprobadoresIds = Array.from(
      new Set(
        aprobaciones
          .map((aprobacion) => aprobacion.aprobado_por)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    let usuariosMap = new Map<string, any>();
    if (aprobadoresIds.length > 0) {
      const { data: usuarios, error: usuariosError } = await client
        .from('usuarios_sistema')
        .select('id, nombres, apellidos, email')
        .in('id', aprobadoresIds);

      if (usuariosError) {
        console.warn('No se pudieron cargar usuarios aprobadores:', usuariosError);
      } else if (usuarios) {
        usuariosMap = new Map(usuarios.map((usuario) => [usuario.id, usuario]));
      }
    }

    return aprobaciones.map((aprobacion) => ({
      ...aprobacion,
      motivos: aprobacion.motivos
        ? String(aprobacion.motivos)
            .split(';')
            .map((motivo) => motivo.trim())
            .filter(Boolean)
        : [],
      aprobador: aprobacion.aprobado_por ? usuariosMap.get(aprobacion.aprobado_por) ?? null : null,
    }));
  }

  /**
   * Resolver aprobación de pedido (aprobar o rechazar)
   */
  async decidirAprobacion(
    pedidoId: string,
    tenantId: string,
    decision: DecisionAprobacion,
    motivosEntrada: string[] = [],
    userId?: string,
    observaciones?: string,
  ): Promise<{ success: boolean; decision: DecisionAprobacion; pedido: PedidoVenta & { detalle: PedidoDetalle[] } }> {
    const client = this.supabase.getClient();
    const pedido = await this.findOne(pedidoId, tenantId);

    if (pedido.estado !== EstadoPedido.PENDIENTE_APROBACION && !pedido.requiere_aprobacion) {
      throw new BadRequestException('El pedido no está pendiente de aprobación');
    }

    const motivos =
      motivosEntrada.length > 0
        ? motivosEntrada
        : pedido.motivo_requiere_aprobacion
          ? String(pedido.motivo_requiere_aprobacion)
              .split(';')
              .map((motivo) => motivo.trim())
              .filter(Boolean)
          : [];

    await this.registrarDecisionAprobacion(pedidoId, tenantId, decision, motivos, userId);

    if (decision === DecisionAprobacion.APROBADO && pedido.estado === EstadoPedido.PENDIENTE_APROBACION) {
      await this.updateEstado(pedidoId, EstadoPedido.PENDIENTE, tenantId);
    }

    if (decision === DecisionAprobacion.RECHAZADO && pedido.estado !== EstadoPedido.CANCELADO) {
      await this.updateEstado(pedidoId, EstadoPedido.CANCELADO, tenantId);
    }

    const timestamp = new Date().toISOString();

    const updateData: Record<string, any> = {
      requiere_aprobacion: false,
      motivo_requiere_aprobacion:
        decision === DecisionAprobacion.RECHAZADO ? motivos.join('; ') || null : null,
      aprobado_por: userId ?? null,
      aprobado_en: timestamp,
      estado_credito: decision === DecisionAprobacion.APROBADO ? 'APROBADO' : 'RECHAZADO',
      updated_at: timestamp,
    };

    if (observaciones) {
      const nota = `[APROBACION:${decision}] ${observaciones}`;
      updateData.notas = pedido.notas ? `${pedido.notas}\n\n${nota}` : nota;
    }

    const { error: updateError } = await client
      .from('pedidos_venta')
      .update(updateData)
      .eq('id', pedidoId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error actualizando datos de aprobación de pedido:', updateError);
      throw new BadRequestException('No se pudo actualizar el pedido luego de la decisión de aprobación');
    }

    const pedidoActualizado = await this.findOne(pedidoId, tenantId);

    await this.registrarAuditoriaAccion(
      pedidoId,
      tenantId,
      userId,
      {
        estado: pedidoActualizado.estado,
        requiere_aprobacion: false,
        estado_credito: updateData.estado_credito,
      },
      decision === DecisionAprobacion.APROBADO ? 'aprobar_pedido' : 'rechazar_pedido',
    );

    await this.enviarNotificacion(tenantId, {
      type: decision === DecisionAprobacion.APROBADO ? 'PEDIDO_APROBADO' : 'PEDIDO_RECHAZADO',
      severity: decision === DecisionAprobacion.APROBADO ? 'SUCCESS' : 'ERROR',
      title: decision === DecisionAprobacion.APROBADO ? 'Pedido aprobado' : 'Pedido rechazado',
      message:
        decision === DecisionAprobacion.APROBADO
          ? `El pedido ${pedido.numero} fue aprobado y puede continuar el flujo`
          : `El pedido ${pedido.numero} fue rechazado. Motivos: ${motivos.join('; ')}`,
      usuario_id: userId,
    });

    return {
      success: true,
      decision,
      pedido: pedidoActualizado,
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
      const { subtotal, igv, total } = await this.calcularTotales(updatePedidoDto.detalle);
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
      [EstadoPedido.PENDIENTE]: [
        EstadoPedido.PENDIENTE_APROBACION,
        EstadoPedido.CONFIRMADO,
        EstadoPedido.CANCELADO,
      ],
      [EstadoPedido.PENDIENTE_APROBACION]: [
        EstadoPedido.PENDIENTE,
        EstadoPedido.CONFIRMADO,
        EstadoPedido.CANCELADO,
      ],
      [EstadoPedido.CONFIRMADO]: [
        EstadoPedido.EN_PREPARACION,
        EstadoPedido.LISTO_FACTURAR,
        EstadoPedido.CANCELADO,
      ],
      [EstadoPedido.EN_PREPARACION]: [EstadoPedido.LISTO_DESPACHO, EstadoPedido.CANCELADO],
      [EstadoPedido.LISTO_DESPACHO]: [EstadoPedido.LISTO_FACTURAR, EstadoPedido.CANCELADO],
      [EstadoPedido.DESPACHO_PARCIAL]: [EstadoPedido.LISTO_FACTURAR, EstadoPedido.CANCELADO],
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

  private async obtenerConfiguracionEmpresa(tenantId: string): Promise<ConfiguracionEmpresa> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('empresa_config')
      .select(
        'usar_flujo_logistica, monto_maximo_sin_aprobacion, porcentaje_descuento_maximo, requiere_aprobacion_descuento, aplicar_limite_credito, dias_vencimiento_factura, gre_automatico_habilitado, umbral_gre_automatico, aplicar_retencion, retencion_tasa, aplicar_percepcion, percepcion_tasa, aplicar_detraccion, detraccion_tasa, detraccion_codigo',
      )
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      console.error('Error obteniendo configuración de empresa:', error);
      throw new BadRequestException('No se pudo obtener la configuración de la empresa');
    }

    return {
      usar_flujo_logistica: data?.usar_flujo_logistica ?? false,
      monto_maximo_sin_aprobacion: data?.monto_maximo_sin_aprobacion != null
        ? Number(data.monto_maximo_sin_aprobacion)
        : undefined,
      porcentaje_descuento_maximo: data?.porcentaje_descuento_maximo != null
        ? Number(data.porcentaje_descuento_maximo)
        : undefined,
      requiere_aprobacion_descuento: data?.requiere_aprobacion_descuento ?? false,
      aplicar_limite_credito: data?.aplicar_limite_credito ?? false,
      dias_vencimiento_factura: data?.dias_vencimiento_factura != null
        ? Number(data.dias_vencimiento_factura)
        : 30,
      gre_automatico_habilitado: data?.gre_automatico_habilitado ?? true,
      umbral_gre_automatico: data?.umbral_gre_automatico != null ? Number(data.umbral_gre_automatico) : undefined,
      aplicar_retencion: data?.aplicar_retencion ?? false,
      retencion_tasa: data?.retencion_tasa != null ? Number(data.retencion_tasa) : undefined,
      aplicar_percepcion: data?.aplicar_percepcion ?? false,
      percepcion_tasa: data?.percepcion_tasa != null ? Number(data.percepcion_tasa) : undefined,
      aplicar_detraccion: data?.aplicar_detraccion ?? false,
      detraccion_tasa: data?.detraccion_tasa != null ? Number(data.detraccion_tasa) : undefined,
      detraccion_codigo: data?.detraccion_codigo ?? null,
    };
  }

  private async evaluarPoliticasAprobacion(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    tenantId: string,
    config: ConfiguracionEmpresa,
    ajustes?: AjustesTributarios,
  ): Promise<EvaluacionPoliticas> {
    const motivos: string[] = [];
    let estadoCredito = 'OK';

    if ((config.monto_maximo_sin_aprobacion ?? 0) > 0 && pedido.total > (config.monto_maximo_sin_aprobacion ?? 0)) {
      motivos.push(
        `Monto total S/ ${pedido.total.toFixed(2)} supera el límite sin aprobación (S/ ${(config.monto_maximo_sin_aprobacion ?? 0).toFixed(2)})`,
      );
    }

    if (config.aplicar_limite_credito) {
      const resumen = await this.obtenerResumenCredito(pedido.cliente_id, tenantId);
      const totalComprometido = resumen.pendiente + pedido.total;
      if (resumen.limite > 0 && totalComprometido > resumen.limite) {
        motivos.push(
          `Límite de crédito excedido: comprometido S/ ${totalComprometido.toFixed(2)} > límite S/ ${resumen.limite.toFixed(2)}`,
        );
        estadoCredito = 'BLOQUEADO';
      }
      if (resumen.tieneVencidos && !resumen.permiteMorosidad) {
        motivos.push('Cliente con cuentas por cobrar vencidas');
        estadoCredito = 'BLOQUEADO';
      }
    }

    if (motivos.length > 0 && estadoCredito !== 'BLOQUEADO') {
      estadoCredito = 'REVISION';
    }

    return {
      requiereAprobacion: motivos.length > 0,
      motivos,
      estadoCredito,
    };
  }

  private async obtenerResumenCredito(clienteId: string, tenantId: string): Promise<ResumenCredito> {
    const client = this.supabase.getClient();

    const { data: cliente, error: clienteError } = await client
      .from('clientes')
      .select('limite_credito, permite_morosidad')
      .eq('tenant_id', tenantId)
      .eq('id', clienteId)
      .single();

    if (clienteError) {
      console.error('Error obteniendo información del cliente:', clienteError);
    }

    const limite = cliente?.limite_credito != null ? Number(cliente.limite_credito) : 0;
    const permiteMorosidad = cliente?.permite_morosidad ?? false;

    const { data: cuentas } = await client
      .from('cuentas_por_cobrar')
      .select('monto_pendiente, estado')
      .eq('tenant_id', tenantId)
      .eq('cliente_id', clienteId);

    let pendiente = 0;
    let tieneVencidos = false;

    (cuentas || []).forEach((cuenta) => {
      const monto = Number(cuenta.monto_pendiente || 0);
      pendiente += monto;
      if (cuenta.estado === 'VENCIDO') {
        tieneVencidos = true;
      }
    });

    return {
      limite,
      pendiente,
      tieneVencidos,
      permiteMorosidad,
    };
  }

  private async registrarSolicitudAprobacion(
    pedido: PedidoVenta,
    tenantId: string,
    motivos: string[],
    estadoCredito: string,
  ): Promise<void> {
    const client = this.supabase.getClient();

    if (pedido.estado !== EstadoPedido.PENDIENTE_APROBACION) {
      await this.updateEstado(pedido.id, EstadoPedido.PENDIENTE_APROBACION, tenantId);
    }

    await client
      .from('pedidos_venta')
      .update({
        requiere_aprobacion: true,
        motivo_requiere_aprobacion: motivos.join('; '),
        estado_credito: estadoCredito,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pedido.id)
      .eq('tenant_id', tenantId);

    await this.registrarAuditoriaAccion(
      pedido.id,
      tenantId,
      undefined,
      {
        estado: EstadoPedido.PENDIENTE_APROBACION,
        requiere_aprobacion: true,
        estado_credito: estadoCredito,
      },
      'solicitud_aprobacion',
    );
  }

  private async registrarDecisionAprobacion(
    pedidoId: string,
    tenantId: string,
    decision: 'APROBADO' | 'RECHAZADO',
    motivos: string[],
    userId?: string,
  ): Promise<void> {
    const client = this.supabase.getClient();

    const { error } = await client
      .from('pedido_aprobaciones')
      .insert({
        tenant_id: tenantId,
        pedido_id: pedidoId,
        decision,
        motivos: motivos.join('; ') || null,
        aprobado_por: userId ?? null,
      });

    if (error) {
      console.error('Error registrando aprobación de pedido:', error);
    }
  }

  private calcularAjustesTributarios(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] } & { cliente?: any; clientes?: any },
    config: ConfiguracionEmpresa,
    ajustes?: AjustesTributarios | number,
    total?: number,
  ): AjustesTributarios {
    const round2 = (value: number) => Math.round(value * 100) / 100;
    const cliente = (pedido as any).cliente ?? (pedido as any).clientes ?? null;

    const sujetoRetencion = cliente?.sujeto_retencion ?? config.aplicar_retencion ?? false;
    const retencionTasa = cliente?.retencion_tasa != null
      ? Number(cliente.retencion_tasa)
      : config.retencion_tasa != null
        ? Number(config.retencion_tasa)
        : 0;

    const sujetoPercepcion = cliente?.sujeto_percepcion ?? config.aplicar_percepcion ?? false;
    const percepcionTasa = cliente?.percepcion_tasa != null
      ? Number(cliente.percepcion_tasa)
      : config.percepcion_tasa != null
        ? Number(config.percepcion_tasa)
        : 0;

    const sujetoDetraccion = cliente?.sujeto_detraccion ?? config.aplicar_detraccion ?? false;
    const detraccionTasa = cliente?.detraccion_tasa != null
      ? Number(cliente.detraccion_tasa)
      : config.detraccion_tasa != null
        ? Number(config.detraccion_tasa)
        : 0;

    const retencion = sujetoRetencion && retencionTasa > 0 ? round2(total * (retencionTasa / 100)) : 0;
    const percepcion = sujetoPercepcion && percepcionTasa > 0 ? round2(total * (percepcionTasa / 100)) : 0;
    const detraccion = sujetoDetraccion && detraccionTasa > 0 ? round2(total * (detraccionTasa / 100)) : 0;

    return {
      retencion,
      percepcion,
      detraccion,
      anticipo: 0,
    };
  }
  /**
   * 🔴 CRÍTICO FIX: Emite evento VentaProcessedEvent cuando se confirma un pedido
   * Esto asegura que todos los flujos de venta generen asientos contables, no solo cuando se genera factura
   */
  private async emitirEventoVentaProcesadaAlConfirmar(
    pedido: (PedidoVenta & { detalle: PedidoDetalle[] }) & { clientes?: any; cliente?: any },
    tenantId: string
  ): Promise<void> {
    if (!this.eventBus) {
      return;
    }

    try {
      const clienteInfo = (pedido as any).clientes ?? (pedido as any).cliente ?? null;

      const eventId = uuidv4();
      const idempotencyKey = `ventas:pedido-confirmado:${tenantId}:${pedido.id}`;

      await this.eventBus.emitVentaProcessed({
        eventId,
        tenantId,
        idempotencyKey,
        source: 'ventas.pedidos.confirmacion',
        ventaId: pedido.id,
        numeroTicket: String(pedido.numero),
        clienteId: pedido.cliente_id,
        clienteNombre:
          clienteInfo?.razon_social ??
          clienteInfo?.nombre ??
          clienteInfo?.denominacion ??
          'Cliente sin razón social',
        metodoPago: 'credito', // Pendiente de facturación
        subtotal: Number(pedido.subtotal ?? 0),
        impuestos: Number(pedido.igv ?? 0),
        total: Number(pedido.total ?? 0),
        items: (pedido.detalle ?? []).map((item) => ({
          productoId: item.producto_id,
          cantidad: Number(item.cantidad ?? 0),
          precio: Number(item.precio_unitario ?? 0),
          total: Number(item.subtotal ?? (item.cantidad ?? 0) * (item.precio_unitario ?? 0)),
        })),
      });

      console.log(`✅ [PedidosService] Evento VentaProcessedEvent emitido al confirmar pedido ${pedido.numero}`);
    } catch (error) {
      console.error('❌ Error emitiendo evento de venta procesada al confirmar pedido:', error);
      // No lanzamos error para no bloquear la confirmación del pedido
      // El outbox pattern garantizará que el evento se procese luego
    }
  }

  private emitirEventoVentaProcesada(
    pedido: (PedidoVenta & { detalle: PedidoDetalle[] }) & { clientes?: any; cliente?: any },
    factura: { factura_id: string; serie?: string; numero?: number; total: number; fecha_emision?: string; moneda?: string },
    tenantId: string,
  ): void {
    if (!this.eventBus) {
      return;
    }

    try {
      const numeroDocumento =
        factura.serie && factura.numero != null
          ? `${factura.serie}-${String(factura.numero).padStart(8, '0')}`
          : pedido.numero;

      const clienteInfo = (pedido as any).clientes ?? (pedido as any).cliente ?? null;

      const eventId = uuidv4();
      const idempotencyKey = `ventas:pedido-facturado:${tenantId}:${factura.factura_id ?? pedido.id}`;

      this.eventBus.emitVentaProcessed({
        eventId,
        tenantId,
        idempotencyKey,
        source: 'ventas.pedidos.facturacion',
        ventaId: factura.factura_id,
        numeroTicket: String(numeroDocumento),
        clienteId: pedido.cliente_id,
        clienteNombre:
          clienteInfo?.razon_social ??
          clienteInfo?.nombre ??
          clienteInfo?.denominacion ??
          'Cliente sin razón social',
        metodoPago: 'credito',
        subtotal: Number(pedido.subtotal ?? 0),
        impuestos: Number(pedido.igv ?? 0),
        total: Number(pedido.total ?? factura.total ?? 0),
        items: (pedido.detalle ?? []).map((item) => ({
          productoId: item.producto_id,
          cantidad: Number(item.cantidad ?? 0),
          precio: Number(item.precio_unitario ?? 0),
          total: Number(item.subtotal ?? (item.cantidad ?? 0) * (item.precio_unitario ?? 0)),
        })),
        cpeId: factura.factura_id,
      });
    } catch (error) {
      console.error('Error emitiendo evento de venta procesada para asientos contables:', error);
    }
  }

  /**
   * 🔴 CRÍTICO FIX: Emite evento VentaProcessedEvent cuando se confirma un pedido
   * Esto asegura que todos los flujos de venta generen asientos contables, no solo cuando se genera factura
   */

  private async registrarAuditoriaAccion(
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
      console.warn(`⚠️ No se pudo registrar auditoría (${action})`, error);
    }
  }

  private redondearCantidad(value: number): number {
    return Math.round(value * 100) / 100;
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

  /**
   * Calcular totales (subtotal, IGV, total)
   * Usa TaxCalculatorService para obtener la tasa correcta según el país
   */
  private async calcularTotales(detalle: Array<{ cantidad: number; precio_unitario: number }>) {
    const subtotal = detalle.reduce(
      (sum, item) => sum + item.cantidad * item.precio_unitario,
      0,
    );
    
    // ✅ CORRECCIÓN: Usar TaxCalculatorService
    const taxResult = await this.taxCalculator.calcularImpuestos({
      subtotal,
      tenantId: this.tenantContext.getTenantId(),
    });
    
    const igv = taxResult.igv;
    const total = taxResult.total;

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
    forzarConfirmacion = false,
    userId?: string,
  ): Promise<{ success: boolean; warnings?: any[]; requiere_aprobacion?: boolean; motivos?: string[]; estado_credito?: string }> {
    const client = this.supabase.getClient();

    const pedido = await this.findOne(id, tenantId);

    if (
      pedido.estado !== EstadoPedido.PENDIENTE &&
      !(pedido.estado === EstadoPedido.PENDIENTE_APROBACION && forzarConfirmacion)
    ) {
      throw new BadRequestException(
        `No se puede confirmar un pedido en estado ${pedido.estado}`,
      );
    }

    if (pedido.estado === EstadoPedido.PENDIENTE_APROBACION && !forzarConfirmacion) {
      return {
        success: false,
        requiere_aprobacion: true,
        motivos: pedido.motivo_requiere_aprobacion ? [pedido.motivo_requiere_aprobacion] : undefined,
        estado_credito: pedido.estado_credito,
      };
    }

    const config = await this.obtenerConfiguracionEmpresa(tenantId);

    // Evaluar políticas de aprobación y crédito
    const evaluacion = await this.evaluarPoliticasAprobacion(pedido, tenantId, config);

    // HARDENING C3: Bloquear completamente cuando crédito está bloqueado
    // NO se puede confirmar ni con forzarConfirmacion si el crédito está bloqueado
    if (evaluacion.estadoCredito === 'BLOQUEADO') {
      await this.registrarSolicitudAprobacion(pedido, tenantId, evaluacion.motivos, evaluacion.estadoCredito);

      await this.enviarNotificacion(tenantId, {
        type: 'PEDIDO_BLOQUEADO_CREDITO' as any,
        severity: 'ERROR' as any,
        title: 'Pedido bloqueado por crédito',
        message: `El pedido ${pedido.numero} no puede ser confirmado: ${evaluacion.motivos.join('; ')}`,
        usuario_id: userId,
      });

      throw new BadRequestException(
        `NO se puede confirmar el pedido. Crédito bloqueado: ${evaluacion.motivos.join('; ')}`,
      );
    }

    if (evaluacion.requiereAprobacion && !forzarConfirmacion) {
      await this.registrarSolicitudAprobacion(pedido, tenantId, evaluacion.motivos, evaluacion.estadoCredito);

      await this.enviarNotificacion(tenantId, {
        type: 'PEDIDO_REQUIERE_APROBACION' as any,
        severity: 'WARNING' as any,
        title: 'Pedido requiere aprobación',
        message: `El pedido ${pedido.numero} requiere aprobación antes de confirmar: ${evaluacion.motivos.join('; ')}`,
        usuario_id: userId,
      });

      return {
        success: false,
        requiere_aprobacion: true,
        motivos: evaluacion.motivos,
        estado_credito: evaluacion.estadoCredito,
      };
    }

    // Verificar stock disponible
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

    if (stockWarnings.length > 0 && !forzarConfirmacion) {
      return {
        success: false,
        warnings: stockWarnings,
      };
    }

    // Evitar reservas duplicadas
    const { data: reservasExistentes } = await client
      .from('movimientos_inventario')
      .select('id')
      .eq('referencia_tipo', 'PEDIDO')
      .eq('referencia_id', id)
      .eq('tipo', 'RESERVA')
      .limit(1);

    if (reservasExistentes && reservasExistentes.length > 0) {
      console.log(`ℹ️ [PedidosService] Pedido ${id} ya cuenta con reservas registradas, retornando estado actual`);
      return {
        success: true,
        warnings: stockWarnings.length > 0 ? stockWarnings : undefined,
        estado_credito: evaluacion.estadoCredito,
      };
    }

    // HARDENING C1: Crear reservas usando función atómica con locks
    // Esto previene race conditions cuando múltiples pedidos reservan el mismo producto
    for (const item of pedido.detalle) {
      try {
        const { data: movimientoId, error: reservaError } = await client.rpc('reservar_stock_atomico', {
          p_producto_id: item.producto_id,
          p_cantidad: item.cantidad,
          p_referencia_tipo: 'PEDIDO',
          p_referencia_id: id,
          p_notas: `Reserva atómica para pedido ${pedido.numero}`,
        });

        if (reservaError) {
          console.error('❌ Error en reserva atómica de stock:', reservaError);
          
          // Si es error de stock insuficiente, retornar warning específico
          if (reservaError.message?.includes('Stock insuficiente') || reservaError.message?.includes('insufficient')) {
            throw new BadRequestException(
              `Stock insuficiente para producto ${item.descripcion}. ${reservaError.message}`,
            );
          }
          
          throw new BadRequestException(
            `No se pudo reservar stock para el producto ${item.descripcion}: ${reservaError.message}`,
          );
        }

        console.log(`✅ [PedidosService] Stock reservado atómicamente - Movimiento: ${movimientoId}`);
      } catch (error) {
        // Si falla alguna reserva, hacer rollback de las ya creadas
        console.error('❌ Error reservando stock, iniciando rollback...', error);
        
        // Intentar liberar reservas ya creadas para este pedido
        try {
          const { data: reservasCreadas } = await client
            .from('movimientos_inventario')
            .select('producto_id, cantidad')
            .eq('referencia_tipo', 'PEDIDO')
            .eq('referencia_id', id)
            .eq('tipo', 'RESERVA')
            .eq('tenant_id', tenantId);

          if (reservasCreadas && reservasCreadas.length > 0) {
            for (const reserva of reservasCreadas) {
              await client.rpc('decrementar_stock_reservado', {
                p_producto_id: reserva.producto_id,
                p_cantidad: reserva.cantidad,
              });
            }
            
            // Eliminar movimientos creados
            await client
              .from('movimientos_inventario')
              .delete()
              .eq('referencia_tipo', 'PEDIDO')
              .eq('referencia_id', id)
              .eq('tipo', 'RESERVA')
              .eq('tenant_id', tenantId);
          }
        } catch (rollbackError) {
          console.error('❌ Error en rollback de reservas:', rollbackError);
          // Continuar con el error original
        }
        
        throw error;
      }
    }

    await this.updateEstado(id, EstadoPedido.CONFIRMADO, tenantId);

    const estadoCreditoFinal = forzarConfirmacion && evaluacion.requiereAprobacion
      ? 'APROBADO_MANUAL'
      : evaluacion.estadoCredito === 'BLOQUEADO'
        ? 'BLOQUEADO'
        : 'OK';

    await client
      .from('pedidos_venta')
      .update({
        requiere_aprobacion: false,
        motivo_requiere_aprobacion: null,
        aprobado_por: forzarConfirmacion && evaluacion.requiereAprobacion ? userId ?? null : null,
        aprobado_en: forzarConfirmacion && evaluacion.requiereAprobacion ? new Date().toISOString() : null,
        estado_credito: estadoCreditoFinal,
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (forzarConfirmacion && evaluacion.requiereAprobacion) {
      await this.registrarDecisionAprobacion(id, tenantId, 'APROBADO', evaluacion.motivos, userId);
    }

    await this.registrarAuditoriaAccion(id, tenantId, userId, {
      estado: EstadoPedido.CONFIRMADO,
      estado_credito: estadoCreditoFinal,
    }, 'confirmar_pedido');

    // 🔴 CRÍTICO FIX: Emitir evento VentaProcessedEvent cuando se confirma pedido (no solo cuando se genera factura)
    // Esto asegura que todos los flujos de venta generen asientos contables
    const pedidoActualizado = await this.findOne(id, tenantId);
    await this.emitirEventoVentaProcesadaAlConfirmar(pedidoActualizado, tenantId);

    if (config.usar_flujo_logistica === false) {
      await this.updateEstado(id, EstadoPedido.LISTO_FACTURAR, tenantId);
    }

    await this.enviarNotificacion(tenantId, {
      type: 'PEDIDO_CONFIRMADO' as any,
      severity: 'INFO' as any,
      title: 'Pedido confirmado',
      message: `El pedido ${pedido.numero} ha sido confirmado y el stock reservado`,
      usuario_id: userId,
    });

    console.log('✅ [PedidosService] Pedido confirmado:', id);

    return {
      success: true,
      warnings: stockWarnings.length > 0 ? stockWarnings : undefined,
      estado_credito: estadoCreditoFinal,
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
        const { error: liberarError } = await client.rpc('decrementar_stock_reservado', {
          p_producto_id: item.producto_id,
          p_cantidad: item.cantidad,
        });

        if (liberarError) {
          console.error('Error liberando reserva:', liberarError);
          throw new BadRequestException('No se pudo liberar el stock reservado');
        }

        const { error: resetDetalleError } = await client
          .from('pedidos_venta_detalle')
          .update({
            cantidad_despachada: 0,
            cantidad_facturada: 0,
            estado_item: 'PENDIENTE',
          })
          .eq('id', item.id);

        if (resetDetalleError) {
          console.warn('No se pudo resetear el detalle del pedido al cancelar:', resetDetalleError);
        }
      }

      await client.from('pedido_backorders').delete().eq('pedido_id', id).eq('tenant_id', tenantId);
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

    // Registrar auditoría
    try {
      await this.auditService.logAction({
        table_name: 'pedidos_venta',
        operation: 'UPDATE',
        record_id: id,
        tenant_id: tenantId,
        user_id: userId ?? undefined,
        new_values: {
          estado: EstadoPedido.CANCELADO,
          motivo_cancelacion: motivo ?? null,
        },
        metadata: {
          action: 'cancelar_pedido',
        },
      });
    } catch (auditError) {
      console.warn('⚠️ No se pudo registrar auditoría de cancelación de pedido', auditError);
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

    if (pedido.factura_id) {
      console.log(`ℹ️ [PedidosService] Pedido ${id} ya tiene factura ${pedido.factura_id}, retornando datos actuales`);
      const sugerenciaExistente = await this.greIntegrationService.verificarSugerenciaGRE(pedido, tenantId);
      return {
        success: true,
        factura_id: pedido.factura_id,
        sugerir_gre: sugerenciaExistente.sugerir,
      };
    }

    // 3. Obtener configuración
    const config = await this.obtenerConfiguracionEmpresa(tenantId);

    if (config.usar_flujo_logistica) {
      const pendientesDespacho = pedido.detalle.some((item) => {
        const total = Number(item.cantidad);
        const despachado = Number(item.cantidad_despachada ?? 0);
        return despachado < total;
      });

      if (pendientesDespacho) {
        throw new BadRequestException('No se puede generar la factura: existen ítems pendientes de despacho.');
      }
    }

    // 4. Si es flujo simplificado, descontar stock ahora (idempotente)
    if (!config.usar_flujo_logistica) {
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
        const { error: salidaError } = await client.rpc('descontar_stock_y_liberar_reserva', {
          p_producto_id: item.producto_id,
          p_cantidad: item.cantidad,
        });

        if (salidaError) {
          console.error('Error descontando stock al facturar:', salidaError);
          throw new BadRequestException('No se pudo descontar el stock al facturar');
        }

        const { error: detalleDespachoError } = await client
          .from('pedidos_venta_detalle')
          .update({
            cantidad_despachada: item.cantidad,
            estado_item: 'DESPACHADO',
          })
          .eq('id', item.id);

        if (detalleDespachoError) {
          console.warn('No se pudo actualizar el detalle con la cantidad despachada al facturar:', detalleDespachoError);
        }
      }

      // En flujo simplificado no existen pendiente, aseguramos limpiar backorders
      await client.from('pedido_backorders').delete().eq('pedido_id', id).eq('tenant_id', tenantId);
    }

    // 5. Integrar con CPE real
    const facturaResultado = await this.cpeIntegrationService.generarFacturaDesdePedido(pedido, tenantId);

    const ajustesTributarios = this.calcularAjustesTributarios(
      pedido as any,
      config,
      undefined,
      facturaResultado.total,
    );

    const costoVentasEstimado = (pedido.detalle ?? []).reduce(
      (sum, item) => sum + Number((item as any).costo_unitario ?? 0) * Number(item.cantidad ?? 0),
      0,
    );

    // 6. Actualizar pedido con factura_id y estado
    await client
      .from('pedidos_venta')
      .update({
        factura_id: facturaResultado.factura_id,
        estado: EstadoPedido.FACTURADO,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    pedido.factura_id = facturaResultado.factura_id;

    const facturaEventId = uuidv4();
    const facturaSerie = facturaResultado.serie ?? 'SIN-SERIE';
    const facturaNumero =
      facturaResultado.numero != null
        ? String(facturaResultado.numero)
        : '0'; // HARDENING: normalizar correlativo como string para preservar ceros a la izquierda.
    const facturaMoneda = facturaResultado.moneda ?? 'PEN';
    const fechaEmisionFactura =
      facturaResultado.fecha_emision ?? new Date().toISOString().split('T')[0];
    const diasVencimiento = config?.dias_vencimiento_factura ?? 30;
    const fechaVencimientoDate = new Date(fechaEmisionFactura);
    fechaVencimientoDate.setDate(fechaVencimientoDate.getDate() + diasVencimiento);
    const fechaVencimientoFactura = fechaVencimientoDate.toISOString().split('T')[0];

    // HARDENING: hook de integración financiera multi-tenant e idempotente.
    this.eventBus.emitFacturaEmitidaEvent({
      eventId: facturaEventId,
      tenantId,
      pedidoId: pedido.id,
      cpeId: facturaResultado.factura_id,
      facturaId: facturaResultado.factura_id,
      serie: facturaSerie,
      numero: facturaNumero,
      clienteId: pedido.cliente_id,
      subtotal: Number(pedido.subtotal ?? 0),
      impuestos: Number(pedido.igv ?? 0),
      total: Number(facturaResultado.total ?? pedido.total ?? 0),
      moneda: facturaMoneda,
      fechaEmision: fechaEmisionFactura,
      fechaVencimiento: fechaVencimientoFactura,
      idempotencyKey: `factura:${tenantId}:${facturaResultado.factura_id}`,
      source: 'ventas',
      ajustes: ajustesTributarios,
      costoVentas: Number(costoVentasEstimado) || 0,
    });

    this.emitirEventoVentaProcesada(
      pedido,
      {
        factura_id: facturaResultado.factura_id,
        serie: facturaResultado.serie,
        numero: facturaResultado.numero,
        total: facturaResultado.total,
        fecha_emision: facturaResultado.fecha_emision,
        moneda: facturaResultado.moneda,
      },
      tenantId,
    );

    // 7. Evaluar sugerencia de GRE
    const sugerenciaGRE = await this.greIntegrationService.verificarSugerenciaGRE(
      {
        ...pedido,
        factura_id: facturaResultado.factura_id,
      },
      tenantId,
    );

    // 8. Registrar auditoría
    try {
      await this.auditService.logAction({
        table_name: 'pedidos_venta',
        operation: 'UPDATE',
        record_id: id,
        tenant_id: tenantId,
        user_id: userId ?? undefined,
        new_values: {
          factura_id: facturaResultado.factura_id,
          estado: EstadoPedido.FACTURADO,
          estado_cpe: facturaResultado.estado,
        },
        metadata: {
          action: 'generar_factura',
        },
      });
    } catch (auditError) {
      console.warn('⚠️ No se pudo registrar auditoría de generación de factura', auditError);
    }

    // 9. Notificar
    await this.enviarNotificacion(tenantId, {
      type: 'FACTURA_EMITIDA' as any,
      severity: 'SUCCESS' as any,
      title: 'Factura emitida',
      message: `La factura para el pedido ${pedido.numero} ha sido emitida exitosamente`,
      usuario_id: userId,
    });

    console.log('✅ [PedidosService] Factura generada para pedido:', id);

    try {
      for (const item of pedido.detalle) {
        const cantidadAFacturar = Number(item.cantidad);
        const { error: updateDetalleFactura } = await client
          .from('pedidos_venta_detalle')
          .update({
            cantidad_facturada: this.redondearCantidad(Number(item.cantidad_facturada ?? 0) + cantidadAFacturar),
            estado_item: 'FACTURADO',
          })
          .eq('id', item.id);

        if (updateDetalleFactura) {
          console.warn('No se pudo actualizar cantidad_facturada del detalle', updateDetalleFactura);
        }
      }
    } catch (detalleFacturaError) {
      console.warn('No se pudo actualizar cantidades facturadas del pedido', detalleFacturaError);
    }

    return {
      success: true,
      factura_id: facturaResultado.factura_id,
      sugerir_gre: sugerenciaGRE.sugerir,
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
      .select('stock, stock_actual, stock_reservado')
      .eq('id', productoId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      console.error('Error fetching stock:', error);
      return 0;
    }

    const stockActual = data.stock_actual != null ? Number(data.stock_actual) : Number(data.stock ?? 0);
    const stockReservado = Number(data.stock_reservado ?? 0);

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
   * Obtener GRE asociadas a un pedido
   */
  async obtenerGreAsociadas(pedidoId: string, tenantId: string) {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('pedido_gres')
      .select(`
        id,
        estado,
        notas,
        creado_en,
        gre:gre_guias (
          id,
          numero,
          estado,
          destinatario,
          direccion_destino,
          fecha_traslado,
          modalidad,
          motivo,
          peso_total,
          transportista,
          placa_vehiculo,
          licencia_conducir
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('pedido_id', pedidoId)
      .order('creado_en', { ascending: false });

    if (error) {
      throw new BadRequestException('Error al obtener las GRE asociadas al pedido');
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      estado: item.estado,
      notas: item.notas ?? null,
      creado_en: item.creado_en,
      gre: item.gre
        ? {
            id: item.gre.id,
            numero: item.gre.numero,
            estado: item.gre.estado,
            destinatario: item.gre.destinatario,
            direccionDestino: item.gre.direccion_destino,
            fechaTraslado: item.gre.fecha_traslado,
            modalidad: item.gre.modalidad,
            motivo: item.gre.motivo,
            pesoTotal: item.gre.peso_total,
            transportista: item.gre.transportista,
            placaVehiculo: item.gre.placa_vehiculo,
            licenciaConducir: item.gre.licencia_conducir,
          }
        : null,
    }));
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


