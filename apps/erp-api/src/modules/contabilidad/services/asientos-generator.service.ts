import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodosService } from './periodos.service';
import { PlanCuentasService } from './plan-cuentas.service';

export interface AsientoContable {
  id?: string;
  tenant_id: string;
  numero_asiento: string;
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
        return asientoExistente;
      }
    }

    // Generar número de asiento
    const numeroAsiento = await this.generarNumeroAsiento(tenantId, fecha);

    // Crear asiento contable
    const { data: asiento, error: asientoError } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .insert({
        tenant_id: tenantId,
        numero_asiento: numeroAsiento,
        fecha: fecha.toISOString(),
        concepto,
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
      asiento_id: asiento.id,
      cuenta_id: detalle.cuenta_id,
      debe: detalle.debe,
      haber: detalle.haber,
      concepto: detalle.concepto,
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
      `✅ [Asientos] Asiento ${numeroAsiento} creado exitosamente para tenant ${tenantId}`
    );

    // Marcar evento como procesado en outbox si existe sourceEventId
    if (sourceEventId) {
      await this.marcarEventoComoProcesado(sourceEventId);
    }

    return asiento as AsientoContable;
  }

  /**
   * Marca un evento como procesado en la tabla outbox_events
   * @param eventId - ID del evento a marcar como procesado
   */
  private async marcarEventoComoProcesado(eventId: string): Promise<void> {
    try {
      const { error } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString()
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
        .single();

      if (fetchError) {
        this.logger.error(
          `❌ [Asientos] Error obteniendo evento ${eventId}:`,
          fetchError
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

      // Si es fallo permanente, registrar la fecha
      if (isPermanentFailure) {
        updateData.failed_permanently_at = new Date().toISOString();
      }

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
          failed_permanently_at: null,
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
  ): Promise<string> {
    const anio = fecha.getFullYear();
    const mes = fecha.getMonth() + 1;

    // Obtener el último número de asiento del período
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
      )
      .order('numero_asiento', { ascending: false })
      .limit(1);

    if (error) {
      console.error('❌ [Asientos] Error obteniendo último número:', error);
    }

    let siguienteNumero = 1;
    if (data && data.length > 0) {
      const ultimoNumero = data[0].numero_asiento;
      // Extraer el número del formato "A-YYYYMM-NNNN"
      const match = ultimoNumero.match(/-(\d+)$/);
      if (match) {
        siguienteNumero = parseInt(match[1], 10) + 1;
      }
    }

    return `A-${anio}${String(mes).padStart(2, '0')}-${String(siguienteNumero).padStart(4, '0')}`;
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
      const { tenant_id, fecha, total, base_imponible, igv, costo_ventas, centro_costo_id } = evento;

      // Obtener cuentas del plan
      const cuentas = await this.planCuentasService.obtenerCuentasPorCodigos(
        tenant_id,
        ['12', '70', '40', '69', '20']
      );

      const detalles: DetalleAsiento[] = [
        // Registro de la venta
        { cuenta_id: cuentas.get('12')!.id, debe: total, haber: 0, concepto: 'Clientes - Venta' },
        { cuenta_id: cuentas.get('70')!.id, debe: 0, haber: base_imponible, concepto: 'Ventas', centro_costo_id },
        { cuenta_id: cuentas.get('40')!.id, debe: 0, haber: igv, concepto: 'IGV por Pagar' },
        // Registro del costo
        { cuenta_id: cuentas.get('69')!.id, debe: costo_ventas, haber: 0, concepto: 'Costo de Ventas', centro_costo_id },
        { cuenta_id: cuentas.get('20')!.id, debe: 0, haber: costo_ventas, concepto: 'Mercaderías' }
      ];

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
}
