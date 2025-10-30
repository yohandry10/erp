import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { RegistrarPagoCxcDto, TipoMovimientoCxc } from './dto';
import { EventBusService, FacturaEmitidaEvent, CuentaPorCobrarCreadaEvent } from '../../../shared/events/event-bus.service';

interface ListarCxcFilters {
  estado?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'VENCIDO';
  cliente_id?: string;
  search?: string;
  page?: number;
  limit?: number;
  vencidas?: boolean;
  hasta?: string;
}

@Injectable()
export class CxcService {
  private readonly logger = new Logger(CxcService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
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

      const fechaEmision = evento.fechaEmision ? new Date(evento.fechaEmision) : new Date();
      const diasVencimiento = config?.dias_vencimiento_factura ?? 30;
      const fechaVencimiento = evento.fechaVencimiento
        ? new Date(evento.fechaVencimiento)
        : this.addDays(fechaEmision, diasVencimiento);

      const retencion = ajustes.retencion ?? 0;
      const percepcion = ajustes.percepcion ?? 0;
      const detraccion = ajustes.detraccion ?? 0;
      const anticipo = ajustes.anticipo ?? 0;

      const montoPendiente = this.round2(Math.max(evento.total - retencion - detraccion - anticipo + percepcion, 0));

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
        cuentaId,
        facturaId,
        serie: numeroSerie ?? undefined,
        numero: numeroCorrelativo ?? undefined,
        clienteId: evento.clienteId,
        montoTotal: this.round2(evento.total),
        montoPendiente,
        moneda: evento.moneda ?? 'PEN',
        subtotal: this.round2(evento.subtotal ?? 0),
        impuestos: this.round2(evento.impuestos ?? (evento.total - (evento.subtotal ?? 0))),
        fechaEmision: this.toISODate(fechaEmision),
        fechaVencimiento: this.toISODate(fechaVencimiento),
        idempotencyKey,
        source: eventSource,
        costoVentas: evento.costoVentas ?? 0,
        ajustes,
      } as CuentaPorCobrarCreadaEvent);

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
    const montoPago = Number(dto.monto);

    if (montoPago <= 0) {
      throw new BadRequestException('El monto del pago debe ser mayor a cero');
    }

    if (montoPago - pendienteActual > 0.05) {
      throw new BadRequestException('El monto del pago supera el saldo pendiente');
    }

    const movimientoTipo =
      dto.tipo ?? (dto.aplica_retencion ? TipoMovimientoCxc.RETENCION : TipoMovimientoCxc.PAGO);
    const retencionMonto =
      dto.retencion_monto != null
        ? Number(dto.retencion_monto)
        : movimientoTipo === TipoMovimientoCxc.RETENCION
          ? montoPago
          : null;

    const nuevoPendiente = this.round2(Math.max(pendienteActual - montoPago, 0));
    const nuevoEstado = this.calcularEstadoCuenta(montoTotal, nuevoPendiente);
    const diasMora = nuevoPendiente > 0 ? this.calcularDiasMora(cuenta.fecha_vencimiento) : 0;

    // Si se especificó cuenta bancaria, validar que existe y la moneda coincida
    let cuentaBancaria: any = null;
    if (dto.cuenta_bancaria_id) {
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
          `Ya existe un pago registrado con la referencia "${dto.referencia}". Use una referencia única.`
        );
      }
    }

    const { data: pagoRegistrado, error: pagoError } = await client.from('cxc_pagos').insert({
      tenant_id: tenantId,
      cuenta_id: cuentaId,
      pedido_id: cuenta.pedido_id ?? null,
      documento_id: dto.documento_pago_id ?? null,
      monto: this.round2(montoPago),
      moneda: dto.moneda ?? cuenta.moneda ?? 'PEN',
      fecha_pago: dto.fecha_pago,
      metodo_pago: dto.metodo_pago ?? null,
      referencia: dto.referencia ?? null,
      notas: dto.notas ?? null,
      tipo: movimientoTipo,
      aplica_retencion: dto.aplica_retencion ?? movimientoTipo === TipoMovimientoCxc.RETENCION,
      retencion_monto: retencionMonto,
      usuario_id: userId ?? null,
      created_at: new Date().toISOString(),
    }).select().single();

    if (pagoError || !pagoRegistrado) {
      console.error('Error registrando pago de CxC:', pagoError);
      throw new BadRequestException('No se pudo registrar el pago de la cuenta por cobrar');
    }

    // Si hay cuenta bancaria, crear movimiento bancario y actualizar saldo
    let movimientoBancario: any = null;
    if (dto.cuenta_bancaria_id && cuentaBancaria) {
      const clienteNombre = cuenta.clientes?.razon_social || cuenta.cliente_id;
      const numeroDocumento = [cuenta.serie, cuenta.numero].filter(Boolean).join('-') || cuenta.documento_id;

      // Crear movimiento bancario (tipo ABONO = ingreso de dinero)
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
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (errorMovimiento) {
        console.error('Error creando movimiento bancario:', errorMovimiento);
        // Revertir el pago registrado
        await client.from('cxc_pagos').delete().eq('id', pagoRegistrado.id);
        throw new BadRequestException('No se pudo crear el movimiento bancario');
      }

      movimientoBancario = movimiento;

      // Actualizar saldo de la cuenta bancaria (ABONO suma al saldo)
      const nuevoSaldoBanco = this.round2(cuentaBancaria.saldo + montoPago);
      const { error: errorSaldoBanco } = await client
        .from('cuentas_bancarias')
        .update({
          saldo: nuevoSaldoBanco,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', dto.cuenta_bancaria_id);

      if (errorSaldoBanco) {
        console.error('Error actualizando saldo de cuenta bancaria:', errorSaldoBanco);
        // Revertir movimiento bancario y pago
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

    if (movimientoTipo === TipoMovimientoCxc.RETENCION || dto.aplica_retencion) {
      acumulados.retencion = this.round2(
        acumulados.retencion + (retencionMonto != null ? Number(retencionMonto) : montoPago),
      );
    }

    if (movimientoTipo === TipoMovimientoCxc.PERCEPCION) {
      acumulados.percepcion = this.round2(acumulados.percepcion + montoPago);
    }

    if (movimientoTipo === TipoMovimientoCxc.DETRACCION) {
      acumulados.detraccion = this.round2(acumulados.detraccion + montoPago);
    }

    if (movimientoTipo === TipoMovimientoCxc.ANTICIPO) {
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', cuentaId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error actualizando cuenta por cobrar después del pago:', updateError);
      throw new BadRequestException('No se pudo actualizar la cuenta por cobrar');
    }

    const detalleActualizado = await this.obtenerCuentaPorCobrar(tenantId, cuentaId);

    // Emitir evento PagoFactura (legacy, para compatibilidad)
    this.emitirEventoPagoFactura(
      tenantId,
      detalleActualizado,
      cuentaId,
      {
        monto: this.round2(montoPago),
        metodo: dto.metodo_pago ?? undefined,
        fecha: dto.fecha_pago,
      },
      nuevoPendiente,
      nuevoEstado,
    );

    // Emitir evento CobroRegistrado (nuevo, para integración con Contabilidad y Tesorería)
    this.emitirEventoCobroRegistrado(
      tenantId,
      pagoRegistrado,
      cuenta,
      detalleActualizado,
      pendienteActual,
      nuevoPendiente,
      nuevoEstado,
      userId,
    );

    // Insertar en outbox_events para procesamiento asíncrono
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
      cobro_id: pagoRegistrado.id,
      cxc_id: pagoRegistrado.cuenta_id,
      cliente_id: detalleActualizado.cliente_id,
      cliente_nombre: clienteNombre,
      documento_id: detalleActualizado.documento_id || null,
      numero_documento: numeroDocumento,
      monto: this.round2(pagoRegistrado.monto),
      moneda: pagoRegistrado.moneda || 'PEN',
      fecha: pagoRegistrado.fecha_pago,
      metodo_pago: pagoRegistrado.metodo_pago || 'EFECTIVO',
      cuenta_bancaria_id: dto.cuenta_bancaria_id || null,
      referencia: pagoRegistrado.referencia || null,
      notas: pagoRegistrado.notas || null,
      saldo_anterior: this.round2(pendienteActual),
      saldo_nuevo: this.round2(nuevoPendiente),
      estado_anterior: cuenta.estado || 'PENDIENTE',
      estado_nuevo: nuevoEstado,
      movimiento_bancario_id: movimientoBancario?.id || null,
      created_by: userId || null,
    };

    const { error: errorOutbox } = await client
      .from('outbox_events')
      .insert({
        event_type: 'CobroRegistrado',
        aggregate_type: 'CuentaPorCobrar',
        aggregate_id: pagoRegistrado.cuenta_id,
        event_data: eventoPayload,
        status: 'pending',
        retry_count: 0,
        created_at: new Date().toISOString(),
      });

    if (errorOutbox) {
      console.error('Error insertando evento CobroRegistrado en outbox:', errorOutbox);
      // No fallar la operación si el evento no se pudo insertar
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

      this.eventBus.emitCobroRegistrado({
        tenantId,
        cobroId: pagoRegistrado.id,
        cxcId: pagoRegistrado.cuenta_id,
        clienteId: cuentaActualizada.cliente_id,
        clienteNombre,
        documentoId: cuentaActualizada.documento_id || null,
        numeroDocumento,
        monto: this.round2(pagoRegistrado.monto),
        moneda: pagoRegistrado.moneda || 'PEN',
        fecha: pagoRegistrado.fecha_pago,
        metodoPago: pagoRegistrado.metodo_pago || 'EFECTIVO',
        cuentaBancariaId: pagoRegistrado.cuenta_bancaria_id || null,
        referencia: pagoRegistrado.referencia || null,
        notas: pagoRegistrado.notas || null,
        saldoAnterior: this.round2(saldoAnterior),
        saldoNuevo: this.round2(saldoNuevo),
        estadoAnterior,
        estadoNuevo,
        createdBy: userId || null,
      });

      console.log('✅ Evento CobroRegistrado emitido exitosamente');
    } catch (error) {
      console.error('Error emitiendo evento CobroRegistrado:', error);
    }
  }
}









