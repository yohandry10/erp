import { Injectable, BadRequestException, NotFoundException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { v4 as uuidv4 } from 'uuid';
import { CrearCxpDto, FiltrarCxpDto, ActualizarCxpDto, AplicarPagoCxpDto, AnularCxpDto, VencimientosCxpDto } from './dto';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';
import { OutboxEventBuilder } from '../../../shared/outbox/outbox-event.interface';
import Decimal from 'decimal.js';
import { DevolucionProveedorEmitidaEvent } from '../../../shared/events/event-bus.service';
import { TesoreriaService } from '../tesoreria/tesoreria.service';
import { createHash } from 'crypto';
import { fechaHoyDelTenant } from '../../../shared/utils/fecha-tenant.util';

@Injectable()
export class CxpService {
  private readonly logger = new Logger(CxpService.name);

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
        this.logger.error(
          `IDEMPOTENCY_CHECK_FAILURE op=${operacion} key=${idempotencyKey}: ${error.message}`,
        );
        // Fail-closed: if we can't verify, assume already processed to prevent duplicates
        return true;
      }

      return Boolean(data?.id);
    } catch (err) {
      this.logger.error(
        `IDEMPOTENCY_CHECK_FAILURE op=${operacion} key=${idempotencyKey}: ${err?.message ?? err}`,
      );
      return true;
    }
  }

  async aplicarDevolucionProveedorEmitida(
    tenantId: string,
    data: DevolucionProveedorEmitidaEvent,
  ): Promise<void> {
    throw new ServiceUnavailableException(
      'El ajuste de CxP por devolución se ejecuta exclusivamente en la RPC atómica de devolución de proveedor',
    );

    /* istanbul ignore next -- writer legado bloqueado; se conserva temporalmente por compatibilidad binaria */
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

      const outboxResult: any = await client.rpc('enqueue_outbox_event_tx', {
        p_event: eventToInsert,
      });
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
    const tipoDocumento = this.normalizarTipoDocumentoCompra(dto.tipo_documento);
    const moneda = String(dto.moneda ?? 'PEN').trim().toUpperCase();

    if (moneda !== 'PEN' && (!Number.isFinite(dto.tipo_cambio) || Number(dto.tipo_cambio) <= 0)) {
      throw new BadRequestException('El tipo de cambio es obligatorio para documentos en moneda extranjera');
    }
    if (
      tipoDocumento === 'NOTA_CREDITO'
      && (!dto.documento_referencia_tipo
        || !dto.documento_referencia_serie
        || !dto.documento_referencia_numero
        || !dto.documento_referencia_fecha)
    ) {
      throw new BadRequestException('La nota de crédito requiere los datos completos del comprobante modificado');
    }

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

    const ajustesTributarios = {
      retencion: this.round2(dto.retencion ?? 0),
      percepcion: this.round2(dto.percepcion ?? 0),
      detraccion: this.round2(dto.detraccion ?? 0),
      anticipo: this.round2(dto.anticipo ?? 0),
    };
    const tieneAjustesTributarios = Object.values(ajustesTributarios).some((monto) => monto > 0);

    if ((ajustesTributarios.anticipo > 0) !== Boolean(dto.anticipo_id)) {
      throw new BadRequestException(
        'Un anticipo aplicado a la factura exige anticipo_id y no se admite un ID sin monto',
      );
    }

    if (tieneAjustesTributarios) {
      const empresaConfig = await this.retencionesValidation.obtenerConfiguracionEmpresa(tenantId);

      const validacion = await this.retencionesValidation.validarCalculoAjustes(
        dto.total,
        ajustesTributarios,
        undefined,
        empresaConfig
      );

      if (!validacion.valido) {
        throw new BadRequestException(
          `Error en cálculo de ajustes tributarios: ${validacion.errores.join('; ')}`
        );
      }

      const saldoCalculado = this.round2(
        Math.max(
          dto.total
          - ajustesTributarios.retencion
          - ajustesTributarios.detraccion
          - ajustesTributarios.anticipo
          + ajustesTributarios.percepcion,
          0,
        ),
      );
      const validacionSaldo = this.retencionesValidation.validarMontoPendiente(
        dto.total,
        ajustesTributarios,
        saldoCalculado,
      );

      if (!validacionSaldo.valido) {
        throw new BadRequestException(`Error en saldo de CxP con ajustes tributarios: ${validacionSaldo.error}`);
      }
    }

    const saldoInicial = tieneAjustesTributarios
      ? this.retencionesValidation.validarMontoPendiente(
          dto.total,
          ajustesTributarios,
          this.round2(
            Math.max(
              dto.total
              - ajustesTributarios.retencion
              - ajustesTributarios.detraccion
              - ajustesTributarios.anticipo
              + ajustesTributarios.percepcion,
              0,
            ),
          ),
        ).montoEsperado
      : this.round2(dto.total);
    const estadoInicial =
      saldoInicial <= 0
        ? 'PAGADA'
        : saldoInicial < this.round2(dto.total)
          ? 'PARCIAL'
          : 'PENDIENTE';

    // Calcular fecha de vencimiento según condiciones de pago.
    // Ojo: un proveedor puede tener condiciones_pago='CREDITO_30' pero dias_credito=0
    // (el modal no deriva los días). Con `??`, ese 0 ganaba y la CxP vencía el mismo
    // día. Se usa dias_credito solo si es positivo; si no, se deriva de la condición.
    const condicionesPago = dto.condiciones_pago ?? 'CONTADO';
    const diasCredito = dto.dias_credito && dto.dias_credito > 0
      ? dto.dias_credito
      : this.obtenerDiasCreditoPorCondicion(condicionesPago);
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
      saldo: saldoInicial,
      saldo_pendiente: saldoInicial,
      retencion_total: ajustesTributarios.retencion,
      percepcion_total: ajustesTributarios.percepcion,
      detraccion_total: ajustesTributarios.detraccion,
      anticipo_total: ajustesTributarios.anticipo,
      moneda,
      tipo_documento: tipoDocumento,
      // Sin clasificar, el destino es GRAVADAS: el comportamiento de siempre.
      destino_credito_fiscal: dto.destino_credito_fiscal ?? 'GRAVADAS',
      codigo_detraccion: dto.codigo_detraccion ?? null,
      referencia_tipo: dto.referencia_tipo ?? (dto.recepcion_id ? 'RECEPCION' : null),
      referencia_id: dto.referencia_id ?? dto.recepcion_id ?? null,
      fiscal_metadata: {
        serie: dto.serie ?? null,
        tipo_cambio: dto.tipo_cambio ?? (moneda === 'PEN' ? 1 : null),
        anticipo_id: dto.anticipo_id ?? null,
        documento_referencia_tipo: dto.documento_referencia_tipo ?? null,
        documento_referencia_serie: dto.documento_referencia_serie ?? null,
        documento_referencia_numero: dto.documento_referencia_numero ?? null,
        documento_referencia_fecha: dto.documento_referencia_fecha ?? null,
      },
      anticipo_id: dto.anticipo_id ?? null,
      // Cotización con la que se contabiliza el documento. Sin ella la
      // diferencia de cambio del saldo no es calculable al cierre.
      tipo_cambio_origen:
        dto.tipo_cambio && dto.tipo_cambio > 0 ? dto.tipo_cambio : null,
      estado: estadoInicial,
      observaciones: dto.observaciones ?? null,
      created_by: userId ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const eventId = uuidv4();
    const idempotencyKey = `cxp:factura:${tenantId}:${dto.proveedor_id}:${dto.numero_documento.trim().toUpperCase()}`;
    const { data: cxpResult, error: cxpError } = await client.rpc(
      'crear_factura_proveedor_tx',
      {
        p_tenant_id: tenantId,
        p_cxp: cxpData,
        p_event_id: eventId,
        p_idempotency_key: idempotencyKey,
      },
    );
    const cxp = Array.isArray(cxpResult) ? cxpResult[0] : cxpResult;

    if (cxpError || !cxp?.id) {
      console.error('Error creando cuenta por pagar:', cxpError);
      throw new BadRequestException('No se pudo crear la cuenta por pagar');
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
  ): Promise<{ success: boolean; data: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const client = this.supabase.getClient();
    const page = filtros.page && filtros.page > 0 ? filtros.page : 1;
    const limit = filtros.limit && filtros.limit > 0 ? Math.min(filtros.limit, 100) : 50;
    const offset = (page - 1) * limit;

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
      `, { count: 'exact' })
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

    const { data: cxps, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('Error listando cuentas por pagar:', error);
      throw new BadRequestException('No se pudieron obtener las cuentas por pagar');
    }

    return {
      success: true,
      data: cxps || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async actualizarCuentaPorPagar(
    tenantId: string,
    id: string,
    dto: ActualizarCxpDto,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<{ success: boolean; data: any }> {
    if (!userId) throw new BadRequestException('Se requiere un usuario autenticado');
    const key = idempotencyKey?.trim() || `cxp-update:${createHash('sha256')
      .update(JSON.stringify({ tenantId, id, dto, userId }))
      .digest('hex')}`;
    const { data: rpcData, error: rpcError } = await this.supabase.getClient().rpc('gestionar_cxp_tx', {
      p_tenant_id: tenantId, p_cxp_id: id, p_actor_id: userId, p_action: 'UPDATE_TERMS',
      p_payload: dto, p_idempotency_key: key,
    });
    if (rpcError) throw new BadRequestException(rpcError.message || 'No se pudo actualizar la cuenta por pagar');
    const result: any = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return { success: true, data: result?.cuenta ?? result };

    /* istanbul ignore next -- implementación legacy inalcanzable; retirar tras ventana compatible */
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
    dto = {
      ...dto,
      monto: this.normalizarMontoPago(dto.monto),
      fecha_pago: this.normalizarFechaPago(dto.fecha_pago),
      idempotency_key: dto.idempotency_key?.trim() || undefined,
    };

    if (!this.tesoreriaService) {
      throw new ServiceUnavailableException(
        'El writer transaccional de tesoreria no esta disponible; el pago no fue aplicado',
      );
    }

    return this.tesoreriaService.registrarPago(
      tenantId,
      {
        cxp_id: cxpId,
        monto: dto.monto,
        fecha_pago: dto.fecha_pago,
        metodo_pago: dto.metodo_pago,
        cuenta_bancaria_id: dto.cuenta_bancaria_id,
        sesion_caja_id: dto.sesion_caja_id,
        referencia: dto.referencia,
        observaciones: dto.observaciones,
        idempotency_key: dto.idempotency_key,
      },
      userId,
    );
  }

  async anularCuentaPorPagar(
    tenantId: string,
    cxpId: string,
    dto: AnularCxpDto,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<{ success: boolean; data: any }> {
    if (!userId) throw new BadRequestException('Se requiere un usuario autenticado');
    const key = idempotencyKey?.trim() || `cxp-cancel:${createHash('sha256')
      .update(JSON.stringify({ tenantId, cxpId, dto, userId }))
      .digest('hex')}`;
    const { data: rpcData, error: rpcError } = await this.supabase.getClient().rpc('gestionar_cxp_tx', {
      p_tenant_id: tenantId, p_cxp_id: cxpId, p_actor_id: userId, p_action: 'CANCEL',
      p_payload: dto, p_idempotency_key: key,
    });
    if (rpcError) throw new BadRequestException(rpcError.message || 'No se pudo anular la cuenta por pagar');
    const result: any = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return { success: true, data: result?.cuenta ?? result };

    /* istanbul ignore next -- implementación legacy inalcanzable; retirar tras ventana compatible */
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
      .rpc('enqueue_outbox_event_tx', { p_event: eventToInsert });

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
      // new Date("2026-07-29") es medianoche UTC, que en Lima cae el dia 28: el
      // vencimiento retrocedia una jornada y toda la antiguedad salia con un dia
      // de mas. Una deuda que vencia hoy figuraba con 1 dia de mora.
      const fechaVencimiento = this.parseFechaLocal(cxp.fecha_vencimiento);

      // Calcular días vencidos (negativos si aún no vence)
      const diasVencidos = Math.floor(
        (hoy.getTime() - fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Una deuda vence al dia siguiente de su fecha: el mismo dia todavia se
      // puede pagar. Contarla como vencida ese dia hacia que el aging dijera
      // "1 cuenta vencida" mientras la tarjeta de resumen decia 0.
      let rango: string;
      if (diasVencidos <= 0) {
        rango = 'por_vencer'; // Aún dentro de plazo
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
      if (diasVencidos > 0) {
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
      // new Date("2026-07-29") es medianoche UTC, que en Lima cae el dia 28: el
      // vencimiento retrocedia una jornada y toda la antiguedad salia con un dia
      // de mas. Una deuda que vencia hoy figuraba con 1 dia de mora.
      const fechaVencimiento = this.parseFechaLocal(cxp.fecha_vencimiento);

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
  /**
   * Catalogo de tasas del SPOT vigentes a una fecha.
   *
   * Lo necesita quien registra la compra: el codigo de detraccion no se sabe de
   * memoria y equivocarlo cuesta la multa por no depositar mas la perdida del
   * credito fiscal. La tabla es comun a todos los contribuyentes --las tasas las
   * fija SUNAT-- asi que no lleva `tenant_id`.
   */
  async listarTasasDetraccion(tenantId: string, fecha?: string): Promise<any> {
    const cliente = this.supabase.getClient();
    // La fecha decide que tasas salen, asi que sale del calendario del
    // contribuyente y no del reloj del servidor.
    const alDia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ? fecha
      : await fechaHoyDelTenant(cliente, tenantId);

    const { data, error } = await cliente
      .from('tasas_detraccion')
      .select('codigo, descripcion, anexo, tasa, importe_minimo')
      .lte('vigente_desde', alDia)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${alDia}`)
      .order('codigo');

    if (error) {
      throw new BadRequestException(`No se pudo leer el catalogo de detracciones: ${error.message}`);
    }

    return { success: true, data: data ?? [] };
  }

  private round2(value: number): number {
    return new Decimal(value).toDecimalPlaces(2).toNumber();
  }

  private normalizarMontoPago(value: number): number {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('El monto del pago debe ser un número válido');
    }

    const cents = amount * 100;
    if (Math.abs(cents - Math.round(cents)) > 1e-9) {
      throw new BadRequestException('El monto del pago debe tener máximo 2 decimales');
    }

    return this.round2(amount);
  }


  private normalizarFechaPago(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('La fecha de pago debe tener formato YYYY-MM-DD');
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('La fecha de pago debe ser una fecha válida');
    }

    return value;
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
          fecha_reporte: await fechaHoyDelTenant(this.supabase.getClient(), tenantId),
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
        fecha_reporte: await fechaHoyDelTenant(this.supabase.getClient(), tenantId),
        proveedores: proveedoresArray,
        total_deuda: this.round2(totalDeuda),
        total_proveedores: proveedoresArray.length,
        total_proveedores_con_deuda: proveedoresMap.size,
      },
    };
  }

  /**
   * Interpreta una fecha sin hora en la zona local. Postgres devuelve YYYY-MM-DD
   * y el constructor de Date lo trata como UTC, lo que en zonas negativas mueve
   * la fecha al dia anterior.
   */
  private parseFechaLocal(valor: string | Date): Date {
    if (valor instanceof Date) return valor;

    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ''));
    if (!partes) return new Date(valor);

    return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  }

  private normalizarTipoDocumentoCompra(valor?: string): string {
    const clave = String(valor ?? 'FACTURA').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const tipos: Record<string, string> = {
      '01': 'FACTURA',
      FACTURA: 'FACTURA',
      '07': 'NOTA_CREDITO',
      NOTA_CREDITO: 'NOTA_CREDITO',
      '08': 'NOTA_DEBITO',
      NOTA_DEBITO: 'NOTA_DEBITO',
      '02': 'RECIBO_HONORARIOS',
      RECIBO_HONORARIOS: 'RECIBO_HONORARIOS',
    };
    const normalizado = tipos[clave];
    if (!normalizado) {
      throw new BadRequestException(`Tipo de documento de compra no soportado: ${valor}`);
    }
    return normalizado;
  }
}
