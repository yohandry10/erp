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

    // Verificar idempotencia si se proporciona sourceEventId
    if (sourceEventId) {
      const asientoExistente = await this.buscarAsientoPorEvento(
        tenantId,
        sourceEventId
      );
      if (asientoExistente) {
        console.log(
          `⚠️ [Asientos] Asiento ya existe para evento ${sourceEventId}, retornando existente`
        );
        // Si el asiento ya existe, el evento igualmente debe salir del outbox
        // para evitar que quede en pending indefinidamente.
        await this.marcarEventoComoProcesado(sourceEventId);
        return asientoExistente;
      }
    }

    // Generar número de asiento
    const asientoNumbering = await this.generarNumeroAsiento(tenantId, fecha);

    // Crear asiento contable
    const { data: asiento, error: asientoError } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .insert({
        tenant_id: tenantId,
        numero_asiento: asientoNumbering.numero,
        codigo: asientoNumbering.codigo,
        fecha: fecha.toISOString(),
        concepto,
        descripcion: concepto,
        referencia,
        total_debe: totalDebe,
        total_haber: totalHaber,
        estado: 'CONFIRMADO',
        source_event_id: sourceEventId
      })
      .select()
      .single();

    if (asientoError) {
      console.error('❌ [Asientos] Error creando asiento:', asientoError);
      throw new Error(`Error creando asiento contable: ${asientoError.message}`);
    }

    // Crear detalles del asiento
    const detallesConAsientoId = detalles.map(detalle => ({
      tenant_id: tenantId,
      asiento_id: asiento.id,
      cuenta_id: detalle.cuenta_id,
      debe: detalle.debe,
      haber: detalle.haber,
      nombre: detalle.concepto,
      centro_costo_id: detalle.centro_costo_id
    }));

    const { error: detallesError } = await this.supabaseService
      .getClient()
      .from('detalle_asientos')
      .insert(detallesConAsientoId);

    if (detallesError) {
      console.error('❌ [Asientos] Error creando detalles:', detallesError);
      // Rollback: eliminar asiento
      await this.supabaseService
        .getClient()
        .from('asientos_contables')
        .delete()
        .eq('id', asiento.id);
      throw new Error(`Error creando detalles del asiento: ${detallesError.message}`);
    }

    console.log(
      `✅ [Asientos] Asiento ${asientoNumbering.codigo} creado exitosamente para tenant ${tenantId}`
    );

    // Marcar evento como procesado en outbox si existe sourceEventId
    if (sourceEventId) {
      await this.marcarEventoComoProcesado(sourceEventId);
    }

    return asiento as AsientoContable;
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
        .eq('event_id', eventId);

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
      const { error } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .update({
          status: 'pending',
          retry_count: 0,
          error_message: null,
          processed_at: null,
          updated_at: new Date().toISOString()
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
        return null;
      }
      console.error('❌ [Asientos] Error buscando asiento por evento:', error);
      return null;
    }

    return data as AsientoContable;
  }

  /**
   * Genera un número de asiento único para el período
   */
  private async generarNumeroAsiento(
    tenantId: string,
    fecha: Date
  ): Promise<{ numero: number; codigo: string }> {
    const anio = fecha.getFullYear();
    const mes = fecha.getMonth() + 1;
    const periodo = `${anio}${String(mes).padStart(2, '0')}`;

    // Obtener números existentes del período (solo el campo para evitar payload grande)
    const { data, error } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('numero_asiento')
      .eq('tenant_id', tenantId)
      .gte('fecha', `${anio}-${String(mes).padStart(2, '0')}-01`)
      .lt(
        'fecha',
        mes === 12
          ? `${anio + 1}-01-01`
          : `${anio}-${String(mes + 1).padStart(2, '0')}-01`
      );

    if (error) {
      console.error('❌ [Asientos] Error obteniendo último número:', error);
    }

    let siguienteNumero = 1;
    if (data && data.length > 0) {
      const numerosValidos = data
        .map((d) => Number(d.numero_asiento))
        .filter((n) => Number.isInteger(n) && n > 0);

      if (numerosValidos.length > 0) {
        const maxNumero = Math.max(...numerosValidos);
        siguienteNumero = maxNumero + 1;
      }
    }

    return {
      numero: siguienteNumero,
      codigo: `A-${periodo}-${String(siguienteNumero).padStart(6, '0')}`,
    };
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
        ['12', '70', '40', '69', '20']
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

      detalles.push({
        cuenta_id: cuentas.get('12')!.id,
        debe: montoPendiente,
        haber: 0,
        concepto: 'Clientes - Venta',
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
   * Genera asiento de pago CxP
   * Dr 42 Proveedores [monto]
   *   Cr 10 Bancos [monto]
   */
  async generarAsientoPago(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, monto, centro_costo_id } = evento;

      // Obtener cuentas del plan
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['42', '10']
      );

      const detalles: DetalleAsiento[] = [
        { cuenta_id: cuentas.get('42')!.id, debe: monto, haber: 0, concepto: 'Proveedores', centro_costo_id },
        { cuenta_id: cuentas.get('10')!.id, debe: 0, haber: monto, concepto: 'Bancos', centro_costo_id }
      ];

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
   * Genera asiento de planilla
   * Dr 62 Gastos Personal [sueldos + aportes]
   *   Cr 40 Tributos [aportes + retenciones]
   *   Cr 41 Remuneraciones [neto a pagar]
   */
  async generarAsientoPlanilla(evento: any): Promise<AsientoContable> {
    try {
      const { tenant_id, fecha, sueldos, aportes, retenciones, neto, centro_costo_id } = evento;

      // Obtener cuentas del plan
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['62', '40', '41']
      );

      const detalles: DetalleAsiento[] = [
        {
          cuenta_id: cuentas.get('62')!.id,
          debe: sueldos + aportes,
          haber: 0,
          concepto: 'Gastos de Personal',
          centro_costo_id
        },
        {
          cuenta_id: cuentas.get('40')!.id,
          debe: 0,
          haber: aportes + retenciones,
          concepto: 'Tributos por Pagar'
        },
        {
          cuenta_id: cuentas.get('41')!.id,
          debe: 0,
          haber: neto,
          concepto: 'Remuneraciones por Pagar'
        }
      ];

      return await this.generarAsiento(
        tenant_id,
        new Date(fecha),
        'Planilla de sueldos',
        detalles,
        evento.referencia,
        evento.event_id
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
