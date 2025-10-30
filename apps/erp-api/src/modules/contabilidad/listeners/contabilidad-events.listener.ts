import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AsientosGeneratorService } from '../services/asientos-generator.service';
import { OutboxEventsService, OutboxEvent } from '../services/outbox-events.service';
import { EventBusService, ERPEvent } from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Listener que procesa eventos de la tabla outbox_events
 * y genera asientos contables automáticamente
 */
@Injectable()
export class ContabilidadEventsListener implements OnModuleInit {
  private readonly logger = new Logger(ContabilidadEventsListener.name);
  private isProcessing = false;

  constructor(
    private readonly asientosGenerator: AsientosGeneratorService,
    private readonly outboxEventsService: OutboxEventsService,
    private readonly eventBus: EventBusService,
    private readonly supabaseService: SupabaseService
  ) {}

  /**
   * Se ejecuta cuando el módulo se inicializa
   * Procesa eventos pendientes al arrancar y suscribe a eventos en tiempo real
   */
  async onModuleInit() {
    this.logger.log('🚀 [ContabilidadEventsListener] Inicializando listener de eventos contables');
    
    // Suscribirse a eventos del EventBus en tiempo real
    this.suscribirseAEventos();
    
    // Procesar eventos pendientes al iniciar
    setTimeout(() => {
      this.procesarEventosPendientes();
    }, 5000); // Esperar 5 segundos para que el sistema esté listo
  }

  /**
   * Suscribe el listener a eventos del EventBus y los persiste en outbox_events
   */
  private suscribirseAEventos(): void {
    this.logger.log('📡 [ContabilidadEventsListener] Suscribiéndose a eventos del EventBus');

    // Evento de venta procesada
    this.eventBus.onVentaProcessed(async (event: ERPEvent) => {
      await this.persistirEventoEnOutbox('venta.procesada', 'venta', event.data);
    });

    // Evento de cobro registrado
    this.eventBus.on('cobro.registrado', async (event: ERPEvent) => {
      await this.persistirEventoEnOutbox('cobro.registrado', 'cobro', event.data);
    });

    // Evento de recepción registrada (compra)
    this.eventBus.onRecepcionRegistrada(async (event: ERPEvent) => {
      await this.persistirEventoEnOutbox('recepcion.registrada', 'recepcion', event.data);
    });


    // Evento de cuenta por cobrar creada
    this.eventBus.onCuentaPorCobrarCreadaEvent(async (event: ERPEvent) => {
      await this.persistirEventoEnOutbox('cxc.creada', 'cxc', event.data);
    });

    // Evento de pago a proveedor
    this.eventBus.onPagoProveedorRegistrado(async (event: ERPEvent) => {
      await this.persistirEventoEnOutbox('pago.proveedor.registrado', 'pago', event.data);
    });

    this.logger.log('✅ [ContabilidadEventsListener] Suscripciones a eventos completadas');
  }

  /**
   * Persiste un evento del EventBus en la tabla outbox_events
   */
  private async persistirEventoEnOutbox(
    eventType: string,
    aggregateType: string,
    eventData: any
  ): Promise<void> {
    try {
      const eventId = uuidv4();
      const aggregateId = eventData.ventaId || eventData.cobroId || eventData.recepcionId || eventData.pagoId || eventData.cuentaId || eventData.facturaId || eventId;

      this.logger.log(
        `💾 [ContabilidadEventsListener] Persistiendo evento ${eventType} en outbox`
      );

      const { error } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .insert({
          event_id: eventId,
          correlation_id: uuidv4(),
          aggregate_type: aggregateType,
          aggregate_id: aggregateId,
          event_type: eventType,
          event_data: eventData,
          event_version: 1,
          status: 'pending',
          retry_count: 0,
          created_at: new Date().toISOString()
        });

      if (error) {
        this.logger.error(
          `❌ [ContabilidadEventsListener] Error persistiendo evento ${eventType}:`,
          error
        );
        return;
      }

      this.logger.log(
        `✅ [ContabilidadEventsListener] Evento ${eventType} persistido en outbox: ${eventId}`
      );
    } catch (error) {
      this.logger.error(
        `❌ [ContabilidadEventsListener] Excepción persistiendo evento ${eventType}:`,
        error
      );
    }
  }

  /**
   * Cron job que procesa eventos pendientes cada minuto
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async procesarEventosPendientesCron() {
    await this.procesarEventosPendientes();
  }

  /**
   * Procesa todos los eventos pendientes de la tabla outbox_events
   */
  async procesarEventosPendientes(): Promise<void> {
    // Evitar procesamiento concurrente
    if (this.isProcessing) {
      this.logger.debug('⏳ [ContabilidadEventsListener] Ya hay un procesamiento en curso, saltando...');
      return;
    }

    this.isProcessing = true;

    try {
      // Leer eventos pendientes con límite de reintentos
      const eventos = await this.outboxEventsService.leerEventosPendientesConReintentos(3, 50);

      if (eventos.length === 0) {
        this.logger.debug('ℹ️ [ContabilidadEventsListener] No hay eventos pendientes para procesar');
        return;
      }

      this.logger.log(`📋 [ContabilidadEventsListener] Procesando ${eventos.length} eventos pendientes`);

      // Procesar eventos en orden
      for (const evento of eventos) {
        await this.procesarEvento(evento);
      }

      this.logger.log(`✅ [ContabilidadEventsListener] Procesamiento completado: ${eventos.length} eventos`);
    } catch (error) {
      this.logger.error('❌ [ContabilidadEventsListener] Error procesando eventos pendientes:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Procesa un evento individual y genera el asiento correspondiente
   * Implementa lógica de reintentos con backoff exponencial
   */
  private async procesarEvento(evento: OutboxEvent): Promise<void> {
    const maxRetries = 3;
    const retryCount = evento.retry_count || 0;

    try {
      this.logger.log(
        `🎯 [ContabilidadEventsListener] Procesando evento: ${evento.event_type} (${evento.event_id}) - Intento ${retryCount + 1}/${maxRetries}`
      );

      // Mapear el tipo de evento al handler correspondiente
      switch (evento.event_type) {
        case 'venta.procesada':
        case 'VentaFacturada':
          await this.handleVentaFacturada(evento);
          break;

        case 'cobro.registrado':
        case 'CobroRegistrado':
          await this.handleCobroRegistrado(evento);
          break;

        case 'recepcion.registrada':
        case 'RecepcionRegistrada':
          await this.handleRecepcionRegistrada(evento);
          break;

        case 'cxc.creada':
        case 'CuentaPorCobrarCreada':
          await this.handleCuentaPorCobrarCreada(evento);
          break;

        case 'pago.proveedor.registrado':
        case 'PagoProveedorRegistrado':
          await this.handlePagoProveedor(evento);
          break;

        case 'ajuste.inventario.aplicado':
        case 'AjusteInventarioAplicado':
          await this.handleAjusteInventario(evento);
          break;

        case 'planilla.liquidada':
        case 'PlanillaLiquidada':
          await this.handlePlanillaLiquidada(evento);
          break;

        case 'depreciacion.generada':
        case 'DepreciacionGenerada':
          await this.handleDepreciacion(evento);
          break;

        default:
          this.logger.debug(`⚠️ [ContabilidadEventsListener] Tipo de evento no manejado: ${evento.event_type}`);
          // No marcar como procesado, simplemente ignorar
          return;
      }

      this.logger.log(`✅ [ContabilidadEventsListener] Evento procesado exitosamente: ${evento.event_id}`);
    } catch (error) {
      const errorMessage = error.message || 'Error desconocido';
      const isRetryable = this.isRetryableError(error);
      
      this.logger.error(
        `❌ [ContabilidadEventsListener] Error procesando evento ${evento.event_id} (intento ${retryCount + 1}/${maxRetries}):`,
        errorMessage
      );

      // Determinar si se debe reintentar
      if (isRetryable && retryCount < maxRetries - 1) {
        // Marcar como fallido pero permitir reintento
        await this.asientosGenerator.marcarEventoComoFallido(
          evento.event_id,
          `${errorMessage} - Se reintentará`
        );
        
        // Calcular tiempo de espera con backoff exponencial
        const backoffMs = this.calculateBackoff(retryCount);
        this.logger.warn(
          `⏳ [ContabilidadEventsListener] Evento ${evento.event_id} será reintentado en ${backoffMs}ms`
        );
      } else {
        // Marcar como fallido permanentemente
        await this.asientosGenerator.marcarEventoComoFallido(
          evento.event_id,
          `${errorMessage} - ${isRetryable ? 'Máximo de reintentos alcanzado' : 'Error no recuperable'}`
        );
        
        this.logger.error(
          `🚫 [ContabilidadEventsListener] Evento ${evento.event_id} marcado como fallido permanentemente`
        );
      }

      // Re-lanzar el error para que sea registrado en logs
      throw error;
    }
  }

  /**
   * Determina si un error es recuperable y se puede reintentar
   */
  private isRetryableError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    
    // Errores no recuperables (no reintentar)
    const nonRetryablePatterns = [
      'período contable cerrado',
      'período no encontrado',
      'cuenta no encontrada',
      'el asiento no cuadra',
      'datos inválidos',
      'validación fallida',
      'foreign key constraint',
      'unique constraint'
    ];

    for (const pattern of nonRetryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return false;
      }
    }

    // Errores recuperables (reintentar)
    const retryablePatterns = [
      'timeout',
      'connection',
      'network',
      'econnrefused',
      'enotfound',
      'etimedout',
      'temporary',
      'unavailable',
      'rate limit'
    ];

    for (const pattern of retryablePatterns) {
      if (errorMessage.includes(pattern)) {
        return true;
      }
    }

    // Por defecto, considerar errores como recuperables
    // (mejor reintentar que perder el evento)
    return true;
  }

  /**
   * Calcula el tiempo de espera para el siguiente reintento
   * usando backoff exponencial: 2^retryCount * 1000ms
   */
  private calculateBackoff(retryCount: number): number {
    const baseDelayMs = 1000; // 1 segundo
    const maxDelayMs = 60000; // 60 segundos máximo
    
    const delayMs = Math.min(
      baseDelayMs * Math.pow(2, retryCount),
      maxDelayMs
    );
    
    // Agregar jitter aleatorio (±20%) para evitar thundering herd
    const jitter = delayMs * 0.2 * (Math.random() - 0.5);

    return Math.floor(delayMs + jitter);
  }
  private ensureEventTenant(eventData: any, contexto: string): string {
    const tenantId = eventData?.tenantId ?? eventData?.tenant_id ?? null;
    if (!tenantId) {
      // HARDENING: los eventos contables requieren tenant explícito.
      this.logger.warn(`⚠️ [ContabilidadEventsListener] Evento ${contexto} sin tenantId, se aborta procesamiento`);
      throw new Error(`Tenant ausente en evento ${contexto}`);
    }
    return tenantId;
  }

  /**
   * Handler para eventos de venta facturada
   * Genera asiento: Dr 12 Clientes / Cr 70 Ventas + Cr 40 IGV
   *                 Dr 69 Costo Ventas / Cr 20 Mercaderías
   */
  private async handleVentaFacturada(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'venta.facturada');
      
      // Preparar datos para el generador de asientos
      const ventaData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || eventData.timestamp || new Date().toISOString(),
        total: eventData.total,
        base_imponible: eventData.subtotal || eventData.base_imponible,
        igv: eventData.impuestos || eventData.igv,
        costo_ventas: eventData.costo_ventas || 0,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.numeroTicket || eventData.numeroFactura || eventData.cpeId,
        event_id: eventData.eventId || evento.event_id
      };

      await this.asientosGenerator.generarAsientoVenta(ventaData);
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleVentaFacturada:`, error);
      throw error;
    }
  }

  /**
   * Handler para eventos de cobro registrado
   * Genera asiento: Dr 10 Bancos/Caja / Cr 12 Clientes
   */
  private async handleCobroRegistrado(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'cobro.registrado');
      
      const cobroData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || eventData.timestamp || new Date().toISOString(),
        monto: eventData.monto,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.numeroDocumento || eventData.referencia,
        event_id: eventData.eventId || evento.event_id
      };

      await this.asientosGenerator.generarAsientoCobro(cobroData);
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleCobroRegistrado:`, error);
      throw error;
    }
  }

  /**
   * Handler para eventos de CxC creada
   * Genera asiento contable de venta si aún no existe
   */
  private async handleCuentaPorCobrarCreada(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'cxc.creada');

      const referencia = eventData.serie && eventData.numero
        ? `${eventData.serie}-${eventData.numero}`
        : eventData.facturaId || eventData.cuentaId;

      const ajustes = eventData.ajustes ?? {
        retencion: 0,
        percepcion: 0,
        detraccion: 0,
        anticipo: 0,
      };

        const ventaData = {
          tenant_id: tenantId,
          fecha: eventData.fechaEmision || eventData.fecha || new Date().toISOString(),
          total: eventData.montoTotal ?? eventData.total ?? 0,
          base_imponible: eventData.subtotal ?? eventData.base_imponible ?? 0,
          igv: eventData.impuestos ?? eventData.igv ?? 0,
          costo_ventas: eventData.costoVentas ?? eventData.costo_ventas ?? 0,
          centro_costo_id: eventData.centro_costo_id,
          referencia,
          event_id: eventData.eventId || evento.event_id,
          monto_pendiente: eventData.montoPendiente ?? eventData.monto_pendiente ?? undefined,
          ajustes,
        };

        const esNotaCredito =
          (eventData.montoTotal ?? 0) < 0 ||
        (eventData.source?.toLowerCase?.().includes('nota_credito') ?? false) ||
        (eventData.serie?.toUpperCase?.().startsWith('NC') ?? false);

        if (esNotaCredito) {
          // HARDENING: revertimos ventas cuando la factura corresponde a una nota de crédito.
          await this.asientosGenerator.generarAsientoNotaCredito({
            ...ventaData,
            total: Math.abs(ventaData.total),
            base_imponible: Math.abs(ventaData.base_imponible),
            igv: Math.abs(ventaData.igv),
            costo_ventas: Math.abs(ventaData.costo_ventas ?? 0),
            monto_pendiente: ventaData.monto_pendiente != null
              ? Math.abs(ventaData.monto_pendiente)
              : undefined,
          });
        } else {
          await this.asientosGenerator.generarAsientoVenta(ventaData);
        }
      } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleCuentaPorCobrarCreada:`, error);
      throw error;
    }
  }
  private async handleRecepcionRegistrada(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'recepcion.registrada');
      
      const compraData = {
        tenant_id: tenantId,
        fecha: eventData.fechaRecepcion || eventData.fecha || new Date().toISOString(),
        total: eventData.total,
        costo: eventData.subtotal || eventData.costo,
        igv: eventData.igv,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.numeroRecepcion || eventData.numeroOrden,
        event_id: eventData.eventId || evento.event_id
      };

      await this.asientosGenerator.generarAsientoCompra(compraData);
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleRecepcionRegistrada:`, error);
      throw error;
    }
  }

  /**
   * Handler para eventos de pago a proveedor
   * Genera asiento: Dr 42 Proveedores / Cr 10 Bancos
   */
  private async handlePagoProveedor(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'pago.proveedor');
      
      const pagoData = {
        tenant_id: tenantId,
        fecha: eventData.fechaPago || eventData.fecha || new Date().toISOString(),
        monto: eventData.monto,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.numeroDocumento || eventData.referencia,
        event_id: eventData.eventId || evento.event_id
      };

      await this.asientosGenerator.generarAsientoPago(pagoData);
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handlePagoProveedor:`, error);
      throw error;
    }
  }

  /**
   * Handler para eventos de ajuste de inventario
   * Genera asiento según tipo (sobrante o faltante)
   */
  private async handleAjusteInventario(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'ajuste.inventario');
      
      const ajusteData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || new Date().toISOString(),
        valor: Math.abs(eventData.valor || eventData.valorDiferencia),
        tipo: eventData.tipo || (eventData.diferencia > 0 ? 'SOBRANTE' : 'FALTANTE'),
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.referencia || `Ajuste ${eventData.productoId}`,
        event_id: eventData.eventId || evento.event_id
      };

      await this.asientosGenerator.generarAsientoAjusteInventario(ajusteData);
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleAjusteInventario:`, error);
      throw error;
    }
  }

  /**
   * Handler para eventos de planilla liquidada
   * Genera asiento: Dr 62 Gastos Personal / Cr 40 Tributos + Cr 41 Remuneraciones
   */
  private async handlePlanillaLiquidada(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'planilla.liquidada');
      
      const planillaData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || new Date().toISOString(),
        sueldos: eventData.totalIngresos || eventData.sueldos,
        aportes: eventData.totalAportes || eventData.aportes,
        retenciones: eventData.totalDescuentos || eventData.retenciones || 0,
        neto: eventData.totalNeto || eventData.neto,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.planillaId || eventData.periodo,
        event_id: eventData.eventId || evento.event_id
      };

      await this.asientosGenerator.generarAsientoPlanilla(planillaData);
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handlePlanillaLiquidada:`, error);
      throw error;
    }
  }

  /**
   * Handler para eventos de depreciación generada
   * Genera asiento: Dr 68 Depreciación / Cr 39 Deprec. Acumulada
   */
  private async handleDepreciacion(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'depreciacion.generada');
      
      const depreciacionData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || new Date().toISOString(),
        monto: eventData.monto,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.activoId || eventData.referencia,
        event_id: eventData.eventId || evento.event_id
      };

      await this.asientosGenerator.generarAsientoDepreciacion(depreciacionData);
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleDepreciacion:`, error);
      throw error;
    }
  }
}







