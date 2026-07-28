import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from 'decimal.js';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { CPEIntegrationService } from './cpe-integration.service';
import { GREIntegrationService } from './gre-integration.service';
import { CreatePedidoDto, UpdatePedidoDto, DecisionAprobacion } from './dto';
import { PedidoVenta, EstadoPedido, PedidoDetalle } from './entities';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { calcularDesgloseIgv, esGravado } from '../../../shared/utils/igv-afectacion.util';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { DocumentosService } from '../../documentos.service';

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
    private readonly eventBus: EventBusService,
    private readonly taxCalculator: TaxCalculatorService,
    private readonly tenantContext: TenantContextService,
    private readonly documentosService: DocumentosService,
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

    // Validar stock disponible antes de crear (hard stop)
    for (const item of createPedidoDto.detalle) {
      const disponible = await this.getStockDisponible(item.producto_id, tenantId);
      if (new Decimal(item.cantidad ?? 0).gt(disponible)) {
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

    // Calcular totales usando decimal.js
    const { subtotal, igv, total } = await this.calcularTotales(createPedidoDto.detalle);

    // Generar número de pedido
    const numero = await this.generarNumero(tenantId);

    // Preparar objeto Pedido
    const pedidoData = {
      tenant_id: tenantId,
      numero,
      cotizacion_id: createPedidoDto.cotizacion_id || null,
      cliente_id: createPedidoDto.cliente_id,
      fecha_pedido: new Date().toISOString().split('T')[0],
      estado: EstadoPedido.PENDIENTE,
      subtotal, // Already a number from calcularTotales
      igv, // Already a number from calcularTotales
      total, // Already a number from calcularTotales
      observaciones: createPedidoDto.notas || null,
      created_by: userId || null,
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
    const { data: rpcResult, error: rpcError } = await client.rpc('crear_pedido_completo', {
      p_pedido: pedidoData,
      p_detalle: detalleData
    });

    if (rpcError) {
      console.error('Error creating pedido (RPC):', rpcError);
      throw new BadRequestException('Error al crear el pedido: ' + rpcError.message);
    }

    const pedidoId = (rpcResult as any).pedido_id;
    console.log('✅ [PedidosService] Pedido creado atómicamente:', pedidoId);

    // Retornar el pedido completo
    return this.findOne(pedidoId, tenantId);
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
          clientes:clientes!pedidos_venta_cliente_id_fkey(id, razon_social, numero_documento, limite_credito, permite_morosidad)
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
      updateData.observaciones = pedido.observaciones ? `${pedido.observaciones}\n\n${nota}` : nota;
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
      updateData.observaciones = updatePedidoDto.notas;
    }

    // Si se actualiza el detalle, recalcular totales
    if (updatePedidoDto.detalle) {
      const { subtotal, igv, total } = await this.calcularTotales(updatePedidoDto.detalle);
      updateData.subtotal = subtotal;
      updateData.igv = igv;
      updateData.total = total;

      // Insertar nuevo detalle ANTES de eliminar el anterior (para evitar pérdida de datos si INSERT falla)
      const detalleData = updatePedidoDto.detalle.map((item) => ({
        pedido_id: id,
        tenant_id: tenantId,
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.cantidad * item.precio_unitario,
      }));

      // Obtener IDs de detalle anterior para eliminar después del INSERT exitoso
      const { data: detalleAnterior } = await client
        .from('pedidos_venta_detalle')
        .select('id')
        .eq('pedido_id', id);

      const { error: detalleError } = await client
        .from('pedidos_venta_detalle')
        .insert(detalleData);

      if (detalleError) {
        console.error('Error updating pedido detalle:', detalleError);
        throw new BadRequestException('Error al actualizar el detalle del pedido');
      }

      // Eliminar detalle anterior solo después de INSERT exitoso
      if (detalleAnterior && detalleAnterior.length > 0) {
        const idsAnteriores = detalleAnterior.map((d) => d.id);
        await client.from('pedidos_venta_detalle').delete().eq('tenant_id', tenantId).in('id', idsAnteriores);
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
        inventarioAplicado: true,
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
    factura: {
      factura_id: string;
      serie?: string;
      numero?: number;
      total: number;
      fecha_emision?: string;
      moneda?: string;
      documento_id?: string | null;
    },
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
        inventarioAplicado: true,
      });
    } catch (error) {
      console.error('Error emitiendo evento de venta procesada para asientos contables:', error);
    }
  }

  private redondearCantidad(value: number): number {
    // Cantidades ahora son enteros; redondeo defensivo
    return Math.round(value);
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
    const subtotalDecimal = detalle.reduce(
      (sum, item) => {
        const cantidad = new Decimal(item.cantidad);
        const precio = new Decimal(item.precio_unitario);
        return sum.plus(cantidad.mul(precio));
      },
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
      detalle.map((item) => ({
        baseImponible: new Decimal(item.cantidad).mul(item.precio_unitario).toDecimalPlaces(2).toNumber(),
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
      const cantidadSolicitada = this.redondearCantidad(Number(item.cantidad ?? 0));
      const stockDisponible = await this.getStockDisponible(item.producto_id, tenantId);
      if (stockDisponible < cantidadSolicitada) {
        stockWarnings.push({
          producto_id: item.producto_id,
          descripcion: item.descripcion,
          disponible: stockDisponible,
          solicitado: cantidadSolicitada,
        });
      }
    }

    if (stockWarnings.length > 0 && !forzarConfirmacion) {
      throw new BadRequestException({
        message: 'Stock insuficiente para uno o más productos',
        warnings: stockWarnings,
      });
    }

    // HARDENING H-003: reserva atómica de TODOS los items del pedido en una sola
    // transacción vía `reservar_pedido_stock_tx`. Reusa `reservar_stock_atomico`
    // por item; si alguno no tiene stock, la RPC hace ROLLBACK total (libera las
    // reservas ya creadas automáticamente, sin el rollback manual frágil anterior
    // que podía dejar el pedido CONFIRMADO con reserva parcial). Idempotente: si
    // el pedido ya tiene reservas, retorna skipped=true y se continúa la confirmación.
    const { data: reservaResult, error: reservaError } = await client.rpc('reservar_pedido_stock_tx', {
      p_pedido_id: id,
      p_tenant_id: tenantId,
    });

    if (reservaError) {
      const msg = reservaError.message ?? '';
      if (msg.includes('Stock insuficiente') || msg.includes('insufficient')) {
        throw new BadRequestException(`Stock insuficiente para confirmar el pedido. ${msg}`);
      }
      throw new BadRequestException(`No se pudo reservar stock para el pedido: ${msg}`);
    }

    const saltarReserva = Boolean((reservaResult as any)?.skipped);
    if (saltarReserva) {
      this.logger.log(`ℹ️ [PedidosService] Pedido ${id} ya contaba con reservas; se omitió crear nuevas y se continúa la confirmación.`);
    }

    const estadoCreditoFinal = forzarConfirmacion && evaluacion.requiereAprobacion
      ? 'APROBADO_MANUAL'
      : evaluacion.estadoCredito === 'BLOQUEADO'
        ? 'BLOQUEADO'
        : 'OK';

    try {
      await this.updateEstado(id, EstadoPedido.CONFIRMADO, tenantId);

      const { data: pedidoConfirmado, error: confirmarError } = await client
        .from('pedidos_venta')
        .update({
          requiere_aprobacion: false,
          motivo_requiere_aprobacion: null,
          aprobado_por: forzarConfirmacion && evaluacion.requiereAprobacion ? userId ?? null : null,
          aprobado_en: forzarConfirmacion && evaluacion.requiereAprobacion ? new Date().toISOString() : null,
          estado_credito: estadoCreditoFinal,
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('id')
        .maybeSingle();

      if (confirmarError || !pedidoConfirmado) {
        throw new BadRequestException('No se pudo persistir la confirmación del pedido');
      }

      if (forzarConfirmacion && evaluacion.requiereAprobacion) {
        await this.registrarDecisionAprobacion(id, tenantId, 'APROBADO', evaluacion.motivos, userId);
      }
    } catch (error) {
      if (!saltarReserva) {
        await this.revertirReservasPedidoBestEffort(id, tenantId, pedido.estado);
      }
      throw error;
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

  private async revertirReservasPedidoBestEffort(
    pedidoId: string,
    tenantId: string,
    estadoAnterior?: string,
  ): Promise<void> {
    const client = this.supabase.getClient();

    try {
      const { error: liberarError } = await client.rpc('liberar_reservas_pedido_tx', {
        p_pedido_id: pedidoId,
        p_tenant_id: tenantId,
        p_referencia_tipo: 'PEDIDO_ROLLBACK',
        p_notas: 'Liberación atómica por fallo posterior a la reserva del pedido',
      });
      if (liberarError) throw liberarError;

      if (estadoAnterior) {
        await client
          .from('pedidos_venta')
          .update({
            estado: estadoAnterior,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pedidoId)
          .eq('tenant_id', tenantId);
      }
    } catch (rollbackError) {
      this.logger.error('❌ [PedidosService] Error revirtiendo reservas tras fallo de confirmación:', rollbackError);
    }
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
      const { error: liberarReservasError } = await client.rpc('liberar_reservas_pedido_tx', {
        p_pedido_id: id,
        p_tenant_id: tenantId,
        p_referencia_tipo: 'PEDIDO_CANCELACION',
        p_notas: `Liberación por cancelación de pedido ${pedido.numero}. Motivo: ${motivo || 'No especificado'}`,
      });
      if (liberarReservasError) {
        throw new BadRequestException(`No se pudo liberar el inventario del pedido: ${liberarReservasError.message}`);
      }

      for (const item of pedido.detalle) {
        const { error: resetDetalleError } = await client
          .from('pedidos_venta_detalle')
          .update({
            cantidad_despachada: 0,
            cantidad_facturada: 0,
            estado_item: 'PENDIENTE',
          })
          .eq('id', item.id)
          .eq('tenant_id', tenantId);

        if (resetDetalleError) {
          console.warn('No se pudo resetear el detalle del pedido al cancelar:', resetDetalleError);
        }
      }

      const { error: backordersError } = await client
        .from('pedido_backorders')
        .delete()
        .eq('pedido_id', id)
        .eq('tenant_id', tenantId);

      if (backordersError) {
        console.warn('No se pudo limpiar backorders al cancelar pedido:', backordersError);
      }
    }

    // 5. Cambiar estado a CANCELADO
    await this.updateEstado(id, EstadoPedido.CANCELADO, tenantId);

    // 6. Registrar motivo de cancelación en observaciones
    if (motivo) {
      const observacionesActualizadas = pedido.observaciones
        ? `${pedido.observaciones}\n\n[CANCELADO] ${motivo}`
        : `[CANCELADO] ${motivo}`;

      await client
        .from('pedidos_venta')
        .update({ observaciones: observacionesActualizadas })
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
    // NOTA: El certificado digital es opcional para testing/desarrollo
    // En producción, la empresa debe subirlo a través del wizard
    if (!empresaConfig.certificado_pfx) camposFaltantes.push('Certificado Digital');
    if (!empresaConfig.certificado_password) camposFaltantes.push('Contraseña del Certificado');

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

    // Si venía en CONFIRMADO (flujo simplificado), intentamos promoverlo antes de continuar.
    if (esFlujoSimplificado && pedido.estado === EstadoPedido.CONFIRMADO) {
      await this.updateEstado(id, EstadoPedido.LISTO_FACTURAR, tenantId);
      pedido = {
        ...pedido,
        estado: EstadoPedido.LISTO_FACTURAR,
      };
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

    if (!config.usar_flujo_logistica) {
      await this.aplicarSalidaStockFacturacionSimplificada(pedido, tenantId);
    }

    const facturaDocumentoId = facturaResultado.documento_id ?? null;

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
    const { data: pedidoFacturado, error: updatePedidoFacturadoError } = await client
      .from('pedidos_venta')
      .update({
        factura_id: facturaResultado.factura_id,
        estado: EstadoPedido.FACTURADO,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle();

    if (updatePedidoFacturadoError || !pedidoFacturado) {
      throw new BadRequestException('No se pudo asociar la factura al pedido');
    }

    pedido.factura_id = facturaResultado.factura_id;

    const facturaEventId = uuidv4();
    const facturaReferenciaId = facturaDocumentoId ?? facturaResultado.factura_id;
    const facturaIdempotencyKey = `factura:${tenantId}:${facturaReferenciaId}`;
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
      facturaId: facturaReferenciaId,
      serie: facturaSerie,
      numero: facturaNumero,
      clienteId: pedido.cliente_id,
      subtotal: Number(pedido.subtotal ?? 0),
      impuestos: Number(pedido.igv ?? 0),
      total: Number(facturaResultado.total ?? pedido.total ?? 0),
      moneda: facturaMoneda,
      fechaEmision: fechaEmisionFactura,
      fechaVencimiento: fechaVencimientoFactura,
      idempotencyKey: facturaIdempotencyKey,
      source: 'ventas',
      // El canal Ventas/Pedidos es venta a crédito (genera CxC). Explícito para
      // que el guard de contado del listener de CxC nunca lo omita.
      esCredito: true,
      ajustes: ajustesTributarios,
      costoVentas: Number(costoVentasEstimado) || 0,
    });

    this.emitirEventoVentaProcesada(
      pedido,
      {
        factura_id: facturaResultado.factura_id,
        documento_id: facturaDocumentoId ?? undefined,
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
          .eq('id', item.id)
          .eq('tenant_id', tenantId);

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
  private async aplicarSalidaStockFacturacionSimplificada(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    tenantId: string,
  ): Promise<void> {
    const client = this.supabase.getClient();

    for (const item of pedido.detalle) {
      const { data: salidaExistente, error: salidaExistenteError } = await client
        .from('movimientos_inventario')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('referencia_tipo', 'PEDIDO')
        .eq('referencia_id', pedido.id)
        .eq('tipo', 'SALIDA')
        .eq('producto_id', item.producto_id)
        .limit(1);

      if (salidaExistenteError) {
        throw new BadRequestException('No se pudo verificar si ya se registró la salida de inventario');
      }

      const yaTieneSalidaRegistrada = Array.isArray(salidaExistente) && salidaExistente.length > 0;

      if (!yaTieneSalidaRegistrada) {
        const { error: salidaError } = await client.rpc('descontar_stock_y_liberar_reserva', {
          p_producto_id: item.producto_id,
          p_cantidad: item.cantidad,
          p_referencia_tipo: 'PEDIDO',
          p_referencia_id: pedido.id,
          p_notas: `Salida por facturación de pedido ${pedido.numero}`,
        });

        if (salidaError) {
          console.error('Error descontando stock al facturar:', salidaError);
          throw new BadRequestException('No se pudo descontar el stock al facturar');
        }
      }

      const { data: detalleDespachado, error: detalleDespachoError } = await client
        .from('pedidos_venta_detalle')
        .update({
          cantidad_despachada: item.cantidad,
          estado_item: 'DESPACHADO',
        })
        .eq('id', item.id)
        .eq('tenant_id', tenantId)
        .select('id')
        .maybeSingle();

      if (detalleDespachoError || !detalleDespachado) {
        throw new BadRequestException('No se pudo actualizar el detalle con la cantidad despachada al facturar');
      }
    }

    const { error: backordersError } = await client
      .from('pedido_backorders')
      .delete()
      .eq('pedido_id', pedido.id)
      .eq('tenant_id', tenantId);

    if (backordersError) {
      throw new BadRequestException('No se pudieron limpiar los backorders al facturar pedido');
    }
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

    const stockActual = Number((data as any).stock_actual ?? 0);
    const stockReservado = Number(data.stock_reservado ?? 0);

    return stockActual - stockReservado;
  }

  /**
   * Generar número de pedido
   * Formato: PV-YYYY-NNNN
   */
  private async generarNumero(tenantId: string, maxRetries = 3): Promise<string> {
    const client = this.supabase.getClient();
    const year = new Date().getFullYear();
    const prefix = `PV-${year}-`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
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

      const candidato = `${prefix}${nextNumber.toString().padStart(4, '0')}`;

      // Check if this number already exists (another concurrent request may have used it)
      const { count } = await client
        .from('pedidos_venta')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('numero', candidato);

      if (!count || count === 0) {
        return candidato;
      }

      // Collision detected, retry with updated MAX
      console.warn(`⚠️ [Pedidos] Colisión en numeración ${candidato}, reintento ${attempt + 1}/${maxRetries}`);
    }

    // Fallback: append timestamp suffix to guarantee uniqueness
    const ts = Date.now().toString(36).slice(-4);
    const { data } = await client
      .from('pedidos_venta')
      .select('numero')
      .eq('tenant_id', tenantId)
      .like('numero', `${prefix}%`)
      .order('numero', { ascending: false })
      .limit(1);

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastNumber = parseInt(data[0].numero.split('-')[2], 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(4, '0')}-${ts}`;
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
    const client = this.supabase.getClient();

    try {
      this.logger.log(`📄 [PedidosService] Generando documento ${tipoDoc} desde pedido ${pedidoId}`);

      // 1. Obtener pedido con detalle y cliente
      const pedido = await this.findOne(pedidoId, tenantId);

      // 2. Validar que el pedido puede ser facturado
      if (pedido.estado !== EstadoPedido.LISTO_FACTURAR && pedido.estado !== EstadoPedido.CONFIRMADO) {
        throw new BadRequestException(
          `El pedido debe estar en estado LISTO_FACTURAR o CONFIRMADO para generar documento. Estado actual: ${pedido.estado}`
        );
      }

      // Validar que no tenga ya un documento generado
      if (pedido.factura_id) {
        throw new BadRequestException(
          `El pedido ya tiene un documento fiscal generado: ${pedido.factura_id}`
        );
      }

      for (const item of pedido.detalle) {
        const { data: salidaExistente, error: salidaExistenteError } = await client
          .from('movimientos_inventario')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('referencia_tipo', 'PEDIDO')
          .eq('referencia_id', pedidoId)
          .eq('tipo', 'SALIDA')
          .eq('producto_id', item.producto_id)
          .limit(1);

        if (salidaExistenteError) {
          throw new BadRequestException('No se pudo verificar si ya se registró la salida de inventario');
        }

        const yaTieneSalidaRegistrada = Array.isArray(salidaExistente) && salidaExistente.length > 0;

        if (!yaTieneSalidaRegistrada) {
          const { error: salidaError } = await client.rpc('descontar_stock_y_liberar_reserva', {
            p_producto_id: item.producto_id,
            p_cantidad: item.cantidad,
            p_referencia_tipo: 'PEDIDO',
            p_referencia_id: pedidoId,
            p_notas: `Salida por documento fiscal de pedido ${pedido.numero}`,
          });

          if (salidaError) {
            this.logger.error('Error descontando stock al generar documento:', salidaError);
            throw new BadRequestException('No se pudo descontar el stock al generar documento');
          }
        }

        const { error: detalleDespachoError } = await client
          .from('pedidos_venta_detalle')
          .update({
            cantidad_despachada: item.cantidad,
            estado_item: 'DESPACHADO',
          })
          .eq('id', item.id)
          .eq('tenant_id', tenantId);

        if (detalleDespachoError) {
          this.logger.warn('No se pudo actualizar el detalle con la cantidad despachada al generar documento:', detalleDespachoError);
        }
      }

      // 3. Obtener configuración del tenant (país, moneda, etc.)
      const { data: empresaConfig, error: configError } = await client
        .from('empresa_config')
        .select('pais_id, ruc, razon_social, direccion_fiscal, dias_vencimiento_factura')
        .eq('tenant_id', tenantId)
        .single();

      if (configError || !empresaConfig) {
        throw new BadRequestException('No se pudo obtener la configuración de la empresa');
      }

      // 4. Obtener serie activa para el tipo de documento
      const tipoDocumentoCanonico = tipoDoc === '01' ? 'FACTURA' : 'BOLETA';
      const serieDefault = tipoDoc === '01' ? 'F001' : 'B001';

      const { data: serie, error: serieError } = await client
        .from('documento_series')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('tipo_documento', [tipoDoc, tipoDocumentoCanonico])
        .eq('activo', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (serieError) {
        this.logger.error('Error obteniendo serie:', serieError);
        throw new BadRequestException('Error al obtener la serie del documento');
      }

      const serieAUsar = serie?.serie || serieDefault;

      // 5. Obtener siguiente número de serie (con lock)
      let numero = await this.obtenerSiguienteNumeroDocumentoSeguro(
        client,
        tenantId,
        tipoDocumentoCanonico,
        serieAUsar,
      );

      this.logger.log(`📋 [PedidosService] Serie: ${serieAUsar}, Número: ${numero}`);

      // 6. Calcular totales por afectación del IGV (Catálogo 07). Aplicar la tasa
      // al subtotal completo gravaba bienes exonerados e inafectos y dejaba el
      // documento descuadrado contra el CPE, que sí desglosa.
      const afectacionesDocumento = await this.obtenerAfectacionesProductos(pedido.detalle, tenantId);
      const tasaIgvDocumento = await this.taxCalculator.getTasaIgv(tenantId);
      const desgloseDocumento = calcularDesgloseIgv(
        (pedido.detalle || []).map((item: any) => ({
          baseImponible: Number(item.subtotal ?? 0),
          afectacionIgv: afectacionesDocumento.get(item.producto_id),
        })),
        tasaIgvDocumento,
      );

      const taxResult = {
        subtotal: Number(pedido.subtotal),
        igv: desgloseDocumento.igv,
        total: this.round2(Number(pedido.subtotal) + desgloseDocumento.igv),
        tasaIgv: tasaIgvDocumento,
      };

      // 7. Calcular fecha de vencimiento
      const fechaEmision = new Date();
      const diasVencimiento = empresaConfig.dias_vencimiento_factura || 30;
      const fechaVencimiento = new Date(fechaEmision);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + diasVencimiento);

      // 8. Obtener datos del cliente
      const { data: cliente, error: clienteError } = await client
        .from('clientes')
        .select('*')
        .eq('id', pedido.cliente_id)
        .eq('tenant_id', tenantId)
        .single();

      if (clienteError || !cliente) {
        throw new BadRequestException('No se pudo obtener los datos del cliente');
      }

      // 9. Crear documento en tabla documentos
      // Resolver moneda y UOM desde configuración y producto
      const monedaPedido = (pedido as any).moneda || (empresaConfig as any).moneda_defecto || 'PEN';

      const documentoData = {
        tenant_id: tenantId,
        pedido_id: pedidoId,
        tipo_documento: tipoDocumentoCanonico,
        serie: serieAUsar,
        numero: numero,
        fecha_emision: fechaEmision.toISOString(),
        fecha_vencimiento: fechaVencimiento.toISOString(),

        // Datos del emisor
        emisor_ruc: empresaConfig.ruc,
        emisor_razon_social: empresaConfig.razon_social,
        emisor_direccion: empresaConfig.direccion_fiscal,

        // Datos del receptor
        cliente_id: pedido.cliente_id,
        receptor_tipo_doc: cliente.documento_tipo || 'RUC',
        receptor_numero_doc: cliente.numero_documento,
        receptor_razon_social: cliente.razon_social || cliente.nombre_comercial,
        receptor_direccion: cliente.direccion,
        receptor_email: cliente.email,

        // Montos
        moneda: monedaPedido,
        tipo_cambio: 1.0000,
        subtotal: taxResult.subtotal,
        descuentos: 0.00,
        impuesto_igv: taxResult.igv,
        impuesto_isc: 0.00,
        otros_impuestos: 0.00,
        total: taxResult.total,

        // Estado
        estado: 'EMITIDO',
        observaciones: `Generado desde pedido ${pedido.numero}`,

        // Auditoría
        created_by: userId,
      };

      let documento: any = null;
      for (let intento = 1; intento <= 5; intento += 1) {
        const { data: documentoCreado, error: documentoError } = await client
          .from('documentos')
          .insert(documentoData)
          .select()
          .single();

        if (!documentoError) {
          documento = documentoCreado;
          break;
        }

        const esDuplicado =
          documentoError.code === '23505' ||
          String(documentoError.message ?? '').toLowerCase().includes('duplicate key value') ||
          String(documentoError.message ?? '').toLowerCase().includes('unique constraint');

        if (!esDuplicado || intento === 5) {
          this.logger.error('Error creando documento:', documentoError);
          throw new BadRequestException(`Error al crear el documento: ${documentoError.message}`);
        }

        this.logger.warn(
          `Correlativo ${serieAUsar}-${numero} ya existe; recalculando número antes de reintentar documento`,
        );
        numero = await this.obtenerSiguienteNumeroDocumentoSeguro(
          client,
          tenantId,
          tipoDocumentoCanonico,
          serieAUsar,
        );
        documentoData.numero = numero;
      }

      this.logger.log(`✅ [PedidosService] Documento creado: ${documento.id}`);

      // 10. Crear detalles del documento
      const detallesData = pedido.detalle.map((item, index) => ({
        documento_id: documento.id,
        tenant_id: tenantId,
        orden: index + 1,
        producto_id: item.producto_id,
        codigo_producto: (item as any).codigo || item.producto_id,
        descripcion: item.descripcion,
        unidad_medida: (item as any).unidad_medida || (item as any).unidad || 'NIU',
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento_unitario: 0,
        valor_venta: item.subtotal,
        // Un ítem exonerado o inafecto no lleva IGV en la línea del documento.
        impuesto_igv: esGravado(afectacionesDocumento.get(item.producto_id))
          ? this.round2(item.subtotal * taxResult.tasaIgv)
          : 0,
        impuesto_isc: 0,
        total_item: esGravado(afectacionesDocumento.get(item.producto_id))
          ? this.round2(item.subtotal * (1 + taxResult.tasaIgv))
          : this.round2(item.subtotal),
      }));

      const { error: detallesError } = await client
        .from('documento_detalles')
        .insert(detallesData);

      if (detallesError) {
        this.logger.error('Error creando detalles del documento:', detallesError);
        // Rollback: eliminar documento
        await client.from('documentos').delete().eq('id', documento.id).eq('tenant_id', tenantId);
        throw new BadRequestException('Error al crear los detalles del documento');
      }

      this.logger.log(`✅ [PedidosService] Detalles del documento creados: ${detallesData.length} líneas`);

      // 11. Generar CPE (Comprobante Electrónico)
      let cpe = null;
      try {
        const cpeData = {
          tenant_id: tenantId,
          documento_id: documento.id,
          tipo_documento: tipoDoc,
          serie: serieAUsar,
          numero: numero,
          fecha_emision: fechaEmision.toISOString(),

          // Datos del cliente
          tipo_documento_receptor: cliente.documento_tipo || cliente.tipo_documento || 'RUC',
          documento_receptor: String(cliente.numero_documento || cliente.documento_numero || ''),
          razon_social_receptor: cliente.razon_social || cliente.nombre_comercial || cliente.nombre,

          // Montos
          moneda: monedaPedido,
          total_venta: taxResult.total,
          total_igv: taxResult.igv,
          total_gravadas: taxResult.subtotal,

          // Estado
          estado_sunat: 'PENDIENTE',

          // Auditoría
          created_by: userId,
        };

        const { data: cpeCreado, error: cpeError } = await client
          .from('cpe')
          .insert(cpeData)
          .select()
          .single();

        if (cpeError) {
          this.logger.error('❌ [PedidosService] Error creando CPE:', cpeError);
          throw new BadRequestException(`Error al crear el CPE: ${cpeError.message}`);
        } else {
          cpe = cpeCreado;
          this.logger.log(`✅ [PedidosService] CPE creado: ${cpe.id}`);
        }
      } catch (cpeException) {
        this.logger.error('❌ [PedidosService] Excepción creando CPE:', cpeException);
        if (cpeException instanceof BadRequestException) {
          throw cpeException;
        }
        throw new BadRequestException('Error al crear el CPE');
      }

      // 12. Crear Cuenta por Cobrar (CxC)
      let cxc = null;
      try {
        const cxcData = {
          tenant_id: tenantId,
          documento_id: documento.id,
          cliente_id: pedido.cliente_id,
          numero_documento: `${serieAUsar}-${numero}`,
          tipo_documento: tipoDoc,
          fecha_emision: fechaEmision.toISOString(),
          fecha_vencimiento: fechaVencimiento.toISOString(),
          monto_total: taxResult.total,
          monto_pendiente: taxResult.total,
          estado: 'PENDIENTE',
          moneda: monedaPedido,
          serie: serieAUsar,
          numero: numero,
        };

        const { data: cxcCreada, error: cxcError } = await client
          .from('cuentas_por_cobrar')
          .insert(cxcData)
          .select()
          .single();

        if (cxcError) {
          this.logger.warn('⚠️ [PedidosService] Error creando CxC (no crítico):', cxcError);
        } else {
          cxc = cxcCreada;
          this.logger.log(`✅ [PedidosService] CxC creada: ${cxc.id}`);
        }
      } catch (cxcException) {
        this.logger.warn('⚠️ [PedidosService] Excepción creando CxC:', cxcException);
      }

      // 13. Actualizar pedido con referencia al documento y cambiar estado
      const { error: updateError } = await client
        .from('pedidos_venta')
        .update({
          factura_id: documento.id,
          estado: EstadoPedido.FACTURADO,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pedidoId)
        .eq('tenant_id', tenantId);

      if (updateError) {
        this.logger.error('Error actualizando pedido:', updateError);
        // No lanzar error, el documento ya fue creado
      } else {
        this.logger.log(`✅ [PedidosService] Pedido actualizado a estado FACTURADO`);
      }

      // 14. Emitir evento para contabilidad
      try {
        const eventId = uuidv4();
          await this.eventBus.emitCuentaPorCobrarCreadaEvent({
            eventId,
            tenantId,
            idempotencyKey: `ventas.cxc.creada:${tenantId}:${documento.id}`,
            cxcId: cxc?.id || documento.id,
            facturaId: documento.id,
            serie: serieAUsar,
            numero: numero,
          clienteId: pedido.cliente_id,
          saldoInicial: taxResult.total,
          saldoPendiente: taxResult.total,
          montoTotal: taxResult.total,
          montoPendiente: taxResult.total,
          subtotal: taxResult.subtotal,
          impuestos: taxResult.igv,
          moneda: monedaPedido,
          fechaEmision: fechaEmision.toISOString(),
          fechaVencimiento: fechaVencimiento.toISOString(),
          source: 'ventas.pedidos',
          ajustes: {
            retencion: 0,
            percepcion: 0,
            detraccion: 0,
            anticipo: 0,
          },
        });

        this.logger.log(`✅ [PedidosService] Evento CuentaPorCobrarCreada emitido`);
      } catch (eventError) {
        this.logger.warn('⚠️ [PedidosService] Error emitiendo evento (no crítico):', eventError);
      }

      // 15. Registrar auditoría
      await this.registrarAuditoriaAccion(
        pedidoId,
        tenantId,
        userId,
        {
          documento_id: documento.id,
          tipo_documento: tipoDoc,
          serie: serieAUsar,
          numero: numero,
          total: taxResult.total,
        },
        'generar_documento',
      );

      return {
        success: true,
        documento,
        cpe,
        cxc,
        message: `Documento ${serieAUsar}-${numero} generado exitosamente`,
      };
    } catch (error) {
      this.logger.error(`❌ [PedidosService] Error generando documento desde pedido ${pedidoId}:`, error);
      throw error;
    }
  }

  /**
   * Redondea un número a 2 decimales
   */
  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async obtenerSiguienteNumeroDocumentoSeguro(
    client: any,
    tenantId: string,
    tipoDocumentoCanonico: string,
    serie: string,
  ): Promise<string> {
    const normalizarNumero = (value: unknown) => {
      const raw = String(value ?? '').trim();
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed > 0
        ? String(parsed).padStart(8, '0')
        : '00000001';
    };

    const { data: numeroData, error: numeroError } = await client
      .rpc('obtener_siguiente_numero_documento', {
        p_tenant_id: tenantId,
        p_tipo_documento: tipoDocumentoCanonico,
        p_serie: serie,
      });

    if (numeroError) {
      this.logger.error('Error obteniendo número de serie:', numeroError);
      throw new BadRequestException('Error al obtener el número de serie');
    }

    const numeroRpc = normalizarNumero(numeroData);

    const { data: documentosExistentes, error: documentosError } = await client
      .from('documentos')
      .select('tipo_documento, numero')
      .eq('tenant_id', tenantId)
      .eq('serie', serie)
      .order('numero', { ascending: false })
      .limit(100);

    if (documentosError) {
      this.logger.error('Error verificando correlativos existentes:', documentosError);
      throw new BadRequestException('Error al verificar correlativos existentes');
    }

    const normalizarTipo = (value: unknown) => {
      const raw = String(value ?? '').trim().toUpperCase();
      if (raw === '01' || raw === 'FACTURA') return 'FACTURA';
      if (raw === '03' || raw === 'BOLETA') return 'BOLETA';
      if (raw === '07' || raw === 'NC' || raw === 'NOTA_CREDITO') return 'NOTA_CREDITO';
      if (raw === '08' || raw === 'ND' || raw === 'NOTA_DEBITO') return 'NOTA_DEBITO';
      return raw || 'FACTURA';
    };

    const ultimoNumero = (documentosExistentes ?? []).reduce((max: number, row: any) => {
      if (normalizarTipo(row.tipo_documento) !== tipoDocumentoCanonico) {
        return max;
      }
      const numero = Number.parseInt(String(row.numero ?? '0'), 10);
      return Number.isFinite(numero) && numero > max ? numero : max;
    }, 0);
    const siguienteRpc = Number.parseInt(numeroRpc, 10);

    if (Number.isFinite(ultimoNumero) && ultimoNumero >= siguienteRpc) {
      return String(ultimoNumero + 1).padStart(8, '0');
    }

    return numeroRpc;
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
