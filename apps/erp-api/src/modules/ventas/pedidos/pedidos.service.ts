import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { CPEIntegrationService } from './cpe-integration.service';
import { GREIntegrationService } from './gre-integration.service';
import { CreatePedidoDto, UpdatePedidoDto, DecisionAprobacion } from './dto';
import { PedidoVenta, EstadoPedido, PedidoDetalle } from './entities';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { calcularDesgloseIgv } from '../../../shared/utils/igv-afectacion.util';
import { canUseRuntimeDemoCertificate } from '../../../shared/utils/demo-certificate.utils';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { tieneEntradaPagoPedido } from './pedido-payment.util';

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

export interface DocumentoGeneradoResult {
  pedidoId: string;
  documentoId: string;
  tipoDocumento: '01' | '03';
  serie: string;
  numero: string;
  total: number;
  moneda: string;
  estadoPedido: EstadoPedido;
  cpeId?: string | null;
  cxcId?: string | null;
}

/**
 * PedidosService
 * Servicio para gestionar pedidos de venta
 * Requirements: 5.1, 5.2, 5.3, 27.1, 27.2, 27.4
 */
@Injectable()
export class PedidosService {
  private readonly logger = new Logger(PedidosService.name);
  constructor(
    private readonly supabase: SupabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    private readonly cpeIntegrationService: CPEIntegrationService,
    private readonly greIntegrationService: GREIntegrationService,
    private readonly taxCalculator: TaxCalculatorService,
    private readonly tenantContext: TenantContextService,
  ) { }

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

    if (!userId) {
      throw new BadRequestException('No se pudo identificar al creador del pedido');
    }

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

    // Calcular totales usando decimal.js
    const { subtotal, igv, total } = await this.calcularTotales(createPedidoDto.detalle);

    // La cotización y el pedido pendiente no inmovilizan existencias. Fecha y
    // correlativo se resuelven dentro de la RPC con la zona horaria del tenant
    // y un advisory lock; la reserva se valida al confirmar.
    const pedidoData = {
      tenant_id: tenantId,
      cliente_id: createPedidoDto.cliente_id,
      subtotal, // Already a number from calcularTotales
      igv, // Already a number from calcularTotales
      total, // Already a number from calcularTotales
      observaciones: createPedidoDto.notas || null,
      created_by: userId,
    };

    // Preparar objeto Detalle
    const detalleData = createPedidoDto.detalle.map((item) => {
      const cantidad = new Decimal(item.cantidad);
      const precio = new Decimal(item.precio_unitario);
      const subtotalItem = cantidad.mul(precio);

      return {
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: cantidad.toNumber(),
        precio_unitario: precio.toNumber(),
        subtotal: subtotalItem.toNumber(),
      };
    });

    // 🔴 CRÍTICO FIX: Uso de RPC para transacción atómica (Header + Detalle)
    const paymentIntent = tieneEntradaPagoPedido(createPedidoDto)
      ? {
          condicion_pago: createPedidoDto.condicion_pago,
          medio_pago: createPedidoDto.medio_pago,
          plazo_pago_dias: createPedidoDto.plazo_pago_dias,
          fecha_vencimiento: createPedidoDto.fecha_vencimiento,
        }
      : null;
    const { data: rpcResult, error: rpcError } = await client.rpc('crear_pedido_comercial_pago_tx_531', {
      p_pedido: pedidoData,
      p_detalle: detalleData,
      p_payment_intent: paymentIntent,
    });

    if (rpcError) {
      console.error('Error creating pedido (RPC):', rpcError);
      throw new BadRequestException('Error al crear el pedido: ' + rpcError.message);
    }

    const pedidoId = (rpcResult as any).pedido_id;
    console.log('✅ [PedidosService] Pedido creado atómicamente:', pedidoId);

    // Retornar el pedido completo. Si sólo falla esta lectura, el alta ya hizo
    // commit; responder error induciría al cliente a crear un segundo pedido.
    try {
      return await this.findOne(pedidoId, tenantId);
    } catch (hydrationError) {
      this.logger.warn(
        `Pedido ${pedidoId} creado; no se pudo hidratar la respuesta post-commit`,
        hydrationError,
      );
      return {
        id: pedidoId,
        tenant_id: tenantId,
        cliente_id: createPedidoDto.cliente_id,
        estado: EstadoPedido.PENDIENTE,
        subtotal,
        igv,
        total,
        detalle: detalleData,
      } as PedidoVenta & { detalle: PedidoDetalle[] };
    }
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
      .select('*, clientes:clientes!pedidos_venta_cliente_id_fkey(id, razon_social, numero_documento)', { count: 'exact' })
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
      query = query.gte('fecha_pedido', filters.fecha_desde);
    }
    if (filters?.fecha_hasta) {
      query = query.lte('fecha_pedido', filters.fecha_hasta);
    }

    // Búsqueda por número o cliente
    if (filters?.search) {
      // HARDENING Q3: Sanitizar search term para evitar inyección en filtro OR de PostgREST
      // Eliminar caracteres especiales de sintaxis PostgREST: (), commas, dots, colons, asterisks
      const cleanSearch = filters.search
        .replace(/[(),.:*\\]/g, '') // Caracteres de control PostgREST
        .replace(/\s+/g, ' ')       // Normalizar espacios
        .trim()
        .substring(0, 100);         // Limitar longitud para evitar DoS
      
      if (cleanSearch.length > 0) {
        const searchTerm = `%${cleanSearch}%`;
        const { data: clientesCoincidentes } = await client
          .from('clientes')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('razon_social', searchTerm)
          .limit(25);

        const clienteIds = (clientesCoincidentes || [])
          .map((cliente: { id?: string }) => cliente.id)
          .filter(Boolean);

        const searchFilters = [`numero.ilike.${searchTerm}`];
        if (clienteIds.length > 0) {
          searchFilters.push(`cliente_id.in.(${clienteIds.join(',')})`);
        }

        query = query.or(searchFilters.join(','));
      }
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
          cliente:clientes!pedidos_venta_cliente_id_fkey(id, razon_social, documento_numero:codigo, limite_credito, permite_morosidad)
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

    if (String(pedido.estado_credito ?? '').toUpperCase() === 'BLOQUEADO') {
      throw new BadRequestException(
        'El pedido está bloqueado por crédito. Debe regularizar la cuenta del cliente; no admite aprobación comercial.',
      );
    }

    if (!userId) {
      throw new BadRequestException(
        'No se pudo identificar al aprobador: token de sesión sin user_id.',
      );
    }

    // Segregación de funciones: la aprobación existe para que alguien distinto
    // revise un pedido que excede el límite de crédito o el monto sin aprobación.
    // Si el creador puede aprobarse a sí mismo, el control no controla nada.
    // Compras ya aplica esta misma regla a las órdenes de compra.
    if ((pedido as any).created_by && userId === (pedido as any).created_by) {
      throw new BadRequestException(
        'El creador del pedido no puede aprobar su propio pedido. Se requiere aprobación de otro usuario autorizado.',
      );
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

    const { data: decisionResult, error: decisionError } = await client.rpc('decidir_aprobacion_pedido_tx', {
      p_pedido_id: pedidoId,
      p_tenant_id: tenantId,
      p_decision: decision,
      p_motivos: motivos.join('; ') || null,
      p_aprobado_por: userId,
      p_observaciones: observaciones ?? null,
    });

    if (decisionError) {
      console.error('Error resolviendo aprobación de pedido:', decisionError);
      throw new BadRequestException(decisionError.message || 'No se pudo resolver la aprobación del pedido');
    }

    let pedidoActualizado: PedidoVenta & { detalle: PedidoDetalle[] };
    try {
      pedidoActualizado = await this.findOne(pedidoId, tenantId);
    } catch (hydrationError) {
      // La decisión ya hizo commit junto con su huella y liberación de reserva.
      // No devolvemos un falso fallo que induciría a decidirla por segunda vez.
      this.logger.warn(
        '⚠️ [PedidosService] Decisión confirmada; no se pudo hidratar el pedido:',
        hydrationError,
      );
      const pedidoRpc = decisionResult?.pedido ?? {};
      pedidoActualizado = {
        ...pedido,
        ...pedidoRpc,
        estado:
          pedidoRpc.estado ??
          (decision === DecisionAprobacion.APROBADO
            ? EstadoPedido.PENDIENTE
            : EstadoPedido.CANCELADO),
        requiere_aprobacion: false,
        estado_credito:
          pedidoRpc.estado_credito ??
          (decision === DecisionAprobacion.APROBADO ? 'APROBADO' : 'RECHAZADO'),
        detalle: pedido.detalle ?? [],
      } as PedidoVenta & { detalle: PedidoDetalle[] };
    }

    await this.registrarAuditoriaAccion(
      pedidoId,
      tenantId,
      userId,
      {
        estado: pedidoActualizado.estado,
        requiere_aprobacion: false,
        estado_credito: decision === DecisionAprobacion.APROBADO ? 'APROBADO' : 'RECHAZADO',
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
      .select('*, clientes:clientes!pedidos_venta_cliente_id_fkey(*)')
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

    const updateData: Record<string, unknown> = {};

    if (updatePedidoDto.cliente_id) {
      updateData.cliente_id = updatePedidoDto.cliente_id;
    }

    if (updatePedidoDto.notas !== undefined) {
      updateData.observaciones = updatePedidoDto.notas;
    }

    let detalleData: Array<{
      producto_id: string;
      descripcion: string;
      cantidad: number;
      precio_unitario: number;
    }> | null = null;

    if (updatePedidoDto.detalle) {
      const { subtotal, igv, total } = await this.calcularTotales(updatePedidoDto.detalle);
      updateData.subtotal = subtotal;
      updateData.igv = igv;
      updateData.total = total;

      detalleData = updatePedidoDto.detalle.map((item) => ({
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
      }));

    }

    const paymentIntent = tieneEntradaPagoPedido(updatePedidoDto)
      ? {
          condicion_pago: updatePedidoDto.condicion_pago,
          medio_pago: updatePedidoDto.medio_pago,
          plazo_pago_dias: updatePedidoDto.plazo_pago_dias,
          fecha_vencimiento: updatePedidoDto.fecha_vencimiento,
        }
      : null;
    const { data: pedidoActualizadoRpc, error } = await client.rpc('actualizar_pedido_comercial_pago_tx_531', {
      p_pedido_id: id,
      p_tenant_id: tenantId,
      p_patch: updateData,
      p_detalle: detalleData,
      p_payment_intent: paymentIntent,
    });

    if (error) {
      console.error('Error updating pedido:', error);
      throw new BadRequestException(error.message || 'Error al actualizar el pedido');
    }

    console.log('✅ [PedidosService] Pedido actualizado:', id);

    // El update ya quedó confirmado por la RPC; una hidratación transitoria no
    // debe transformar el commit en un falso fallo HTTP.
    try {
      return await this.findOne(id, tenantId);
    } catch (hydrationError) {
      this.logger.warn(
        `Pedido ${id} actualizado; no se pudo hidratar la respuesta post-commit`,
        hydrationError,
      );
      return {
        ...(pedidoActualizadoRpc as any),
        id,
        tenant_id: tenantId,
        detalle: detalleData ?? [],
      } as PedidoVenta & { detalle: PedidoDetalle[] };
    }
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
      gre_automatico_habilitado: data?.gre_automatico_habilitado ?? false,
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

    const { error } = await client.rpc('solicitar_aprobacion_pedido_tx', {
      p_pedido_id: pedido.id,
      p_tenant_id: tenantId,
      p_motivos: motivos.join('; ') || null,
      p_estado_credito: estadoCredito,
    });

    if (error) {
      throw new BadRequestException(error.message || 'No se pudo solicitar la aprobación del pedido');
    }

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

  private redondearCantidad(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return new Decimal(value).toDecimalPlaces(2).toNumber();
  }

  /**
   * Calcular totales (subtotal, IGV, total)
   * Usa TaxCalculatorService para obtener la tasa correcta según el país
   */
  /**
   * Calcular totales (subtotal, IGV, total)
   * Usa TaxCalculatorService para obtener la tasa correcta según el país
   */
  private async calcularTotales(
    detalle: Array<{ producto_id?: string; cantidad: number; precio_unitario: number }>,
  ) {
    // Usar Decimal para el cálculo del subtotal
    const bases = detalle.map((item) =>
      new Decimal(item.cantidad).mul(item.precio_unitario).toDecimalPlaces(2),
    );
    const subtotalDecimal = bases.reduce(
      (sum, base) => sum.plus(base),
      new Decimal(0),
    );

    const tenantId = this.tenantContext.getTenantId();

    // La afectación del IGV (Catálogo 07) decide qué parte del pedido es gravada.
    // Aplicar la tasa al subtotal completo cobraba impuesto sobre bienes
    // exonerados o inafectos, y dejaba el pedido descuadrado contra el CPE, que
    // sí desglosa por afectación.
    const afectaciones = await this.obtenerAfectacionesProductos(detalle, tenantId);
    const tasaIgv = await this.taxCalculator.getTasaIgv(tenantId);

    const desglose = calcularDesgloseIgv(
      detalle.map((item, index) => ({
        baseImponible: bases[index].toNumber(),
        afectacionIgv: item.producto_id ? afectaciones.get(item.producto_id) : undefined,
      })),
      tasaIgv,
    );

    const igvDecimal = new Decimal(desglose.igv);
    const totalDecimal = subtotalDecimal.plus(igvDecimal);

    return {
      subtotal: subtotalDecimal.toDecimalPlaces(2).toNumber(), // Redondeo a 2 decimales
      igv: igvDecimal.toDecimalPlaces(2).toNumber(),
      total: totalDecimal.toDecimalPlaces(2).toNumber(),
      desglose,
      tasaIgv,
      afectaciones,
      subtotalDecimal, // Retornar también los objetos Decimal por si se necesitan
      igvDecimal,
      totalDecimal
    };
  }

  /** Afectación del IGV por producto, para no depender de lo que envíe el cliente. */
  private async obtenerAfectacionesProductos(
    detalle: Array<{ producto_id?: string }>,
    tenantId?: string,
  ): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    const ids = Array.from(new Set(detalle.map((item) => item.producto_id).filter(Boolean))) as string[];
    if (ids.length === 0) return mapa;

    try {
      let query = this.supabase.getClient()
        .from('productos')
        .select('id, afectacion_igv')
        .in('id', ids);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;
      if (error) {
        this.logger.warn(`No se pudo leer la afectación IGV de los productos: ${error.message}`);
        return mapa;
      }

      for (const producto of data || []) {
        mapa.set((producto as any).id, (producto as any).afectacion_igv);
      }
    } catch (lecturaError: any) {
      // Sin afectación conocida se asume gravado, que es el default del Catálogo
      // 07 y el que no sub-declara IGV.
      this.logger.warn(`No se pudo resolver la afectación IGV: ${lecturaError?.message ?? lecturaError}`);
    }

    return mapa;
  }

  /**
   * Confirmar pedido con reserva de stock
   * Requirements: 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 7.5, 8.1
   */
  async confirmarPedido(
    id: string,
    tenantId: string,
    userId?: string,
  ): Promise<{
    success: true;
    confirmado: boolean;
    warnings?: any[];
    requiere_aprobacion?: boolean;
    motivos?: string[];
    estado_credito?: string;
  }> {
    const client = this.supabase.getClient();

    if (!userId) {
      throw new BadRequestException('No se pudo identificar al confirmador del pedido');
    }

    const pedido = await this.findOne(id, tenantId);

    if (
      [EstadoPedido.CONFIRMADO, EstadoPedido.LISTO_FACTURAR].includes(pedido.estado)
      && typeof (pedido as any).metadata?.confirmation_fingerprint === 'string'
    ) {
      // Retry de red: el commit ya dejó actor, fingerprint, reserva y resultado
      // durable. No se vuelve a evaluar ni se crea una segunda reserva.
      return {
        success: true,
        confirmado: true,
        estado_credito: pedido.estado_credito ?? 'OK',
      };
    }

    if (pedido.estado === EstadoPedido.PENDIENTE_APROBACION) {
      if (String(pedido.estado_credito ?? '').toUpperCase() === 'BLOQUEADO') {
        throw new BadRequestException(
          'El pedido está bloqueado por crédito. Debe regularizar la cuenta del cliente; no admite aprobación comercial.',
        );
      }

      return {
        success: true,
        confirmado: false,
        requiere_aprobacion: true,
        motivos: pedido.motivo_requiere_aprobacion ? [pedido.motivo_requiere_aprobacion] : undefined,
        estado_credito: pedido.estado_credito,
      };
    }

    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new BadRequestException(
        `No se puede confirmar un pedido en estado ${pedido.estado}`,
      );
    }

    const { data: politicaData, error: politicaError } = await client.rpc(
      'evaluar_politica_pedido_441',
      { p_pedido_id: id, p_tenant_id: tenantId },
    );
    if (politicaError || !(politicaData as any)?.pedido_fingerprint) {
      throw new BadRequestException(
        politicaError?.message || 'No se pudo evaluar la política vigente del pedido',
      );
    }
    const politica = politicaData as any;
    const evaluacion: EvaluacionPoliticas = {
      requiereAprobacion: Boolean(politica.requiere_aprobacion),
      motivos: Array.isArray(politica.motivos) ? politica.motivos : [],
      estadoCredito: String(politica.estado_credito || 'OK').toUpperCase(),
    };
    const fingerprintEvaluado = String(politica.pedido_fingerprint);

    // Un bloqueo crediticio exige corregir la cuenta; no es una aprobación
    // comercial que pueda saltarse desde este endpoint.
    if (evaluacion.estadoCredito === 'BLOQUEADO') {
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

    if (evaluacion.requiereAprobacion) {
      const { data: aprobacionVigente, error: aprobacionError } = await client.rpc(
        'pedido_tiene_aprobacion_vigente',
        { p_pedido_id: id, p_tenant_id: tenantId },
      );
      if (aprobacionError) {
        throw new BadRequestException(
          aprobacionError.message || 'No se pudo validar la aprobación del pedido',
        );
      }

      if (!aprobacionVigente) {
        await this.registrarSolicitudAprobacion(pedido, tenantId, evaluacion.motivos, evaluacion.estadoCredito);

        await this.enviarNotificacion(tenantId, {
          type: 'PEDIDO_REQUIERE_APROBACION' as any,
          severity: 'WARNING' as any,
          title: 'Pedido requiere aprobación',
          message: `El pedido ${pedido.numero} requiere aprobación antes de confirmar: ${evaluacion.motivos.join('; ')}`,
          usuario_id: userId,
        });

        return {
          success: true,
          confirmado: false,
          requiere_aprobacion: true,
          motivos: evaluacion.motivos,
          estado_credito: evaluacion.estadoCredito,
        };
      }
    }

    const estadoCreditoFinal = evaluacion.requiereAprobacion ? 'APROBADO' : 'OK';
    const estadoDestino = politica.usar_flujo_logistica
      ? EstadoPedido.CONFIRMADO
      : EstadoPedido.LISTO_FACTURAR;

    // La migración 441 confirma cabecera, reserva todos los productos, repara
    // cualquier reserva parcial histórica y valida la aprobación segregada en
    // un único commit. La confirmación comercial no genera ingreso contable:
    // `venta.procesada` nace recién con la factura/CPE.
    const { data: confirmacionResult, error: confirmacionError } = await client.rpc('confirmar_pedido_tx', {
      p_pedido_id: id,
      p_tenant_id: tenantId,
      p_estado_credito: estadoCreditoFinal,
      p_estado_destino: estadoDestino,
      p_forzado: false,
      p_requiere_aprobacion: evaluacion.requiereAprobacion,
      p_aprobado_por: null,
      p_motivos: evaluacion.motivos.join('; ') || null,
      p_expected_fingerprint: fingerprintEvaluado,
      p_actor_id: userId,
    });

    if (confirmacionError) {
      const msg = confirmacionError.message ?? '';
      if (msg.includes('Stock insuficiente') || msg.includes('insufficient')) {
        throw new BadRequestException(`Stock insuficiente para confirmar el pedido. ${msg}`);
      }
      throw new BadRequestException(`No se pudo confirmar el pedido: ${msg}`);
    }

    const saltarReserva = Boolean((confirmacionResult as any)?.reserva?.skipped);
    if (saltarReserva) {
      this.logger.log(`ℹ️ [PedidosService] Pedido ${id} ya contaba con su reserva completa.`);
    }

    const estadoConfirmado = (confirmacionResult as any)?.estado ?? estadoDestino;
    const creditoConfirmado = (confirmacionResult as any)?.estado_credito ?? estadoCreditoFinal;

    await this.registrarAuditoriaAccion(id, tenantId, userId, {
      estado: estadoConfirmado,
      estado_credito: creditoConfirmado,
    }, 'confirmar_pedido');

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
      confirmado: true,
      estado_credito: creditoConfirmado,
    };
  }

  /**
   * Cancela un pedido todavía no despachado mediante la frontera atómica 467.
   * Si hubo salida física, el dominio exige una devolución antes de cancelar.
   */
  async cancelarPedido(
    id: string,
    tenantId: string,
    motivo?: string,
    userId?: string,
    idempotencyKey?: string,
    confirmarRetornoFisico = false,
  ): Promise<{
    success: boolean;
    pedido_id?: string;
    numero?: string;
    estado?: string;
    event_id?: string;
    idempotent?: boolean;
    movimientos_retorno?: any[];
  }> {
    if (!userId) {
      throw new BadRequestException('La cancelación requiere un usuario autenticado');
    }
    const normalizedReason = String(motivo ?? '').trim();
    const normalizedKey = String(idempotencyKey ?? '').trim();
    if (normalizedReason.length < 3) {
      throw new BadRequestException('El motivo de cancelación debe tener al menos 3 caracteres');
    }
    if (normalizedKey.length < 8 || normalizedKey.length > 200) {
      throw new BadRequestException('Se requiere un Idempotency-Key válido para cancelar el pedido');
    }

    const client = this.supabase.getClient();
    const { data, error } = await client.rpc('cancelar_pedido_venta_tx', {
      p_pedido_id: id,
      p_tenant_id: tenantId,
      p_actor_id: userId,
      p_motivo: normalizedReason,
      p_idempotency_key: normalizedKey,
      p_confirmar_retorno_fisico: confirmarRetornoFisico,
    });
    if (error) {
      const message = String(error.message ?? 'Error transaccional al cancelar el pedido');
      if (message.includes('ORDER_CANCELLATION_REQUIRES_PHYSICAL_RETURN')) {
        throw new BadRequestException(
          'El pedido ya tiene mercadería despachada. Registre y confirme la devolución física antes de cancelarlo.',
        );
      }
      if (message.includes('ORDER_CANCELLATION_REQUIRES_GRE_CANCELLATION')) {
        throw new BadRequestException(
          'El pedido tiene una guía activa. Anule primero la GRE mediante su flujo fiscal.',
        );
      }
      if (message.includes('ORDER_ALREADY_DOCUMENTED_USE_CPE_CANCELLATION')) {
        throw new BadRequestException(
          'El pedido ya fue documentado. Use la nota de crédito/anulación del CPE.',
        );
      }
      if (
        message.includes('ORDER_CANCELLATION_IDEMPOTENCY_CONFLICT') ||
        message.includes('ORDER_ALREADY_CANCELLED_WITH_DIFFERENT_REASON')
      ) {
        throw new BadRequestException(
          'La clave de cancelación ya fue utilizada con una intención diferente.',
        );
      }
      if (message.includes('ORDER_CANCELLATION_ACTOR_INVALID')) {
        throw new BadRequestException('El usuario no pertenece al tenant o está inactivo');
      }
      if (message.includes('ORDER_DISPATCH_LEDGER_INCONSISTENT')) {
        throw new BadRequestException(
          'El pedido registra cantidades despachadas sin un movimiento físico trazable. Requiere conciliación de inventario antes de cancelar.',
        );
      }
      throw new BadRequestException(`No se pudo cancelar el pedido: ${message}`);
    }

    const result = (data ?? {}) as Record<string, any>;
    await this.enviarNotificacion(tenantId, {
      type: 'PEDIDO_CANCELADO' as any,
      severity: 'WARNING' as any,
      title: 'Pedido cancelado',
      message: `El pedido ${result.numero ?? id} fue cancelado. Motivo: ${normalizedReason}`,
      usuario_id: userId,
    });

    return {
      success: true,
      pedido_id: result.pedido_id ?? id,
      numero: result.numero,
      estado: result.estado ?? EstadoPedido.CANCELADO,
      event_id: result.event_id,
      idempotent: result.idempotent === true,
      movimientos_retorno: result.movimientos_retorno ?? [],
    };
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

    // 0. VALIDAR CONFIGURACIÓN COMPLETA ANTES DE CONTINUAR
    const { data: empresaConfig, error: configError } = await client
      .from('empresa_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (configError || !empresaConfig) {
      throw new BadRequestException(
        'No se puede generar factura: La configuración de la empresa no está completa. Por favor, complete el wizard de configuración inicial.',
      );
    }

    // Validar campos críticos
    const camposFaltantes: string[] = [];
    if (!empresaConfig.ruc) camposFaltantes.push('RUC');
    if (!empresaConfig.razon_social) camposFaltantes.push('Razón Social');
    if (!empresaConfig.direccion_fiscal) camposFaltantes.push('Dirección Fiscal');
    const usaCertificadoDemoRuntime = canUseRuntimeDemoCertificate(empresaConfig);
    if (!empresaConfig.certificado_pfx && !usaCertificadoDemoRuntime) {
      camposFaltantes.push('Certificado Digital');
    }
    if (!empresaConfig.certificado_password && !usaCertificadoDemoRuntime) {
      camposFaltantes.push('Contraseña del Certificado');
    }

    if (camposFaltantes.length > 0) {
      throw new BadRequestException(
        `No se puede generar factura: Faltan los siguientes datos de configuración: ${camposFaltantes.join(', ')}. Por favor, complete el wizard de configuración inicial.`,
      );
    }

    // 1. Obtener pedido
    let pedido = await this.findOne(id, tenantId);

    // 2. Validar estado (considerando flujo simplificado)
    const config = await this.obtenerConfiguracionEmpresa(tenantId);
    const esFlujoSimplificado = !config.usar_flujo_logistica;
    const puedeFacturar =
      pedido.estado === EstadoPedido.LISTO_FACTURAR ||
      (esFlujoSimplificado && pedido.estado === EstadoPedido.CONFIRMADO);

    if (!puedeFacturar) {
      throw new BadRequestException(
        `No se puede generar factura para un pedido en estado ${pedido.estado}`,
      );
    }

    if (pedido.factura_id) {
      console.log(`ℹ️ [PedidosService] Pedido ${id} ya tiene factura ${pedido.factura_id}, retornando datos actuales`);
      await this.repararDetalleFacturadoSiEsNecesario(pedido, tenantId);
      const sugerenciaExistente = await this.greIntegrationService.verificarSugerenciaGRE(pedido, tenantId);
      return {
        success: true,
        factura_id: pedido.factura_id,
        sugerir_gre: sugerenciaExistente.sugerir,
      };
    }

    // 3. Obtener configuración
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

    // 4. En flujo simplificado el descuento de stock ocurre después de obtener
    // el CPE idempotente. Así un fallo de SUNAT/CPE no deja stock descontado
    // sin factura; si falla un paso local posterior, el reintento reutiliza el CPE.

    // 5. Integrar con CPE real
    const cpeIdempotencyKey = `ventas.cpe.factura:${tenantId}:${pedido.id}`;
    const facturaResultado = await this.cpeIntegrationService.generarFacturaDesdePedido(
      pedido,
      tenantId,
      cpeIdempotencyKey,
      userId,
    );

    // CPEIntegrationService incluye pedido_id en el payload. CpeService enruta
    // entonces a facturar_pedido_venta_tx (446), que ya cerró en un solo commit
    // salida/reserva, líneas, pedido, documento, CPE, CxC y outbox. No se admite
    // aquí una segunda escritura o un segundo evento financiero.
    pedido.factura_id = facturaResultado.factura_id;

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

    return {
      success: true,
      factura_id: facturaResultado.factura_id,
      sugerir_gre: sugerenciaGRE.sugerir,
    };
  }

  private async repararDetalleFacturadoSiEsNecesario(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    tenantId: string,
  ): Promise<void> {
    const pendientes = (pedido.detalle ?? []).filter((item) => {
      const cantidad = this.redondearCantidad(Number(item.cantidad ?? 0));
      const facturada = this.redondearCantidad(Number(item.cantidad_facturada ?? 0));
      return cantidad > 0 && facturada < cantidad;
    });

    if (pendientes.length === 0) {
      return;
    }

    const client = this.supabase.getClient();
    for (const item of pendientes) {
      const cantidad = this.redondearCantidad(Number(item.cantidad ?? 0));
      const { data, error } = await client
        .from('pedidos_venta_detalle')
        .update({
          cantidad_facturada: cantidad,
          estado_item: 'FACTURADO',
        })
        .eq('id', item.id)
        .eq('tenant_id', tenantId)
        .select('id')
        .maybeSingle();

      if (error || !data) {
        throw new BadRequestException('No se pudo reparar el detalle facturado del pedido');
      }
    }
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
  /**
   * 🔥 NUEVO: Genera documento fiscal (factura/boleta) desde un pedido
   * Requirements: Flujo completo Ventas → Documentos → CPE → CxC → Contabilidad
   * 
   * @param pedidoId - ID del pedido a facturar
   * @param tipoDoc - Tipo de documento: '01' (Factura) o '03' (Boleta)
   * @param tenantId - ID del tenant
   * @param userId - ID del usuario que genera el documento
   * @returns Documento fiscal generado con CPE y CxC
   */
  async generarDocumentoDesdePedido(
    pedidoId: string,
    tipoDoc: '01' | '03',
    tenantId: string,
    userId?: string,
  ): Promise<{
    success: boolean;
    documento: any;
    cpe: any;
    cxc: any;
    message: string;
  }> {
    // Adaptador temporal de compatibilidad: todas las escrituras pasan por
    // generarFactura -> CpeService -> facturar_pedido_venta_tx (446). Se
    // conserva la forma de respuesta mientras los clientes migran a
    // /generar-factura.
    {
      const resultado = await this.generarFactura(pedidoId, tenantId, userId);
      const canonicalClient = this.supabase.getClient();
      const { data: cpe } = await canonicalClient
        .from('cpe')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', resultado.factura_id)
        .maybeSingle();
      const documentoId = cpe?.documento_id ?? null;
      const { data: documento } = documentoId
        ? await canonicalClient
            .from('documentos')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', documentoId)
            .maybeSingle()
        : { data: null };
      const { data: cxc } = documentoId
        ? await canonicalClient
            .from('cuentas_por_cobrar')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('documento_id', documentoId)
            .maybeSingle()
        : { data: null };

      if (cpe?.tipo_documento && cpe.tipo_documento !== tipoDoc) {
        this.logger.warn(
          `El tipo ${tipoDoc} solicitado fue normalizado a ${cpe.tipo_documento} según el documento del cliente`,
        );
      }

      return {
        success: true,
        documento: documento ?? (documentoId ? { id: documentoId } : null),
        cpe: cpe ?? { id: resultado.factura_id },
        cxc,
        message: documento
          ? `Documento ${documento.serie}-${documento.numero} generado exitosamente`
          : 'Documento fiscal generado exitosamente',
      };
    }

  }

  /**
   * Registra una acción de auditoría en el pedido
   */
  private async registrarAuditoriaAccion(
    pedidoId: string,
    tenantId: string,
    userId: string | undefined,
    cambios: any,
    accion: string,
  ): Promise<void> {
    try {
      await this.auditService.logAction({
        table_name: 'pedidos_venta',
        operation: 'UPDATE',
        tenant_id: tenantId,
        record_id: pedidoId,
        user_id: userId ?? undefined,
        new_values: cambios,
        metadata: { action: accion },
      });
    } catch (error) {
      this.logger.warn('⚠️ [PedidosService] Error registrando auditoría:', error);
    }
  }

  /**
   * Envía una notificación al usuario
   */
  private async enviarNotificacion(
    tenantId: string,
    notification: {
      type: string;
      severity: string;
      title: string;
      message: string;
      usuario_id?: string;
    },
  ): Promise<void> {
    try {
      await this.notificationsService.createNotification(tenantId, notification as any);
    } catch (error) {
      this.logger.warn('⚠️ [PedidosService] Error enviando notificación:', error);
    }
  }
}
