import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodosService } from './periodos.service';
import { PlanCuentasService } from './plan-cuentas.service';
import { DocumentoFiscalGeneradoEvent } from '../../../shared/events/event-bus.service';

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
    private readonly planCuentasService: PlanCuentasService
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
    const totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
    const totalHaber = detalles.reduce((sum, d) => sum + d.haber, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
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
          await this.marcarEventoComoProcesado(sourceEventId);
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
          // Si el asiento ya existe, el evento igualmente debe salir del outbox
          // para evitar que quede en pending indefinidamente.
          await this.marcarEventoComoProcesado(sourceEventId);
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
            await this.marcarEventoComoProcesado(sourceEventId);
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

      // Marcar evento como procesado en outbox si existe sourceEventId
      if (sourceEventId) {
        await this.marcarEventoComoProcesado(sourceEventId);
      }

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
    try {
      const { error } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('event_id', eventId);

      if (error) {
        this.logger.error(
          `❌ [Asientos] Error marcando evento ${eventId} como procesado:`,
          error
        );
        // No lanzamos error para no afectar la creación del asiento
        // El evento quedará en estado pending y podrá ser reprocesado
      } else {
        this.logger.log(
          `✅ [Asientos] Evento ${eventId} marcado como procesado en outbox`
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ [Asientos] Excepción marcando evento ${eventId} como procesado:`,
        error
      );
      // No lanzamos error para no afectar la creación del asiento
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
    
    try {
      // Obtener el evento actual para incrementar retry_count
      const { data: evento, error: fetchError } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .select('retry_count, status')
        .eq('event_id', eventId)
        .maybeSingle();

      if (fetchError) {
        this.logger.error(
          `❌ [Asientos] Error obteniendo evento ${eventId}:`,
          fetchError
        );
        return;
      }

      // Si no existe el evento, no podemos marcarlo; evitar reventar el worker
      if (!evento) {
        this.logger.warn(
          `⚠️ [Asientos] Evento ${eventId} no encontrado al marcar como fallido; se omite`
        );
        return;
      }

      if (String(evento.status).toLowerCase() === 'completed') {
        this.logger.warn(
          `⚠️ [Asientos] Evento ${eventId} ya estaba completado; no se degrada a fallido`
        );
        return;
      }

      const retryCount = (evento?.retry_count || 0) + 1;
      const isPermanentFailure = retryCount >= maxRetries;

      // Truncar mensaje de error si es muy largo
      const truncatedMessage = errorMessage.length > 500 
        ? errorMessage.substring(0, 497) + '...'
        : errorMessage;

      const updateData: any = {
        status: isPermanentFailure ? 'dead_letter' : 'failed',
        error_message: truncatedMessage,
        retry_count: retryCount,
        updated_at: new Date().toISOString()
      };

      const { error } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .update(updateData)
        .eq('event_id', eventId)
        .neq('status', 'completed');

      if (error) {
        this.logger.error(
          `❌ [Asientos] Error marcando evento ${eventId} como fallido:`,
          error
        );
      } else {
        if (isPermanentFailure) {
          this.logger.error(
            `🚫 [Asientos] Evento ${eventId} marcado como DEAD_LETTER después de ${retryCount} intentos: ${truncatedMessage}`
          );
        } else {
          this.logger.warn(
            `⚠️ [Asientos] Evento ${eventId} marcado como fallido (intento ${retryCount}/${maxRetries}): ${truncatedMessage}`
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `❌ [Asientos] Excepción marcando evento ${eventId} como fallido:`,
        error
      );
    }
  }

  /**
   * Reinicia un evento fallido para que pueda ser reprocesado
   * @param eventId - ID del evento a reiniciar
   * @returns true si se reinició exitosamente
   */
  async reiniciarEventoFallido(eventId: string): Promise<boolean> {
    try {
      const MAX_RESTARTS = 3;

      // Check current restart count before resetting
      const { data: evento, error: fetchError } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .select('id, retry_count, payload')
        .eq('event_id', eventId)
        .in('status', ['failed', 'dead_letter'])
        .maybeSingle();

      if (fetchError || !evento) {
        console.warn(`⚠️ [Asientos] Evento ${eventId} no encontrado o no está en estado fallido`);
        return false;
      }

      const restartCount = (evento.payload as any)?.restart_count ?? 0;
      if (restartCount >= MAX_RESTARTS) {
        console.error(`❌ [Asientos] Evento ${eventId} alcanzó el límite de ${MAX_RESTARTS} reinicios`);
        return false;
      }

      const { error } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .update({
          status: 'pending',
          retry_count: 0,
          error_message: null,
          processed_at: null,
          updated_at: new Date().toISOString(),
          payload: {
            ...(evento.payload as object),
            restart_count: restartCount + 1,
          },
        })
        .eq('event_id', eventId)
        .in('status', ['failed', 'dead_letter']);

      if (error) {
        this.logger.error(
          `❌ [Asientos] Error reiniciando evento ${eventId}:`,
          error
        );
        return false;
      }

      this.logger.log(
        `✅ [Asientos] Evento ${eventId} reiniciado para reprocesamiento`
      );
      return true;
    } catch (error) {
      this.logger.error(
        `❌ [Asientos] Excepción reiniciando evento ${eventId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Obtiene estadísticas de eventos fallidos
   * @param tenantId - ID del tenant (opcional)
   * @returns Estadísticas de eventos fallidos
   */
  async obtenerEstadisticasEventosFallidos(tenantId?: string): Promise<{
    total_fallidos: number;
    total_dead_letter: number;
    por_tipo: Record<string, number>;
  }> {
    try {
      let query = this.supabaseService
        .getClient()
        .from('outbox_events')
        .select('event_type, status')
        .in('status', ['failed', 'dead_letter']);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error(
          '❌ [Asientos] Error obteniendo estadísticas de eventos fallidos:',
          error
        );
        throw error;
      }

      const stats = {
        total_fallidos: 0,
        total_dead_letter: 0,
        por_tipo: {} as Record<string, number>
      };

      if (data) {
        for (const evento of data) {
          if (evento.status === 'failed') {
            stats.total_fallidos++;
          } else if (evento.status === 'dead_letter') {
            stats.total_dead_letter++;
          }

          stats.por_tipo[evento.event_type] = 
            (stats.por_tipo[evento.event_type] || 0) + 1;
        }
      }

      return stats;
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

      // Venta al CONTADO (POS o factura contado): el cobro entra a Caja/Bancos
      // según el método de pago, NO a CxC (12). Evita la "CxC fantasma" de una
      // venta ya cobrada y hace que el ingreso quede contabilizado UNA sola vez.
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

  async generarAsientoNotaCredito(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, base_imponible, igv, centro_costo_id } = evento;

      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['12', '70', '40', '69', '20']
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

      detalles.push({
        cuenta_id: cuentas.get('12')!.id,
        debe: 0,
        haber: saldoClientes,
        concepto: 'Reversión clientes',
      });

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

  /**
   * Genera asiento de cobro CxC
   * Dr 10 Bancos/Caja [monto]
   *   Cr 12 Clientes [monto]
   */
  async generarAsientoCobro(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, monto, centro_costo_id } = evento;

      // Obtener cuentas del plan
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['10', '12']
      );

      const detalles: DetalleAsiento[] = [
        { cuenta_id: cuentas.get('10')!.id, debe: monto, haber: 0, concepto: 'Bancos/Caja', centro_costo_id },
        { cuenta_id: cuentas.get('12')!.id, debe: 0, haber: monto, concepto: 'Clientes', centro_costo_id }
      ];

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

  /** Recepción física sin factura: Dr 20 / Cr 4699. No reconoce IGV ni CxP. */
  async generarAsientoRecepcion(evento: any): Promise<AsientoContable> {
    const { tenant_id, fecha, costo, centro_costo_id } = evento;
    const monto = Number(costo || 0);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new Error('La recepción debe tener un costo positivo');
    }
    const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
      tenant_id,
      ['20', '4699'],
    );
    const detalles: DetalleAsiento[] = [
      { cuenta_id: cuentas.get('20')!.id, debe: monto, haber: 0, concepto: 'Mercaderías recibidas', centro_costo_id },
      { cuenta_id: cuentas.get('4699')!.id, debe: 0, haber: monto, concepto: 'Mercaderías recibidas por facturar' },
    ];
    return this.generarAsiento(
      tenant_id,
      new Date(fecha),
      'Recepción de mercadería pendiente de factura',
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
    const base = Number(subtotal || 0);
    const impuesto = Number(igv || 0);
    const importe = Number(total || 0);
    if (![base, impuesto, importe].every(Number.isFinite) || base < 0 || impuesto < 0 || importe <= 0) {
      throw new Error('La factura de proveedor contiene importes inválidos');
    }
    if (Math.abs(base + impuesto - importe) > 0.01) {
      throw new Error(
        `Factura de proveedor inconsistente: subtotal ${base} + IGV ${impuesto} no coincide con total ${importe}`,
      );
    }
    const cuentaBase = recepcion_id ? '4699' : '20';
    const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
      tenant_id,
      [cuentaBase, '40', '42'],
    );
    const detalles: DetalleAsiento[] = [
      {
        cuenta_id: cuentas.get(cuentaBase)!.id,
        debe: base,
        haber: 0,
        concepto: recepcion_id ? 'Aplicación de mercadería recibida por facturar' : 'Mercaderías',
      },
      { cuenta_id: cuentas.get('40')!.id, debe: impuesto, haber: 0, concepto: 'IGV Crédito Fiscal' },
      { cuenta_id: cuentas.get('42')!.id, debe: 0, haber: importe, concepto: 'Proveedores' },
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
   *   Cr 10 Bancos [monto]
   */
  async generarAsientoPagoPlanilla(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, monto } = evento;
      const montoNum = Number(monto ?? 0);
      const sourceEventId = evento.source_event_id || evento.planilla_id || evento.event_id;

      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['411', '10'],
      );

      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get('411')!.id,
          debe: montoNum,
          haber: 0,
          concepto: 'Pago de remuneraciones',
        },
        {
          cuenta_id: cuentas.get('10')!.id,
          debe: 0,
          haber: montoNum,
          concepto: 'Bancos - Pago planilla',
        },
      ];

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        `Pago de planilla ${evento.referencia || ''}`.trim(),
        detalles,
        evento.referencia,
        sourceEventId,
      );
    } catch (error) {
      if (evento.event_id) {
        await this.marcarEventoComoFallido(
          evento.event_id,
          `Error generando asiento de pago planilla: ${error.message}`,
        );
      }
      throw error;
    }
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
  }): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, subtotal, igv, total, referencia, event_id, centro_costo_id } = evento;

      // Obtener cuentas del plan: inventario, IGV crédito fiscal, proveedores
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(tenant_id, ['20', '40', '42']);

      const detalles: DetalleAsiento[] = [
        { cuenta_id: cuentas.get('42')!.id, debe: total, haber: 0, concepto: 'Proveedores', centro_costo_id },
        { cuenta_id: cuentas.get('20')!.id, debe: 0, haber: subtotal, concepto: 'Mercaderías devueltas', centro_costo_id },
        { cuenta_id: cuentas.get('40')!.id, debe: 0, haber: igv, concepto: 'Reverso IGV Crédito Fiscal' },
      ];

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
