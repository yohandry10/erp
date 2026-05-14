import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService, PagoProveedorRegistradoEvent } from '../../../shared/events/event-bus.service';
import { v4 as uuidv4 } from 'uuid';
import { CrearCxpDto, FiltrarCxpDto, ActualizarCxpDto, AplicarPagoCxpDto, AnularCxpDto, VencimientosCxpDto } from './dto';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';
import { OutboxEventBuilder } from '../../../shared/outbox/outbox-event.interface';
import Decimal from 'decimal.js';
import { DevolucionProveedorEmitidaEvent } from '../../../shared/events/event-bus.service';
import { TesoreriaService } from '../tesoreria/tesoreria.service';

@Injectable()
export class CxpService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly retencionesValidation: RetencionesValidationService,
    private readonly tesoreriaService?: TesoreriaService,
  ) { }

  private async registrarIntegrationLog(entry: {
    tenantId: string;
    operacion: string;
    correlacionId?: string | null;
    correlacionTipo?: string | null;
    status: 'SUCCESS' | 'ERROR';
    requestSummary?: Record<string, any>;
    responseSummary?: Record<string, any>;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await this.supabase
        .getClient()
        .from('integration_logs')
        .insert({
          tenant_id: entry.tenantId,
          servicio: 'FINANZAS',
          operacion: entry.operacion,
          correlacion_id: entry.correlacionId ?? null,
          correlacion_tipo: entry.correlacionTipo ?? null,
          status: entry.status,
          request_summary: entry.requestSummary ?? null,
          response_summary: entry.responseSummary ?? null,
          error_message: entry.errorMessage ?? null,
          duration_ms: null,
        });
    } catch {
      // No bloquear por errores de logging.
    }
  }

  private async yaProcesadoPorIdempotencyKey(params: {
    tenantId: string;
    operacion: string;
    idempotencyKey: string;
  }): Promise<boolean> {
    const client = this.supabase.getClient();
    const { tenantId, operacion, idempotencyKey } = params;
    try {
      const { data, error } = await client
        .from('integration_logs')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('servicio', 'FINANZAS')
        .eq('operacion', operacion)
        .eq('correlacion_id', idempotencyKey)
        .eq('status', 'SUCCESS')
        .maybeSingle();

      if (error) {
        return false;
      }

      return Boolean(data?.id);
    } catch {
      return false;
    }
  }

  async aplicarDevolucionProveedorEmitida(
    tenantId: string,
    data: DevolucionProveedorEmitidaEvent,
  ): Promise<void> {
    const startedAt = Date.now();
    const operacion = 'CXP_DEVOLUCION_PROVEEDOR_APLICADA';
    const idempotencyKey =
      data.idempotencyKey ?? `devolucion:${tenantId}:${data.devolucionId}`;

    if (await this.yaProcesadoPorIdempotencyKey({ tenantId, operacion, idempotencyKey })) {
      return;
    }

    const client = this.supabase.getClient();

    try {
      if (!data.recepcionId) {
        await this.registrarIntegrationLog({
          tenantId,
          operacion,
          correlacionId: idempotencyKey,
          correlacionTipo: 'DEVOLUCION_PROVEEDOR',
          status: 'ERROR',
          requestSummary: { devolucionId: data.devolucionId, numero: data.numeroDevolucion },
          errorMessage: 'Devolución sin recepcionId; no se puede aplicar a CxP automáticamente',
        });
        return;
      }

      const { data: cxp, error: cxpError } = await client
        .from('cuentas_por_pagar')
        .select('id, estado, saldo, total, subtotal, igv, moneda, referencia_id, observaciones')
        .eq('tenant_id', tenantId)
        .eq('referencia_tipo', 'RECEPCION')
        .eq('referencia_id', data.recepcionId)
        .maybeSingle();

      if (cxpError || !cxp) {
        await this.registrarIntegrationLog({
          tenantId,
          operacion,
          correlacionId: idempotencyKey,
          correlacionTipo: 'DEVOLUCION_PROVEEDOR',
          status: 'ERROR',
          requestSummary: {
            devolucionId: data.devolucionId,
            recepcionId: data.recepcionId,
            total: data.total,
          },
          errorMessage: 'No se encontró CxP asociada a la recepción',
        });
        return;
      }

      if (cxp.estado === 'ANULADA') {
        await this.registrarIntegrationLog({
          tenantId,
          operacion,
          correlacionId: idempotencyKey,
          correlacionTipo: 'DEVOLUCION_PROVEEDOR',
          status: 'SUCCESS',
          requestSummary: { cxpId: cxp.id, devolucionId: data.devolucionId },
          responseSummary: { skipped: true, reason: 'CxP ya ANULADA' },
        });
        return;
      }

      const saldo = new Decimal(cxp.saldo ?? 0);
      const total = new Decimal(cxp.total ?? 0);
      const subtotal = new Decimal(cxp.subtotal ?? 0);
      const igv = new Decimal(cxp.igv ?? 0);

      if (saldo.lessThan(total)) {
        await this.registrarIntegrationLog({
          tenantId,
          operacion,
          correlacionId: idempotencyKey,
          correlacionTipo: 'DEVOLUCION_PROVEEDOR',
          status: 'ERROR',
          requestSummary: { cxpId: cxp.id, saldo: cxp.saldo, total: cxp.total },
          errorMessage:
            'CxP tiene pagos aplicados; no se ajusta automáticamente por devolución (requiere proceso contable/manual)',
        });
        return;
      }

      const devolucionTotal = new Decimal(data.total ?? 0).toDecimalPlaces(2);
      const devolucionSubtotal = new Decimal(data.subtotal ?? 0).toDecimalPlaces(2);
      const devolucionIgv = new Decimal(data.igv ?? 0).toDecimalPlaces(2);

      if (devolucionTotal.lte(0)) {
        await this.registrarIntegrationLog({
          tenantId,
          operacion,
          correlacionId: idempotencyKey,
          correlacionTipo: 'DEVOLUCION_PROVEEDOR',
          status: 'SUCCESS',
          requestSummary: { cxpId: cxp.id, devolucionId: data.devolucionId, total: data.total },
          responseSummary: { skipped: true, reason: 'Total devolución <= 0' },
        });
        return;
      }

      const restanteTotal = total.minus(devolucionTotal);

      // Si la devolución cubre todo (o prácticamente todo) y no hay pagos, anulamos la CxP.
      if (restanteTotal.lte(0.01)) {
        await this.anularCuentaPorPagar(
          tenantId,
          cxp.id,
          {
            motivo: 'DEVOLUCION_PROVEEDOR',
            observaciones: `Devolución ${data.numeroDevolucion} (${data.devolucionId}) por ${devolucionTotal.toFixed(
              2,
            )} ${data.moneda}. Motivo: ${data.motivo}`,
          },
          data.emitidoPor ?? undefined,
        );

        await this.registrarIntegrationLog({
          tenantId,
          operacion,
          correlacionId: idempotencyKey,
          correlacionTipo: 'DEVOLUCION_PROVEEDOR',
          status: 'SUCCESS',
          requestSummary: { cxpId: cxp.id, devolucionId: data.devolucionId, total: data.total },
          responseSummary: { estado: 'ANULADA' },
        });
        return;
      }

      const nuevoSubtotal = Decimal.max(subtotal.minus(devolucionSubtotal), 0).toDecimalPlaces(2);
      const nuevoIgv = Decimal.max(igv.minus(devolucionIgv), 0).toDecimalPlaces(2);
      const nuevoTotal = Decimal.max(total.minus(devolucionTotal), 0).toDecimalPlaces(2);
      const nuevoSaldo = Decimal.max(saldo.minus(devolucionTotal), 0).toDecimalPlaces(2);

      const { data: cxpActualizada, error: updateError } = await client
        .from('cuentas_por_pagar')
        .update({
          subtotal: nuevoSubtotal.toNumber(),
          igv: nuevoIgv.toNumber(),
          total: nuevoTotal.toNumber(),
          saldo: nuevoSaldo.toNumber(),
          updated_at: new Date().toISOString(),
          observaciones: cxp.observaciones
            ? `${cxp.observaciones}\nAJUSTE POR DEVOLUCION ${data.numeroDevolucion} (${data.devolucionId}) -${devolucionTotal.toFixed(
                2,
              )} ${data.moneda}. ${data.motivo}`
            : `AJUSTE POR DEVOLUCION ${data.numeroDevolucion} (${data.devolucionId}) -${devolucionTotal.toFixed(
                2,
              )} ${data.moneda}. ${data.motivo}`,
        })
        .eq('tenant_id', tenantId)
        .eq('id', cxp.id)
        .select()
        .single();

      if (updateError || !cxpActualizada) {
        throw new BadRequestException('No se pudo ajustar la CxP por devolución de proveedor');
      }

      // Emitir evento a outbox para integración/contabilidad.
      const eventToInsert = OutboxEventBuilder.build({
        tenantId,
        eventType: 'CuentaPorPagarAjustadaPorDevolucionProveedor',
        aggregateType: 'CuentaPorPagar',
        aggregateId: cxp.id,
        idempotencyKey: `cxp.ajuste.devolucion:${tenantId}:${cxp.id}:${data.devolucionId}`,
        eventData: {
          tenant_id: tenantId,
          cxp_id: cxp.id,
          recepcion_id: data.recepcionId,
          devolucion_id: data.devolucionId,
          numero_devolucion: data.numeroDevolucion,
          moneda: data.moneda,
          ajuste_subtotal: devolucionSubtotal.toNumber(),
          ajuste_igv: devolucionIgv.toNumber(),
          ajuste_total: devolucionTotal.toNumber(),
          subtotal_nuevo: nuevoSubtotal.toNumber(),
          igv_nuevo: nuevoIgv.toNumber(),
          total_nuevo: nuevoTotal.toNumber(),
          saldo_nuevo: nuevoSaldo.toNumber(),
          aplicado_en: new Date().toISOString(),
        },
      });

      const outboxResult: any = await client.from('outbox_events').insert(eventToInsert);
      const outboxError = outboxResult?.error;
      if (outboxError) {
        // No bloquear; pero queda trazado en logs.
        console.error('Error emitiendo outbox CuentaPorPagarAjustadaPorDevolucionProveedor:', outboxError);
      }

      await this.registrarIntegrationLog({
        tenantId,
        operacion,
        correlacionId: idempotencyKey,
        correlacionTipo: 'DEVOLUCION_PROVEEDOR',
        status: 'SUCCESS',
        requestSummary: { cxpId: cxp.id, devolucionId: data.devolucionId, total: data.total },
        responseSummary: {
          subtotal_nuevo: nuevoSubtotal.toNumber(),
          igv_nuevo: nuevoIgv.toNumber(),
          total_nuevo: nuevoTotal.toNumber(),
          saldo_nuevo: nuevoSaldo.toNumber(),
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (error: any) {
      await this.registrarIntegrationLog({
        tenantId,
        operacion,
        correlacionId: idempotencyKey,
        correlacionTipo: 'DEVOLUCION_PROVEEDOR',
        status: 'ERROR',
        requestSummary: { devolucionId: data.devolucionId, recepcionId: data.recepcionId, total: data.total },
        errorMessage: error?.message ?? 'Error aplicando devolución proveedor a CxP',
      });
      throw error;
    }
  }

  async crearCuentaPorPagar(
    tenantId: string,
    dto: CrearCxpDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Validar que el proveedor existe
    const { data: proveedor, error: proveedorError } = await client
      .from('proveedores')
      .select('id, razon_social')
      .eq('tenant_id', tenantId)
      .eq('id', dto.proveedor_id)
      .single();

    if (proveedorError || !proveedor) {
      throw new BadRequestException('Proveedor no encontrado');
    }

    // Validar que no exista una CxP con el mismo número de documento para este proveedor
    const { data: existente } = await client
      .from('cuentas_por_pagar')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('proveedor_id', dto.proveedor_id)
      .eq('numero_documento', dto.numero_documento)
      .maybeSingle();

    if (existente) {
      throw new BadRequestException(
        `Ya existe una cuenta por pagar con el número de documento ${dto.numero_documento} para este proveedor`,
      );
    }

    // Validar que el total sea igual a subtotal + igv
    // ✅ FIX: Usar Decimal.js para evitar errores de punto flotante
    const totalCalculado = new Decimal(dto.subtotal).plus(dto.igv).toDecimalPlaces(2).toNumber();
    if (Math.abs(totalCalculado - dto.total) > 0.01) {
      throw new BadRequestException(
        `El total (${dto.total}) no coincide con subtotal + IGV (${totalCalculado})`,
      );
    }

    // 🔴 TAREA 17: Validar cálculos de retenciones si se implementan en el futuro
    // Nota: Actualmente CxP no tiene campos de retenciones, pero esta validación
    // prepara el código para cuando se agreguen estos campos
    // Si en el futuro se agregan retenciones/percepciones/detracciones a CxP,
    // descomentar y completar esta validación:
    /*
    if (dto.retencion || dto.percepcion || dto.detraccion) {
      const proveedor = await this.obtenerProveedor(dto.proveedor_id, tenantId);
      const empresaConfig = await this.retencionesValidation.obtenerConfiguracionEmpresa(tenantId);
      
      const ajustes = {
        retencion: dto.retencion ?? 0,
        percepcion: dto.percepcion ?? 0,
        detraccion: dto.detraccion ?? 0,
        anticipo: dto.anticipo ?? 0,
      };
      
      const validacion = await this.retencionesValidation.validarCalculoAjustes(
        dto.total,
        ajustes,
        proveedor ? {
          sujeto_retencion: proveedor.sujeto_retencion,
          retencion_tasa: proveedor.retencion_tasa,
          sujeto_percepcion: proveedor.sujeto_percepcion,
          percepcion_tasa: proveedor.percepcion_tasa,
          sujeto_detraccion: proveedor.sujeto_detraccion,
          detraccion_tasa: proveedor.detraccion_tasa,
        } : undefined,
        empresaConfig
      );
      
      if (!validacion.valido) {
        throw new BadRequestException(
          `Error en cálculo de ajustes tributarios: ${validacion.errores.join('; ')}`
        );
      }
    }
    */

    // Calcular fecha de vencimiento según condiciones de pago
    const condicionesPago = dto.condiciones_pago ?? 'CONTADO';
    const diasCredito = dto.dias_credito ?? this.obtenerDiasCreditoPorCondicion(condicionesPago);
    const fechaVencimiento = dto.fecha_vencimiento ?? this.calcularFechaVencimiento(dto.fecha_emision, diasCredito);

    // Crear la cuenta por pagar
    const cxpData = {
      tenant_id: tenantId,
      proveedor_id: dto.proveedor_id,
      orden_id: dto.orden_id ?? null,
      recepcion_id: dto.recepcion_id ?? null,
      numero_documento: dto.numero_documento,
      fecha_emision: dto.fecha_emision,
      fecha_vencimiento: fechaVencimiento,
      condiciones_pago: condicionesPago,
      dias_credito: diasCredito,
      subtotal: this.round2(dto.subtotal),
      igv: this.round2(dto.igv),
      total: this.round2(dto.total),
      saldo: this.round2(dto.total), // Inicialmente el saldo es igual al total
      moneda: dto.moneda ?? 'PEN',
      estado: 'PENDIENTE',
      observaciones: dto.observaciones ?? null,
      created_by: userId ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: cxp, error: cxpError } = await client
      .from('cuentas_por_pagar')
      .insert(cxpData)
      .select()
      .single();

    if (cxpError) {
      console.error('Error creando cuenta por pagar:', cxpError);
      throw new BadRequestException('No se pudo crear la cuenta por pagar');
    }

    // Emitir evento FacturaProveedorRegistrada
    try {
      const eventId = uuidv4();
      const idempotencyKey = `cxp:factura:${tenantId}:${cxp.id}`;

      const eventoPayload: any = {
        tenantId,
        eventId,
        idempotencyKey,
        facturaProvId: cxp.id,
        numeroDocumento: cxp.numero_documento,
        serie: null,
        ordenId: cxp.orden_id,
        recepcionId: cxp.recepcion_id,
        proveedorId: cxp.proveedor_id,
        subtotal: Number(cxp.subtotal),
        igv: Number(cxp.igv),
        total: Number(cxp.total),
        moneda: cxp.moneda,
        fechaEmision: cxp.fecha_emision,
        fechaVencimiento: cxp.fecha_vencimiento,
        estadoComparacion: 'OK',
        emittedAt: new Date().toISOString(),
      };

      this.eventBus.emitFacturaProveedorRegistrada(eventoPayload);
      console.log('✅ Evento FacturaProveedorRegistrada emitido exitosamente');
    } catch (errorEvento) {
      console.error('❌ Error emitiendo evento FacturaProveedorRegistrada:', errorEvento);
    }

    return {
      success: true,
      data: cxp,
    };
  }

  async obtenerCuentaPorPagar(
    tenantId: string,
    id: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    const { data: cxp, error } = await client
      .from('cuentas_por_pagar')
      .select(`
        *,
        proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
          id,
          razon_social,
          ruc,
          email,
          telefono,
          direccion
        ),
        orden:ordenes_compra!cuentas_por_pagar_orden_id_fkey(
          id,
          numero_orden,
          fecha_orden,
          estado
        ),
        recepcion:recepciones!cuentas_por_pagar_recepcion_id_fkey(
          id,
          numero,
          fecha_recepcion,
          estado
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error obteniendo cuenta por pagar:', error);
      throw new BadRequestException('No se pudo obtener la cuenta por pagar');
    }

    if (!cxp) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }

    return {
      success: true,
      data: cxp,
    };
  }

  async listarCuentasPorPagar(
    tenantId: string,
    filtros: FiltrarCxpDto,
  ): Promise<{ success: boolean; data: any[] }> {
    const client = this.supabase.getClient();

    // Construir query base
    let query = client
      .from('cuentas_por_pagar')
      .select(`
        *,
        proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
          id,
          razon_social,
          ruc,
          email
        ),
        orden:ordenes_compra!cuentas_por_pagar_orden_id_fkey(
          id,
          numero_orden
        ),
        recepcion:recepciones!cuentas_por_pagar_recepcion_id_fkey(
          id,
          numero
        )
      `)
      .eq('tenant_id', tenantId)
      .order('fecha_emision', { ascending: false });

    // Aplicar filtros
    if (filtros.estado) {
      query = query.eq('estado', filtros.estado);
    }

    if (filtros.vencimiento_desde) {
      query = query.gte('fecha_vencimiento', filtros.vencimiento_desde);
    }

    if (filtros.vencimiento_hasta) {
      query = query.lte('fecha_vencimiento', filtros.vencimiento_hasta);
    }

    if (filtros.proveedor_id) {
      query = query.eq('proveedor_id', filtros.proveedor_id);
    }

    const { data: cxps, error } = await query;

    if (error) {
      console.error('Error listando cuentas por pagar:', error);
      throw new BadRequestException('No se pudieron obtener las cuentas por pagar');
    }

    return {
      success: true,
      data: cxps || [],
    };
  }

  async actualizarCuentaPorPagar(
    tenantId: string,
    id: string,
    dto: ActualizarCxpDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Verificar que la CxP existe
    const { data: cxpExistente, error: errorExistente } = await client
      .from('cuentas_por_pagar')
      .select('id, estado, proveedor_id, numero_documento, saldo, total')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (errorExistente || !cxpExistente) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }

    // Validar que no esté pagada o anulada
    if (cxpExistente.estado === 'PAGADA') {
      throw new BadRequestException('No se puede modificar una cuenta por pagar que ya está pagada');
    }

    if (cxpExistente.estado === 'ANULADA') {
      throw new BadRequestException('No se puede modificar una cuenta por pagar anulada');
    }

    // Si se está actualizando el número de documento, validar que no exista otro con el mismo número
    if (dto.numero_documento && dto.numero_documento !== cxpExistente.numero_documento) {
      const { data: duplicado } = await client
        .from('cuentas_por_pagar')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('proveedor_id', cxpExistente.proveedor_id)
        .eq('numero_documento', dto.numero_documento)
        .neq('id', id)
        .maybeSingle();

      if (duplicado) {
        throw new BadRequestException(
          `Ya existe otra cuenta por pagar con el número de documento ${dto.numero_documento} para este proveedor`,
        );
      }
    }

    // Si se actualizan montos, validar que el total sea igual a subtotal + igv
    const subtotal = dto.subtotal !== undefined ? dto.subtotal : null;
    const igv = dto.igv !== undefined ? dto.igv : null;
    const total = dto.total !== undefined ? dto.total : null;

    if (subtotal !== null && igv !== null && total !== null) {
      const totalCalculado = this.round2(subtotal + igv);
      if (Math.abs(totalCalculado - total) > 0.01) {
        throw new BadRequestException(
          `El total (${total}) no coincide con subtotal + IGV (${totalCalculado})`,
        );
      }
    }

    // Preparar datos de actualización
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (dto.numero_documento !== undefined) {
      updateData.numero_documento = dto.numero_documento;
    }

    if (dto.fecha_emision !== undefined) {
      updateData.fecha_emision = dto.fecha_emision;
    }

    if (dto.fecha_vencimiento !== undefined) {
      updateData.fecha_vencimiento = dto.fecha_vencimiento;
    }

    if (dto.condiciones_pago !== undefined) {
      updateData.condiciones_pago = dto.condiciones_pago;
    }

    if (dto.dias_credito !== undefined) {
      updateData.dias_credito = dto.dias_credito;
    }

    if (dto.subtotal !== undefined) {
      updateData.subtotal = this.round2(dto.subtotal);
    }

    if (dto.igv !== undefined) {
      updateData.igv = this.round2(dto.igv);
    }

    if (dto.total !== undefined) {
      updateData.total = this.round2(dto.total);
      // Si se actualiza el total y no hay pagos, actualizar el saldo también
      if (cxpExistente.saldo === cxpExistente.total) {
        updateData.saldo = this.round2(dto.total);
      }
    }

    if (dto.moneda !== undefined) {
      updateData.moneda = dto.moneda;
    }

    if (dto.observaciones !== undefined) {
      updateData.observaciones = dto.observaciones;
    }

    // Actualizar la cuenta por pagar
    const { data: cxpActualizada, error: errorActualizar } = await client
      .from('cuentas_por_pagar')
      .update(updateData)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();

    if (errorActualizar) {
      console.error('Error actualizando cuenta por pagar:', errorActualizar);
      throw new BadRequestException('No se pudo actualizar la cuenta por pagar');
    }

    return {
      success: true,
      data: cxpActualizada,
    };
  }

  async aplicarPago(
    tenantId: string,
    cxpId: string,
    dto: AplicarPagoCxpDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    if (this.tesoreriaService) {
      return this.tesoreriaService.registrarPago(
        tenantId,
        {
          cxp_id: cxpId,
          monto: dto.monto,
          fecha_pago: dto.fecha_pago,
          metodo_pago: dto.metodo_pago,
          cuenta_bancaria_id: dto.cuenta_bancaria_id,
          referencia: dto.referencia,
          observaciones: dto.observaciones,
          idempotency_key: dto.idempotency_key,
        },
        userId,
      );
    }

    const client = this.supabase.getClient();

    // Validar que el monto sea positivo
    if (dto.monto <= 0) {
      throw new BadRequestException('El monto del pago debe ser mayor a 0');
    }

    // Obtener la CxP actual
    const { data: cxp, error: errorCxp } = await client
      .from('cuentas_por_pagar')
      .select(`
        id,
        estado,
        saldo,
        total,
        moneda,
        proveedor_id,
        numero_documento,
        proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
          id,
          razon_social,
          ruc
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('id', cxpId)
      .maybeSingle();

    if (errorCxp || !cxp) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }

    // Validar que no esté anulada
    if (cxp.estado === 'ANULADA') {
      throw new BadRequestException('No se puede aplicar pago a una cuenta por pagar anulada');
    }

    // Validar que no esté completamente pagada
    if (cxp.estado === 'PAGADA' || cxp.saldo <= 0) {
      throw new BadRequestException('La cuenta por pagar ya está completamente pagada');
    }

    // Validar que el monto no exceda el saldo pendiente
    if (dto.monto > cxp.saldo) {
      throw new BadRequestException(
        `El monto del pago (${dto.monto}) no puede ser mayor al saldo pendiente (${cxp.saldo})`,
      );
    }

    const proveedorNombre: string | null =
      (cxp as any)?.proveedor?.razon_social ?? null;

    let cuentaBancariaNombre: string | null = null;
    let cuentaSaldoAnterior: number | null = null;

    // Si se especificó cuenta bancaria, validar que existe y tiene saldo suficiente
    if (dto.cuenta_bancaria_id) {
      const { data: cuentaBancaria, error: errorCuenta } = await client
        .from('cuentas_bancarias')
        .select('id, nombre, saldo, moneda, permite_sobregiro, activa')
        .eq('tenant_id', tenantId)
        .eq('id', dto.cuenta_bancaria_id)
        .maybeSingle();

      if (errorCuenta || !cuentaBancaria) {
        throw new BadRequestException('Cuenta bancaria no encontrada');
      }

      cuentaBancariaNombre = cuentaBancaria.nombre;

      if (!cuentaBancaria.activa) {
        throw new BadRequestException('No se pueden registrar pagos desde una cuenta bancaria inactiva');
      }

      // 🔴 CRÍTICO FIX: Validar que la moneda coincida con la CxP
      if (cuentaBancaria.moneda !== cxp.moneda) {
        throw new BadRequestException(
          `La moneda de la cuenta bancaria (${cuentaBancaria.moneda}) no coincide con la moneda de la CxP (${cxp.moneda})`,
        );
      }

      // ✅ VALIDAR SALDO BANCARIO: Verificar que hay fondos suficientes
      const saldoActual = Number(cuentaBancaria.saldo || 0);
      cuentaSaldoAnterior = this.round2(saldoActual);
      const permiteSobregiro = cuentaBancaria.permite_sobregiro || false;

      if (!permiteSobregiro && saldoActual < dto.monto) {
        throw new BadRequestException(
          `Saldo insuficiente en la cuenta bancaria "${cuentaBancaria.nombre}". ` +
          `Disponible: ${saldoActual.toFixed(2)}, Requerido: ${dto.monto.toFixed(2)}`
        );
      }

      // Si permite sobregiro pero el saldo resultante sería muy negativo, alertar
      if (permiteSobregiro && (saldoActual - dto.monto) < -10000) {
        console.warn(
          `⚠️ [CxP] Pago generará sobregiro significativo en cuenta ${cuentaBancaria.nombre}: ` +
          `Saldo actual: ${saldoActual}, Pago: ${dto.monto}, Saldo resultante: ${saldoActual - dto.monto}`
        );
      }
    }

    // Calcular nuevo saldo
    const nuevoSaldo = this.round2(cxp.saldo - dto.monto);

    // Determinar nuevo estado
    let nuevoEstado: string;
    if (nuevoSaldo === 0) {
      nuevoEstado = 'PAGADA';
    } else if (nuevoSaldo < cxp.total) {
      nuevoEstado = 'PARCIAL';
    } else {
      nuevoEstado = cxp.estado;
    }

    // Actualizar la CxP con el nuevo saldo y estado
    const { data: cxpActualizada, error: errorActualizar } = await client
      .from('cuentas_por_pagar')
      .update({
        saldo: nuevoSaldo,
        estado: nuevoEstado,
        ultimo_pago: dto.fecha_pago,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', cxpId)
      .select()
      .single();

    if (errorActualizar) {
      console.error('Error actualizando cuenta por pagar:', errorActualizar);
      throw new BadRequestException('No se pudo aplicar el pago a la cuenta por pagar');
    }

    // Emitir evento PagoProveedorRegistrado
    // Este evento será procesado por el módulo de Tesorería para:
    // 1. Crear el movimiento bancario
    // 2. Actualizar el saldo de la cuenta bancaria
    // 3. Registrar el pago en la tabla de pagos
    try {
      const pagoId = uuidv4();
      const eventId = uuidv4();
      const idempotencyKey =
        dto.idempotency_key ?? `cxp:pago:${tenantId}:${cxpId}:${pagoId}`;
      const cuentaSaldoPosterior =
        cuentaSaldoAnterior !== null ? this.round2(cuentaSaldoAnterior - dto.monto) : null;

      const eventoPayload: PagoProveedorRegistradoEvent = {
        tenantId,
        eventId,
        idempotencyKey,
        cxpId: cxpId,
        pagoId,
        proveedorId: cxp.proveedor_id,
        proveedorNombre: proveedorNombre ?? cxp.proveedor_id,
        numeroDocumento: cxp.numero_documento,
        monto: this.round2(dto.monto),
        moneda: cxp.moneda,
        fecha: dto.fecha_pago,
        metodoPago: dto.metodo_pago,
        cuentaBancariaId: dto.cuenta_bancaria_id ?? null,
        cuentaBancariaNombre,
        referencia: dto.referencia ?? null,
        observaciones: dto.observaciones ?? null,
        saldoAnterior: cxp.saldo,
        saldoNuevo: nuevoSaldo,
        estadoAnterior: cxp.estado,
        estadoNuevo: nuevoEstado,
        createdBy: userId ?? null,
        movimientoBancarioId: null,
        cuentaSaldoAnterior,
        cuentaSaldoNuevo: cuentaSaldoPosterior,
        source: 'cxp.aplicarPago',
      };

      this.eventBus.emitPagoProveedorRegistrado(eventoPayload);
      console.log('✅ Evento PagoProveedorRegistrado emitido exitosamente');
    } catch (errorEvento) {
      console.error('❌ Error emitiendo evento PagoProveedorRegistrado:', errorEvento);
      // No fallar la operación si el evento no se pudo emitir
      // El evento se puede reintentar o procesar manualmente
    }

    return {
      success: true,
      data: {
        cxp: cxpActualizada,
        pago: {
          monto: this.round2(dto.monto),
          fecha_pago: dto.fecha_pago,
          metodo_pago: dto.metodo_pago,
          referencia: dto.referencia,
          saldo_anterior: cxp.saldo,
          saldo_nuevo: nuevoSaldo,
          estado_anterior: cxp.estado,
          estado_nuevo: nuevoEstado,
        },
      },
    };
  }

  async anularCuentaPorPagar(
    tenantId: string,
    cxpId: string,
    dto: AnularCxpDto,
    userId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Obtener la CxP actual
    const { data: cxp, error: errorCxp } = await client
      .from('cuentas_por_pagar')
      .select('id, estado, saldo, total, proveedor_id, numero_documento, tenant_id')
      .eq('tenant_id', tenantId)
      .eq('id', cxpId)
      .maybeSingle();

    if (errorCxp || !cxp) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }

    // Validar que no esté ya anulada
    if (cxp.estado === 'ANULADA') {
      throw new BadRequestException('La cuenta por pagar ya está anulada');
    }

    // Validar que no tenga pagos aplicados (saldo debe ser igual al total)
    if (cxp.saldo < cxp.total) {
      throw new BadRequestException(
        'No se puede anular una cuenta por pagar que tiene pagos aplicados. ' +
        `Saldo actual: ${cxp.saldo}, Total: ${cxp.total}`,
      );
    }

    // Anular la CxP
    const { data: cxpAnulada, error: errorAnular } = await client
      .from('cuentas_por_pagar')
      .update({
        estado: 'ANULADA',
        anulado_at: new Date().toISOString(),
        anulado_by: userId ?? null,
        observaciones: dto.observaciones
          ? `ANULADA: ${dto.motivo}. ${dto.observaciones}`
          : `ANULADA: ${dto.motivo}`,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', cxpId)
      .select()
      .single();

    if (errorAnular) {
      console.error('Error anulando cuenta por pagar:', errorAnular);
      throw new BadRequestException('No se pudo anular la cuenta por pagar');
    }

    // Emitir evento CuentaPorPagarAnulada a outbox_events
    // Este evento será procesado por otros módulos si es necesario
    const eventoPayload = {
      tenant_id: tenantId,
      cxp_id: cxpId,
      proveedor_id: cxp.proveedor_id,
      numero_documento: cxp.numero_documento,
      total: cxp.total,
      motivo: dto.motivo,
      observaciones: dto.observaciones ?? null,
      anulado_by: userId ?? null,
      anulado_at: new Date().toISOString(),
    };

    // Insertar evento en outbox_events usando el builder
    const eventToInsert = OutboxEventBuilder.build({
      tenantId: cxp.tenant_id,
      eventType: 'CuentaPorPagarAnulada',
      aggregateType: 'CuentaPorPagar',
      aggregateId: cxpId,
      idempotencyKey: `cxp.anulada:${tenantId}:${cxpId}`,
      eventData: eventoPayload,
    });

    const { error: errorEvento } = await client
      .from('outbox_events')
      .insert(eventToInsert);

    if (errorEvento) {
      console.error('Error emitiendo evento CuentaPorPagarAnulada:', errorEvento);
      // No fallar la operación si el evento no se pudo emitir
    }

    return {
      success: true,
      data: cxpAnulada,
    };
  }

  async obtenerAgingCxp(
    tenantId: string,
    proveedorId?: string,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Obtener todas las CxP pendientes o parciales
    let query = client
      .from('cuentas_por_pagar')
      .select(`
        id,
        proveedor_id,
        numero_documento,
        fecha_emision,
        fecha_vencimiento,
        total,
        saldo,
        moneda,
        estado,
        proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
          id,
          razon_social,
          ruc
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA']);

    // Filtrar por proveedor si se especifica
    if (proveedorId) {
      query = query.eq('proveedor_id', proveedorId);
    }

    const { data: cxps, error } = await query;

    if (error) {
      console.error('Error obteniendo cuentas por pagar para aging:', error);
      throw new BadRequestException('No se pudo generar el reporte de aging');
    }

    if (!cxps || cxps.length === 0) {
      return {
        success: true,
        data: {
          resumen: {
            rango_0_30: { cantidad: 0, monto: 0 },
            rango_31_60: { cantidad: 0, monto: 0 },
            rango_61_90: { cantidad: 0, monto: 0 },
            rango_mas_90: { cantidad: 0, monto: 0 },
            total: { cantidad: 0, monto: 0 },
          },
          por_proveedor: [],
          detalle: [],
        },
      };
    }

    // Fecha actual para calcular días vencidos
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Inicializar contadores
    const resumen = {
      rango_0_30: { cantidad: 0, monto: 0 },
      rango_31_60: { cantidad: 0, monto: 0 },
      rango_61_90: { cantidad: 0, monto: 0 },
      rango_mas_90: { cantidad: 0, monto: 0 },
      total: { cantidad: 0, monto: 0 },
    };

    const porProveedor = new Map<string, any>();
    const detalle: any[] = [];

    // Procesar cada CxP
    for (const cxp of cxps) {
      const fechaVencimiento = new Date(cxp.fecha_vencimiento);
      fechaVencimiento.setHours(0, 0, 0, 0);

      // Calcular días vencidos (negativos si aún no vence)
      const diasVencidos = Math.floor(
        (hoy.getTime() - fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Determinar rango
      let rango: string;
      if (diasVencidos < 0) {
        rango = 'por_vencer'; // No vencido aún
      } else if (diasVencidos <= 30) {
        rango = 'rango_0_30';
      } else if (diasVencidos <= 60) {
        rango = 'rango_31_60';
      } else if (diasVencidos <= 90) {
        rango = 'rango_61_90';
      } else {
        rango = 'rango_mas_90';
      }

      // Solo contar en el resumen si está vencido
      if (diasVencidos >= 0) {
        if (rango === 'rango_0_30') {
          resumen.rango_0_30.cantidad++;
          resumen.rango_0_30.monto += cxp.saldo;
        } else if (rango === 'rango_31_60') {
          resumen.rango_31_60.cantidad++;
          resumen.rango_31_60.monto += cxp.saldo;
        } else if (rango === 'rango_61_90') {
          resumen.rango_61_90.cantidad++;
          resumen.rango_61_90.monto += cxp.saldo;
        } else if (rango === 'rango_mas_90') {
          resumen.rango_mas_90.cantidad++;
          resumen.rango_mas_90.monto += cxp.saldo;
        }

        resumen.total.cantidad++;
        resumen.total.monto += cxp.saldo;
      }

      // Agregar al detalle
      detalle.push({
        id: cxp.id,
        proveedor_id: cxp.proveedor_id,
        proveedor_razon_social: (cxp.proveedor as any)?.razon_social,
        proveedor_ruc: (cxp.proveedor as any)?.ruc,
        numero_documento: cxp.numero_documento,
        fecha_emision: cxp.fecha_emision,
        fecha_vencimiento: cxp.fecha_vencimiento,
        dias_vencidos: diasVencidos,
        total: this.round2(cxp.total),
        saldo: this.round2(cxp.saldo),
        moneda: cxp.moneda,
        estado: cxp.estado,
        rango: rango,
      });

      // Agregar al resumen por proveedor
      if (!porProveedor.has(cxp.proveedor_id)) {
        porProveedor.set(cxp.proveedor_id, {
          proveedor_id: cxp.proveedor_id,
          proveedor_razon_social: (cxp.proveedor as any)?.razon_social,
          proveedor_ruc: (cxp.proveedor as any)?.ruc,
          rango_0_30: 0,
          rango_31_60: 0,
          rango_61_90: 0,
          rango_mas_90: 0,
          por_vencer: 0,
          total: 0,
          cantidad_cxp: 0,
        });
      }

      const proveedorData = porProveedor.get(cxp.proveedor_id);
      proveedorData.cantidad_cxp++;
      proveedorData.total += cxp.saldo;

      if (rango === 'por_vencer') {
        proveedorData.por_vencer += cxp.saldo;
      } else if (rango === 'rango_0_30') {
        proveedorData.rango_0_30 += cxp.saldo;
      } else if (rango === 'rango_31_60') {
        proveedorData.rango_31_60 += cxp.saldo;
      } else if (rango === 'rango_61_90') {
        proveedorData.rango_61_90 += cxp.saldo;
      } else if (rango === 'rango_mas_90') {
        proveedorData.rango_mas_90 += cxp.saldo;
      }
    }

    // Redondear montos en resumen
    resumen.rango_0_30.monto = this.round2(resumen.rango_0_30.monto);
    resumen.rango_31_60.monto = this.round2(resumen.rango_31_60.monto);
    resumen.rango_61_90.monto = this.round2(resumen.rango_61_90.monto);
    resumen.rango_mas_90.monto = this.round2(resumen.rango_mas_90.monto);
    resumen.total.monto = this.round2(resumen.total.monto);

    // Convertir Map a array y redondear montos
    const porProveedorArray = Array.from(porProveedor.values()).map((p) => ({
      ...p,
      rango_0_30: this.round2(p.rango_0_30),
      rango_31_60: this.round2(p.rango_31_60),
      rango_61_90: this.round2(p.rango_61_90),
      rango_mas_90: this.round2(p.rango_mas_90),
      por_vencer: this.round2(p.por_vencer),
      total: this.round2(p.total),
    }));

    // Ordenar por total descendente
    porProveedorArray.sort((a, b) => b.total - a.total);

    // Ordenar detalle por días vencidos descendente
    detalle.sort((a, b) => b.dias_vencidos - a.dias_vencidos);

    return {
      success: true,
      data: {
        fecha_reporte: hoy.toISOString().split('T')[0],
        resumen,
        por_proveedor: porProveedorArray,
        detalle,
      },
    };
  }

  async obtenerProximosVencimientos(
    tenantId: string,
    filtros: VencimientosCxpDto,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Días por defecto: 30
    const dias = filtros.dias ?? 30;

    // Calcular fecha límite (hoy + días)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const fechaLimite = new Date(hoy);
    fechaLimite.setDate(fechaLimite.getDate() + dias);

    // Construir query base - solo CxP pendientes o parciales
    let query = client
      .from('cuentas_por_pagar')
      .select(`
        id,
        proveedor_id,
        numero_documento,
        fecha_emision,
        fecha_vencimiento,
        condiciones_pago,
        dias_credito,
        subtotal,
        igv,
        total,
        saldo,
        moneda,
        estado,
        observaciones,
        proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
          id,
          razon_social,
          ruc,
          email,
          telefono
        ),
        orden:ordenes_compra!cuentas_por_pagar_orden_id_fkey(
          id,
          numero_orden
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['PENDIENTE', 'PARCIAL'])
      .gte('fecha_vencimiento', hoy.toISOString().split('T')[0])
      .lte('fecha_vencimiento', fechaLimite.toISOString().split('T')[0])
      .order('fecha_vencimiento', { ascending: true });

    // Filtrar por proveedor si se especifica
    if (filtros.proveedor_id) {
      query = query.eq('proveedor_id', filtros.proveedor_id);
    }

    const { data: cxps, error } = await query;

    if (error) {
      console.error('Error obteniendo próximos vencimientos:', error);
      throw new BadRequestException('No se pudieron obtener los próximos vencimientos');
    }

    if (!cxps || cxps.length === 0) {
      return {
        success: true,
        data: {
          fecha_consulta: hoy.toISOString().split('T')[0],
          dias_adelante: dias,
          fecha_limite: fechaLimite.toISOString().split('T')[0],
          resumen: {
            cantidad_total: 0,
            monto_total: 0,
            por_moneda: {},
          },
          vencimientos: [],
        },
      };
    }

    // Calcular resumen
    let cantidadTotal = 0;
    let montoTotal = 0;
    const porMoneda: Record<string, { cantidad: number; monto: number }> = {};

    const vencimientos = cxps.map((cxp) => {
      const fechaVencimiento = new Date(cxp.fecha_vencimiento);
      fechaVencimiento.setHours(0, 0, 0, 0);

      // Calcular días hasta vencimiento
      const diasHastaVencimiento = Math.floor(
        (fechaVencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Actualizar contadores
      cantidadTotal++;
      montoTotal += cxp.saldo;

      if (!porMoneda[cxp.moneda]) {
        porMoneda[cxp.moneda] = { cantidad: 0, monto: 0 };
      }
      porMoneda[cxp.moneda].cantidad++;
      porMoneda[cxp.moneda].monto += cxp.saldo;

      return {
        id: cxp.id,
        proveedor_id: cxp.proveedor_id,
        proveedor_razon_social: (cxp.proveedor as any)?.razon_social,
        proveedor_ruc: (cxp.proveedor as any)?.ruc,
        proveedor_email: (cxp.proveedor as any)?.email,
        proveedor_telefono: (cxp.proveedor as any)?.telefono,
        numero_documento: cxp.numero_documento,
        orden_numero: (cxp.orden as any)?.numero_orden,
        fecha_emision: cxp.fecha_emision,
        fecha_vencimiento: cxp.fecha_vencimiento,
        dias_hasta_vencimiento: diasHastaVencimiento,
        condiciones_pago: cxp.condiciones_pago,
        dias_credito: cxp.dias_credito,
        subtotal: this.round2(cxp.subtotal),
        igv: this.round2(cxp.igv),
        total: this.round2(cxp.total),
        saldo: this.round2(cxp.saldo),
        moneda: cxp.moneda,
        estado: cxp.estado,
        observaciones: cxp.observaciones,
      };
    });

    // Redondear montos en porMoneda
    Object.keys(porMoneda).forEach((moneda) => {
      porMoneda[moneda].monto = this.round2(porMoneda[moneda].monto);
    });

    return {
      success: true,
      data: {
        fecha_consulta: hoy.toISOString().split('T')[0],
        dias_adelante: dias,
        fecha_limite: fechaLimite.toISOString().split('T')[0],
        resumen: {
          cantidad_total: cantidadTotal,
          monto_total: this.round2(montoTotal),
          por_moneda: porMoneda,
        },
        vencimientos,
      },
    };
  }

  /**
   * ✅ FIX: Usar Decimal.js para redondeo preciso a 2 decimales
   * @param value Valor a redondear
   * @returns Valor redondeado con precisión decimal
   */
  private round2(value: number): number {
    return new Decimal(value).toDecimalPlaces(2).toNumber();
  }

  /**
   * Obtiene los días de crédito según las condiciones de pago
   * @param condicionesPago - Condiciones de pago (CONTADO, CREDITO_7, CREDITO_15, etc.)
   * @returns Número de días de crédito
   */
  private obtenerDiasCreditoPorCondicion(condicionesPago: string): number {
    const mapeoCondiciones: Record<string, number> = {
      'CONTADO': 0,
      'CREDITO_7': 7,
      'CREDITO_15': 15,
      'CREDITO_30': 30,
      'CREDITO_45': 45,
      'CREDITO_60': 60,
      'CREDITO_90': 90,
    };

    return mapeoCondiciones[condicionesPago] ?? 0;
  }

  /**
   * Calcula la fecha de vencimiento sumando días de crédito a la fecha de emisión
   * @param fechaEmision - Fecha de emisión en formato ISO (YYYY-MM-DD)
   * @param diasCredito - Número de días de crédito
   * @returns Fecha de vencimiento en formato ISO (YYYY-MM-DD)
   */
  private calcularFechaVencimiento(fechaEmision: string, diasCredito: number): string {
    const fecha = new Date(fechaEmision);
    fecha.setDate(fecha.getDate() + diasCredito);
    return fecha.toISOString().split('T')[0];
  }

  /**
   * Obtiene el historial de pagos de una cuenta por pagar
   * @param tenantId - ID del tenant
   * @param cxpId - ID de la cuenta por pagar
   * @returns Historial de pagos ordenado por fecha descendente
   */
  async obtenerHistorialPagos(
    tenantId: string,
    cxpId: string,
  ): Promise<{ success: boolean; data: any[] }> {
    const client = this.supabase.getClient();

    // Verificar que la CxP existe
    const { data: cxp, error: errorCxp } = await client
      .from('cuentas_por_pagar')
      .select('id, numero_documento')
      .eq('tenant_id', tenantId)
      .eq('id', cxpId)
      .maybeSingle();

    if (errorCxp || !cxp) {
      throw new NotFoundException('Cuenta por pagar no encontrada');
    }

    // Obtener los movimientos bancarios relacionados con esta CxP
    const { data: pagos, error: errorPagos } = await client
      .from('movimientos_bancarios')
      .select(`
        id,
        fecha,
        monto,
        tipo,
        descripcion,
        referencia,
        metodo_pago,
        conciliado,
        cuenta_bancaria_id,
        created_at,
        cuenta_bancaria:cuentas_bancarias!movimientos_bancarios_cuenta_bancaria_id_fkey(
          id,
          banco,
          numero_cuenta,
          tipo_cuenta,
          moneda
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('cxp_id', cxpId)
      .eq('tipo', 'CARGO') // Los pagos a proveedores son CARGO
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    if (errorPagos) {
      console.error('Error obteniendo historial de pagos:', errorPagos);
      throw new BadRequestException('No se pudo obtener el historial de pagos');
    }

    return {
      success: true,
      data: pagos || [],
    };
  }

  /**
   * Obtener proveedores con mayor deuda
   * Retorna un ranking de proveedores ordenados por el monto total de deuda pendiente
   */
  async obtenerProveedoresMayorDeuda(
    tenantId: string,
    limite?: number,
  ): Promise<{ success: boolean; data: any }> {
    const client = this.supabase.getClient();

    // Obtener todas las CxP pendientes o parciales agrupadas por proveedor
    const { data: cxps, error } = await client
      .from('cuentas_por_pagar')
      .select(`
        proveedor_id,
        saldo,
        moneda,
        proveedor:proveedores!cuentas_por_pagar_proveedor_id_fkey(
          id,
          razon_social,
          ruc,
          email,
          telefono
        )
      `)
      .eq('tenant_id', tenantId)
      .in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA']);

    if (error) {
      console.error('Error obteniendo proveedores con mayor deuda:', error);
      throw new BadRequestException('No se pudo generar el reporte de proveedores con mayor deuda');
    }

    if (!cxps || cxps.length === 0) {
      return {
        success: true,
        data: {
          fecha_reporte: new Date().toISOString().split('T')[0],
          proveedores: [],
          total_deuda: 0,
          total_proveedores: 0,
        },
      };
    }

    // Agrupar por proveedor y sumar deudas
    const proveedoresMap = new Map<string, any>();

    for (const cxp of cxps) {
      if (!proveedoresMap.has(cxp.proveedor_id)) {
        proveedoresMap.set(cxp.proveedor_id, {
          proveedor_id: cxp.proveedor_id,
          razon_social: (cxp.proveedor as any)?.razon_social,
          ruc: (cxp.proveedor as any)?.ruc,
          email: (cxp.proveedor as any)?.email,
          telefono: (cxp.proveedor as any)?.telefono,
          deuda_total: 0,
          cantidad_cxp: 0,
          deuda_por_moneda: {} as Record<string, number>,
        });
      }

      const proveedorData = proveedoresMap.get(cxp.proveedor_id);
      proveedorData.deuda_total += cxp.saldo;
      proveedorData.cantidad_cxp++;

      // Agrupar por moneda
      if (!proveedorData.deuda_por_moneda[cxp.moneda]) {
        proveedorData.deuda_por_moneda[cxp.moneda] = 0;
      }
      proveedorData.deuda_por_moneda[cxp.moneda] += cxp.saldo;
    }

    // Convertir a array y ordenar por deuda total descendente
    let proveedoresArray = Array.from(proveedoresMap.values()).map((p) => ({
      ...p,
      deuda_total: this.round2(p.deuda_total),
      deuda_por_moneda: Object.entries(p.deuda_por_moneda).reduce(
        (acc, [moneda, monto]) => {
          acc[moneda] = this.round2(monto as number);
          return acc;
        },
        {} as Record<string, number>,
      ),
    }));

    // Ordenar por deuda total descendente
    proveedoresArray.sort((a, b) => b.deuda_total - a.deuda_total);

    // Aplicar límite si se especifica
    if (limite && limite > 0) {
      proveedoresArray = proveedoresArray.slice(0, limite);
    }

    // Calcular totales
    const totalDeuda = proveedoresArray.reduce((sum, p) => sum + p.deuda_total, 0);

    return {
      success: true,
      data: {
        fecha_reporte: new Date().toISOString().split('T')[0],
        proveedores: proveedoresArray,
        total_deuda: this.round2(totalDeuda),
        total_proveedores: proveedoresArray.length,
        total_proveedores_con_deuda: proveedoresMap.size,
      },
    };
  }
}
