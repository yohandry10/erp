import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { RegistrarPagoCxcDto, TipoMovimientoCxc } from './dto';
import { EventBusService } from '../../../shared/events/event-bus.service';

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
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
  ) {}

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
      detalleActualizado,
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
    cuenta: any,
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

      this.eventBus.emitPagoFactura({
        facturaId: cuenta.documento_id,
        numeroFactura,
        clienteId: cuenta.cliente_id,
        montoPagado: this.round2(pago.monto),
        metodoPago: pago.metodo ?? 'desconocido',
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
