import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { RegistrarPagoCxcDto, TipoMovimientoCxc, AplicarNotaCreditoDto, ReprogramarCxcDto } from './dto';
import { EventBusService, FacturaEmitidaEvent, CuentaPorCobrarCreadaEvent } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';

interface ListarCxcFilters {
  estado?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'VENCIDO';
  cliente_id?: string;
  search?: string;
  page?: number;
  limit?: number;
  vencidas?: boolean;
  desde?: string;
  hasta?: string;
}

@Injectable()
export class CxcService {
  private readonly logger = new Logger(CxcService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly auditService: AuditService,
    private readonly retencionesValidation: RetencionesValidationService,
  ) {}

  private async registrarIntegrationLog(entry: {
    tenantId: string;
    servicio: string;
    operacion: string;
    correlacionId: string | null;
    correlacionTipo: string;
    status: 'SUCCESS' | 'ERROR' | 'PENDING' | 'TIMEOUT';
    requestSummary?: Record<string, any>;
    responseSummary?: Record<string, any>;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<void> {
    try {
      await this.supabase
        .getClient()
        .from('integration_logs')
        .insert({
          tenant_id: entry.tenantId,
          servicio: entry.servicio,
          operacion: entry.operacion,
          correlacion_id: entry.correlacionId,
          correlacion_tipo: entry.correlacionTipo,
          status: entry.status,
          request_summary: entry.requestSummary ?? null,
          response_summary: entry.responseSummary ?? null,
          error_message: entry.errorMessage ?? null,
          duration_ms: entry.durationMs ?? null,
        });
    } catch (error) {
      this.logger.error('❌ [CXC] Error registrando integration_log:', error);
    }
  }

  async listarCuentasPorCobrar(
    tenantId: string,
    filters: ListarCxcFilters = {},
  ): Promise<{ success: boolean; data: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const client = this.supabase.getClient();
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 50;
    const offset = (page - 1) * limit;

    let query = client
      .from('cuentas_por_cobrar')
      .select(
        `
          *,
          clientes!inner(
            id,
            razon_social,
            documento_numero
          )
        `,
        { count: 'exact' },
      )
      .eq('tenant_id', tenantId);

    if (filters.estado) {
      query = query.eq('estado', filters.estado);
    }

    if (filters.cliente_id) {
      query = query.eq('cliente_id', filters.cliente_id);
    }

    if (filters.vencidas) {
      const hoy = new Date().toISOString().split('T')[0];
      query = query.lt('fecha_vencimiento', hoy).neq('estado', 'CANCELADO');
    }

    if (filters.desde) {
      query = query.gte('fecha_vencimiento', filters.desde); // HARDENING: habilitar rango inferior de vencimiento.
    }

    if (filters.hasta) {
      query = query.lte('fecha_vencimiento', filters.hasta);
    }

    if (filters.search) {
      const sanitized = filters.search.replace(/[%_]/g, '');
      const term = `%${sanitized}%`;
      query = query.or(
        `serie.ilike.${term},numero.ilike.${term},clientes.razon_social.ilike.${term},cliente_id.eq.${filters.search}`,
      );
    }

    query = query
      .order('fecha_vencimiento', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error listando cuentas por cobrar:', error);
      throw new BadRequestException('No se pudieron obtener las cuentas por cobrar');
    }

    return {
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }
  async crearCuentaPorCobrarDesdeFactura(evento: FacturaEmitidaEvent): Promise<void> {
    const tenantId = evento.tenantId;
    const facturaId = evento.cpeId ?? evento.facturaId;
    if (!tenantId || !facturaId) {
      // HARDENING: sin tenant o identificación fiscal no procesamos para evitar fugas.
      this.logger.warn('⚠️ [CXC] Evento de factura emitida sin tenant o cpeId/facturaId, se ignora.');
      return;
    }

    const client = this.supabase.getClient();
    const startedAt = Date.now();
    const idempotencyKey = evento.idempotencyKey ?? `factura:${tenantId}:${facturaId}`;
    const eventSource = evento.source ?? 'ventas';
    const sourceEventId = evento.eventId ?? uuidv4();
    let cuentaId: string | null = null;

    try {
      const { data: existentePorKey, error: idempotencyError } = await client
        .from('cuentas_por_cobrar')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', idempotencyKey)
        .limit(1);

      if (idempotencyError) {
        this.logger.error('❌ [CXC] Error verificando idempotencia de CxC:', idempotencyError);
        throw new BadRequestException('No se pudo validar la idempotencia de la cuenta por cobrar');
      }

      if (existentePorKey && existentePorKey.length > 0) {
        this.logger.log(`ℹ️ [CXC] Evento idempotente ${idempotencyKey} ya procesado, se omite duplicado.`);
        await this.registrarIntegrationLog({
          tenantId,
          servicio: 'FINANZAS',
          operacion: 'cxc.crear_desde_factura',
          correlacionId: facturaId,
          correlacionTipo: 'FACTURA',
          status: 'SUCCESS',
          requestSummary: {
            eventId: sourceEventId,
            idempotencyKey,
            source: eventSource,
          },
          responseSummary: {
            skipped: true,
            motivo: 'duplicate_idempotency_key',
          },
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      const { data: existente, error: existenteError } = await client
        .from('cuentas_por_cobrar')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('documento_id', facturaId)
        .limit(1);

      if (existenteError) {
        this.logger.error('❌ [CXC] Error verificando existencia de CxC:', existenteError);
        throw new BadRequestException('No se pudo validar la cuenta por cobrar existente');
      }

      if (existente && existente.length > 0) {
        this.logger.log(`ℹ️ [CXC] Ya existe cuenta por cobrar para factura ${facturaId}, no se duplica.`);
        await this.registrarIntegrationLog({
          tenantId,
          servicio: 'FINANZAS',
          operacion: 'cxc.crear_desde_factura',
          correlacionId: facturaId,
          correlacionTipo: 'FACTURA',
          status: 'SUCCESS',
          requestSummary: {
            eventId: sourceEventId,
            idempotencyKey,
            source: eventSource,
          },
          responseSummary: {
            skipped: true,
            motivo: 'existing_documento_id',
            cuentaId: existente[0].id,
          },
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      const config = await this.obtenerConfiguracionEmpresa(tenantId);
      const cliente = await this.obtenerCliente(evento.clienteId, tenantId);
      const ajustes = this.calcularAjustesDesdeEvento(evento, cliente, config);

      // 🔴 TAREA 17: Validar que los cálculos de retenciones sean correctos antes de crear CxC
      const clienteConfig = cliente ? {
        sujeto_retencion: cliente.sujeto_retencion,
        retencion_tasa: cliente.retencion_tasa,
        sujeto_percepcion: cliente.sujeto_percepcion,
        percepcion_tasa: cliente.percepcion_tasa,
        sujeto_detraccion: cliente.sujeto_detraccion,
        detraccion_tasa: cliente.detraccion_tasa,
      } : undefined;

      const empresaConfig = config ? {
        aplicar_retencion: config.aplicar_retencion,
        retencion_tasa: config.retencion_tasa,
        aplicar_percepcion: config.aplicar_percepcion,
        percepcion_tasa: config.percepcion_tasa,
        aplicar_detraccion: config.aplicar_detraccion,
        detraccion_tasa: config.detraccion_tasa,
      } : undefined;

      const validacionAjustes = await this.retencionesValidation.validarCalculoAjustes(
        evento.total,
        ajustes,
        clienteConfig,
        empresaConfig
      );

      if (!validacionAjustes.valido) {
        const errorMessage = `Error en cálculo de ajustes tributarios: ${validacionAjustes.errores.join('; ')}`;
        this.logger.error(`❌ [CXC] ${errorMessage}`);
        await this.registrarIntegrationLog({
          tenantId,
          servicio: 'FINANZAS',
          operacion: 'cxc.crear_desde_factura',
          correlacionId: facturaId,
          correlacionTipo: 'FACTURA',
          status: 'ERROR',
          requestSummary: {
            eventId: sourceEventId,
            idempotencyKey,
            source: eventSource,
          },
          errorMessage,
          durationMs: Date.now() - startedAt,
        });
        throw new BadRequestException(errorMessage);
      }

      // Validar monto pendiente calculado
      const montoPendienteCalculado = this.round2(Math.max(evento.total - ajustes.retencion - ajustes.detraccion - ajustes.anticipo + ajustes.percepcion, 0));
      const validacionPendiente = this.retencionesValidation.validarMontoPendiente(
        evento.total,
        ajustes,
        montoPendienteCalculado
      );

      if (!validacionPendiente.valido) {
        const errorMessage = `Error en cálculo de monto pendiente: ${validacionPendiente.error}`;
        this.logger.error(`❌ [CXC] ${errorMessage}`);
        await this.registrarIntegrationLog({
          tenantId,
          servicio: 'FINANZAS',
          operacion: 'cxc.crear_desde_factura',
          correlacionId: facturaId,
          correlacionTipo: 'FACTURA',
          status: 'ERROR',
          requestSummary: {
            eventId: sourceEventId,
            idempotencyKey,
            source: eventSource,
          },
          errorMessage,
          durationMs: Date.now() - startedAt,
        });
        throw new BadRequestException(errorMessage);
      }

      const fechaEmision = evento.fechaEmision ? new Date(evento.fechaEmision) : new Date();
      const diasVencimiento = config?.dias_vencimiento_factura ?? 30;
      const fechaVencimiento = evento.fechaVencimiento
        ? new Date(evento.fechaVencimiento)
        : this.addDays(fechaEmision, diasVencimiento);

      const retencion = ajustes.retencion ?? 0;
      const percepcion = ajustes.percepcion ?? 0;
      const detraccion = ajustes.detraccion ?? 0;
      const anticipo = ajustes.anticipo ?? 0;

      const montoPendiente = validacionPendiente.montoEsperado; // Usar el monto validado

      const estadoInicial =
        montoPendiente <= 0
          ? 'CANCELADO'
          : retencion > 0 || detraccion > 0 || anticipo > 0
            ? 'PARCIAL'
            : 'PENDIENTE';

      const numeroSerie = evento.serie ?? null;
      const numeroCorrelativo = evento.numero != null ? String(evento.numero).padStart(8, '0') : null;

      const { data: cuentaInsertada, error: insertError } = await client
        .from('cuentas_por_cobrar')
        .insert({
          tenant_id: tenantId,
          cliente_id: evento.clienteId,
          pedido_id: evento.pedidoId ?? null,
          documento_id: facturaId,
          serie: numeroSerie,
          numero: numeroCorrelativo,
          fecha_emision: this.toISODate(fechaEmision),
          fecha_vencimiento: this.toISODate(fechaVencimiento),
          moneda: evento.moneda ?? 'PEN',
          monto_total: this.round2(evento.total),
          monto_pendiente: montoPendiente,
          estado: estadoInicial,
          dias_mora: 0,
          retencion_total: this.round2(retencion),
          percepcion_total: this.round2(percepcion),
          detraccion_total: this.round2(detraccion),
          anticipo_total: this.round2(anticipo),
          event_id: sourceEventId,
          idempotency_key: idempotencyKey,
          event_source: eventSource,
        })
        .select('id')
        .single();

      if (insertError) {
        if ((insertError as any)?.code === '23505') {
          this.logger.log(`ℹ️ [CXC] CxC duplicada detectada por constraint para factura ${facturaId}, se omite`);
          await this.registrarIntegrationLog({
            tenantId,
            servicio: 'FINANZAS',
            operacion: 'cxc.crear_desde_factura',
            correlacionId: facturaId,
            correlacionTipo: 'FACTURA',
            status: 'SUCCESS',
            requestSummary: {
              eventId: sourceEventId,
              idempotencyKey,
              source: eventSource,
            },
            responseSummary: {
              skipped: true,
              motivo: 'unique_violation',
            },
            durationMs: Date.now() - startedAt,
          });
          return;
        }
        this.logger.error('❌ [CXC] Error registrando cuenta por cobrar:', insertError);
        throw new BadRequestException('No se pudo registrar la cuenta por cobrar');
      }

      cuentaId = cuentaInsertada?.id ?? null;

      if (cuentaId) {
        const movimientos: any[] = [];
        const fechaPago = this.toISODate(fechaEmision);
        const monedaPago = evento.moneda ?? 'PEN';

        if (retencion > 0) {
          movimientos.push({
            tenant_id: tenantId,
            cuenta_id: cuentaId,
            pedido_id: evento.pedidoId ?? null,
            documento_id: facturaId,
            tipo: TipoMovimientoCxc.RETENCION,
            monto: this.round2(retencion),
            moneda: monedaPago,
            fecha_pago: fechaPago,
            metodo_pago: 'RETENCION',
            referencia: null,
            aplica_retencion: true,
            retencion_monto: this.round2(retencion),
          });
        }

        if (detraccion > 0) {
          movimientos.push({
            tenant_id: tenantId,
            cuenta_id: cuentaId,
            pedido_id: evento.pedidoId ?? null,
            documento_id: facturaId,
            tipo: TipoMovimientoCxc.DETRACCION,
            monto: this.round2(detraccion),
            moneda: monedaPago,
            fecha_pago: fechaPago,
            metodo_pago: 'DETRACCION',
            referencia: config?.detraccion_codigo ?? null,
            aplica_retencion: false,
            retencion_monto: null,
          });
        }

        if (anticipo > 0) {
          movimientos.push({
            tenant_id: tenantId,
            cuenta_id: cuentaId,
            pedido_id: evento.pedidoId ?? null,
            documento_id: facturaId,
            tipo: TipoMovimientoCxc.ANTICIPO,
            monto: this.round2(anticipo),
            moneda: monedaPago,
            fecha_pago: fechaPago,
            metodo_pago: 'ANTICIPO',
            referencia: null,
            aplica_retencion: false,
            retencion_monto: null,
          });
        }

        if (movimientos.length > 0) {
          const { error: pagosError } = await client.from('cxc_pagos').insert(movimientos);
          if (pagosError) {
            this.logger.warn('⚠️ [CXC] No se pudieron registrar movimientos automáticos de CxC:', pagosError);
          }
        }
      }

      if (!cuentaId) {
        this.logger.warn(`⚠️ [CXC] No se obtuvo ID de cuenta por cobrar para factura ${facturaId}`);
        await this.registrarIntegrationLog({
          tenantId,
          servicio: 'FINANZAS',
          operacion: 'cxc.crear_desde_factura',
          correlacionId: facturaId,
          correlacionTipo: 'FACTURA',
          status: 'ERROR',
          requestSummary: {
            eventId: sourceEventId,
            idempotencyKey,
            source: eventSource,
          },
          errorMessage: 'No se obtuvo ID de la CxC insertada',
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      const cxcEventId = sourceEventId;

      this.eventBus.emitCuentaPorCobrarCreadaEvent({
        eventId: cxcEventId,
        tenantId,
        idempotencyKey,
        cxcId: cuentaId,
        cuentaId,
        cpeId: facturaId,
        facturaId,
        serie: numeroSerie ?? undefined,
        numero: numeroCorrelativo != null ? String(numeroCorrelativo) : undefined,
        clienteId: evento.clienteId,
        saldoInicial: this.round2(evento.total),
        saldoPendiente: this.round2(montoPendiente),
        moneda: evento.moneda ?? 'PEN',
        montoTotal: this.round2(evento.total),
        montoPendiente: this.round2(montoPendiente),
        subtotal: this.round2(evento.subtotal ?? 0),
        impuestos: this.round2(evento.impuestos ?? (evento.total - (evento.subtotal ?? 0))),
        fechaEmision: this.toISODate(fechaEmision),
        fechaVencimiento: this.toISODate(fechaVencimiento),
        source: eventSource,
        costoVentas: evento.costoVentas ?? 0,
        ajustes,
      } as CuentaPorCobrarCreadaEvent); // HARDENING: evento idempotente con metadatos completos exigidos.

      await this.registrarIntegrationLog({
        tenantId,
        servicio: 'FINANZAS',
        operacion: 'cxc.crear_desde_factura',
        correlacionId: facturaId,
        correlacionTipo: 'FACTURA',
        status: 'SUCCESS',
        requestSummary: {
          eventId: sourceEventId,
          idempotencyKey,
          source: eventSource,
        },
        responseSummary: { cuentaId },
        durationMs: Date.now() - startedAt,
      });

      this.logger.log(`✅ [CXC] Cuenta por cobrar registrada para factura ${facturaId}`);
    } catch (error) {
      await this.registrarIntegrationLog({
        tenantId,
        servicio: 'FINANZAS',
        operacion: 'cxc.crear_desde_factura',
        correlacionId: facturaId,
        correlacionTipo: 'FACTURA',
        status: 'ERROR',
        requestSummary: {
          eventId: sourceEventId,
          idempotencyKey,
          source: eventSource,
        },
        responseSummary: cuentaId ? { cuentaId } : undefined,
        errorMessage: error?.message ?? 'Error creando cuenta por cobrar',
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
  async obtenerCuentaPorCobrar(
    tenantId: string,
    cuentaId: string,
  ): Promise<any> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('cuentas_por_cobrar')
      .select(
        `
          *,
          clientes(*),
          documentos:documentos(*),
          pedido:pedidos_venta(id, numero, estado),
          pagos:cxc_pagos(*)
        `,
      )
      .eq('tenant_id', tenantId)
      .eq('id', cuentaId)
      // HARDENING: ordenar pagos más recientes primero para evitar inconsistencias de UI/historial.
      .order('fecha_pago', { ascending: false, foreignTable: 'cxc_pagos' })
      .single();

    if (error || !data) {
      console.error('Error obteniendo cuenta por cobrar:', error);
      throw new NotFoundException('Cuenta por cobrar no encontrada');
    }

    return data;
  }

  async registrarPago(
    tenantId: string,
    cuentaId: string,
    dto: RegistrarPagoCxcDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    const cuenta = await this.obtenerCuentaPorCobrar(tenantId, cuentaId);

    const pendienteActual = Number(cuenta.monto_pendiente ?? 0);
    const montoTotal = Number(cuenta.monto_total ?? 0);
    const montoPago = this.round2(Number(dto.monto));

    if (Number.isNaN(montoPago) || montoPago <= 0) {
      throw new BadRequestException('El monto del pago debe ser mayor a cero');
    }

    if (montoPago - pendienteActual > 0.05) {
      throw new BadRequestException('El monto del pago supera el saldo pendiente');
    }

    const movimientoTipo =
      dto.tipo ?? (dto.aplica_retencion ? TipoMovimientoCxc.RETENCION : TipoMovimientoCxc.PAGO);
    const esNotaCredito = movimientoTipo === TipoMovimientoCxc.NOTA_CREDITO;

    const retencionMonto =
      !esNotaCredito && dto.retencion_monto != null
        ? Number(dto.retencion_monto)
        : !esNotaCredito && movimientoTipo === TipoMovimientoCxc.RETENCION
          ? montoPago
          : null;

    const nuevoPendiente = this.round2(Math.max(pendienteActual - montoPago, 0));
    const nuevoEstado = this.calcularEstadoCuenta(montoTotal, nuevoPendiente);
    const diasMora = nuevoPendiente > 0 ? this.calcularDiasMora(cuenta.fecha_vencimiento) : 0;

    // Si se especificó cuenta bancaria, validar que existe y la moneda coincida
    let cuentaBancaria: any = null;
    if (!esNotaCredito && dto.cuenta_bancaria_id) {
      const { data: cuentaBanco, error: errorCuentaBanco } = await client
        .from('cuentas_bancarias')
        .select('id, nombre, saldo, moneda, permite_sobregiro, activa')
        .eq('tenant_id', tenantId)
        .eq('id', dto.cuenta_bancaria_id)
        .maybeSingle();

      if (errorCuentaBanco || !cuentaBanco) {
        throw new BadRequestException('Cuenta bancaria no encontrada');
      }

      if (!cuentaBanco.activa) {
        throw new BadRequestException('No se pueden registrar cobros en una cuenta bancaria inactiva');
      }

      cuentaBancaria = cuentaBanco;

      // Validar que la moneda coincida
      const monedaCuenta = dto.moneda ?? cuenta.moneda ?? 'PEN';
      if (cuentaBanco.moneda !== monedaCuenta) {
        throw new BadRequestException(
          `La moneda de la cuenta bancaria (${cuentaBanco.moneda}) no coincide con la moneda del cobro (${monedaCuenta})`,
        );
      }
    }

    // ✅ IDEMPOTENCIA: Validar que no exista un pago duplicado con la misma referencia
    if (dto.referencia) {
      const { data: pagoDuplicado } = await client
        .from('cxc_pagos')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('cuenta_id', cuentaId)
        .eq('referencia', dto.referencia)
        .maybeSingle();

      if (pagoDuplicado) {
        throw new BadRequestException(
          `Ya existe un pago registrado con la referencia "${dto.referencia}". Use una referencia única.`,
        );
      }
    }

    const cobroEventId = uuidv4();
    const submittedIdempotency = dto.idempotency_key?.trim() || null;
    const provisionalIdempotencyKey = submittedIdempotency ?? `cxc.cobro:${tenantId}:${cobroEventId}`;
    const ahora = new Date().toISOString();

    const { data: pagoRegistrado, error: pagoError } = await client
      .from('cxc_pagos')
      .insert({
        tenant_id: tenantId,
        cuenta_id: cuentaId,
        pedido_id: cuenta.pedido_id ?? null,
        documento_id: dto.documento_pago_id ?? null,
        monto: this.round2(montoPago),
        moneda: dto.moneda ?? cuenta.moneda ?? 'PEN',
        fecha_pago: dto.fecha_pago,
        metodo_pago: esNotaCredito ? 'NOTA_CREDITO' : dto.metodo_pago ?? null,
        referencia: dto.referencia ?? null,
        notas: dto.notas ?? null,
        tipo: movimientoTipo,
        aplica_retencion: !esNotaCredito && (dto.aplica_retencion ?? movimientoTipo === TipoMovimientoCxc.RETENCION),
        retencion_monto: !esNotaCredito ? retencionMonto : null,
        usuario_id: userId ?? null,
        cuenta_bancaria_id: dto.cuenta_bancaria_id ?? null,
        event_id: cobroEventId,
        idempotency_key: provisionalIdempotencyKey,
        source: 'finanzas.cxc',
        created_at: ahora,
        updated_at: ahora,
      })
      .select()
      .single();

    if (pagoError || !pagoRegistrado) {
      console.error('Error registrando pago de CxC:', pagoError);
      throw new BadRequestException('No se pudo registrar el pago de la cuenta por cobrar');
    }

    const finalIdempotencyKey = submittedIdempotency ?? `cxc.cobro:${tenantId}:${pagoRegistrado.id}`;
    if (!submittedIdempotency && finalIdempotencyKey !== provisionalIdempotencyKey) {
      const { error: idempotencyUpdateError } = await client
        .from('cxc_pagos')
        .update({
          idempotency_key: finalIdempotencyKey,
          updated_at: ahora,
        })
        .eq('id', pagoRegistrado.id)
        .eq('tenant_id', tenantId);

      if (idempotencyUpdateError) {
        this.logger.warn(
          `⚠️ [CXC] No se pudo actualizar idempotency_key del cobro ${pagoRegistrado.id}:`,
          idempotencyUpdateError,
        );
      } else {
        (pagoRegistrado as any).idempotency_key = finalIdempotencyKey;
      }
    }

    // Si hay cuenta bancaria, crear movimiento bancario y actualizar saldo
    let movimientoBancario: any = null;
    if (!esNotaCredito && dto.cuenta_bancaria_id && cuentaBancaria) {
      const clienteNombre = cuenta.clientes?.razon_social || cuenta.cliente_id;
      const numeroDocumento = [cuenta.serie, cuenta.numero].filter(Boolean).join('-') || cuenta.documento_id;

      const { data: movimiento, error: errorMovimiento } = await client
        .from('movimientos_bancarios')
        .insert({
          tenant_id: tenantId,
          cuenta_bancaria_id: dto.cuenta_bancaria_id,
          tipo: 'ABONO',
          monto: this.round2(montoPago),
          fecha: dto.fecha_pago,
          descripcion: `Cobro de cliente ${clienteNombre} - Doc: ${numeroDocumento}`,
          referencia: dto.referencia || null,
          metodo_pago: dto.metodo_pago,
          cliente_id: cuenta.cliente_id,
          cxc_id: cuentaId,
          conciliado: false,
          created_by: userId || null,
          created_at: ahora,
        })
        .select()
        .single();

      if (errorMovimiento) {
        console.error('Error creando movimiento bancario:', errorMovimiento);
        await client.from('cxc_pagos').delete().eq('id', pagoRegistrado.id);
        throw new BadRequestException('No se pudo crear el movimiento bancario');
      }

      movimientoBancario = movimiento;

      const nuevoSaldoBanco = this.round2(cuentaBancaria.saldo + montoPago);
      const { error: errorSaldoBanco } = await client
        .from('cuentas_bancarias')
        .update({
          saldo: nuevoSaldoBanco,
          updated_at: ahora,
        })
        .eq('tenant_id', tenantId)
        .eq('id', dto.cuenta_bancaria_id);

      if (errorSaldoBanco) {
        console.error('Error actualizando saldo de cuenta bancaria:', errorSaldoBanco);
        await client.from('movimientos_bancarios').delete().eq('id', movimiento.id);
        await client.from('cxc_pagos').delete().eq('id', pagoRegistrado.id);
        throw new BadRequestException('No se pudo actualizar el saldo de la cuenta bancaria');
      }
    }

    const acumulados = {
      retencion: Number(cuenta.retencion_total ?? 0),
      percepcion: Number(cuenta.percepcion_total ?? 0),
      detraccion: Number(cuenta.detraccion_total ?? 0),
      anticipo: Number(cuenta.anticipo_total ?? 0),
    };

    if (!esNotaCredito && (movimientoTipo === TipoMovimientoCxc.RETENCION || dto.aplica_retencion)) {
      acumulados.retencion = this.round2(
        acumulados.retencion + (retencionMonto != null ? Number(retencionMonto) : montoPago),
      );
    }

    if (!esNotaCredito && movimientoTipo === TipoMovimientoCxc.PERCEPCION) {
      acumulados.percepcion = this.round2(acumulados.percepcion + montoPago);
    }

    if (!esNotaCredito && movimientoTipo === TipoMovimientoCxc.DETRACCION) {
      acumulados.detraccion = this.round2(acumulados.detraccion + montoPago);
    }

    if (!esNotaCredito && movimientoTipo === TipoMovimientoCxc.ANTICIPO) {
      acumulados.anticipo = this.round2(acumulados.anticipo + montoPago);
    }

    const { error: updateError } = await client
      .from('cuentas_por_cobrar')
      .update({
        monto_pendiente: nuevoPendiente,
        estado: nuevoEstado,
        dias_mora: diasMora,
        retencion_total: acumulados.retencion,
        percepcion_total: acumulados.percepcion,
        detraccion_total: acumulados.detraccion,
        anticipo_total: acumulados.anticipo,
        updated_at: ahora,
      })
      .eq('id', cuentaId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error actualizando cuenta por cobrar después del pago:', updateError);
      throw new BadRequestException('No se pudo actualizar la cuenta por cobrar');
    }

    const detalleActualizado = await this.obtenerCuentaPorCobrar(tenantId, cuentaId);

    const medioCobro = esNotaCredito ? 'NOTA_CREDITO' : (dto.metodo_pago ?? 'EFECTIVO'); // HARDENING: aseguramos precedencia al calcular medio de cobro.

    if (!esNotaCredito) {
      this.emitirEventoPagoFactura(
        tenantId,
        detalleActualizado,
        cuentaId,
        {
          monto: this.round2(montoPago),
          metodo: medioCobro,
          fecha: dto.fecha_pago,
        },
        nuevoPendiente,
        nuevoEstado,
      );
    }

    this.emitirEventoCobroRegistrado(
      tenantId,
      pagoRegistrado,
      cuenta,
      detalleActualizado,
      pendienteActual,
      nuevoPendiente,
      nuevoEstado,
      userId,
      {
        eventId: cobroEventId,
        idempotencyKey: finalIdempotencyKey,
        medio: medioCobro,
        cuentaBancariaId: dto.cuenta_bancaria_id || null,
        timestamp: ahora,
      },
    );

    const numeroDocumento =
      [detalleActualizado.serie, detalleActualizado.numero].filter(Boolean).join('-') ||
      detalleActualizado.documento_id ||
      'SIN-DOC';

    const clienteNombre =
      detalleActualizado.clientes?.razon_social ||
      cuenta.clientes?.razon_social ||
      null;

    const eventoPayload = {
      tenant_id: tenantId,
      tenantId,
      event_id: cobroEventId,
      eventId: cobroEventId,
      idempotency_key: finalIdempotencyKey,
      idempotencyKey: finalIdempotencyKey,
      cobro_id: pagoRegistrado.id,
      cobroId: pagoRegistrado.id,
      cxc_id: pagoRegistrado.cuenta_id,
      cxcId: pagoRegistrado.cuenta_id,
      cliente_id: detalleActualizado.cliente_id,
      clienteId: detalleActualizado.cliente_id,
      cliente_nombre: clienteNombre,
      clienteNombre,
      documento_id: detalleActualizado.documento_id || null,
      documentoId: detalleActualizado.documento_id || null,
      numero_documento: numeroDocumento,
      numeroDocumento,
      monto: this.round2(pagoRegistrado.monto),
      moneda: pagoRegistrado.moneda || 'PEN',
      fecha: pagoRegistrado.fecha_pago,
      medio: medioCobro,
      metodo_pago: medioCobro,
      cuenta_bancaria_id: dto.cuenta_bancaria_id || null,
      cuentaBancariaId: dto.cuenta_bancaria_id || null,
      referencia: pagoRegistrado.referencia || null,
      notas: pagoRegistrado.notas || null,
      saldo_anterior: this.round2(pendienteActual),
      saldoAnterior: this.round2(pendienteActual),
      saldo_nuevo: this.round2(nuevoPendiente),
      saldoNuevo: this.round2(nuevoPendiente),
      estado_anterior: cuenta.estado || 'PENDIENTE',
      estadoAnterior: cuenta.estado || 'PENDIENTE',
      estado_nuevo: nuevoEstado,
      estadoNuevo: nuevoEstado,
      movimiento_bancario_id: movimientoBancario?.id || null,
      movimientoBancarioId: movimientoBancario?.id || null,
      created_by: userId || null,
      createdBy: userId || null,
      source: 'finanzas.cxc',
      timestamp: ahora,
    };

    const { error: errorOutbox } = await client
      .from('outbox_events')
      .insert({
        event_id: cobroEventId,
        correlation_id: finalIdempotencyKey,
        aggregate_type: 'cobro',
        aggregate_id: pagoRegistrado.id,
        event_type: 'cobro.registrado',
        event_data: eventoPayload,
        status: 'pending',
        retry_count: 0,
        created_at: ahora,
      });

    if (errorOutbox) {
      console.error('Error insertando evento CobroRegistrado en outbox:', errorOutbox);
    }

    if (userId) {
      const auditoriaAccion = esNotaCredito ? 'APLICAR_NOTA_CREDITO' : 'REGISTRAR_PAGO';
      try {
        await this.auditService.registrarCambio(
          'cuentas_por_cobrar',
          'UPDATE',
          userId,
          {
            old: { monto_pendiente: pendienteActual, estado: cuenta.estado },
            new: { monto_pendiente: nuevoPendiente, estado: nuevoEstado, dias_mora: diasMora },
          },
          tenantId,
          cuentaId,
          {
            accion: auditoriaAccion,
            monto: montoPago,
            medio_cobro: medioCobro,
            referencia: dto.referencia,
            tipo_movimiento: movimientoTipo,
            event_id: cobroEventId,
          },
        );
      } catch (error) {
        console.warn('⚠️ No se pudo registrar auditoría de pago CxC:', error);
      }
    }

    return {
      success: true,
      data: detalleActualizado,
    };
  }

  async aplicarNotaCredito(
    tenantId: string,
    cuentaId: string,
    dto: AplicarNotaCreditoDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const serieNumero = [dto.serie, dto.numero].filter(Boolean).join('-');
    const referenciaCalculada =
      dto.referencia ?? (serieNumero ? serieNumero : undefined); // HARDENING: referencia calculada segura para evitar rupturas de compilación.
    const notas = dto.notas ?? dto.motivo ?? undefined;

    // HARDENING: reutilizamos flujo de registrarPago con tipo NOTA_CREDITO para garantizar idempotencia.
    return this.registrarPago(
      tenantId,
      cuentaId,
      {
        monto: dto.monto,
        fecha_pago: dto.fecha_emision,
        metodo_pago: 'NOTA_CREDITO',
        referencia: referenciaCalculada,
        notas,
        tipo: TipoMovimientoCxc.NOTA_CREDITO,
        documento_pago_id: dto.documento_id,
        idempotency_key: dto.documento_id
          ? `cxc.nota_credito:${tenantId}:${dto.documento_id}`
          : referenciaCalculada
            ? `cxc.nota_credito:${tenantId}:${referenciaCalculada}`
            : undefined,
      } as RegistrarPagoCxcDto,
      userId,
    );
  }

  async reprogramarCuentaPorCobrar(
    tenantId: string,
    cuentaId: string,
    dto: ReprogramarCxcDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    const cuenta = await this.obtenerCuentaPorCobrar(tenantId, cuentaId);

    if (!dto.nueva_fecha_vencimiento) {
      throw new BadRequestException('La nueva fecha de vencimiento es requerida');
    }

    const fechaReprogramada = new Date(dto.nueva_fecha_vencimiento);
    if (Number.isNaN(fechaReprogramada.getTime())) {
      throw new BadRequestException('La nueva fecha de vencimiento es inválida');
    }

    const diasMora = this.calcularDiasMora(dto.nueva_fecha_vencimiento);
    const ahora = new Date().toISOString();

    const { error: updateError } = await client
      .from('cuentas_por_cobrar')
      .update({
        fecha_vencimiento: dto.nueva_fecha_vencimiento,
        dias_mora: diasMora,
        updated_at: ahora,
      })
      .eq('tenant_id', tenantId)
      .eq('id', cuentaId);

    if (updateError) {
      console.error('Error reprogramando CxC:', updateError);
      throw new BadRequestException('No se pudo reprogramar la cuenta por cobrar');
    }

    const detalleActualizado = await this.obtenerCuentaPorCobrar(tenantId, cuentaId);

    if (userId) {
      try {
        await this.auditService.registrarCambio(
          'cuentas_por_cobrar',
          'UPDATE',
          userId,
          {
            old: { fecha_vencimiento: cuenta.fecha_vencimiento },
            new: { fecha_vencimiento: dto.nueva_fecha_vencimiento, dias_mora: diasMora },
          },
          tenantId,
          cuentaId,
          {
            accion: 'REPROGRAMAR_VENCIMIENTO',
            motivo: dto.motivo,
            comentarios: dto.comentarios,
          },
        );
      } catch (error) {
        console.warn('⚠️ No se pudo registrar auditoría de reprogramación CxC:', error);
      }
    }

    return {
      success: true,
      data: detalleActualizado,
    };
  }

  private async obtenerConfiguracionEmpresa(tenantId: string): Promise<any> {
    const { data, error } = await this.supabase
      .getClient()
      .from('empresa_config')
      .select('dias_vencimiento_factura, detraccion_codigo, aplicar_retencion, retencion_tasa, aplicar_percepcion, percepcion_tasa, aplicar_detraccion, detraccion_tasa')
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      this.logger.warn(`⚠️ [CXC] No se pudo obtener configuración de empresa para ${tenantId}: ${error.message}`);
      return {};
    }

    return data || {};
  }

  private async obtenerCliente(clienteId: string, tenantId: string): Promise<any> {
    if (!clienteId) {
      return null;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('clientes')
      .select('id, razon_social, sujeto_retencion, retencion_tasa, sujeto_percepcion, percepcion_tasa, sujeto_detraccion, detraccion_tasa')
      .eq('id', clienteId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      this.logger.warn(`⚠️ [CXC] No se pudo obtener cliente ${clienteId} para tenant ${tenantId}: ${error.message}`);
      return null;
    }

    return data;
  }

  private calcularAjustesDesdeEvento(
    evento: FacturaEmitidaEvent,
    cliente: any,
    config: any,
  ): { retencion: number; percepcion: number; detraccion: number; anticipo: number } {
    if (evento.ajustes) {
      return {
        retencion: this.round2(evento.ajustes.retencion || 0),
        percepcion: this.round2(evento.ajustes.percepcion || 0),
        detraccion: this.round2(evento.ajustes.detraccion || 0),
        anticipo: this.round2(evento.ajustes.anticipo || 0),
      };
    }

    const total = this.round2(evento.total);
    const sujetoRetencion = cliente?.sujeto_retencion ?? config?.aplicar_retencion ?? false;
    const retencionTasa = cliente?.retencion_tasa ?? config?.retencion_tasa ?? 0;
    const sujetoPercepcion = cliente?.sujeto_percepcion ?? config?.aplicar_percepcion ?? false;
    const percepcionTasa = cliente?.percepcion_tasa ?? config?.percepcion_tasa ?? 0;
    const sujetoDetraccion = cliente?.sujeto_detraccion ?? config?.aplicar_detraccion ?? false;
    const detraccionTasa = cliente?.detraccion_tasa ?? config?.detraccion_tasa ?? 0;

    const retencion = sujetoRetencion && retencionTasa > 0 ? this.round2(total * (Number(retencionTasa) / 100)) : 0;
    const percepcion = sujetoPercepcion && percepcionTasa > 0 ? this.round2(total * (Number(percepcionTasa) / 100)) : 0;
    const detraccion = sujetoDetraccion && detraccionTasa > 0 ? this.round2(total * (Number(detraccionTasa) / 100)) : 0;

    return {
      retencion,
      percepcion,
      detraccion,
      anticipo: 0,
    };
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private toISODate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
  private calcularEstadoCuenta(
    total: number,
    pendiente: number,
  ): 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'VENCIDO' {
    const roundedPendiente = this.round2(pendiente);
    if (roundedPendiente <= 0.009) {
      return 'CANCELADO';
    }
    if (roundedPendiente >= this.round2(total)) {
      return 'PENDIENTE';
    }
    return 'PARCIAL';
  }

  private calcularDiasMora(fechaVencimiento: string): number {
    if (!fechaVencimiento) {
      return 0;
    }
    const hoy = new Date();
    const vencimiento = new Date(fechaVencimiento);
    const diff = hoy.getTime() - vencimiento.getTime();
    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    return dias > 0 ? dias : 0;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private emitirEventoPagoFactura(
    tenantId: string,
    cuenta: any,
    cuentaId: string,
    pago: { monto: number; metodo?: string; fecha: string },
    saldoPendiente: number,
    estadoCuenta: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'VENCIDO',
  ): void {
    if (!this.eventBus || !cuenta?.documento_id) {
      return;
    }

    try {
      const numeroFactura =
        [cuenta.serie, cuenta.numero].filter(Boolean).join('-') || cuenta.documento_id;
      const tenantFromContext = tenantId || cuenta.tenant_id || cuenta.tenantId || null;

      if (!tenantFromContext) {
        // HARDENING: sin tenant no generamos evento de pago.
        console.warn('⚠️ [CXC] Pago de factura sin tenantId, se omite evento contable');
        return;
      }

      this.eventBus.emitPagoFactura({
        eventId: uuidv4(),
        tenantId: tenantFromContext,
        cxcId: cuentaId,
        facturaId: cuenta.documento_id,
        cpeId: cuenta.documento_id,
        numeroFactura,
        clienteId: cuenta.cliente_id,
        montoPagado: this.round2(pago.monto),
        moneda: cuenta.moneda || 'PEN',
        metodoPago: pago.metodo ?? 'desconocido',
        cuentaBancariaId: cuenta.cuenta_bancaria_id ?? null,
        fechaPago: pago.fecha,
        saldoPendiente: this.round2(saldoPendiente),
        estadoPago: estadoCuenta === 'CANCELADO' ? 'COMPLETO' : 'PARCIAL',
      });
    } catch (error) {
      console.error('Error emitiendo evento de pago de factura para contabilidad:', error);
    }
  }

  private emitirEventoCobroRegistrado(
    tenantId: string,
    pagoRegistrado: any,
    cuentaAnterior: any,
    cuentaActualizada: any,
    saldoAnterior: number,
    saldoNuevo: number,
    estadoNuevo: string,
    userId?: string,
    extras?: {
      eventId: string;
      idempotencyKey: string;
      medio: string;
      cuentaBancariaId?: string | null;
      timestamp?: string;
    },
  ): void {
    if (!this.eventBus) {
      return;
    }

    try {
      const numeroDocumento =
        [cuentaActualizada.serie, cuentaActualizada.numero].filter(Boolean).join('-') ||
        cuentaActualizada.documento_id ||
        'SIN-DOC';

      const clienteNombre =
        cuentaActualizada.clientes?.razon_social ||
        cuentaAnterior.clientes?.razon_social ||
        null;

      const estadoAnterior = cuentaAnterior.estado || 'PENDIENTE';

      const eventId = extras?.eventId ?? uuidv4();
      const idempotencyKey = extras?.idempotencyKey ?? `cxc.cobro:event:${eventId}`;
      const medio =
        extras?.medio ?? (pagoRegistrado.metodo_pago || 'EFECTIVO'); // HARDENING: parentesis para respetar precedencia segura.

      this.eventBus.emitCobroRegistrado({
        tenantId,
        eventId,
        idempotencyKey,
        cobroId: pagoRegistrado.id,
        cxcId: pagoRegistrado.cuenta_id,
        clienteId: cuentaActualizada.cliente_id,
        clienteNombre,
        documentoId: cuentaActualizada.documento_id || null,
        numeroDocumento,
        monto: this.round2(pagoRegistrado.monto),
        moneda: pagoRegistrado.moneda || 'PEN',
        fecha: pagoRegistrado.fecha_pago,
        medio,
        cuentaBancariaId: extras?.cuentaBancariaId ?? pagoRegistrado.cuenta_bancaria_id ?? null,
        referencia: pagoRegistrado.referencia || null,
        notas: pagoRegistrado.notas || null,
        saldoAnterior: this.round2(saldoAnterior),
        saldoNuevo: this.round2(saldoNuevo),
        estadoAnterior,
        estadoNuevo,
        source: 'finanzas.cxc',
        createdBy: userId || null,
        timestamp: extras?.timestamp ?? new Date().toISOString(),
      });

      console.log('✅ Evento CobroRegistrado emitido exitosamente');
    } catch (error) {
      console.error('Error emitiendo evento CobroRegistrado:', error);
    }
  }
}









