import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import {
  AplicarSaldoFavorDto,
  AprobarRmaDto,
  CrearRmaDto,
  GenerarNotaCreditoDto,
  RecepcionarRmaDto,
  ReembolsarSaldoFavorDto,
  RevertirReembolsoSaldoFavorDto,
  RevertirRecepcionRmaDto,
} from './dto';

/**
 * Puerta de aplicación de RMA.
 *
 * Las lecturas son tenant-scoped. Toda escritura de negocio cruza una única
 * RPC 456 SECURITY DEFINER ejecutable sólo por service_role; no se permiten
 * actualizaciones compensatorias desde TypeScript.
 */
@Injectable()
export class RmaService {
  constructor(private readonly supabase: SupabaseService) {}

  async listar(tenantId: string, estado?: string) {
    const query = this.supabase
      .getClient()
      .from('rma_solicitudes')
      .select(
        `
        id,
        pedido_id,
        cliente_id,
        numero,
        motivo_general,
        tipo,
        estado,
        documento_origen_id,
        cpe_origen_id,
        cxc_origen_id,
        nota_credito_documento_id,
        nota_credito_cpe_id,
        almacen_retorno_id,
        created_by,
        aprobado_por,
        aprobado_en,
        recibido_por,
        recibido_en,
        created_at,
        updated_at,
        clientes:cliente_id(id, razon_social, nombre, ruc, numero_documento)
      `,
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (estado?.trim()) query.eq('estado', estado.trim().toUpperCase());
    const { data, error } = await query;
    if (error) this.throwReadError(error, 'listar las RMA');
    return data ?? [];
  }

  async obtenerPorId(tenantId: string, rmaId: string) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('rma_solicitudes')
      .select(
        `
        *,
        items:rma_items(
          *,
          productos:producto_id(id, codigo, nombre, es_servicio, controla_stock),
          detalle:detalle_id(id, descripcion, cantidad, cantidad_despachada, cantidad_facturada),
          documento_detalle:documento_detalle_id(id, orden, descripcion, cantidad, total_item)
        ),
        eventos:rma_eventos(*)
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('id', rmaId)
      .maybeSingle();

    if (error) this.throwReadError(error, 'obtener la RMA');
    if (!data) throw new NotFoundException('RMA no encontrada en el tenant');
    const { data: saldoFavor, error: saldoError } = await client
      .from('saldos_favor_clientes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('rma_id', rmaId)
      .maybeSingle();
    if (saldoError) this.throwReadError(saldoError, 'obtener el saldo a favor de la RMA');
    return { ...data, saldo_favor: saldoFavor ?? null };
  }

  async listarRecursosRecepcion(tenantId: string) {
    const client = this.supabase.getClient();
    const [{ data: config, error: configError }, { data: almacenes, error: almacenesError }] =
      await Promise.all([
        client
          .from('empresa_config')
          .select('rma_requiere_control_calidad')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        client
          .from('almacenes')
          .select('id, codigo, nombre, es_principal, activo')
          .eq('tenant_id', tenantId)
          .eq('activo', true)
          .order('es_principal', { ascending: false })
          .order('nombre', { ascending: true }),
      ]);
    if (configError) this.throwReadError(configError, 'leer la configuración de recepción RMA');
    if (almacenesError) this.throwReadError(almacenesError, 'listar almacenes de recepción RMA');
    const almacenIds = (almacenes ?? []).map((almacen: any) => almacen.id);
    let ubicaciones: any[] = [];
    if (almacenIds.length > 0) {
      const response = await client
        .from('almacen_ubicaciones')
        .select('id, almacen_id, codigo, nombre, tipo, estado')
        .eq('tenant_id', tenantId)
        .in('almacen_id', almacenIds)
        .order('nombre', { ascending: true });
      if (response.error) this.throwReadError(response.error, 'listar ubicaciones de recepción RMA');
      ubicaciones = response.data ?? [];
    }
    return {
      control_calidad_requerido: Boolean(config?.rma_requiere_control_calidad),
      almacenes: almacenes ?? [],
      ubicaciones,
    };
  }

  async listarCandidatos(tenantId: string) {
    const client = this.supabase.getClient();
    const [configResponse, pedidosResponse] = await Promise.all([
      client
        .from('empresa_config')
        .select('pais, is_demo')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      client
        .from('pedidos_venta')
        .select('id, numero, estado, cliente_id, fecha_pedido, moneda, total, clientes:cliente_id(id, razon_social, nombre, ruc, numero_documento)')
        .eq('tenant_id', tenantId)
        .in('estado', ['FACTURADO', 'COMPLETADO', 'DESPACHO_PARCIAL', 'LISTO_FACTURAR'])
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    const { data: config, error: configError } = configResponse;
    const { data: pedidos, error: pedidosError } = pedidosResponse;
    if (configError) this.throwReadError(configError, 'leer el país fiscal para las RMA');
    if (pedidosError) this.throwReadError(pedidosError, 'listar pedidos elegibles para RMA');
    const country = String(config?.pais ?? '').trim().toUpperCase();
    const isRealColombia = country === 'CO' && config?.is_demo === false;
    const pedidoIds = (pedidos ?? []).map((pedido: any) => pedido.id);
    if (pedidoIds.length === 0) return [];

    const [{ data: detalles, error: detallesError }, { data: documentos, error: documentosError }] =
      await Promise.all([
        client
          .from('pedidos_venta_detalle')
          .select('id, pedido_id, producto_id, descripcion, cantidad, cantidad_despachada, cantidad_facturada, precio_unitario, productos:producto_id(id, codigo, nombre, es_servicio, controla_stock)')
          .eq('tenant_id', tenantId)
          .in('pedido_id', pedidoIds)
          .order('created_at', { ascending: true }),
        client
          .from('documentos')
          .select('id, pedido_id, tipo_documento, serie, numero, fecha_emision, moneda, total, estado')
          .eq('tenant_id', tenantId)
          .in('pedido_id', pedidoIds)
          .in('tipo_documento', ['FACTURA', 'BOLETA'])
          .order('created_at', { ascending: false }),
      ]);
    if (detallesError) this.throwReadError(detallesError, 'listar líneas elegibles para RMA');
    if (documentosError) this.throwReadError(documentosError, 'listar documentos origen de RMA');

    const documentoIds = (documentos ?? []).map((documento: any) => documento.id);
    const detalleIds = (detalles ?? []).map((detalle: any) => detalle.id);
    const [{ data: cpes, error: cpesError }, { data: usos, error: usosError }] =
      await Promise.all([
        documentoIds.length > 0
          ? client
              .from('cpe')
              .select('id, documento_id, tipo_documento, estado, estado_sunat, sunat_status, simulated_origin, issuer_snapshot, fiscal_authority_evidence')
              .eq('tenant_id', tenantId)
              .in('documento_id', documentoIds)
              .in('tipo_documento', ['01', '03'])
          : Promise.resolve({ data: [], error: null }),
        detalleIds.length > 0
          ? client
              .from('rma_items')
              .select('rma_id, detalle_id, cantidad_autorizada, estado')
              .eq('tenant_id', tenantId)
              .in('detalle_id', detalleIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (cpesError) this.throwReadError(cpesError, 'validar los CPE origen de RMA');
    if (usosError) this.throwReadError(usosError, 'calcular cantidades ya devueltas');

    const rmaIds = [...new Set((usos ?? []).map((uso: any) => uso.rma_id).filter(Boolean))];
    let solicitudes: any[] = [];
    if (rmaIds.length > 0) {
      const response = await client
        .from('rma_solicitudes')
        .select('id, estado')
        .eq('tenant_id', tenantId)
        .in('id', rmaIds);
      if (response.error) this.throwReadError(response.error, 'validar consumos RMA previos');
      solicitudes = response.data ?? [];
    }
    const estadosActivos = new Set(
      solicitudes
        .filter((solicitud: any) => !['RECHAZADA', 'CANCELADA', 'INACTIVO'].includes(String(solicitud.estado).toUpperCase()))
        .map((solicitud: any) => solicitud.id),
    );
    const consumidoPorDetalle = new Map<string, number>();
    for (const uso of usos ?? []) {
      if (!estadosActivos.has((uso as any).rma_id)
          || ['RECHAZADO', 'INACTIVO'].includes(String((uso as any).estado).toUpperCase())) continue;
      const detalleId = (uso as any).detalle_id;
      consumidoPorDetalle.set(
        detalleId,
        (consumidoPorDetalle.get(detalleId) ?? 0) + Number((uso as any).cantidad_autorizada ?? 0),
      );
    }

    const cpesPorDocumento = new Map<string, any[]>();
    for (const cpe of cpes ?? []) {
      if (['RECHAZADO', 'ANULADO', 'ERROR'].includes(String((cpe as any).estado).toUpperCase())
          || ['REJECTED', 'ERROR'].includes(String((cpe as any).sunat_status).toUpperCase())) continue;
      if (isRealColombia) {
        const evidence = (cpe as any).fiscal_authority_evidence ?? {};
        const issuer = (cpe as any).issuer_snapshot ?? {};
        const uniqueCode = String(evidence.unique_code ?? '').trim().toUpperCase();
        const isAcceptedRealDianInvoice =
          String((cpe as any).tipo_documento ?? '').trim() === '01'
          && String((cpe as any).estado ?? '').toUpperCase() === 'ACEPTADO'
          && String((cpe as any).estado_sunat ?? '').toUpperCase() === 'ACEPTADO'
          && String((cpe as any).sunat_status ?? '').toUpperCase() === 'ACCEPTED'
          && (cpe as any).simulated_origin === false
          && String(issuer.country_code ?? '').toUpperCase() === 'CO'
          && String(evidence.authority ?? '').toUpperCase() === 'DIAN'
          && String(evidence.status ?? '').toUpperCase() === 'ACCEPTED'
          && String(evidence.code_kind ?? '').toUpperCase() === 'CUFE'
          && /^[0-9A-F]{96}$/.test(uniqueCode);
        if (!isAcceptedRealDianInvoice) continue;
      }
      const group = cpesPorDocumento.get((cpe as any).documento_id) ?? [];
      group.push(cpe);
      cpesPorDocumento.set((cpe as any).documento_id, group);
    }

    const detallesPorPedido = new Map<string, any[]>();
    for (const detalle of detalles ?? []) {
      const group = detallesPorPedido.get((detalle as any).pedido_id) ?? [];
      const product = Array.isArray((detalle as any).productos)
        ? (detalle as any).productos[0]
        : (detalle as any).productos;
      const logical = Boolean(product?.es_servicio) || product?.controla_stock === false;
      const delivered = logical
        ? Number((detalle as any).cantidad_facturada ?? (detalle as any).cantidad ?? 0)
        : Math.min(
            Number((detalle as any).cantidad_despachada ?? 0),
            Number((detalle as any).cantidad_facturada ?? (detalle as any).cantidad ?? 0),
          );
      const disponible = Math.max(
        0,
        Number((delivered - (consumidoPorDetalle.get((detalle as any).id) ?? 0)).toFixed(6)),
      );
      group.push({ ...detalle, cantidad_retornable: disponible });
      detallesPorPedido.set((detalle as any).pedido_id, group);
    }
    const documentosPorPedido = new Map<string, any[]>();
    for (const documento of documentos ?? []) {
      const group = documentosPorPedido.get((documento as any).pedido_id) ?? [];
      const state = String((documento as any).estado ?? '').toUpperCase();
      if (!['ANULADO', 'RECHAZADO'].includes(state)
          && (cpesPorDocumento.get((documento as any).id)?.length ?? 0) === 1) {
        group.push(documento);
      }
      documentosPorPedido.set((documento as any).pedido_id, group);
    }
    return (pedidos ?? [])
      .map((pedido: any) => ({
        ...pedido,
        detalle: (detallesPorPedido.get(pedido.id) ?? []).filter(
          (detalle: any) => Number(detalle.cantidad_retornable ?? 0) > 0,
        ),
        documentos: documentosPorPedido.get(pedido.id) ?? [],
      }))
      .filter((pedido: any) => pedido.detalle.length > 0 && pedido.documentos.length > 0);
  }

  async listarSaldosFavor(tenantId: string, clienteId?: string, estado?: string) {
    const query = this.supabase
      .getClient()
      .from('saldos_favor_clientes')
      .select(
        `
        *,
        clientes:cliente_id(id, razon_social, nombre, ruc, numero_documento),
        rma:rma_id(id, numero, estado)
      `,
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (clienteId?.trim()) query.eq('cliente_id', clienteId.trim());
    if (estado?.trim()) query.eq('estado', estado.trim().toUpperCase());
    const { data, error } = await query;
    if (error) this.throwReadError(error, 'listar los saldos a favor');
    return data ?? [];
  }

  async obtenerSaldoFavor(tenantId: string, saldoId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('saldos_favor_clientes')
      .select(
        `
        *,
        movimientos:saldos_favor_movimientos(*),
        rma:rma_id(id, numero, estado),
        clientes:cliente_id(id, razon_social, nombre, ruc, numero_documento)
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('id', saldoId)
      .maybeSingle();
    if (error) this.throwReadError(error, 'obtener el saldo a favor');
    if (!data) throw new NotFoundException('Saldo a favor no encontrado en el tenant');
    return data;
  }

  async listarCxcAplicables(tenantId: string, saldoId: string) {
    const saldo = await this.obtenerSaldoFavor(tenantId, saldoId);
    const { data, error } = await this.supabase
      .getClient()
      .from('cuentas_por_cobrar')
      .select('id, numero_documento, tipo_documento, fecha_emision, fecha_vencimiento, moneda, monto_total, monto_pendiente, saldo, saldo_pendiente, estado')
      .eq('tenant_id', tenantId)
      .eq('cliente_id', saldo.cliente_id)
      .eq('moneda', saldo.moneda)
      .in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA', 'VENCIDO'])
      .order('fecha_vencimiento', { ascending: true });
    if (error) this.throwReadError(error, 'listar las CxC aplicables al saldo');
    return (data ?? []).filter((cuenta: any) =>
      Number(cuenta.monto_pendiente ?? cuenta.saldo_pendiente ?? cuenta.saldo ?? 0) > 0,
    );
  }

  async listarMediosReembolso(tenantId: string, userId?: string | null) {
    const actorId = this.requireActor(userId);
    const client = this.supabase.getClient();
    const [{ data: bancos, error: bancosError }, { data: sesiones, error: sesionesError }] =
      await Promise.all([
        client
          .from('cuentas_bancarias')
          .select('id, codigo, nombre, banco, numero_cuenta, moneda, saldo, saldo_actual, estado')
          .eq('tenant_id', tenantId)
          .eq('estado', 'ACTIVO')
          .eq('activa', true)
          .order('nombre', { ascending: true }),
        client
          .from('sesiones_caja')
          .select('id, caja_id, moneda, estado, hora_apertura, cajas:caja_id(id, codigo, nombre)')
          .eq('tenant_id', tenantId)
          .eq('estado', 'ABIERTA')
          .or(`cajero_id.eq.${actorId},usuario_id.eq.${actorId},abierto_por.eq.${actorId},usuario_apertura.eq.${actorId}`)
          .order('hora_apertura', { ascending: false }),
      ]);
    if (bancosError) this.throwReadError(bancosError, 'listar cuentas bancarias para reembolso');
    if (sesionesError) this.throwReadError(sesionesError, 'listar sesiones de caja para reembolso');
    return { bancos: bancos ?? [], sesiones_caja: sesiones ?? [] };
  }

  crear(
    tenantId: string,
    userId: string | null | undefined,
    dto: CrearRmaDto,
    idempotencyKey?: string,
  ) {
    return this.rpc('crear_rma_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_payload: this.normalizePayload(dto),
      p_idempotency_key: this.requireIdempotencyKey(idempotencyKey),
    });
  }

  aprobar(
    tenantId: string,
    userId: string | null | undefined,
    rmaId: string,
    dto: AprobarRmaDto,
    idempotencyKey?: string,
  ) {
    return this.rpc('decidir_rma_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_rma_id: rmaId,
      p_aprobar: dto.aprobar ?? true,
      p_notas: dto.notas?.trim() || null,
      p_idempotency_key: this.requireIdempotencyKey(idempotencyKey),
    });
  }

  recepcionar(
    tenantId: string,
    userId: string | null | undefined,
    rmaId: string,
    dto: RecepcionarRmaDto,
    idempotencyKey?: string,
  ) {
    return this.rpc('recepcionar_rma_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_rma_id: rmaId,
      p_payload: this.normalizePayload(dto),
      p_idempotency_key: this.requireIdempotencyKey(idempotencyKey),
    });
  }

  revertirRecepcion(
    tenantId: string,
    userId: string | null | undefined,
    rmaId: string,
    dto: RevertirRecepcionRmaDto,
    idempotencyKey?: string,
  ) {
    return this.rpc('revertir_recepcion_rma_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_rma_id: rmaId,
      p_motivo: dto.motivo.trim(),
      p_idempotency_key: this.requireIdempotencyKey(idempotencyKey),
    });
  }

  async generarNotaCredito(
    tenantId: string,
    userId: string | null | undefined,
    rmaId: string,
    dto: GenerarNotaCreditoDto,
    idempotencyKey?: string,
  ) {
    const client = this.supabase.getClient();
    const { data: tenantConfig, error: tenantConfigError } = await client
      .from('empresa_config')
      .select('pais, is_demo')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (tenantConfigError || !tenantConfig) {
      throw new BadRequestException(
        'No se pudo verificar el país fiscal del tenant antes de emitir la nota de crédito',
      );
    }
    const fiscalCountry = String((tenantConfig as any).pais ?? '').trim().toUpperCase();
    if (fiscalCountry === 'CO') {
      if ((tenantConfig as any).is_demo !== false) {
        throw new BadRequestException({
          code: 'RMA_DIAN_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW',
          message:
            'La demo Colombia permite probar la devolución física, pero no puede aceptar ni emitir una Nota Crédito DIAN 91 real. Convierte la cuenta y completa la habilitación DIAN para continuar.',
        });
      }
      return this.rpc('emitir_nota_credito_rma_tx', {
        p_tenant_id: tenantId,
        p_actor_id: this.requireActor(userId),
        p_rma_id: rmaId,
        p_payload: this.normalizePayload({
          motivo: dto.motivo?.trim() || 'Devolución parcial de bienes o servicios',
        }),
        p_idempotency_key: this.requireIdempotencyKey(idempotencyKey),
      });
    }
    if (fiscalCountry === 'AR') {
      throw new BadRequestException({
        code: 'RMA_ARCA_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW',
        message:
          'Argentina no usa la nota RMA SUNAT 07. La nota de crédito debe emitirse mediante el flujo ARCA referenciado y no puede afectar la CxC antes de obtener CAE.',
      });
    }

    return this.rpc('emitir_nota_credito_rma_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_rma_id: rmaId,
      p_payload: this.normalizePayload(dto),
      p_idempotency_key: this.requireIdempotencyKey(idempotencyKey),
    });
  }

  aplicarSaldoFavor(
    tenantId: string,
    userId: string | null | undefined,
    saldoId: string,
    dto: AplicarSaldoFavorDto,
    idempotencyKey?: string,
  ) {
    return this.rpc('aplicar_saldo_favor_cxc_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_saldo_id: saldoId,
      p_cxc_id: dto.cxc_id,
      p_monto: dto.monto,
      p_idempotency_key: this.requireIdempotencyKey(idempotencyKey),
    });
  }

  reembolsarSaldoFavor(
    tenantId: string,
    userId: string | null | undefined,
    saldoId: string,
    dto: ReembolsarSaldoFavorDto,
    idempotencyKey?: string,
  ) {
    return this.rpc('reembolsar_saldo_favor_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_saldo_id: saldoId,
      p_payload: this.normalizePayload(dto),
      p_idempotency_key: this.requireIdempotencyKey(idempotencyKey),
    });
  }

  revertirReembolsoSaldoFavor(
    tenantId: string,
    userId: string | null | undefined,
    saldoId: string,
    movimientoId: string,
    dto: RevertirReembolsoSaldoFavorDto,
    idempotencyKey?: string,
  ) {
    return this.rpc('revertir_reembolso_saldo_favor_tx', {
      p_tenant_id: tenantId,
      p_actor_id: this.requireActor(userId),
      p_saldo_id: saldoId,
      p_movimiento_id: movimientoId,
      p_payload: this.normalizePayload(dto),
      p_idempotency_key: this.requireIdempotencyKey(idempotencyKey),
    });
  }

  private requireActor(userId?: string | null): string {
    const actor = String(userId ?? '').trim();
    if (!actor) {
      throw new BadRequestException('La operación RMA requiere un actor autenticado');
    }
    return actor;
  }

  private requireIdempotencyKey(value?: string): string {
    const key = String(value ?? '').trim().toLowerCase();
    if (key.length < 8 || key.length > 200) {
      throw new BadRequestException(
        'El encabezado Idempotency-Key es obligatorio y debe tener entre 8 y 200 caracteres',
      );
    }
    return key;
  }

  private normalizePayload(value: Record<string, any>): Record<string, any> {
    const payload: Record<string, any> = {};
    for (const [key, rawValue] of Object.entries(value ?? {})) {
      if (rawValue === undefined) continue;
      if (Array.isArray(rawValue)) {
        payload[key] = rawValue.map((item) =>
          item && typeof item === 'object' ? this.normalizePayload(item) : item,
        );
      } else if (rawValue instanceof Date) {
        payload[key] = rawValue.toISOString();
      } else {
        payload[key] = rawValue;
      }
    }
    return payload;
  }

  private async rpc(name: string, params: Record<string, any>): Promise<any> {
    const { data, error } = await this.supabase.getClient().rpc(name, params);
    if (error) this.throwRpcError(error, name);
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result !== 'object') {
      throw new BadRequestException(`La operación atómica ${name} no devolvió resultado`);
    }
    return result;
  }

  private throwReadError(error: any, operation: string): never {
    throw new BadRequestException(
      `No se pudo ${operation}: ${String(error?.message ?? error ?? 'error desconocido')}`,
    );
  }

  private throwRpcError(error: any, operation: string): never {
    const message = String(error?.message ?? error ?? 'error desconocido');
    if (/RMA_DIAN_FISCAL_LINE_BALANCE_(?:EXCEEDED|UNVERIFIABLE)/i.test(message)) {
      throw new BadRequestException(
        'La factura ya tiene una nota de crédito que consume total o parcialmente las líneas seleccionadas. Recarga la venta y elige sólo cantidades con saldo fiscal disponible.',
      );
    }
    if (error?.code === '42501') throw new ForbiddenException(message);
    if (
      error?.code === '23505' ||
      error?.code === '40001' ||
      /IDEMPOTENCY.*CONFLICT|KEY_REUSED|PENDING_RETRY/i.test(message)
    ) {
      throw new ConflictException(message);
    }
    if (error?.code === 'P0002' || /NOT_FOUND/i.test(message)) {
      throw new NotFoundException(message);
    }
    throw new BadRequestException(
      `No se pudo completar ${operation} de forma transaccional: ${message}`,
    );
  }
}
