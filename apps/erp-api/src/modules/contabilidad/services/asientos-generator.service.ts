import { Injectable, Logger, Optional } from '@nestjs/common';
import { cuadranImportes, sumarImportes } from '../../../shared/utils/cuadre-contable.util';
import { OnEvent } from '@nestjs/event-emitter';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodosService } from './periodos.service';
import { PlanCuenta, PlanCuentasService } from './plan-cuentas.service';
import { DocumentoFiscalGeneradoEvent } from '../../../shared/events/event-bus.service';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

export interface AsientoContable {
  id?: string;
  tenant_id: string;
  numero_asiento: number;
  codigo?: string;
  fecha: string;
  concepto: string;
  referencia?: string;
  total_debe: number;
  total_haber: number;
  estado: string;
  source_event_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DetalleAsiento {
  cuenta_id: string;
  debe: number;
  haber: number;
  concepto: string;
  centro_costo_id?: string;
}

@Injectable()
export class AsientosGeneratorService {
  private readonly logger = new Logger(AsientosGeneratorService.name);
  private static readonly activeSourceEventIds = new Set<string>();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly periodosService: PeriodosService,
    private readonly planCuentasService: PlanCuentasService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  /**
   * Genera un asiento contable validando que el período esté abierto
   * @param tenantId - ID del tenant
   * @param fecha - Fecha del asiento
   * @param concepto - Concepto del asiento
   * @param detalles - Detalles del asiento (debe/haber)
   * @param referencia - Referencia opcional (ej: factura, recibo)
   * @param sourceEventId - ID del evento origen para idempotencia
   * @returns Asiento contable creado
   */
  async generarAsiento(
    tenantId: string,
    fecha: Date,
    concepto: string,
    detalles: DetalleAsiento[],
    referencia?: string,
    sourceEventId?: string
  ): Promise<AsientoContable> {
    // ✅ VALIDAR PERÍODO CONTABLE ABIERTO
    await this.periodosService.validarPeriodoAbierto(tenantId, fecha);

    // Validar que el asiento cuadre (debe = haber)
    const totalDebe = sumarImportes(detalles.map((d) => d.debe));
    const totalHaber = sumarImportes(detalles.map((d) => d.haber));

    // Exacto: `> 0.01` dejaba pasar un descuadre de justo un céntimo, y el writer
    // que recibe esto lo rechaza con `v_total_debe <> v_total_haber`. La compuerta
    // de aquí tiene que exigir lo mismo que la de allí.
    if (!cuadranImportes(totalDebe, totalHaber)) {
      throw new Error(
        `El asiento no cuadra: Debe=${totalDebe}, Haber=${totalHaber}`
      );
    }

    const localLockKey = sourceEventId ? `${tenantId}:${sourceEventId}` : null;
    if (localLockKey) {
      if (AsientosGeneratorService.activeSourceEventIds.has(localLockKey)) {
        const asientoCreadoPorOtroFlujo = await this.waitForLocalSourceEventTurn(
          tenantId,
          sourceEventId,
          localLockKey
        );
        if (asientoCreadoPorOtroFlujo) {
          return asientoCreadoPorOtroFlujo;
        }

        throw new Error(
          `No se pudo verificar el asiento contable para evento concurrente ${sourceEventId}; se reintentara el procesamiento`
        );
      }

      AsientosGeneratorService.activeSourceEventIds.add(localLockKey);
    }

    try {
      // Verificar idempotencia si se proporciona sourceEventId. La exclusión fuerte
      // se delega a la constraint única en BD; el lock local solo evita carreras
      // dentro del mismo proceso Node. No usamos advisory locks de sesión porque en
      // PostgREST/Supabase pueden quedar atados a conexiones del pool.
      if (sourceEventId) {
        const asientoExistente = await this.buscarAsientoPorEvento(
          tenantId,
          sourceEventId
        );
        if (asientoExistente) {
          this.logger.warn(
            `⚠️ [Asientos] Asiento ya existe para evento ${sourceEventId}, retornando existente`
          );
          return asientoExistente;
        }
      }

      // Cabecera y detalles forman un solo agregado contable. Una compensación
      // posterior no equivale a rollback si el proceso cae entre llamadas.
      const { data: asiento, error: asientoError } = await this.supabaseService
        .getClient()
        .rpc('crear_asiento_con_detalles_tx', {
          p_tenant_id: tenantId,
          p_asiento: {
            fecha: fecha.toISOString(),
            concepto,
            descripcion: concepto,
            referencia: referencia ?? null,
            estado: 'CONFIRMADO',
            source_event_id: sourceEventId ?? null
          },
          p_detalles: detalles.map(detalle => ({
            cuenta_id: detalle.cuenta_id,
            debe: detalle.debe,
            haber: detalle.haber,
            concepto: detalle.concepto,
            centro_costo_id: detalle.centro_costo_id ?? null
          }))
        });

      if (asientoError) {
        if (sourceEventId && this.isSourceEventUniqueViolation(asientoError)) {
          const asientoExistente = await this.waitForExistingAsiento(
            tenantId,
            sourceEventId
          );
          if (asientoExistente) {
            this.logger.warn(
              `⚠️ [Asientos] Inserción idempotente detectó asiento existente para evento ${sourceEventId}; retornando ${asientoExistente.id}`
            );
            return asientoExistente;
          }
        }

        console.error('❌ [Asientos] Error creando asiento:', asientoError);
        throw new Error(`Error creando asiento contable: ${asientoError.message}`);
      }

      if (!asiento?.id) throw new Error('La transacción contable no retornó un asiento válido');

      console.log(
        `✅ [Asientos] Asiento ${asiento.codigo ?? asiento.numero_asiento ?? asiento.id} creado exitosamente para tenant ${tenantId}`
      );

      const asientoFinal = sourceEventId
        ? await this.consolidarAsientoUnicoPorEvento(tenantId, sourceEventId, asiento as AsientoContable)
        : asiento;

      return asientoFinal as AsientoContable;
    } finally {
      if (localLockKey) {
        AsientosGeneratorService.activeSourceEventIds.delete(localLockKey);
      }
    }
  }

  @OnEvent('documento.fiscal.generado')
  async handleDocumentoFiscalGenerado(evento: DocumentoFiscalGeneradoEvent) {
    try {
      const paisId = evento.paisId ?? 1;
      const plantilla = await this.obtenerPlantillaAsientoVenta(paisId, evento.tipoDocumento);
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(evento.tenantId, [
        plantilla.cuenta_debe_codigo,
        plantilla.cuenta_haber_ventas_codigo,
        plantilla.cuenta_haber_impuesto_codigo,
      ]);

      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get(plantilla.cuenta_debe_codigo)!.id,
          debe: this.round2(evento.total),
          haber: 0,
          concepto: `Cuenta por cobrar ${evento.serie}-${evento.numero}`,
        },
        {
          cuenta_id: cuentas.get(plantilla.cuenta_haber_ventas_codigo)!.id,
          debe: 0,
          haber: this.round2(evento.subtotal),
          concepto: `Ingresos por venta ${evento.serie}-${evento.numero}`,
        },
        {
          cuenta_id: cuentas.get(plantilla.cuenta_haber_impuesto_codigo)!.id,
          debe: 0,
          haber: this.round2(evento.impuesto),
          concepto: `Impuestos por pagar ${evento.serie}-${evento.numero}`,
        },
      ];

      await this.generarAsiento(
        evento.tenantId,
        new Date(evento.fechaEmision),
        `Venta ${evento.serie}-${evento.numero}`,
        detalles,
        evento.documentoId,
        evento.eventId,
      );
    } catch (error) {
      this.logger.error(
        `❌ [Asientos] Error generando asiento para documento ${evento.documentoId}:`,
        error,
      );
    }
  }

  /**
   * Marca un evento como procesado en la tabla outbox_events
   * @param eventId - ID del evento a marcar como procesado
   */
  async marcarEventoComoProcesado(eventId: string): Promise<void> {
    const claim = this.tenantContext?.getOutboxClaim();
    if (!claim || (claim.eventId && claim.eventId !== eventId)) {
      return;
    }
    const { data, error } = await this.supabaseService.getClient().rpc(
      'complete_outbox_event_tx',
      { p_id: claim.eventRowId, p_claim_token: claim.claimToken },
    );
    if (error) {
      throw new Error(`No se pudo completar evento ${eventId}: ${error.message}`);
    }
    if (data !== true && !(await this.eventoTieneEstado(eventId, ['completed']))) {
      throw new Error(`OUTBOX_CLAIM_LOST:${claim.eventRowId}`);
    }
  }

  /**
   * Marca un evento como fallido en la tabla outbox_events
   * @param eventId - ID del evento a marcar como fallido
   * @param errorMessage - Mensaje de error
   */
  async marcarEventoComoFallido(
    eventId: string,
    errorMessage: string
  ): Promise<void> {
    const maxRetries = 3;
    const claim = this.tenantContext?.getOutboxClaim();
    if (!claim || (claim.eventId && claim.eventId !== eventId)) {
      return;
    }
    const truncatedMessage = errorMessage.length > 500
      ? `${errorMessage.substring(0, 497)}...`
      : errorMessage;
    const { data, error } = await this.supabaseService.getClient().rpc(
      'fail_outbox_event_tx',
      {
        p_id: claim.eventRowId,
        p_claim_token: claim.claimToken,
        p_error: truncatedMessage,
        p_next_retry_at: null,
        p_max_retries: maxRetries,
      },
    );
    if (error) {
      throw new Error(`No se pudo fallar evento ${eventId}: ${error.message}`);
    }
    const updated = Boolean((data as { updated?: boolean } | null)?.updated);
    if (!updated && !(await this.eventoTieneEstado(eventId, ['completed', 'failed', 'dead_letter']))) {
      throw new Error(`OUTBOX_CLAIM_LOST:${claim.eventRowId}`);
    }
  }

  /**
   * Reinicia un evento fallido para que pueda ser reprocesado
   * @param eventId - ID del evento a reiniciar
   * @returns true si se reinició exitosamente
   */
  async reiniciarEventoFallido(
    tenantId: string,
    actorId: string,
    eventId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService.getClient().rpc(
      'reset_outbox_event_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_event_id: eventId,
        p_reason: 'MANUAL_RETRY',
        p_max_restarts: 3,
      },
    );
    if (error) {
      throw new Error(error.message);
    }
    return Boolean((data as { updated?: boolean } | null)?.updated);
  }

  private async eventoTieneEstado(eventId: string, estados: string[]): Promise<boolean> {
    const { data, error } = await this.supabaseService.getClient()
      .from('outbox_events')
      .select('status')
      .eq('event_id', eventId)
      .maybeSingle();
    if (error) {
      throw new Error(`No se pudo reconciliar estado outbox ${eventId}: ${error.message}`);
    }
    return estados.includes(String(data?.status ?? '').toLowerCase());
  }

  /**
   * Obtiene estadísticas de eventos fallidos
   * @param tenantId - ID del tenant (opcional)
   * @returns Estadísticas de eventos fallidos
   */
  async obtenerEstadisticasEventosFallidos(
    tenantId: string,
    actorId: string,
  ): Promise<{
    total_fallidos: number;
    total_dead_letter: number;
    por_tipo: Record<string, number>;
  }> {
    try {
      const { data, error } = await this.supabaseService.getClient().rpc(
        'outbox_tenant_stats_492',
        { p_tenant_id: tenantId, p_actor_id: actorId },
      );

      if (error) {
        this.logger.error(
          '❌ [Asientos] Error obteniendo estadísticas de eventos fallidos:',
          error
        );
        throw error;
      }

      const raw = (data ?? {}) as Record<string, unknown>;
      return {
        total_fallidos: Number(raw.failed ?? 0),
        total_dead_letter: Number(raw.dead_letter ?? 0),
        por_tipo: (raw.por_tipo ?? {}) as Record<string, number>,
      };
    } catch (error) {
      this.logger.error(
        '❌ [Asientos] Excepción obteniendo estadísticas de eventos fallidos:',
        error
      );
      throw error;
    }
  }

  /**
   * Busca un asiento por su evento origen (para idempotencia)
   */
  private async buscarAsientoPorEvento(
    tenantId: string,
    sourceEventId: string
  ): Promise<AsientoContable | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('source_event_id', sourceEventId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        if (this.isMultipleRowsSingleResultError(error)) {
          throw new Error(
            `Idempotencia contable corrupta: existe mas de un asiento para tenant ${tenantId} y evento ${sourceEventId}`
          );
        }
        return null;
      }
      console.error('❌ [Asientos] Error buscando asiento por evento:', error);
      return null;
    }

    return data as AsientoContable;
  }

  private async waitForExistingAsiento(
    tenantId: string,
    sourceEventId: string
  ): Promise<AsientoContable | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      const asiento = await this.buscarAsientoPorEvento(tenantId, sourceEventId);
      if (asiento) {
        return asiento;
      }
    }

    return null;
  }

  private async waitForLocalSourceEventTurn(
    tenantId: string,
    sourceEventId: string,
    localLockKey: string
  ): Promise<AsientoContable | null> {
    let waited = false;
    const deadline = Date.now() + 10000;
    while (AsientosGeneratorService.activeSourceEventIds.has(localLockKey)) {
      if (Date.now() >= deadline) {
        throw new Error(
          `Timeout esperando lock local contable para evento concurrente ${sourceEventId}`
        );
      }
      waited = true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return waited ? this.buscarAsientoPorEvento(tenantId, sourceEventId) : null;
  }

  private async consolidarAsientoUnicoPorEvento(
    tenantId: string,
    sourceEventId: string,
    currentAsiento: AsientoContable
  ): Promise<AsientoContable> {
    const { data: asientos, error } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('source_event_id', sourceEventId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(
        `No se pudo verificar idempotencia contable para evento ${sourceEventId}: ${error.message}`
      );
    }

    const rows = Array.isArray(asientos) ? asientos : [];
    if (rows.length <= 1) {
      const onlyRow = rows[0] as AsientoContable | undefined;
      return onlyRow?.source_event_id ? onlyRow : currentAsiento;
    }

    const keeper = rows[0] as AsientoContable;
    const duplicates = rows.slice(1);

    for (const duplicate of duplicates) {
      // Soft-delete: marcar como ANULADO en vez de hard-delete para mantener audit trail contable
      const { error: anularError } = await this.supabaseService
        .getClient()
        .from('asientos_contables')
        .update({
          estado: 'ANULADO',
          observaciones: `Duplicado consolidado. Asiento conservado: ${keeper.id}. Evento: ${sourceEventId}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', duplicate.id);

      if (anularError) {
        throw new Error(
          `No se pudo anular duplicado contable ${duplicate.id} para evento ${sourceEventId}: ${anularError.message}`
        );
      }
    }

    this.logger.warn(
      `⚠️ [Asientos] Se consolidaron ${duplicates.length} asientos duplicados para evento ${sourceEventId}; se conserva ${keeper.id}`
    );

    return keeper;
  }

  private isMultipleRowsSingleResultError(error: any): boolean {
    const text = `${error?.details ?? ''} ${error?.message ?? ''}`.toLowerCase();
    return (
      text.includes('multiple') ||
      /contain[s]?\s+([2-9]|\d{2,})\s+rows/.test(text)
    );
  }

  private isSourceEventUniqueViolation(error: any): boolean {
    const text = `${error?.details ?? ''} ${error?.message ?? ''}`.toLowerCase();
    return (
      error?.code === '23505' &&
      text.includes('source_event_id')
    );
  }

  /**
   * Genera asiento de venta (factura CPE)
   * Dr 12 Clientes [total]
   *   Cr 70 Ventas [base]
   *   Cr 40 IGV por Pagar [igv]
   * Dr 69 Costo de Ventas [costo]
   *   Cr 20 Mercaderías [costo]
   */
  async generarAsientoVenta(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, base_imponible, igv, centro_costo_id } = evento;
      const totalFactura = this.round2(Number(evento.total ?? 0));
      const ajustes = {
        retencion: this.round2(Number(evento.ajustes?.retencion ?? 0)),
        percepcion: this.round2(Number(evento.ajustes?.percepcion ?? 0)),
        detraccion: this.round2(Number(evento.ajustes?.detraccion ?? 0)),
        anticipo: this.round2(Number(evento.ajustes?.anticipo ?? 0)),
      };

      if (ajustes.retencion || ajustes.percepcion || ajustes.detraccion || ajustes.anticipo) {
        // HARDENING: reflejamos ajustes tributarios en el asiento cuando existen subcuentas configuradas.
        this.logger.log(
          `ℹ️ [Asientos] Venta con ajustes - Retención: ${ajustes.retencion}, Percepción: ${ajustes.percepcion}, ` +
            `Detracción: ${ajustes.detraccion}, Anticipo aplicado: ${ajustes.anticipo}`,
        );
      }

      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['12', '70', '40', '69', '20', '10']
      );

      const montoPendiente = Math.max(this.round2(
        evento.monto_pendiente != null
          ? Number(evento.monto_pendiente)
          : totalFactura - ajustes.retencion - ajustes.detraccion - ajustes.anticipo + ajustes.percepcion
      ), 0);
      const base = this.round2(Number(base_imponible ?? 0));
      const montoIgv = this.round2(Number(igv ?? 0));
      const costoVentas = this.round2(Number(evento.costo_ventas ?? 0));

      const cuentaRetencion = ajustes.retencion > 0
        ? await this.planCuentasService.buscarCuentaPorCodigoONombre(tenant_id, {
            codigos: ['12111', '1211', '121'],
            keywords: ['retencion', 'retención'],
          })
        : null;
      const cuentaDetraccion = ajustes.detraccion > 0
        ? await this.planCuentasService.buscarCuentaPorCodigoONombre(tenant_id, {
            codigos: ['1041', '104', '1040'],
            keywords: ['detraccion', 'detracción'],
          })
        : null;
      const cuentaPercepcion = ajustes.percepcion > 0
        ? await this.planCuentasService.buscarCuentaPorCodigoONombre(tenant_id, {
            codigos: ['4017', '40171', '401'],
            keywords: ['percepcion', 'percepción'],
          })
        : null;
      const cuentaAnticipos = ajustes.anticipo > 0
        ? await this.planCuentasService.buscarCuentaPorCodigoONombre(tenant_id, {
            codigos: ['1212', '1213', '122'],
            keywords: ['anticipo', 'anticipos'],
          })
        : null;

      const detalles: DetalleAsiento[] = [];

      // POS 451 entrega el desglose durable de cobros. Cada porción se debita
      // en su naturaleza real: caja, tarjeta, banco o CxC. La suma debe cubrir
      // exactamente el total contable para fallar cerrado ante payload parcial.
      const cobros = Array.isArray(evento.cobros) ? evento.cobros : [];
      if (cobros.length > 0) {
        const agrupados = new Map<string, number>();
        for (const cobro of cobros) {
          const tipo = String(cobro?.tipo ?? cobro?.codigo ?? '').toUpperCase();
          const monto = this.round2(Number(cobro?.monto ?? 0));
          if (!Number.isFinite(monto) || monto <= 0) {
            throw new Error('Desglose de cobros POS contiene un monto inválido');
          }
          const codigoCuenta = tipo === 'CREDITO'
            ? '12'
            : tipo === 'EFECTIVO'
              ? '10111'
              : tipo === 'TARJETA'
                ? '10411'
                : ['TRANSFERENCIA', 'BILLETERA_DIGITAL', 'YAPE', 'PLIN'].includes(tipo)
                  ? '10412'
                  : null;
          if (!codigoCuenta) {
            throw new Error(`Tipo de cobro POS no soportado: ${tipo || 'VACIO'}`);
          }
          agrupados.set(codigoCuenta, this.round2((agrupados.get(codigoCuenta) ?? 0) + monto));
        }

        const totalCobros = this.round2(
          [...agrupados.values()].reduce((sum, monto) => sum + monto, 0),
        );
        // `monto_pendiente` representa únicamente el saldo a crédito. El
        // desglose POS, en cambio, contiene efectivo + medios electrónicos +
        // crédito y por ello debe cuadrar contra el total íntegro de la venta.
        if (Math.abs(totalCobros - totalFactura) > 0.01) {
          throw new Error(
            `El desglose de cobros POS no cuadra: cobros=${totalCobros}, total=${totalFactura}`,
          );
        }

        for (const [codigoCuenta, monto] of agrupados) {
          const cuentaEspecifica = codigoCuenta === '12'
            ? cuentas.get('12')!
            : await this.planCuentasService.buscarCuentaPorCodigoONombre(tenant_id, {
                codigos: [codigoCuenta],
              });
          if (cuentaEspecifica && !cuentaEspecifica.acepta_movimiento) {
            throw new Error(`La cuenta ${codigoCuenta} no acepta movimientos`);
          }
          const cuentaCobro = cuentaEspecifica ?? cuentas.get('10')!;
          detalles.push({
            cuenta_id: cuentaCobro.id,
            debe: monto,
            haber: 0,
            concepto: codigoCuenta === '12'
              ? 'Clientes - Venta a crédito'
              : `Cobro POS - ${codigoCuenta}`,
            centro_costo_id,
          });
        }
      } else {
        // Compatibilidad para eventos previos sin desglose de pagos.
        const esContado = evento.es_contado === true;
        const cuentaCobro = esContado
          ? (cuentas.get(evento.cuenta_cobro_codigo) ??
             cuentas.get('10111') ??
             cuentas.get('10') ??
             cuentas.get('12')!)
          : cuentas.get('12')!;

        detalles.push({
          cuenta_id: cuentaCobro.id,
          debe: montoPendiente,
          haber: 0,
          concepto: esContado ? 'Caja/Bancos - Cobro contado' : 'Clientes - Venta',
          centro_costo_id,
        });
      }

      if (ajustes.retencion > 0) {
        detalles.push({
          cuenta_id: (cuentaRetencion ?? cuentas.get('12')!).id,
          debe: ajustes.retencion,
          haber: 0,
          concepto: cuentaRetencion ? 'Retenciones por cobrar' : 'Clientes - Retención pendiente',
        });
      }

      if (ajustes.detraccion > 0) {
        detalles.push({
          cuenta_id: (cuentaDetraccion ?? cuentas.get('12')!).id,
          debe: ajustes.detraccion,
          haber: 0,
          concepto: cuentaDetraccion ? 'Detracciones por cobrar' : 'Clientes - Detracción aplicada',
        });
      }

      if (ajustes.anticipo > 0) {
        detalles.push({
          cuenta_id: (cuentaAnticipos ?? cuentas.get('12')!).id,
          debe: ajustes.anticipo,
          haber: 0,
          concepto: cuentaAnticipos ? 'Aplicación de anticipo' : 'Clientes - Ajuste por anticipo',
        });
      }

      detalles.push({
        cuenta_id: cuentas.get('70')!.id,
        debe: 0,
        haber: base,
        concepto: 'Ventas',
        centro_costo_id,
      });
      detalles.push({
        cuenta_id: cuentas.get('40')!.id,
        debe: 0,
        haber: montoIgv,
        concepto: 'IGV por pagar',
      });

      if (ajustes.percepcion > 0) {
        detalles.push({
          cuenta_id: (cuentaPercepcion ?? cuentas.get('40')!).id,
          debe: 0,
          haber: ajustes.percepcion,
          concepto: cuentaPercepcion ? 'Percepciones por pagar' : 'IGV / Percepciones',
        });
      }

      if (costoVentas > 0) {
        detalles.push(
          {
            cuenta_id: cuentas.get('69')!.id,
            debe: costoVentas,
            haber: 0,
            concepto: 'Costo de ventas',
            centro_costo_id,
          },
          {
            cuenta_id: cuentas.get('20')!.id,
            debe: 0,
            haber: costoVentas,
            concepto: 'Mercaderías',
          },
        );
      }

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Venta de mercadería',
        detalles,
        evento.referencia,
        evento.event_id
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de venta: ${error.message}`
        );
      }
      throw error;
    }
  }

  async generarAsientoCierreCaja(evento: any): Promise<AsientoContable | null> {
    try {
      const tenantId = evento.tenant_id;
      const diferencia = this.round2(Number(evento.diferencia ?? 0));
      if (!Number.isFinite(diferencia)) {
        throw new Error('La diferencia de cierre de caja no es numérica');
      }
      if (Math.abs(diferencia) <= 0.009) {
        return null;
      }
      const esRedondeoLegal = evento.redondeo_efectivo_legal === true
        || evento.tipo_diferencia === 'REDONDEO_EFECTIVO_LEGAL';

      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenantId,
        ['10', '65', '75'],
      );
      const cuentaCajaEspecifica = await this.planCuentasService.buscarCuentaPorCodigoONombre(
        tenantId,
        { codigos: [evento.cuenta_caja_codigo || '10111'] },
      );
      if (cuentaCajaEspecifica && !cuentaCajaEspecifica.acepta_movimiento) {
        throw new Error('La cuenta de caja configurada no acepta movimientos');
      }
      const cuentaCaja = cuentaCajaEspecifica ?? cuentas.get('10')!;
      const monto = Math.abs(diferencia);
      const detalles: DetalleAsiento[] = diferencia > 0
        ? [
            {
              cuenta_id: cuentaCaja.id,
              debe: monto,
              haber: 0,
              concepto: 'Sobrante en arqueo de caja',
            },
            {
              cuenta_id: cuentas.get('75')!.id,
              debe: 0,
              haber: monto,
              concepto: 'Otros ingresos - sobrante de caja',
            },
          ]
        : [
            {
              cuenta_id: cuentas.get('65')!.id,
              debe: monto,
              haber: 0,
              concepto: esRedondeoLegal
                ? 'Redondeo legal de pago en efectivo'
                : 'Otros gastos - faltante de caja',
            },
            {
              cuenta_id: cuentaCaja.id,
              debe: 0,
              haber: monto,
              concepto: esRedondeoLegal
                ? 'Menor efectivo por redondeo legal'
                : 'Faltante en arqueo de caja',
            },
          ];

      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        diferencia > 0
          ? 'Sobrante de caja'
          : esRedondeoLegal
            ? 'Redondeo legal de efectivo'
            : 'Faltante de caja',
        detalles,
        evento.referencia,
        evento.event_id,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de cierre de caja: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Único dueño contable de los movimientos Caja 474. El evento trae cuentas
   * postables e importe local congelados por la misma transacción que movió el
   * efectivo; el worker no vuelve a inferir una contrapartida mutable.
   */
  async generarAsientoOperacionCaja474(evento: any): Promise<AsientoContable | null> {
    try {
      const tenantId = String(evento.tenant_id ?? '').trim();
      const eventId = String(evento.event_id ?? evento.eventId ?? '').trim();
      const tipoEvento = String(evento.tipo_evento ?? '').trim();
      const tipo = String(evento.tipo ?? '').trim().toUpperCase();
      const diferencia = this.round2(Number(evento.diferencia ?? evento.diferenciaOrigen ?? 0));
      const monto = this.round2(Number(evento.monto));
      const montoOrigen = this.round2(Number(evento.montoOrigen ?? evento.monto_origen ?? monto));
      const tipoCambio = Number(evento.tipoCambio ?? evento.tipo_cambio ?? 1);
      const cuentaCajaId = String(evento.cuentaCajaId ?? evento.cuenta_caja_id ?? '').trim();
      const cuentaCajaCodigo = String(
        evento.cuentaCajaCodigo ?? evento.cuenta_caja_codigo ?? '',
      ).trim();
      const cuentaContrapartidaId = String(
        evento.cuentaContrapartidaId ?? evento.cuenta_contrapartida_id ?? '',
      ).trim();
      const cuentaContrapartidaCodigo = String(
        evento.cuentaContrapartidaCodigo ?? evento.cuenta_contrapartida_codigo ?? '',
      ).trim();

      if (evento.accountingHandledByOutbox !== true) {
        throw new Error('La operación de caja no acredita ownership contable durable');
      }
      if (!tenantId || !eventId || ![
        'caja.movimiento_manual.registrado',
        'caja.retiro.registrado',
        'caja.cambio_turno.completado',
      ].includes(tipoEvento)) {
        throw new Error('La operación Caja 474 exige tenant, event_id y tipo de evento soportado');
      }
      if (tipoEvento === 'caja.cambio_turno.completado' && Math.abs(diferencia) <= 0.009) {
        return null;
      }
      if (
        !Number.isFinite(monto) || monto <= 0 ||
        !Number.isFinite(montoOrigen) || montoOrigen <= 0 ||
        !Number.isFinite(tipoCambio) || tipoCambio <= 0 ||
        Math.abs(this.round2(montoOrigen * tipoCambio) - monto) > 0.01
      ) {
        throw new Error('La valuación local de la operación de caja es inválida');
      }
      if (
        !cuentaCajaId || !cuentaCajaCodigo ||
        !cuentaContrapartidaId || !cuentaContrapartidaCodigo ||
        cuentaCajaId === cuentaContrapartidaId
      ) {
        throw new Error('Caja y contrapartida deben estar congeladas, válidas y ser distintas');
      }
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, [
        cuentaCajaCodigo,
        cuentaContrapartidaCodigo,
      ]);
      if (
        cuentas.get(cuentaCajaCodigo)?.id !== cuentaCajaId ||
        cuentas.get(cuentaContrapartidaCodigo)?.id !== cuentaContrapartidaId
      ) {
        throw new Error('Las cuentas congeladas no pertenecen al plan contable del tenant');
      }

      const cashIn = tipoEvento === 'caja.movimiento_manual.registrado'
        ? tipo === 'INGRESO'
        : tipoEvento === 'caja.cambio_turno.completado'
          ? diferencia > 0
          : false;
      const concepto = evento.descripcion || (
        cashIn ? 'Ingreso operativo de caja' : 'Salida operativa de caja'
      );
      const detalles: DetalleAsiento[] = cashIn
        ? [
            { cuenta_id: cuentaCajaId, debe: monto, haber: 0, concepto },
            { cuenta_id: cuentaContrapartidaId, debe: 0, haber: monto, concepto },
          ]
        : [
            { cuenta_id: cuentaContrapartidaId, debe: monto, haber: 0, concepto },
            { cuenta_id: cuentaCajaId, debe: 0, haber: monto, concepto },
          ];

      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        concepto,
        detalles,
        evento.referencia,
        eventId,
      );
    } catch (error) {
      const eventId = evento.event_id ?? evento.eventId;
      if (eventId) {
        await this.marcarEventoComoFallido(
          eventId,
          `Error generando asiento de operación Caja 474: ${error.message}`,
        );
      }
      throw error;
    }
  }

  async generarAsientoNotaCredito(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, base_imponible, igv, centro_costo_id } = evento;

      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['12', '122', '70', '40', '69', '20']
      );

      const ajustes = {
        retencion: this.round2(Math.abs(Number(evento.ajustes?.retencion ?? 0))),
        percepcion: this.round2(Math.abs(Number(evento.ajustes?.percepcion ?? 0))),
        detraccion: this.round2(Math.abs(Number(evento.ajustes?.detraccion ?? 0))),
        anticipo: this.round2(Math.abs(Number(evento.ajustes?.anticipo ?? 0))),
      };

      const cuentaRetencion = ajustes.retencion > 0
        ? await this.planCuentasService.buscarCuentaPorCodigoONombre(tenant_id, {
            codigos: ['12111', '1211', '121'],
            keywords: ['retencion', 'retención'],
          })
        : null;
      const cuentaDetraccion = ajustes.detraccion > 0
        ? await this.planCuentasService.buscarCuentaPorCodigoONombre(tenant_id, {
            codigos: ['1041', '104', '1040'],
            keywords: ['detraccion', 'detracción'],
          })
        : null;
      const cuentaPercepcion = ajustes.percepcion > 0
        ? await this.planCuentasService.buscarCuentaPorCodigoONombre(tenant_id, {
            codigos: ['4017', '40171', '401'],
            keywords: ['percepcion', 'percepción'],
          })
        : null;
      const cuentaAnticipos = ajustes.anticipo > 0
        ? await this.planCuentasService.buscarCuentaPorCodigoONombre(tenant_id, {
            codigos: ['1212', '1213', '122'],
            keywords: ['anticipo', 'anticipos'],
          })
        : null;

      const baseAbs = this.round2(Math.abs(Number(base_imponible ?? 0)));
      const igvAbs = this.round2(Math.abs(Number(igv ?? 0)));
      const costoAbs = this.round2(Math.abs(Number(evento.costo_ventas ?? 0)));
      const saldoClientes = Math.max(this.round2(
        evento.monto_pendiente != null
          ? Math.abs(Number(evento.monto_pendiente))
          : Math.abs(Number(evento.total ?? 0)) - ajustes.retencion - ajustes.detraccion - ajustes.anticipo + ajustes.percepcion
      ), 0);
      const saldoFavorCliente = Math.max(this.round2(Math.abs(Number(
        evento.customerCreditBalance ?? evento.customer_credit_balance ?? evento.saldoFavor ?? 0,
      ))), 0);

      if (evento.customerCreditBalance != null || evento.customer_credit_balance != null || evento.saldoFavor != null) {
        const totalDebeFinanciero = this.round2(baseAbs + igvAbs + ajustes.percepcion);
        const totalHaberFinanciero = this.round2(
          saldoClientes + saldoFavorCliente + ajustes.retencion + ajustes.detraccion + ajustes.anticipo,
        );
        if (!cuadranImportes(totalDebeFinanciero, totalHaberFinanciero)) {
          throw new Error(
            `La distribución de la nota de crédito no cuadra: reversión=${totalDebeFinanciero}, CxC+saldo a favor=${totalHaberFinanciero}`,
          );
        }
      }

      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get('70')!.id,
          debe: baseAbs,
          haber: 0,
          concepto: 'Reversión de ingresos',
          centro_costo_id,
        },
        {
          cuenta_id: cuentas.get('40')!.id,
          debe: igvAbs,
          haber: 0,
          concepto: 'Reversión IGV por pagar',
        },
      ];

      if (ajustes.percepcion > 0) {
        detalles.push({
          cuenta_id: (cuentaPercepcion ?? cuentas.get('40')!).id,
          debe: ajustes.percepcion,
          haber: 0,
          concepto: cuentaPercepcion ? 'Reversión percepciones por pagar' : 'Reversión IGV / Percepciones',
        });
      }

      if (costoAbs > 0) {
        detalles.push(
          {
            cuenta_id: cuentas.get('20')!.id,
            debe: costoAbs,
            haber: 0,
            concepto: 'Reversión inventario',
          },
          {
            cuenta_id: cuentas.get('69')!.id,
            debe: 0,
            haber: costoAbs,
            concepto: 'Reversión costo de ventas',
            centro_costo_id,
          },
        );
      }

      if (saldoClientes > 0) {
        detalles.push({
          cuenta_id: cuentas.get('12')!.id,
          debe: 0,
          haber: saldoClientes,
          concepto: 'Reversión de cuenta por cobrar del cliente',
        });
      }

      if (saldoFavorCliente > 0) {
        detalles.push({
          cuenta_id: cuentas.get('122')!.id,
          debe: 0,
          haber: saldoFavorCliente,
          concepto: 'Saldo a favor durable del cliente',
        });
      }

      if (ajustes.retencion > 0) {
        detalles.push({
          cuenta_id: (cuentaRetencion ?? cuentas.get('12')!).id,
          debe: 0,
          haber: ajustes.retencion,
          concepto: cuentaRetencion ? 'Reversión retenciones por cobrar' : 'Reversión retención',
        });
      }

      if (ajustes.detraccion > 0) {
        detalles.push({
          cuenta_id: (cuentaDetraccion ?? cuentas.get('12')!).id,
          debe: 0,
          haber: ajustes.detraccion,
          concepto: cuentaDetraccion ? 'Reversión detracciones por cobrar' : 'Reversión detracción',
        });
      }

      if (ajustes.anticipo > 0) {
        detalles.push({
          cuenta_id: (cuentaAnticipos ?? cuentas.get('12')!).id,
          debe: 0,
          haber: ajustes.anticipo,
          concepto: cuentaAnticipos ? 'Reversión anticipo' : 'Reversión anticipo cliente',
        });
      }

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Nota de crédito',
        detalles,
        evento.referencia,
        evento.event_id
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de nota de crédito: ${error.message}`
        );
      }
      throw error;
    }
  }

  /** Nota de débito comercial: incrementa la cuenta por cobrar sin mover stock. */
  async generarAsientoNotaDebito(evento: any): Promise<AsientoContable> {
    try {
      const tenantId = evento.tenant_id;
      const base = this.round2(Math.abs(Number(evento.base_imponible ?? evento.subtotal ?? 0)));
      const impuestos = this.round2(Math.abs(Number(evento.igv ?? evento.impuestos ?? 0)));
      const total = this.round2(Math.abs(Number(evento.total ?? 0)));
      if (!tenantId || base < 0 || impuestos < 0 || total <= 0
          || Math.abs(this.round2(base + impuestos) - total) > 0.01) {
        throw new Error('Importes inválidos para asiento de nota de débito');
      }
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenantId, ['12', '70', '40'],
      );
      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get('12')!.id,
          debe: total,
          haber: 0,
          concepto: 'Incremento de cuenta por cobrar por nota de débito',
        },
        {
          cuenta_id: cuentas.get('70')!.id,
          debe: 0,
          haber: base,
          concepto: 'Ingreso adicional por nota de débito',
        },
      ];
      if (impuestos > 0) {
        detalles.push({
          cuenta_id: cuentas.get('40')!.id,
          debe: 0,
          haber: impuestos,
          concepto: 'IGV adicional por nota de débito',
        });
      }
      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        'Nota de débito',
        detalles,
        evento.referencia,
        evento.event_id,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de nota de débito: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Dr 122 / Cr 12, con diferencia de cambio si ambas partidas tienen distinta valuación. */
  async generarAsientoAplicacionSaldoFavor(evento: any): Promise<AsientoContable> {
    try {
      const tenantId = evento.tenant_id;
      const montoPasivo = this.round2(Number(evento.montoPasivo ?? evento.monto_pasivo ?? evento.monto));
      const montoCxc = this.round2(Number(evento.montoCxc ?? evento.monto_cxc ?? evento.monto));
      const diferencia = this.round2(Number(
        evento.diferenciaCambio ?? evento.diferencia_cambio ?? montoCxc - montoPasivo,
      ));
      if (!tenantId || !Number.isFinite(montoPasivo) || !Number.isFinite(montoCxc)
          || montoPasivo <= 0 || montoCxc <= 0
          || Math.abs(this.round2(montoCxc - montoPasivo) - diferencia) > 0.01) {
        throw new Error('Valuación inválida para aplicar saldo a favor');
      }
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenantId, ['122', '12', '676', '776'],
      );
      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get('122')!.id,
          debe: montoPasivo,
          haber: 0,
          concepto: 'Aplicación de saldo a favor del cliente',
        },
        {
          cuenta_id: cuentas.get('12')!.id,
          debe: 0,
          haber: montoCxc,
          concepto: 'Cancelación de cuenta por cobrar con saldo a favor',
        },
      ];
      this.appendFxDifference(detalles, cuentas, diferencia);
      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        'Aplicación de saldo a favor del cliente',
        detalles,
        evento.referencia,
        evento.event_id,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de aplicación de saldo a favor: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Dr 122 / Cr 10, con caja o banco explícito ya materializado por la RPC 456. */
  async generarAsientoReembolsoSaldoFavor(evento: any): Promise<AsientoContable> {
    try {
      const tenantId = evento.tenant_id;
      const montoPasivo = this.round2(Number(evento.montoPasivo ?? evento.monto_pasivo ?? evento.monto));
      const montoTesoreria = this.round2(Number(
        evento.montoTesoreria ?? evento.monto_tesoreria ?? evento.monto,
      ));
      const diferencia = this.round2(Number(
        evento.diferenciaCambio ?? evento.diferencia_cambio ?? montoTesoreria - montoPasivo,
      ));
      if (!tenantId || !Number.isFinite(montoPasivo) || !Number.isFinite(montoTesoreria)
          || montoPasivo <= 0 || montoTesoreria <= 0
          || Math.abs(this.round2(montoTesoreria - montoPasivo) - diferencia) > 0.01) {
        throw new Error('Valuación inválida para reembolsar saldo a favor');
      }
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenantId, ['122', '10', '676', '776'],
      );
      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get('122')!.id,
          debe: montoPasivo,
          haber: 0,
          concepto: 'Extinción del saldo a favor reembolsado',
        },
        {
          cuenta_id: cuentas.get('10')!.id,
          debe: 0,
          haber: montoTesoreria,
          concepto: `Reembolso por ${String(evento.medio ?? 'tesorería').toLowerCase()}`,
        },
      ];
      this.appendFxDifference(detalles, cuentas, diferencia);
      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        'Reembolso de saldo a favor del cliente',
        detalles,
        evento.referencia,
        evento.event_id,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de reembolso de saldo a favor: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Inversa exacta de Dr 122 / Cr 10: repone tesorería y el pasivo del cliente. */
  async generarAsientoReversaReembolsoSaldoFavor(evento: any): Promise<AsientoContable> {
    try {
      const tenantId = evento.tenant_id;
      const montoPasivo = this.round2(Number(
        evento.montoPasivo ?? evento.monto_pasivo ?? evento.monto,
      ));
      const montoTesoreria = this.round2(Number(
        evento.montoTesoreria ?? evento.monto_tesoreria ?? evento.monto,
      ));
      const diferencia = this.round2(Number(
        evento.diferenciaCambio ?? evento.diferencia_cambio
          ?? montoTesoreria - montoPasivo,
      ));
      if (!tenantId || !Number.isFinite(montoPasivo) || !Number.isFinite(montoTesoreria)
          || montoPasivo <= 0 || montoTesoreria <= 0
          || Math.abs(this.round2(montoTesoreria - montoPasivo) - diferencia) > 0.01) {
        throw new Error('Valuación inválida para revertir el reembolso de saldo a favor');
      }
      const codigos = ['122', '10'];
      if (diferencia > 0) codigos.push('676');
      if (diferencia < 0) codigos.push('776');
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenantId, codigos,
      );
      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get('10')!.id,
          debe: montoTesoreria,
          haber: 0,
          concepto: `Reposición por ${String(evento.medio ?? 'tesorería').toLowerCase()}`,
        },
        {
          cuenta_id: cuentas.get('122')!.id,
          debe: 0,
          haber: montoPasivo,
          concepto: 'Reposición del saldo a favor del cliente',
        },
      ];
      if (diferencia > 0) {
        detalles.push({
          cuenta_id: cuentas.get('676')!.id,
          debe: 0,
          haber: diferencia,
          concepto: 'Reversa de pérdida por diferencia de cambio',
        });
      } else if (diferencia < 0) {
        detalles.push({
          cuenta_id: cuentas.get('776')!.id,
          debe: Math.abs(diferencia),
          haber: 0,
          concepto: 'Reversa de ganancia por diferencia de cambio',
        });
      }
      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        'Reversa de reembolso de saldo a favor del cliente',
        detalles,
        evento.referencia,
        evento.event_id,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de reversa de reembolso: ${error.message}`,
        );
      }
      throw error;
    }
  }

  private appendFxDifference(
    detalles: DetalleAsiento[],
    cuentas: Map<string, PlanCuenta>,
    diferencia: number,
  ): void {
    if (diferencia > 0) {
      detalles.push({
        cuenta_id: cuentas.get('676')!.id,
        debe: diferencia,
        haber: 0,
        concepto: 'Pérdida por diferencia de cambio',
      });
    } else if (diferencia < 0) {
      detalles.push({
        cuenta_id: cuentas.get('776')!.id,
        debe: 0,
        haber: Math.abs(diferencia),
        concepto: 'Ganancia por diferencia de cambio',
      });
    }
  }

  /**
   * Genera asiento de cobro CxC
   * Dr 10 Bancos/Caja [monto de liquidación]
   * Dr 676 Pérdida por diferencia de cambio [si corresponde]
   *   Cr 12 Clientes [monto contabilizado]
   *   Cr 776 Ganancia por diferencia de cambio [si corresponde]
   */
  async generarAsientoCobro(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, monto, centro_costo_id } = evento;

      const montoContabilizado = this.round2(
        Number(evento.montoContabilizado ?? evento.monto_contabilizado ?? monto)
      );
      const montoLiquidacion = this.round2(
        Number(evento.montoLiquidacion ?? evento.monto_liquidacion ?? monto)
      );
      const diferenciaCambio = this.round2(
        Number(evento.diferenciaCambio ?? evento.diferencia_cambio ?? 0)
      );
      if (
        !Number.isFinite(montoContabilizado) ||
        !Number.isFinite(montoLiquidacion) ||
        !Number.isFinite(diferenciaCambio) ||
        montoContabilizado <= 0 ||
        montoLiquidacion <= 0
      ) {
        throw new Error('La valuación del cobro debe contener importes positivos y finitos');
      }
      const diferenciaEsperada = this.round2(montoLiquidacion - montoContabilizado);
      if (Math.abs(diferenciaEsperada - diferenciaCambio) > 0.01) {
        throw new Error(
          `Valuación de cobro inconsistente: liquidación ${montoLiquidacion} - contabilizado ${montoContabilizado} != diferencia ${diferenciaCambio}`,
        );
      }

      const codigos = ['10', '12'];
      if (diferenciaCambio < 0) codigos.push('676');
      if (diferenciaCambio > 0) codigos.push('776');
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        codigos
      );

      const detalles: DetalleAsiento[] = [
        { cuenta_id: cuentas.get('10')!.id, debe: montoLiquidacion, haber: 0, concepto: 'Bancos/Caja', centro_costo_id },
        { cuenta_id: cuentas.get('12')!.id, debe: 0, haber: montoContabilizado, concepto: 'Clientes', centro_costo_id }
      ];

      if (diferenciaCambio < 0) {
        detalles.push({
          cuenta_id: cuentas.get('676')!.id,
          debe: this.round2(-diferenciaCambio),
          haber: 0,
          concepto: 'Pérdida por diferencia de cambio',
          centro_costo_id,
        });
      } else if (diferenciaCambio > 0) {
        detalles.push({
          cuenta_id: cuentas.get('776')!.id,
          debe: 0,
          haber: diferenciaCambio,
          concepto: 'Ganancia por diferencia de cambio',
          centro_costo_id,
        });
      }

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Cobro de factura',
        detalles,
        evento.referencia,
        evento.event_id
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de cobro: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Inversa exacta del cobro: Dr 12 / Cr 10. La diferencia de cambio usa la
   * misma valuación durable del cobro original, pero con naturaleza opuesta.
   */
  async generarAsientoReversaCobro(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, monto, centro_costo_id } = evento;
      const montoContabilizado = this.round2(Number(
        evento.montoContabilizado ?? evento.monto_contabilizado ?? monto,
      ));
      const montoLiquidacion = this.round2(Number(
        evento.montoLiquidacion ?? evento.monto_liquidacion ?? monto,
      ));
      const diferenciaCambio = this.round2(Number(
        evento.diferenciaCambio ?? evento.diferencia_cambio ?? 0,
      ));
      if (!tenant_id || !Number.isFinite(montoContabilizado)
          || !Number.isFinite(montoLiquidacion) || !Number.isFinite(diferenciaCambio)
          || montoContabilizado <= 0 || montoLiquidacion <= 0) {
        throw new Error('La valuación de la reversa de cobro debe contener importes positivos y finitos');
      }
      const diferenciaEsperada = this.round2(montoLiquidacion - montoContabilizado);
      if (Math.abs(diferenciaEsperada - diferenciaCambio) > 0.01) {
        throw new Error(
          `Valuación de reversa de cobro inconsistente: liquidación ${montoLiquidacion} - contabilizado ${montoContabilizado} != diferencia ${diferenciaCambio}`,
        );
      }
      const codigos = ['10', '12'];
      if (diferenciaCambio < 0) codigos.push('676');
      if (diferenciaCambio > 0) codigos.push('776');
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id, codigos,
      );
      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get('12')!.id,
          debe: montoContabilizado,
          haber: 0,
          concepto: 'Restauración de cuenta por cobrar',
          centro_costo_id,
        },
        {
          cuenta_id: cuentas.get('10')!.id,
          debe: 0,
          haber: montoLiquidacion,
          concepto: 'Reembolso por caja/banco',
          centro_costo_id,
        },
      ];
      if (diferenciaCambio < 0) {
        detalles.push({
          cuenta_id: cuentas.get('676')!.id,
          debe: 0,
          haber: Math.abs(diferenciaCambio),
          concepto: 'Reversa de pérdida por diferencia de cambio',
          centro_costo_id,
        });
      } else if (diferenciaCambio > 0) {
        detalles.push({
          cuenta_id: cuentas.get('776')!.id,
          debe: diferenciaCambio,
          haber: 0,
          concepto: 'Reversa de ganancia por diferencia de cambio',
          centro_costo_id,
        });
      }
      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Reversa de cobro de factura',
        detalles,
        evento.referencia,
        evento.event_id,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de reversa de cobro: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Contabiliza un movimiento bancario ya confirmado por la RPC 457.
   * ABONO: Dr banco / Cr contrapartida. CARGO: Dr contrapartida / Cr banco.
   */
  async generarAsientoMovimientoBancario(evento: any): Promise<AsientoContable> {
    try {
      const tenantId = String(evento.tenant_id ?? '').trim();
      const eventId = String(evento.event_id ?? evento.eventId ?? '').trim();
      const tipo = String(evento.tipo ?? '').trim().toUpperCase();
      const monto = this.round2(Number(evento.monto));
      const montoOrigen = this.round2(Number(evento.montoOrigen ?? evento.monto_origen ?? monto));
      const tipoCambio = Number(evento.tipoCambio ?? evento.tipo_cambio ?? 1);
      const cuentaBancoId = String(evento.cuentaBancoId ?? evento.cuenta_banco_id ?? '').trim();
      const cuentaBancoCodigo = String(
        evento.cuentaBancoCodigo ?? evento.cuenta_banco_codigo ?? '',
      ).trim();
      const cuentaContrapartidaId = String(
        evento.cuentaContrapartidaId ?? evento.cuenta_contrapartida_id ?? '',
      ).trim();
      const cuentaContrapartidaCodigo = String(
        evento.cuentaContrapartidaCodigo ?? evento.cuenta_contrapartida_codigo ?? '',
      ).trim();

      if (evento.accountingHandledByOutbox !== true) {
        throw new Error('El movimiento bancario no acredita ownership contable durable');
      }
      if (!tenantId || !eventId || !['ABONO', 'CARGO'].includes(tipo)) {
        throw new Error('El movimiento bancario exige tenant, event_id y tipo ABONO/CARGO');
      }
      if (
        !Number.isFinite(monto) || monto <= 0 ||
        !Number.isFinite(montoOrigen) || montoOrigen <= 0 ||
        !Number.isFinite(tipoCambio) || tipoCambio <= 0 ||
        Math.abs(this.round2(montoOrigen * tipoCambio) - monto) > 0.01
      ) {
        throw new Error('La valuación local del movimiento bancario es inválida');
      }
      if (
        !cuentaBancoId || !cuentaBancoCodigo ||
        !cuentaContrapartidaId || !cuentaContrapartidaCodigo ||
        cuentaBancoId === cuentaContrapartidaId
      ) {
        throw new Error('Las cuentas bancarias y de contrapartida deben ser válidas y distintas');
      }

      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, [
        cuentaBancoCodigo,
        cuentaContrapartidaCodigo,
      ]);
      if (
        cuentas.get(cuentaBancoCodigo)?.id !== cuentaBancoId ||
        cuentas.get(cuentaContrapartidaCodigo)?.id !== cuentaContrapartidaId
      ) {
        throw new Error('Las cuentas del evento bancario no pertenecen al plan contable del tenant');
      }

      const detalles: DetalleAsiento[] = tipo === 'ABONO'
        ? [
            { cuenta_id: cuentaBancoId, debe: monto, haber: 0, concepto: 'Ingreso bancario' },
            {
              cuenta_id: cuentaContrapartidaId,
              debe: 0,
              haber: monto,
              concepto: evento.descripcion || 'Contrapartida de ingreso bancario',
            },
          ]
        : [
            {
              cuenta_id: cuentaContrapartidaId,
              debe: monto,
              haber: 0,
              concepto: evento.descripcion || 'Contrapartida de salida bancaria',
            },
            { cuenta_id: cuentaBancoId, debe: 0, haber: monto, concepto: 'Salida bancaria' },
          ];

      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        evento.descripcion || `Movimiento bancario ${tipo}`,
        detalles,
        evento.referencia,
        eventId,
      );
    } catch (error) {
      const eventId = evento.event_id ?? evento.eventId;
      if (eventId) {
        await this.marcarEventoComoFallido(
          eventId,
          `Error generando asiento de movimiento bancario: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Contabiliza la transferencia interna confirmada por 457 sin consultar TC mutable. */
  async generarAsientoTransferenciaBancaria(evento: any): Promise<AsientoContable> {
    try {
      const tenantId = String(evento.tenant_id ?? '').trim();
      const eventId = String(evento.event_id ?? evento.eventId ?? '').trim();
      const monto = this.round2(Number(evento.monto));
      const montoOrigen = this.round2(Number(evento.montoOrigen ?? evento.monto_origen ?? monto));
      const tipoCambio = Number(evento.tipoCambio ?? evento.tipo_cambio ?? 1);
      const cuentaOrigenId = String(
        evento.cuentaOrigenContableId ?? evento.cuenta_origen_contable_id ?? '',
      ).trim();
      const cuentaOrigenCodigo = String(
        evento.cuentaOrigenCodigo ?? evento.cuenta_origen_codigo ?? '',
      ).trim();
      const cuentaDestinoId = String(
        evento.cuentaDestinoContableId ?? evento.cuenta_destino_contable_id ?? '',
      ).trim();
      const cuentaDestinoCodigo = String(
        evento.cuentaDestinoCodigo ?? evento.cuenta_destino_codigo ?? '',
      ).trim();

      if (evento.accountingHandledByOutbox !== true) {
        throw new Error('La transferencia bancaria no acredita ownership contable durable');
      }
      if (!tenantId || !eventId) {
        throw new Error('La transferencia bancaria exige tenant y event_id');
      }
      if (
        !Number.isFinite(monto) || monto <= 0 ||
        !Number.isFinite(montoOrigen) || montoOrigen <= 0 ||
        !Number.isFinite(tipoCambio) || tipoCambio <= 0 ||
        Math.abs(this.round2(montoOrigen * tipoCambio) - monto) > 0.01
      ) {
        throw new Error('La valuación local de la transferencia bancaria es inválida');
      }
      if (
        !cuentaOrigenId || !cuentaOrigenCodigo ||
        !cuentaDestinoId || !cuentaDestinoCodigo ||
        cuentaOrigenId === cuentaDestinoId
      ) {
        throw new Error('Las cuentas contables de origen y destino deben ser válidas y distintas');
      }

      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, [
        cuentaOrigenCodigo,
        cuentaDestinoCodigo,
      ]);
      if (
        cuentas.get(cuentaOrigenCodigo)?.id !== cuentaOrigenId ||
        cuentas.get(cuentaDestinoCodigo)?.id !== cuentaDestinoId
      ) {
        throw new Error('Las cuentas de la transferencia no pertenecen al plan contable del tenant');
      }

      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        evento.descripcion || 'Transferencia entre cuentas bancarias',
        [
          {
            cuenta_id: cuentaDestinoId,
            debe: monto,
            haber: 0,
            concepto: 'Ingreso en cuenta bancaria destino',
          },
          {
            cuenta_id: cuentaOrigenId,
            debe: 0,
            haber: monto,
            concepto: 'Salida de cuenta bancaria origen',
          },
        ],
        evento.referencia,
        eventId,
      );
    } catch (error) {
      const eventId = evento.event_id ?? evento.eventId;
      if (eventId) {
        await this.marcarEventoComoFallido(
          eventId,
          `Error generando asiento de transferencia bancaria: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Registra ajustes de una CxC que no representan un ingreso de tesorería.
   * Cada tipo usa su contrapartida económica y nunca la cuenta 10 genérica.
   */
  async generarAsientoAjusteCxc(evento: any): Promise<AsientoContable> {
    try {
      const tenantId = evento.tenant_id;
      const tipo = String(evento.tipoMovimiento ?? evento.tipo_movimiento ?? evento.tipo ?? '')
        .trim()
        .toUpperCase();
      const monto = this.round2(
        Number(evento.montoContabilizado ?? evento.monto_contabilizado ?? evento.monto),
      );
      if (!tenantId || !Number.isFinite(monto) || monto <= 0) {
        throw new Error('El ajuste CxC exige tenant e importe contabilizado positivo');
      }

      let codigos: string[];
      let concepto: string;
      let detalles: DetalleAsiento[];

      switch (tipo) {
        case 'RETENCION': {
          codigos = ['40114', '12'];
          const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, codigos);
          concepto = 'Aplicación de retención a cuenta por cobrar';
          detalles = [
            { cuenta_id: cuentas.get('40114')!.id, debe: monto, haber: 0, concepto: 'IGV retenido por aplicar' },
            { cuenta_id: cuentas.get('12')!.id, debe: 0, haber: monto, concepto: 'Clientes' },
          ];
          break;
        }
        case 'DETRACCION': {
          codigos = ['1042', '12'];
          const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, codigos);
          concepto = 'Aplicación de detracción a cuenta por cobrar';
          detalles = [
            { cuenta_id: cuentas.get('1042')!.id, debe: monto, haber: 0, concepto: 'Fondos sujetos a detracción' },
            { cuenta_id: cuentas.get('12')!.id, debe: 0, haber: monto, concepto: 'Clientes' },
          ];
          break;
        }
        case 'ANTICIPO': {
          codigos = ['122', '12'];
          const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, codigos);
          concepto = 'Aplicación de anticipo de cliente';
          detalles = [
            { cuenta_id: cuentas.get('122')!.id, debe: monto, haber: 0, concepto: 'Anticipos de clientes' },
            { cuenta_id: cuentas.get('12')!.id, debe: 0, haber: monto, concepto: 'Clientes' },
          ];
          break;
        }
        case 'PERCEPCION': {
          codigos = ['12', '40113'];
          const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, codigos);
          concepto = 'Percepción adicionada a cuenta por cobrar';
          detalles = [
            { cuenta_id: cuentas.get('12')!.id, debe: monto, haber: 0, concepto: 'Clientes' },
            { cuenta_id: cuentas.get('40113')!.id, debe: 0, haber: monto, concepto: 'IGV - régimen de percepciones' },
          ];
          break;
        }
        case 'NOTA_CREDITO': {
          codigos = ['70', '40', '12'];
          const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenantId, codigos);
          const base = this.round2(Number(evento.baseAjuste ?? evento.base_ajuste ?? 0));
          const igv = this.round2(Number(evento.igvAjuste ?? evento.igv_ajuste ?? 0));
          if (!Number.isFinite(base) || !Number.isFinite(igv) || base < 0 || igv < 0
              || Math.abs(this.round2(base + igv) - monto) > 0.01) {
            throw new Error('La base e IGV del ajuste por nota de crédito no cuadran');
          }
          concepto = 'Aplicación de nota de crédito a cuenta por cobrar';
          detalles = [
            ...(base > 0 ? [{ cuenta_id: cuentas.get('70')!.id, debe: base, haber: 0, concepto: 'Reversión de ventas' }] : []),
            ...(igv > 0 ? [{ cuenta_id: cuentas.get('40')!.id, debe: igv, haber: 0, concepto: 'Reversión de IGV' }] : []),
            { cuenta_id: cuentas.get('12')!.id, debe: 0, haber: monto, concepto: 'Clientes' },
          ];
          break;
        }
        default:
          throw new Error(`Tipo de ajuste CxC no soportado: ${tipo || 'VACIO'}`);
      }

      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        concepto,
        detalles,
        evento.referencia,
        evento.event_id,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de ajuste CxC: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Asiento exacto opuesto a RETENCION/DETRACCION/ANTICIPO/PERCEPCION CxC. */
  async generarAsientoReversaAjusteCxc(evento: any): Promise<AsientoContable> {
    try {
      const tenantId = evento.tenant_id;
      const tipo = String(
        evento.tipoMovimiento ?? evento.tipo_movimiento ?? evento.tipo ?? '',
      ).trim().toUpperCase();
      const monto = this.round2(Number(
        evento.montoContabilizado ?? evento.monto_contabilizado ?? evento.monto,
      ));
      if (!tenantId || !Number.isFinite(monto) || monto <= 0) {
        throw new Error('La reversa de ajuste CxC exige tenant e importe contabilizado positivo');
      }
      const mapping: Record<string, { debe: string; haber: string; concepto: string }> = {
        RETENCION: {
          debe: '12', haber: '40114',
          concepto: 'Reversa de retención aplicada a cuenta por cobrar',
        },
        DETRACCION: {
          debe: '12', haber: '1042',
          concepto: 'Reversa de detracción aplicada a cuenta por cobrar',
        },
        ANTICIPO: {
          debe: '12', haber: '122',
          concepto: 'Reversa de anticipo aplicado a cuenta por cobrar',
        },
        PERCEPCION: {
          debe: '40113', haber: '12',
          concepto: 'Reversa de percepción adicionada a cuenta por cobrar',
        },
      };
      const selected = mapping[tipo];
      if (!selected) {
        throw new Error(`Tipo de reversa de ajuste CxC no soportado: ${tipo || 'VACIO'}`);
      }
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenantId, [selected.debe, selected.haber],
      );
      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        selected.concepto,
        [
          {
            cuenta_id: cuentas.get(selected.debe)!.id,
            debe: monto,
            haber: 0,
            concepto: selected.debe === '12' ? 'Restauración de clientes' : selected.concepto,
          },
          {
            cuenta_id: cuentas.get(selected.haber)!.id,
            debe: 0,
            haber: monto,
            concepto: selected.haber === '12' ? 'Reducción de clientes' : selected.concepto,
          },
        ],
        evento.referencia,
        evento.event_id,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de reversa de ajuste CxC: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Ajustes documentales CxP; el pago bancario es un evento distinto. */
  async generarAsientoAjusteCxp(evento: any): Promise<AsientoContable> {
    try {
      const tenantId = evento.tenant_id;
      const tipo = String(evento.tipoMovimiento ?? evento.tipo_movimiento ?? evento.tipo ?? '')
        .trim()
        .toUpperCase();
      const monto = this.round2(
        Number(evento.montoContabilizado ?? evento.monto_contabilizado ?? evento.monto),
      );
      if (!tenantId || !Number.isFinite(monto) || monto <= 0) {
        throw new Error('El ajuste CxP exige tenant e importe contabilizado positivo');
      }

      const mapping: Record<string, { debe: string; haber: string; concepto: string }> = {
        RETENCION: { debe: '42', haber: '40114', concepto: 'Retención aplicada a cuenta por pagar' },
        PERCEPCION: { debe: '40113', haber: '42', concepto: 'Percepción adicionada a cuenta por pagar' },
        DETRACCION: { debe: '42', haber: '421', concepto: 'Detracción reclasificada para depósito' },
        ANTICIPO: { debe: '42', haber: '422', concepto: 'Anticipo aplicado a cuenta por pagar' },
      };
      const selected = mapping[tipo];
      if (!selected) throw new Error(`Tipo de ajuste CxP no soportado: ${tipo || 'VACIO'}`);
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenantId,
        [selected.debe, selected.haber],
      );
      return await this.generarAsiento(
        tenantId,
        new Date(evento.fecha),
        selected.concepto,
        [
          {
            cuenta_id: cuentas.get(selected.debe)!.id,
            debe: monto,
            haber: 0,
            concepto: selected.debe === '42' ? 'Proveedores' : selected.concepto,
          },
          {
            cuenta_id: cuentas.get(selected.haber)!.id,
            debe: 0,
            haber: monto,
            concepto: selected.haber === '42' ? 'Proveedores' : selected.concepto,
          },
        ],
        evento.referencia,
        evento.event_id,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de ajuste CxP: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Genera asiento de compra (recepción)
   * Dr 20 Mercaderías [costo]
   * Dr 40 IGV Crédito Fiscal [igv]
   *   Cr 42 Proveedores [total]
   */
  async generarAsientoCompra(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, total, costo, igv, centro_costo_id } = evento;

      // Obtener cuentas del plan
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['20', '40', '42']
      );

      // Validar el documento; el IGV nunca puede usarse como cuenta de ajuste
      // para tapar diferencias entre subtotal y total.
      const sumaDebitos = costo + igv;
      const diferenciaCompra = Math.abs(sumaDebitos - total);
      if (diferenciaCompra > 0.01) {
        throw new Error(
          `Documento de compra inconsistente: subtotal ${costo} + IGV ${igv} no coincide con total ${total}`,
        );
      }

      const detalles: DetalleAsiento[] = [
        { cuenta_id: cuentas.get('20')!.id, debe: costo, haber: 0, concepto: 'Mercaderías', centro_costo_id },
        { cuenta_id: cuentas.get('40')!.id, debe: igv, haber: 0, concepto: 'IGV Crédito Fiscal' },
        { cuenta_id: cuentas.get('42')!.id, debe: 0, haber: total, concepto: 'Proveedores' }
      ];

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Compra de mercadería',
        detalles,
        evento.referencia,
        evento.event_id
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de compra: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Recepción sin factura: Dr 20 por bienes físicos, Dr 63 por servicios o
   * consumos sin stock y Cr 4699 por el total. No reconoce IGV ni CxP.
   */
  async generarAsientoRecepcion(evento: any): Promise<AsientoContable> {
    const { tenant_id, fecha, costo, centro_costo_id } = evento;
    const monto = Number(costo || 0);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new Error('La recepción debe tener un costo positivo');
    }

    const tieneClasificacion =
      evento.mercaderia !== undefined ||
      evento.servicios !== undefined ||
      evento.no_stock !== undefined;
    const mercaderia = tieneClasificacion ? Number(evento.mercaderia ?? 0) : monto;
    const servicios = tieneClasificacion ? Number(evento.servicios ?? 0) : 0;
    const noStock = tieneClasificacion ? Number(evento.no_stock ?? 0) : 0;
    const gastos = servicios + noStock;
    if (![mercaderia, servicios, noStock].every((valor) => Number.isFinite(valor) && valor >= 0)) {
      throw new Error('La clasificación contable de la recepción es inválida');
    }
    if (Math.abs(mercaderia + gastos - monto) > 0.01) {
      throw new Error(
        `La clasificación de recepción (${mercaderia + gastos}) no coincide con el costo (${monto})`,
      );
    }

    const codigos = ['4699'];
    if (mercaderia > 0) codigos.push('20');
    if (gastos > 0) codigos.push('63');
    const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
      tenant_id,
      codigos,
    );
    const detalles: DetalleAsiento[] = [];
    if (mercaderia > 0) {
      detalles.push({
        cuenta_id: cuentas.get('20')!.id,
        debe: mercaderia,
        haber: 0,
        concepto: 'Mercaderías recibidas',
        centro_costo_id,
      });
    }
    if (gastos > 0) {
      detalles.push({
        cuenta_id: cuentas.get('63')!.id,
        debe: gastos,
        haber: 0,
        concepto: 'Servicios y consumos recibidos',
        centro_costo_id,
      });
    }
    detalles.push({
      cuenta_id: cuentas.get('4699')!.id,
      debe: 0,
      haber: monto,
      concepto: 'Bienes y servicios recibidos por facturar',
    });
    return this.generarAsiento(
      tenant_id,
      new Date(fecha),
      'Recepción pendiente de factura',
      detalles,
      evento.referencia,
      evento.event_id,
    );
  }

  /**
   * Factura del proveedor. Si está vinculada a una recepción, cancela la cuenta
   * transitoria 4699; si no, reconoce directamente la mercadería.
   */
  async generarAsientoFacturaProveedor(evento: any): Promise<AsientoContable> {
    const { tenant_id, fecha, subtotal, igv, total, recepcion_id } = evento;
    const base = this.round2(Number(subtotal || 0));
    const impuesto = this.round2(Number(igv || 0));
    const importe = this.round2(Number(total || 0));
    const retencion = this.round2(Number(evento.ajustes?.retencion ?? evento.retencion ?? 0));
    const percepcion = this.round2(Number(evento.ajustes?.percepcion ?? evento.percepcion ?? 0));
    const detraccion = this.round2(Number(evento.ajustes?.detraccion ?? evento.detraccion ?? 0));
    const anticipo = this.round2(Number(evento.ajustes?.anticipo ?? evento.anticipo ?? 0));
    const saldoProveedor = this.round2(Number(
      evento.saldoProveedor ?? evento.saldo_proveedor
        ?? importe - retencion - detraccion - anticipo + percepcion,
    ));
    if (![base, impuesto, importe, retencion, percepcion, detraccion, anticipo, saldoProveedor]
      .every(Number.isFinite)
      || base < 0 || impuesto < 0 || importe <= 0
      || retencion < 0 || percepcion < 0 || detraccion < 0 || anticipo < 0
      || saldoProveedor < 0) {
      throw new Error('La factura de proveedor contiene importes inválidos');
    }
    if (Math.abs(this.round2(base + impuesto) - importe) > 0.01) {
      throw new Error(
        `Factura de proveedor inconsistente: subtotal ${base} + IGV ${impuesto} no coincide con total ${importe}`,
      );
    }
    const saldoEsperado = this.round2(importe - retencion - detraccion - anticipo + percepcion);
    if (Math.abs(saldoEsperado - saldoProveedor) > 0.01) {
      throw new Error(
        `Factura de proveedor inconsistente: saldo ${saldoProveedor} no coincide con total y ajustes ${saldoEsperado}`,
      );
    }
    const cuentaBase = recepcion_id ? '4699' : '20';
    const codigos = [cuentaBase, '40', '42'];
    if (percepcion > 0) codigos.push('40113');
    if (retencion > 0) codigos.push('40114');
    if (detraccion > 0) codigos.push('421');
    if (anticipo > 0) codigos.push('422');
    const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
      tenant_id,
      codigos,
    );
    const detalles: DetalleAsiento[] = [
      {
        cuenta_id: cuentas.get(cuentaBase)!.id,
        debe: base,
        haber: 0,
        concepto: recepcion_id ? 'Aplicación de mercadería recibida por facturar' : 'Mercaderías',
      },
      { cuenta_id: cuentas.get('40')!.id, debe: impuesto, haber: 0, concepto: 'IGV Crédito Fiscal' },
      ...(percepcion > 0 ? [{
        cuenta_id: cuentas.get('40113')!.id,
        debe: percepcion,
        haber: 0,
        concepto: 'Percepción de IGV por aplicar',
      }] : []),
      ...(saldoProveedor > 0 ? [{
        cuenta_id: cuentas.get('42')!.id,
        debe: 0,
        haber: saldoProveedor,
        concepto: 'Proveedores - saldo neto',
      }] : []),
      ...(retencion > 0 ? [{
        cuenta_id: cuentas.get('40114')!.id,
        debe: 0,
        haber: retencion,
        concepto: 'Retención por pagar',
      }] : []),
      ...(detraccion > 0 ? [{
        cuenta_id: cuentas.get('421')!.id,
        debe: 0,
        haber: detraccion,
        concepto: 'Detracción pendiente de depósito',
      }] : []),
      ...(anticipo > 0 ? [{
        cuenta_id: cuentas.get('422')!.id,
        debe: 0,
        haber: anticipo,
        concepto: 'Aplicación de anticipo a proveedor',
      }] : []),
    ];
    return this.generarAsiento(
      tenant_id,
      new Date(fecha),
      'Factura de proveedor',
      detalles,
      evento.referencia,
      evento.event_id,
    );
  }

  /**
   * Genera asiento de pago CxP
   * Dr 42 Proveedores [monto]
   *   Cr 10 Bancos [monto]
   */
  async generarAsientoPago(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, monto, centro_costo_id } = evento;

      // `monto` viene en la moneda del documento. Tesorería lo valúa y adjunta
      // los importes en moneda local; si no vienen (pago en moneda local, o
      // eventos anteriores a la valuación), ambos coinciden con el monto.
      const montoContabilizado = this.round2(
        Number(evento.montoContabilizado ?? evento.monto_contabilizado ?? monto)
      );
      const montoLiquidacion = this.round2(
        Number(evento.montoLiquidacion ?? evento.monto_liquidacion ?? monto)
      );
      const diferenciaCambio = this.round2(
        Number(evento.diferenciaCambio ?? evento.diferencia_cambio ?? 0)
      );

      // Solo se piden las cuentas de resultado si hay diferencia que registrar:
      // pedirlas siempre las crearía en tenants que nunca operan en divisa.
      const codigos = ['42', '10'];
      if (diferenciaCambio < 0) codigos.push('676');
      if (diferenciaCambio > 0) codigos.push('776');

      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        codigos
      );

      // Se cancela el pasivo por su valor contabilizado y se acredita el banco
      // por lo efectivamente desembolsado. La brecha entre ambos es el
      // resultado por diferencia de cambio.
      const detalles: DetalleAsiento[] = [
        { cuenta_id: cuentas.get('42')!.id, debe: montoContabilizado, haber: 0, concepto: 'Proveedores', centro_costo_id },
        { cuenta_id: cuentas.get('10')!.id, debe: 0, haber: montoLiquidacion, concepto: 'Bancos', centro_costo_id }
      ];

      if (diferenciaCambio < 0) {
        detalles.push({
          cuenta_id: cuentas.get('676')!.id,
          debe: this.round2(-diferenciaCambio),
          haber: 0,
          concepto: 'Pérdida por diferencia de cambio',
          centro_costo_id
        });
      } else if (diferenciaCambio > 0) {
        detalles.push({
          cuenta_id: cuentas.get('776')!.id,
          debe: 0,
          haber: diferenciaCambio,
          concepto: 'Ganancia por diferencia de cambio',
          centro_costo_id
        });
      }

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Pago a proveedor',
        detalles,
        evento.referencia,
        evento.event_id
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de pago: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Genera asiento de ajuste de inventario
   */
  async generarAsientoAjusteInventario(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, valor, tipo, centro_costo_id } = evento;

      let detalles: DetalleAsiento[];

      if (tipo === 'SOBRANTE') {
        // Si positivo (sobrante):
        // Dr 20 Mercaderías [valor]
        //   Cr 76 Ingresos Diversos [valor]
        const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
          tenant_id,
          ['20', '76']
        );
        detalles = [
          { cuenta_id: cuentas.get('20')!.id, debe: valor, haber: 0, concepto: 'Mercaderías - Sobrante', centro_costo_id },
          { cuenta_id: cuentas.get('76')!.id, debe: 0, haber: valor, concepto: 'Ingresos Diversos', centro_costo_id }
        ];
      } else {
        // Si negativo (faltante):
        // Dr 68 Valuación Activos [valor]
        //   Cr 20 Mercaderías [valor]
        const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
          tenant_id,
          ['68', '20']
        );
        detalles = [
          { cuenta_id: cuentas.get('68')!.id, debe: valor, haber: 0, concepto: 'Valuación de Activos', centro_costo_id },
          { cuenta_id: cuentas.get('20')!.id, debe: 0, haber: valor, concepto: 'Mercaderías - Faltante', centro_costo_id }
        ];
      }

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        `Ajuste de inventario - ${tipo}`,
        detalles,
        evento.referencia,
        evento.event_id
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de ajuste de inventario: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Genera asiento de planilla con aportes patronales reales.
   * Dr 621 Remuneraciones [ingresos]
   * Dr 627 Seguridad/prevision social [aportes empleador]
   *   Cr 403 Instituciones publicas [descuentos/retenciones]
   *   Cr 407 Aportes empleador por pagar [aportes empleador]
   *   Cr 411 Remuneraciones por pagar [neto]
   */
  async generarAsientoPlanilla(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, sueldos, retenciones, neto, centro_costo_id } = evento;
      const totalIngresos = Number(sueldos ?? 0);
      const totalDescuentos = Number(retenciones ?? 0);
      const totalAportes = Number(evento.aportes ?? evento.totalAportes ?? evento.total_aportes ?? 0);
      const totalNeto = Number(neto ?? 0);
      const sourceEventId = evento.source_event_id || evento.planilla_id || evento.event_id;

      // Validar ecuación: ingresos + aportes patronales = descuentos + neto + aportes patronales.
      const totalDebeEsperado = this.round2(totalIngresos + totalAportes);
      const totalHaberEsperado = this.round2(totalDescuentos + totalNeto + totalAportes);
      const diferencia = Math.abs(totalDebeEsperado - totalHaberEsperado);
      if (diferencia > 0.01) {
        this.logger.error(
          `PLANILLA_IMBALANCE debe=${totalDebeEsperado} != haber=${totalHaberEsperado}, ingresos=${totalIngresos}, aportes=${totalAportes}, retenciones=${totalDescuentos}, neto=${totalNeto}, diff=${diferencia.toFixed(2)}`,
        );
        throw new Error(
          `Asiento de planilla desbalanceado: debe (${totalDebeEsperado}) != haber (${totalHaberEsperado}). Diferencia: ${diferencia.toFixed(2)}`,
        );
      }

      // Obtener cuentas del plan
      const codigosCuentas = totalAportes > 0
        ? ['621', '627', '403', '407', '411']
        : ['621', '403', '411'];
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        codigosCuentas
      );

      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get('621')!.id,
          debe: totalIngresos,
          haber: 0,
          concepto: 'Gastos de Personal - Remuneraciones',
          centro_costo_id
        }
      ];

      if (totalAportes > 0) {
        detalles.push({
          cuenta_id: cuentas.get('627')!.id,
          debe: totalAportes,
          haber: 0,
          concepto: 'Aportes empleador - EsSalud',
          centro_costo_id,
        });
      }

      if (totalDescuentos > 0) {
        detalles.push({
          cuenta_id: cuentas.get('403')!.id,
          debe: 0,
          haber: totalDescuentos,
          concepto: 'Retenciones laborales por pagar'
        });
      }

      if (totalAportes > 0) {
        detalles.push({
          cuenta_id: cuentas.get('407')!.id,
          debe: 0,
          haber: totalAportes,
          concepto: 'EsSalud por pagar',
        });
      }

      if (totalNeto > 0) {
        detalles.push({
          cuenta_id: cuentas.get('411')!.id,
          debe: 0,
          haber: totalNeto,
          concepto: 'Remuneraciones por Pagar'
        });
      }

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Planilla de sueldos',
        detalles,
        evento.referencia,
        sourceEventId
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de planilla: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Genera asiento de pago de planilla
   * Dr 411 Remuneraciones por Pagar [monto]
   *   Cr cuenta tesorera exacta validada contra banco/caja [monto]
   */
  async generarAsientoPagoPlanilla(evento: any): Promise<AsientoContable> {
    const { tenant_id, fecha, monto } = evento;
    const montoNum = this.round2(Number(monto ?? 0));
    const cuentaTesoreriaId = String(evento.cuenta_tesoreria_id ?? '').trim();
    const cuentaTesoreriaCodigo = String(evento.cuenta_tesoreria_codigo ?? '').trim();
    const metodoPago = String(evento.metodo_pago ?? '').toLowerCase();
    if (!tenant_id || !Number.isFinite(montoNum) || montoNum <= 0
        || !cuentaTesoreriaId || !cuentaTesoreriaCodigo
        || !['transferencia', 'efectivo'].includes(metodoPago)) {
      throw new Error('Pago de planilla: cuenta tesorera o importe inválido');
    }
    const sourceEventId = evento.source_event_id || evento.planilla_id || evento.event_id;
    const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenant_id, ['411']);
    const cuentaRemuneracionesId = cuentas.get('411')!.id;
    if (cuentaRemuneracionesId === cuentaTesoreriaId) {
      throw new Error('Pago de planilla: la cuenta tesorera no puede ser la cuenta de remuneraciones');
    }

    return this.generarAsiento(
      tenant_id,
      new Date(fecha),
      `Pago de planilla ${evento.referencia || ''}`.trim(),
      [
        {
          cuenta_id: cuentaRemuneracionesId,
          debe: montoNum,
          haber: 0,
          concepto: 'Pago de remuneraciones',
        },
        {
          cuenta_id: cuentaTesoreriaId,
          debe: 0,
          haber: montoNum,
          concepto: `${metodoPago === 'efectivo' ? 'Caja' : 'Banco'} ${cuentaTesoreriaCodigo} - Pago planilla`,
        },
      ],
      evento.referencia,
      sourceEventId,
    );
  }

  async generarAsientoDevengoLiquidacion(evento: any): Promise<AsientoContable> {
    const componentes = evento.componentes_liquidacion ?? evento.componentesLiquidacion;
    const total = this.round2(Number(evento.monto ?? evento.totalLiquidacion ?? 0));
    const montoCts = this.round2(Number(componentes?.montoCts));
    const indemnizacion = this.round2(Number(componentes?.indemnizacion));
    const beneficios = this.round2(Number(componentes?.beneficiosSociales));
    const remuneracionesOtros = this.round2(Number(componentes?.remuneracionesYOtros));
    const version = Number(componentes?.version);
    const esperadoBeneficios = this.round2(Math.min(total, montoCts + indemnizacion));

    if (!componentes || !Number.isInteger(version) || version < 492
        || ![total, montoCts, indemnizacion, beneficios, remuneracionesOtros]
          .every((importe) => Number.isFinite(importe) && importe >= 0)
        || total <= 0
        || montoCts + indemnizacion > total
        || Math.abs(beneficios - esperadoBeneficios) > 0.01
        || Math.abs(this.round2(beneficios + remuneracionesOtros) - total) > 0.01
        || Math.abs(this.round2(Number(componentes.total)) - total) > 0.01) {
      throw new Error('Devengo de liquidación laboral: snapshot de componentes inválido o desbalanceado');
    }

    const codigos = ['411'];
    if (beneficios > 0) codigos.push('629');
    if (remuneracionesOtros > 0) codigos.push('621');
    const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
      evento.tenant_id,
      codigos,
    );
    const detalles: DetalleAsiento[] = [];
    if (beneficios > 0) {
      detalles.push({
        cuenta_id: cuentas.get('629')!.id,
        debe: beneficios,
        haber: 0,
        concepto: `Beneficios sociales (CTS e indemnización) - snapshot ${version}`,
      });
    }
    if (remuneracionesOtros > 0) {
      detalles.push({
        cuenta_id: cuentas.get('621')!.id,
        debe: remuneracionesOtros,
        haber: 0,
        concepto: `Vacaciones y otros conceptos remunerativos - snapshot ${version}`,
      });
    }
    detalles.push({
      cuenta_id: cuentas.get('411')!.id,
      debe: 0,
      haber: total,
      concepto: 'Liquidación laboral por pagar',
    });

    return this.generarAsiento(
      evento.tenant_id,
      new Date(evento.fecha),
      'Devengo de liquidación laboral',
      detalles,
      evento.referencia,
      evento.source_event_id || evento.event_id,
    );
  }

  async generarAsientoPagoLiquidacion(evento: any): Promise<AsientoContable> {
    return this.generarAsientoMovimientoLaboral(evento, {
      cuentaDebe: '411',
      cuentaHaber: null,
      tesoreriaEn: 'haber',
      concepto: 'Pago de liquidación laboral',
      detalleDebe: 'Liquidaciones por pagar',
      detalleHaber: 'Tesorería del pago de liquidación',
    });
  }

  async generarAsientoReversaPagoLiquidacion(evento: any): Promise<AsientoContable> {
    return this.generarAsientoMovimientoLaboral(evento, {
      cuentaDebe: null,
      cuentaHaber: '411',
      tesoreriaEn: 'debe',
      concepto: 'Reversa de pago de liquidación laboral',
      detalleDebe: 'Reingreso a la tesorería original',
      detalleHaber: 'Liquidaciones por pagar restauradas',
    });
  }

  async generarAsientoDepositoCts(evento: any): Promise<AsientoContable> {
    return this.generarAsientoMovimientoLaboral(evento, {
      // No existe aún un evento separado de provisión CTS. En este release el
      // depósito reconoce el beneficio y lo cancela en el mismo asiento; usar
      // 415 aquí inventaría un pasivo previo que el sistema no ha devengado.
      cuentaDebe: '629',
      cuentaHaber: null,
      tesoreriaEn: 'haber',
      concepto: 'Depósito semestral de CTS',
      detalleDebe: 'Beneficio social CTS reconocido al depósito',
      detalleHaber: 'Banco exacto del depósito CTS',
    });
  }

  private async generarAsientoMovimientoLaboral(
    evento: any,
    config: {
      cuentaDebe: string | null;
      cuentaHaber: string | null;
      tesoreriaEn?: 'debe' | 'haber';
      concepto: string;
      detalleDebe: string;
      detalleHaber: string;
    },
  ): Promise<AsientoContable> {
    const monto = this.round2(Number(
      evento.monto
      ?? evento.totalLiquidacion
      ?? evento.totalPagado
      ?? evento.montoRevertido
      ?? evento.totalDepositado
      ?? 0,
    ));
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new Error(`${config.concepto}: importe inválido`);
    }
    const cuentaTesoreriaId = String(evento.cuenta_tesoreria_id ?? '').trim();
    const cuentaTesoreriaCodigo = String(evento.cuenta_tesoreria_codigo ?? '').trim();
    const metodoPago = String(evento.metodo_pago ?? '').toLowerCase();
    if (config.tesoreriaEn && (!cuentaTesoreriaId || !cuentaTesoreriaCodigo
        || !['transferencia', 'efectivo'].includes(metodoPago))) {
      throw new Error(`${config.concepto}: cuenta tesorera exacta requerida`);
    }
    const codigos = [config.cuentaDebe, config.cuentaHaber]
      .filter((codigo): codigo is string => Boolean(codigo));
    const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(evento.tenant_id, codigos);
    const cuentaDebeId = config.tesoreriaEn === 'debe'
      ? cuentaTesoreriaId
      : cuentas.get(config.cuentaDebe!)!.id;
    const cuentaHaberId = config.tesoreriaEn === 'haber'
      ? cuentaTesoreriaId
      : cuentas.get(config.cuentaHaber!)!.id;
    if (!cuentaDebeId || !cuentaHaberId || cuentaDebeId === cuentaHaberId) {
      throw new Error(`${config.concepto}: cuentas contables inválidas o coincidentes`);
    }
    const sourceEventId = evento.source_event_id || evento.event_id;
    return this.generarAsiento(
      evento.tenant_id,
      new Date(evento.fecha),
      config.concepto,
      [
        {
          cuenta_id: cuentaDebeId,
          debe: monto,
          haber: 0,
          concepto: config.tesoreriaEn === 'debe'
            ? `${config.detalleDebe} (${cuentaTesoreriaCodigo})`
            : config.detalleDebe,
        },
        {
          cuenta_id: cuentaHaberId,
          debe: 0,
          haber: monto,
          concepto: config.tesoreriaEn === 'haber'
            ? `${config.detalleHaber} (${cuentaTesoreriaCodigo})`
            : config.detalleHaber,
        },
      ],
      evento.referencia,
      sourceEventId,
    );
  }

  /**
   * Genera asiento de depreciación
   * Dr 68 Depreciación [monto]
   *   Cr 39 Deprec. Acumulada [monto]
   */
  async generarAsientoDepreciacion(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, monto, centro_costo_id } = evento;

      // Obtener cuentas del plan
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['68', '39']
      );

      const detalles: DetalleAsiento[] = [
        { cuenta_id: cuentas.get('68')!.id, debe: monto, haber: 0, concepto: 'Depreciación', centro_costo_id },
        {
          cuenta_id: cuentas.get('39')!.id,
          debe: 0,
          haber: monto,
          concepto: 'Depreciación Acumulada'
        }
      ];

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Depreciación de activos fijos',
        detalles,
        evento.referencia,
        evento.event_id
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de depreciación: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Genera asiento de devolución a proveedor (retorno de mercadería)
   * Dr 42 Proveedores [total]
   *   Cr 20 Mercaderías [costo/subtotal]
   *   Cr 40 IGV Crédito Fiscal [igv]
   */
  async generarAsientoDevolucionProveedor(evento: {
    tenant_id: string;
    fecha: string | Date;
    subtotal: number;
    igv: number;
    total: number;
    referencia?: string;
    event_id?: string;
    centro_costo_id?: string;
    mercaderia?: number;
    servicios?: number;
    no_stock?: number;
    cuenta_pasivo?: '42' | '4699';
  }): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, referencia, event_id, centro_costo_id } = evento;
      const subtotal = Number(evento.subtotal ?? 0);
      const igv = Number(evento.igv ?? 0);
      const total = Number(evento.total ?? 0);
      const mercaderia = evento.mercaderia == null ? subtotal : Number(evento.mercaderia);
      const servicios = Number(evento.servicios ?? 0);
      const noStock = Number(evento.no_stock ?? 0);
      const cuentaPasivo = evento.cuenta_pasivo ?? '42';
      if (cuentaPasivo !== '42' && cuentaPasivo !== '4699') {
        throw new Error(`Cuenta pasivo de devolución no soportada: ${cuentaPasivo}`);
      }
      if (![subtotal, igv, total, mercaderia, servicios, noStock].every(Number.isFinite)
          || subtotal < 0 || igv < 0 || total <= 0
          || mercaderia < 0 || servicios < 0 || noStock < 0
          || Math.abs(mercaderia + servicios + noStock - subtotal) > 0.01
          || Math.abs(subtotal + igv - total) > 0.01) {
        throw new Error('La devolución a proveedor contiene importes o clasificación inconsistentes');
      }

      const codigos: string[] = [cuentaPasivo];
      if (mercaderia > 0) codigos.push('20');
      if (servicios + noStock > 0) codigos.push('63');
      if (igv > 0) codigos.push('40');
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenant_id, codigos);

      const detalles: DetalleAsiento[] = [{
        cuenta_id: cuentas.get(cuentaPasivo)!.id,
        debe: total,
        haber: 0,
        concepto: cuentaPasivo === '42' ? 'Proveedores' : 'Recibido por facturar',
        centro_costo_id,
      }];
      if (mercaderia > 0) detalles.push({
        cuenta_id: cuentas.get('20')!.id,
        debe: 0,
        haber: mercaderia,
        concepto: 'Mercaderías devueltas',
        centro_costo_id,
      });
      if (servicios + noStock > 0) detalles.push({
        cuenta_id: cuentas.get('63')!.id,
        debe: 0,
        haber: servicios + noStock,
        concepto: 'Servicios y consumos devueltos',
        centro_costo_id,
      });
      if (igv > 0) detalles.push({
        cuenta_id: cuentas.get('40')!.id,
        debe: 0,
        haber: igv,
        concepto: 'Reverso IGV Crédito Fiscal',
      });

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Devolución a proveedor',
        detalles,
        referencia,
        event_id
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de devolución proveedor: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async obtenerPlantillaAsientoVenta(paisId: number, tipoDocumento: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plantillas_asientos_ventas')
      .select('*')
      .eq('pais_id', paisId)
      .eq('tipo_documento', tipoDocumento)
      .eq('activo', true)
      .maybeSingle();

    if (error || !data) {
      throw new Error(
        `No se encontró plantilla contable para país ${paisId} y documento ${tipoDocumento}`,
      );
    }

    return data;
  }

  private round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }
}
