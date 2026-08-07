import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AsientosGeneratorService } from '../services/asientos-generator.service';
import { OutboxEventsService, OutboxEvent } from '../services/outbox-events.service';
import { EventBusService, ERPEvent } from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { OutboxEventBuilder } from '../../../shared/outbox/outbox-event.interface';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { v4 as uuidv4 } from 'uuid';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

/**
 * Listener que procesa eventos de la tabla outbox_events
 * y genera asientos contables automáticamente
 */
@Injectable()
export class ContabilidadEventsListener implements OnModuleInit {
  private readonly logger = new Logger(ContabilidadEventsListener.name);
  private readonly cronLockKey = 'worker:outbox:contabilidad';
  private readonly cronLockTtlSeconds = 240;
  private static isProcessing = false;
  private readonly accountingEventTypes = new Set([
    'venta.procesada',
    'VentaFacturada',
    'pos.venta.registrada',
    'cobro.registrado',
    'CobroRegistrado',
    'recepcion.registrada',
    'RecepcionRegistrada',
    'devolucion.proveedor.registrada',
    'DevolucionProveedorEmitida',
    'cxc.creada',
    'CuentaPorCobrarCreada',
    'pago.proveedor.registrado',
    'PagoProveedorRegistrado',
    'ajuste.inventario.aplicado',
    'AjusteInventarioAplicado',
    'planilla.liquidada',
    'PlanillaLiquidada',
    'planilla.pagada',
    'PlanillaPagada',
    'depreciacion.generada',
    'DepreciacionGenerada',
    'cpe.anulado',
    'CPEAnulado',
    // BUG-001 fix: garantiza que POST /api/cpe directo (sin pasar por
    // /ventas/pedidos/:id/facturar) genere asiento contable. El handler tiene
    // idempotencia por (tenant + referencia serie-numero) para evitar doble
    // asiento cuando el flujo /ventas tambien emite venta.procesada.
    'factura.emitida',
    'FacturaEmitida',
    'producto.stock_bajo',
    'producto.stock.bajo',
    'ProductoStockBajo',
    'stock.movimiento',
    'StockMovimiento',
  ]);

  constructor(
    private readonly asientosGenerator: AsientosGeneratorService,
    private readonly outboxEventsService: OutboxEventsService,
    private readonly eventBus: EventBusService,
    private readonly supabaseService: SupabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly taxCalculator: TaxCalculatorService,
  ) {}

  /**
   * Se ejecuta cuando el módulo se inicializa
   * Procesa eventos pendientes al arrancar y suscribe a eventos en tiempo real
   */
  async onModuleInit() {
    this.logger.log('🚀 [ContabilidadEventsListener] Inicializando listener de eventos contables');
    
    // Suscribirse a eventos del EventBus en tiempo real
    this.suscribirseAEventos();
    
    // No procesar eventos pendientes al iniciar para evitar errores de tenant context
    // El cron se encargará de procesarlos cada 5 minutos
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

    // BUG-001 fix: persistir factura.emitida en outbox para que el cron genere
    // el asiento contable. Cubre POSTs directos a /api/cpe que no pasan por
    // /ventas/pedidos/:id/facturar (este ultimo emite venta.procesada).
    this.eventBus.on('factura.emitida', async (event: ERPEvent) => {
      await this.persistirEventoEnOutbox('factura.emitida', 'factura', event.data);
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
      const tenantId = eventData.tenantId || eventData.tenant_id;
      if (!tenantId) {
        this.logger.warn(
          `⚠️ [ContabilidadEventsListener] Evento ${eventType} sin tenantId, se omite persistencia`
        );
        return;
      }

      const aggregateId =
        eventData.ventaId ||
        eventData.cobroId ||
        eventData.recepcionId ||
        eventData.pagoId ||
        eventData.cuentaId ||
        eventData.facturaId ||
        uuidv4();

      const idempotencyKey =
        eventData.idempotencyKey ||
        eventData.idempotency_key ||
        eventData.correlationId ||
        eventData.correlation_id ||
        `${eventType}:${tenantId}:${aggregateType}:${aggregateId}`;

      this.logger.log(
        `💾 [ContabilidadEventsListener] Persistiendo evento ${eventType} en outbox`
      );

      if (idempotencyKey) {
        const { data: existingEvent, error: existingError } = await this.supabaseService
          .getClient()
          .from('outbox_events')
          .select('event_id')
          .eq('tenant_id', tenantId)
          .eq('event_type', eventType)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        if (existingError) {
          this.logger.error(
            `❌ [ContabilidadEventsListener] Error verificando idempotencia de ${eventType}:`,
            existingError,
          );
          return;
        }

        if (existingEvent?.event_id) {
          this.logger.log(
            `ℹ️ [ContabilidadEventsListener] Evento ${eventType} ya existe para idempotency_key ${idempotencyKey}; se omite duplicado`,
          );
          return;
        }
      }

      // Usar el builder para garantizar estructura consistente
      const eventToInsert = OutboxEventBuilder.build({
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        idempotencyKey,
        eventData,
        eventId: eventData.eventId || eventData.event_id,
      });

      const { error } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .insert(eventToInsert);

      if (error) {
        if (error.code === '23505') {
          this.logger.log(
            `ℹ️ [ContabilidadEventsListener] Evento ${eventType} ya persistido (idempotente), se omite duplicado`
          );
          return;
        }
        this.logger.error(
          `❌ [ContabilidadEventsListener] Error persistiendo evento ${eventType}:`,
          error
        );
        return;
      }

      this.logger.log(
        `✅ [ContabilidadEventsListener] Evento ${eventType} persistido en outbox: ${eventToInsert.event_id}`
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
    if (process.env.ACCOUNTING_OUTBOX_WORKER_CRON_ENABLED === 'false') {
      return;
    }

    await this.procesarEventosPendientes();
  }

  /**
   * Procesa todos los eventos pendientes de la tabla outbox_events
   */
  async procesarEventosPendientes(): Promise<void> {
    // Evitar procesamiento concurrente
    if (ContabilidadEventsListener.isProcessing) {
      this.logger.debug('⏳ [ContabilidadEventsListener] Ya hay un procesamiento en curso, saltando...');
      return;
    }

    ContabilidadEventsListener.isProcessing = true;
    let lockAcquired = false;

    try {
      const backoffMs = this.supabaseService.getNetworkBackoffRemainingMs();
      if (backoffMs > 0) {
        this.logger.warn(
          `⚠️ [ContabilidadEventsListener] Supabase no disponible, reintentando en ${Math.ceil(backoffMs / 1000)}s`,
        );
        return;
      }

      lockAcquired = await this.tryAcquireJobLock();
      if (!lockAcquired) {
        this.logger.debug('⏭️ [ContabilidadEventsListener] Otro nodo tiene el lock distribuido, saltando...');
        return;
      }

      // Leer eventos pendientes con límite de reintentos
      const eventos = (await this.outboxEventsService.leerEventosPendientesConReintentos(3, 50))
        .filter((evento) => this.accountingEventTypes.has(evento.event_type));

      if (eventos.length === 0) {
        this.logger.debug('ℹ️ [ContabilidadEventsListener] No hay eventos pendientes para procesar');
        return;
      }

      this.logger.log(`📋 [ContabilidadEventsListener] Procesando ${eventos.length} eventos pendientes`);

      // Procesar eventos en orden
      for (const evento of eventos) {
        try {
          await this.procesarEvento(evento);
        } catch (error) {
          this.logger.error(
            `❌ [ContabilidadEventsListener] Evento ${evento.event_id} falló; se continúa con el siguiente evento del lote:`,
            error,
          );
        }
      }

      this.logger.log(`✅ [ContabilidadEventsListener] Procesamiento completado: ${eventos.length} eventos`);
    } catch (error) {
      // Silenciar errores de tenant context - es normal cuando no hay eventos con tenant
      if (error.message !== 'Tenant context required') {
        this.logger.error('❌ [ContabilidadEventsListener] Error procesando eventos pendientes:', error);
      }
    } finally {
      if (lockAcquired) {
        await this.releaseJobLock();
      }
      ContabilidadEventsListener.isProcessing = false;
    }
  }

  private async tryAcquireJobLock(): Promise<boolean> {
    try {
      const client = (this.supabaseService as any).getPublicClient?.();
      const rpc = client?.rpc;
      if (typeof rpc !== 'function') {
        return true;
      }

      const { data, error } = await rpc('acquire_job_lock', {
        p_lock_key: this.cronLockKey,
        p_lock_ttl_seconds: this.cronLockTtlSeconds,
      });

      if (error) {
        this.logger.warn(`⚠️ [ContabilidadEventsListener] No se pudo adquirir lock distribuido: ${error.message}`);
        return this.shouldContinueWithoutDistributedLock(error);
      }

      return data === true || data === 'true';
    } catch (error) {
      this.logger.warn(`⚠️ [ContabilidadEventsListener] Error adquiriendo lock distribuido: ${error?.message || error}`);
      return this.shouldContinueWithoutDistributedLock(error);
    }
  }

  private shouldContinueWithoutDistributedLock(error: any): boolean {
    const message = String(error?.message || error || '').toLowerCase();
    const lockUnavailable =
      message.includes('permission denied') ||
      message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('schema cache') ||
      message.includes('blocked for rpc');

    if (lockUnavailable) {
      this.logger.warn(
        '⚠️ [ContabilidadEventsListener] Lock distribuido no disponible; se continua con claim idempotente por evento.',
      );
      return true;
    }

    return false;
  }

  private async releaseJobLock(): Promise<void> {
    try {
      const client = (this.supabaseService as any).getPublicClient?.();
      const rpc = client?.rpc;
      if (typeof rpc !== 'function') {
        return;
      }

      await rpc('release_job_lock', { p_lock_key: this.cronLockKey });
    } catch (error) {
      this.logger.warn(`⚠️ [ContabilidadEventsListener] Error liberando lock distribuido: ${error?.message || error}`);
    }
  }

  /**
   * Registra el inicio del procesamiento de un evento en event_processing_log
   */
  private async registrarInicioProcesamiento(evento: OutboxEvent, tenantId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('event_processing_log')
        .insert({
          tenant_id: tenantId,
          event_id: evento.event_id || evento.id,
          processor_name: 'ContabilidadEventsListener',
          started_at: new Date().toISOString(),
          status: 'PROCESSING',
        })
        .select('id')
        .single();

      if (error) {
        this.logger.warn('⚠️ [ContabilidadEventsListener] No se pudo registrar inicio en event_processing_log:', error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      this.logger.warn('⚠️ [ContabilidadEventsListener] Error registrando inicio de procesamiento:', error);
      return null;
    }
  }

  /**
   * Registra la finalización exitosa del procesamiento de un evento
   */
  private async registrarFinalizacionExitosa(logId: string | null): Promise<void> {
    if (!logId) return;

    try {
      await this.supabaseService
        .getClient()
        .from('event_processing_log')
        .update({
          completed_at: new Date().toISOString(),
          status: 'COMPLETED',
        })
        .eq('id', logId);
    } catch (error) {
      this.logger.warn('⚠️ [ContabilidadEventsListener] Error registrando finalización exitosa:', error);
    }
  }

  /**
   * Registra el error en el procesamiento de un evento
   */
  private async registrarErrorProcesamiento(logId: string | null, error: any): Promise<void> {
    if (!logId) return;

    try {
      await this.supabaseService
        .getClient()
        .from('event_processing_log')
        .update({
          completed_at: new Date().toISOString(),
          status: 'FAILED',
          error_details: {
            message: error?.message || 'Error desconocido',
            stack: error?.stack || null,
            name: error?.name || 'Error',
          },
        })
        .eq('id', logId);
    } catch (err) {
      this.logger.warn('⚠️ [ContabilidadEventsListener] Error registrando error de procesamiento:', err);
    }
  }

  /**
   * Procesa un evento individual y genera el asiento correspondiente
   * Implementa lógica de reintentos con backoff exponencial
   */
  private async procesarEvento(evento: OutboxEvent): Promise<void> {
    if (!this.accountingEventTypes.has(evento.event_type)) {
      this.logger.debug(
        `⏭️ [ContabilidadEventsListener] Evento no contable ${evento.event_type} (${evento.event_id}) completado sin asiento`,
      );
      await this.asientosGenerator.marcarEventoComoProcesado(evento.event_id);
      return;
    }

    const maxRetries = 3;
    const retryCount = evento.retry_count || 0;
    let logId: string | null = null;

    // Extraer tenantId del evento
    const tenantId = evento.event_data?.tenantId || evento.event_data?.tenant_id || null;

    if (!tenantId) {
      this.logger.error(
        `❌ [ContabilidadEventsListener] Evento ${evento.event_id} sin tenantId, se marca como fallido para evitar bucle`
      );
      await this.asientosGenerator.marcarEventoComoFallido(
        evento.event_id,
        'Evento sin tenantId'
      );
      return;
    }

    await this.tenantContext.run({ tenantId, isSuperAdmin: true }, async () => {
      try {
        const claimed = await this.claimEventoParaProcesamiento(evento);
        if (!claimed) {
          this.logger.debug(
            `⏭️ [ContabilidadEventsListener] Evento ${evento.event_id} ya fue reclamado o procesado por otro worker`
          );
          return;
        }

        this.logger.log(
          `🎯 [ContabilidadEventsListener] Procesando evento: ${evento.event_type} (${evento.event_id}) - Intento ${retryCount + 1}/${maxRetries}`
        );

        // Registrar inicio del procesamiento
        logId = await this.registrarInicioProcesamiento(evento, tenantId);

        // Mapear el tipo de evento al handler correspondiente
        switch (evento.event_type) {
          case 'venta.procesada':
          case 'VentaFacturada':
          case 'pos.venta.registrada':
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

          case 'devolucion.proveedor.registrada':
          case 'DevolucionProveedorEmitida':
            await this.handleDevolucionProveedorRegistrada(evento);
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

          case 'planilla.pagada':
          case 'PlanillaPagada':
            await this.handlePlanillaPagada(evento);
            break;

      case 'depreciacion.generada':
      case 'DepreciacionGenerada':
        await this.handleDepreciacion(evento);
        break;

          case 'cpe.anulado':
          case 'CPEAnulado':
            await this.handleCpeAnulado(evento);
            break;

          case 'factura.emitida':
          case 'FacturaEmitida':
            await this.handleFacturaEmitida(evento);
            break;

          case 'producto.stock_bajo':
          case 'producto.stock.bajo':
          case 'ProductoStockBajo':
            await this.handleProductoStockBajo(evento);
            break;

          case 'stock.movimiento':
          case 'StockMovimiento':
            await this.handleStockMovimiento(evento);
            break;

          default:
            // Marcar como dead_letter inmediatamente para que no quede en pending
            await this.marcarEventoNoManejado(evento, `Tipo de evento no manejado: ${evento.event_type}`);
            return;
        }

        this.logger.log(`✅ [ContabilidadEventsListener] Evento procesado exitosamente: ${evento.event_id}`);
        
        await this.asientosGenerator.marcarEventoComoProcesado(evento.event_id);

        // Registrar finalización exitosa
        await this.registrarFinalizacionExitosa(logId);
      } catch (error) {
        const errorMessage = error.message || 'Error desconocido';
        const isRetryable = this.isRetryableError(error);
        
        // Registrar error en event_processing_log
        await this.registrarErrorProcesamiento(logId, error);
        
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
    });
  }

  private async claimEventoParaProcesamiento(evento: OutboxEvent): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('outbox_events')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('event_id', evento.event_id)
      .in('status', ['pending', 'failed', 'PENDING', 'FAILED'])
      .select('event_id')
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo reclamar evento contable ${evento.event_id}: ${error.message}`);
    }

    return Boolean(data?.event_id);
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
      'idempotencia contable corrupta',
      'duplicidad contable detectada',
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
   * Manejo mínimo para devoluciones de proveedor emitidas (outbox only)
   * Marca el evento como procesado en outbox para evitar reintentos.
   */
  private async handleDevolucionProveedorRegistrada(evento: OutboxEvent): Promise<void> {
    const tenantId = evento.event_data?.tenantId || evento.event_data?.tenant_id;
    this.logger.log(`📦 [Contabilidad] Devolución proveedor registrada recibida (evento ${evento.event_id}) tenant=${tenantId}`);

    // Generar asiento: Dr 42 / Cr 20 / Cr 40
    try {
      if (!tenantId) {
        throw new Error('Evento devolucion.proveedor.registrada sin tenantId');
      }

      const eventoAsiento = {
        tenant_id: tenantId,
        fecha: evento.event_data?.fechaDevolucion || evento.event_data?.fecha || new Date().toISOString(),
        subtotal: Number(evento.event_data?.subtotal ?? 0),
        igv: Number(evento.event_data?.igv ?? 0),
        total: Number(evento.event_data?.total ?? 0),
        referencia: evento.event_data?.numeroDevolucion || evento.event_data?.referencia,
        event_id: evento.event_id,
      };

      await this.asientosGenerator.generarAsientoDevolucionProveedor(eventoAsiento);
    } catch (err) {
      this.logger.error('❌ [Contabilidad] Error procesando devolucion.proveedor.registrada:', err);
      throw err;
    }
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

  /**
   * Marca un evento no manejado como dead_letter (sin reintentos) para que no quede en pending
   */
  private async marcarEventoNoManejado(evento: OutboxEvent, motivo: string): Promise<void> {
    try {
      const { data: current } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .select('status')
        .eq('event_id', evento.event_id)
        .maybeSingle();

      if (String(current?.status ?? '').toLowerCase() === 'completed') {
        this.logger.warn(
          `⚠️ [ContabilidadEventsListener] Evento ${evento.event_id} ya estaba completado; no se marca como no manejado`
        );
        return;
      }

      const truncated = motivo.length > 500 ? `${motivo.slice(0, 497)}...` : motivo;
      await this.supabaseService
        .getClient()
        .from('outbox_events')
        .update({
          status: 'dead_letter',
          retry_count: 3, // forzar salida del ciclo de reintentos
          error_message: truncated,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', evento.event_id)
        .neq('status', 'completed');

      this.logger.debug(
        `⚠️ [ContabilidadEventsListener] Evento ${evento.event_id} marcado como dead_letter por no ser manejado (${evento.event_type})`
      );
    } catch (err) {
      this.logger.warn(
        `⚠️ [ContabilidadEventsListener] No se pudo marcar evento no manejado ${evento.event_id}:`,
        err,
      );
    }
  }
  /**
   * Normaliza una referencia tipo comprobante (SERIE-numero) al formato canónico
   * SERIE-NNNNNNNN. Los emisores usan formatos distintos ("F001-1" desde CPE,
   * "F001-00000001" desde ventas), lo que rompía la deduplicación por referencia
   * y producía asientos de venta duplicados para la misma factura.
   */
  private normalizarReferenciaComprobante(referencia?: string | null): string | null {
    if (!referencia) return null;
    const match = /^([A-Za-z0-9]+)-(\d{1,8})$/.exec(String(referencia).trim());
    if (!match) return String(referencia);
    return `${match[1].toUpperCase()}-${match[2].padStart(8, '0')}`;
  }

  /** Variantes con y sin padding para buscar asientos históricos con cualquier formato. */
  private variantesReferenciaComprobante(referencia: string): string[] {
    const match = /^([A-Za-z0-9]+)-(\d{1,8})$/.exec(String(referencia).trim());
    if (!match) return [referencia];
    const serie = match[1].toUpperCase();
    return [...new Set([
      referencia,
      `${serie}-${String(Number(match[2]))}`,
      `${serie}-${match[2].padStart(8, '0')}`,
    ])];
  }

  /**
   * Busca un asiento existente para la misma referencia de comprobante (en
   * cualquiera de sus variantes de formato). Es el guard de idempotencia
   * compartido por venta.procesada / factura.emitida / cxc.creada, que emiten
   * eventos distintos para la misma venta.
   */
  private async buscarAsientoPorReferenciaVenta(
    tenantId: string,
    referencia?: string | null,
  ): Promise<{ id: string; numero_asiento: string } | null> {
    if (!referencia) return null;
    const { data } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('id, numero_asiento')
      .eq('tenant_id', tenantId)
      .in('referencia', this.variantesReferenciaComprobante(referencia))
      .limit(1)
      .maybeSingle();
    return data ?? null;
  }

  /**
   * 🔴 CRÍTICO FIX: Verifica que un asiento contable se haya creado correctamente en la BD
   * Valida que el asiento exista y tenga detalles asociados
   */
  private async verificarAsientoCreado(
    tenantId: string,
    sourceEventId: string,
    referencia?: string
  ): Promise<any> {
    try {
      // Buscar asiento por source_event_id (idempotencia)
      const { data: asiento, error: asientoError } = await this.supabaseService
        .getClient()
        .from('asientos_contables')
        .select('id, numero_asiento, estado, total_debe, total_haber, referencia')
        .eq('tenant_id', tenantId)
        .eq('source_event_id', sourceEventId)
        .maybeSingle();

      if (asientoError) {
        if (this.isMultipleRowsSingleResultError(asientoError)) {
          this.logger.error(
            `❌ [ContabilidadEventsListener] Duplicidad contable detectada para tenant ${tenantId} y evento ${sourceEventId}:`,
            asientoError
          );
          throw new Error(
            `Idempotencia contable corrupta: existe mas de un asiento para tenant ${tenantId} y evento ${sourceEventId}`
          );
        }

        this.logger.error(
          `❌ [ContabilidadEventsListener] Error verificando asiento para evento ${sourceEventId}:`,
          asientoError
        );
        return null;
      }

      if (!asiento) {
        // Intentar buscar por referencia si no se encontró por event_id
        if (referencia) {
          const { data: asientoPorRef, error: refError } = await this.supabaseService
            .getClient()
            .from('asientos_contables')
            .select('id, numero_asiento, estado, total_debe, total_haber, referencia')
            .eq('tenant_id', tenantId)
            .eq('referencia', referencia)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!refError && asientoPorRef) {
            this.logger.log(
              `✅ [ContabilidadEventsListener] Asiento encontrado por referencia: ${asientoPorRef.numero_asiento}`
            );
            return asientoPorRef;
          }
        }

        this.logger.warn(
          `⚠️ [ContabilidadEventsListener] Asiento no encontrado para evento ${sourceEventId}`
        );
        return null;
      }

      // Verificar que el asiento tenga detalles (líneas contables)
      const { data: detalles, error: detallesError } = await this.supabaseService
        .getClient()
        .from('detalle_asientos')
        .select('id')
        .eq('asiento_id', asiento.id)
        .limit(1);

      if (detallesError) {
        this.logger.error(
          `❌ [ContabilidadEventsListener] Error verificando detalles del asiento ${asiento.id}:`,
          detallesError
        );
        return null;
      }

      if (!detalles || detalles.length === 0) {
        this.logger.error(
          `❌ [ContabilidadEventsListener] Asiento ${asiento.id} no tiene detalles asociados`
        );
        return null;
      }

      // Verificar que el asiento cuadre (debe = haber)
      if (Math.abs(Number(asiento.total_debe) - Number(asiento.total_haber)) > 0.01) {
        this.logger.error(
          `❌ [ContabilidadEventsListener] Asiento ${asiento.id} no cuadra: Debe=${asiento.total_debe}, Haber=${asiento.total_haber}`
        );
        return null;
      }

      this.logger.log(
        `✅ [ContabilidadEventsListener] Asiento ${asiento.numero_asiento} verificado correctamente (ID: ${asiento.id}, Detalles: ${detalles.length})`
      );

      return asiento;
    } catch (error) {
      if (error?.message?.includes('Idempotencia contable corrupta')) {
        throw error;
      }

      this.logger.error(
        `❌ [ContabilidadEventsListener] Excepción verificando asiento para evento ${sourceEventId}:`,
        error
      );
      return null;
    }
  }

  private isMultipleRowsSingleResultError(error: any): boolean {
    const text = `${error?.details ?? ''} ${error?.message ?? ''}`.toLowerCase();
    return (
      text.includes('multiple') ||
      /contain[s]?\s+([2-9]|\d{2,})\s+rows/.test(text)
    );
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
  /**
   * Mapea el método de pago a la cuenta de Caja/Bancos donde entra el cobro contado.
   * Efectivo → 10111 (Caja POS), tarjeta → 10411 (Bancos - tarjeta),
   * transferencia/yape/plin/depósito → 10412. Por defecto 10111.
   */
  private mapMetodoPagoACuentaCaja(metodoPago?: string | null): string {
    const m = String(metodoPago ?? '').toUpperCase();
    if (m.includes('TARJETA') || m.includes('CARD') || m.includes('POS')) return '10411';
    if (
      m.includes('TRANSFER') ||
      m.includes('YAPE') ||
      m.includes('PLIN') ||
      m.includes('DEPOSITO') ||
      m.includes('DEPÓSITO')
    ) {
      return '10412';
    }
    return '10111';
  }

  private async handleVentaFacturada(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'venta.facturada');
      if (eventData.source === 'ventas.pedidos.confirmacion') {
        this.logger.log(
          `ℹ️ [ContabilidadEventsListener] Pedido confirmado ${eventData.ventaId ?? eventData.pedidoId ?? evento.event_id}; ` +
          'se espera evento fiscal/CxC para generar asiento de venta.',
        );
        return;
      }

      const itemSubtotal = Array.isArray(eventData.items)
        ? eventData.items.reduce((sum, item) => sum + Number(item?.subtotal ?? 0), 0)
        : 0;
      const total = Number(eventData.total ?? 0);
      const baseImponible = Number(
        eventData.subtotal ??
        eventData.base_imponible ??
        (itemSubtotal > 0 ? itemSubtotal : 0)
      );
      const igv = Number(
        eventData.impuestos ??
        eventData.igv ??
        (baseImponible > 0 ? Math.max(total - baseImponible, 0) : 0)
      );
      
      // Preparar datos para el generador de asientos
      const referenciaVenta = this.normalizarReferenciaComprobante(
        eventData.numeroTicket || eventData.numeroFactura || eventData.cpeId,
      );

      // Idempotencia cruzada: factura.emitida y cxc.creada emiten la misma venta;
      // si cualquiera de ellos ya generó el asiento, no duplicar.
      const asientoPrevio = await this.buscarAsientoPorReferenciaVenta(tenantId, referenciaVenta);
      if (asientoPrevio) {
        this.logger.log(
          `ℹ️ [ContabilidadEventsListener] venta.procesada ${referenciaVenta} ya tiene asiento ${asientoPrevio.numero_asiento}, skip.`,
        );
        return;
      }

      // Determinar si la venta fue al CONTADO (POS es siempre contado; factura según
      // condición de pago). Si es contado, el asiento debita Caja/Bancos en vez de CxC.
      const esContado =
        eventData.source === 'pos.venta.registrada' ||
        eventData.esCredito === false ||
        String(eventData.condicionPago ?? eventData.condicion_pago ?? '').toUpperCase() === 'CONTADO';
      const cuentaCobroCodigo = this.mapMetodoPagoACuentaCaja(
        eventData.metodoPago ?? eventData.metodo_pago,
      );

      const ventaData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || eventData.timestamp || new Date().toISOString(),
        total,
        base_imponible: baseImponible,
        igv,
        costo_ventas: eventData.costo_ventas || 0,
        centro_costo_id: eventData.centro_costo_id,
        referencia: referenciaVenta,
        event_id: evento.event_id || eventData.eventId,
        es_contado: esContado,
        cuenta_cobro_codigo: cuentaCobroCodigo,
      };

      const eventId = ventaData.event_id;

      const asientoCreado = await this.asientosGenerator.generarAsientoVenta(ventaData);

      // 🔴 CRÍTICO FIX: Validar que el asiento se haya creado correctamente
      if (eventId) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          eventId,
          ventaData.referencia
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de venta no se pudo verificar después de creación para evento ${eventId}. ` +
            `El asiento puede no haberse guardado correctamente en la base de datos.`
          );
        }
        this.logger.log(
          `✅ [ContabilidadEventsListener] Asiento ${asientoVerificado.numero_asiento} verificado correctamente`
        );
      } else if (asientoCreado?.id) {
        // Si no hay event_id pero el método retornó un asiento, verificar por ID
        const { data: asientoVerificado } = await this.supabaseService
          .getClient()
          .from('asientos_contables')
          .select('id, numero_asiento, estado')
          .eq('id', asientoCreado.id)
          .eq('tenant_id', tenantId)
          .single();

        if (!asientoVerificado) {
          throw new Error(`Asiento contable ${asientoCreado.id} no encontrado en la base de datos`);
        }
        this.logger.log(
          `✅ [ContabilidadEventsListener] Asiento ${asientoVerificado.numero_asiento} verificado por ID`
        );
      } else {
        throw new Error('Asiento contable no retornó ID válido después de creación');
      }
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleVentaFacturada:`, error);
      throw error;
    }
  }

  /**
   * BUG-001 fix: handler para `factura.emitida` que cubre el caso POST /api/cpe
   * directo (sin pasar por /ventas/pedidos/:id/facturar).
   *
   * Genera asiento de venta a partir del payload del evento. Es idempotente
   * por (tenant + referencia serie-numero): si ya existe un asiento para la
   * misma factura (por ejemplo porque el flujo de ventas tambien emitio
   * venta.procesada), no genera duplicado.
   */
  private async handleFacturaEmitida(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'factura.emitida');

      const serie = eventData?.serie ? String(eventData.serie) : null;
      const numero = eventData?.numero !== undefined && eventData?.numero !== null
        ? String(eventData.numero)
        : null;
      const referencia = this.normalizarReferenciaComprobante(
        serie && numero
          ? `${serie}-${numero}`
          : eventData?.cpeId || eventData?.facturaId || evento.event_id,
      );

      // Idempotencia: si ya hay asiento para esta referencia (en cualquier
      // formato con/sin padding), skip.
      const asientoExistente = await this.buscarAsientoPorReferenciaVenta(tenantId, referencia);

      if (asientoExistente?.id) {
        this.logger.log(
          `ℹ️ [ContabilidadEventsListener] factura.emitida ${referencia} ya tiene asiento ${asientoExistente.numero_asiento}, skip.`,
        );
        return;
      }

      const total = Number(eventData.total ?? 0);
      const baseImponible = Number(eventData.subtotal ?? eventData.base_imponible ?? 0);
      const igv = Number(
        eventData.impuestos ??
          eventData.igv ??
          (baseImponible > 0 ? Math.max(total - baseImponible, 0) : 0),
      );

      const ventaData = {
        tenant_id: tenantId,
        fecha: eventData.fechaEmision || eventData.fecha || new Date().toISOString(),
        total,
        base_imponible: baseImponible,
        igv,
        costo_ventas: Number(eventData.costo_ventas ?? 0),
        centro_costo_id: eventData.centro_costo_id,
        referencia,
        event_id: evento.event_id || eventData.eventId,
      };

      const asientoCreado = await this.asientosGenerator.generarAsientoVenta(ventaData);

      // Verificar como handleVentaFacturada.
      if (ventaData.event_id) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          ventaData.event_id,
          ventaData.referencia,
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de factura.emitida no se pudo verificar (event ${ventaData.event_id}, ref ${referencia}).`,
          );
        }
        this.logger.log(
          `✅ [ContabilidadEventsListener] Asiento ${asientoVerificado.numero_asiento} generado desde factura.emitida (${referencia}).`,
        );
      } else if (asientoCreado?.id) {
        this.logger.log(
          `✅ [ContabilidadEventsListener] Asiento ${asientoCreado.id} generado desde factura.emitida sin event_id verificable (${referencia}).`,
        );
      } else {
        throw new Error('Asiento contable no retornó ID válido tras factura.emitida.');
      }
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleFacturaEmitida:`, error);
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
        event_id: evento.event_id || eventData.eventId
      };

      const eventId = cobroData.event_id;

      const asientoCreado = await this.asientosGenerator.generarAsientoCobro(cobroData);

      // 🔴 CRÍTICO FIX: Validar que el asiento se haya creado correctamente
      if (eventId) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          eventId,
          cobroData.referencia
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de cobro no se pudo verificar después de creación para evento ${eventId}`
          );
        }
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento contable de cobro no retornó ID válido después de creación');
      }
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

      const referencia = this.normalizarReferenciaComprobante(
        eventData.serie && eventData.numero
          ? `${eventData.serie}-${eventData.numero}`
          : eventData.facturaId || eventData.cuentaId,
      );

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
          event_id: evento.event_id || eventData.eventId,
          monto_pendiente: eventData.montoPendiente ?? eventData.monto_pendiente ?? undefined,
          ajustes,
        };

        const esNotaCredito =
          (eventData.montoTotal ?? 0) < 0 ||
        (eventData.source?.toLowerCase?.().includes('nota_credito') ?? false) ||
        (eventData.serie?.toUpperCase?.().startsWith('NC') ?? false);

        const eventId = ventaData.event_id;

        if (esNotaCredito) {
          // HARDENING: revertimos ventas cuando la factura corresponde a una nota de crédito.
          const asientoCreado = await this.asientosGenerator.generarAsientoNotaCredito({
            ...ventaData,
            total: Math.abs(ventaData.total),
            base_imponible: Math.abs(ventaData.base_imponible),
            igv: Math.abs(ventaData.igv),
            costo_ventas: Math.abs(ventaData.costo_ventas ?? 0),
            monto_pendiente: ventaData.monto_pendiente != null
              ? Math.abs(ventaData.monto_pendiente)
              : undefined,
          });

          // 🔴 CRÍTICO FIX: Validar que el asiento se haya creado correctamente
          if (eventId) {
            const asientoVerificado = await this.verificarAsientoCreado(
              tenantId,
              eventId,
              referencia
            );
            if (!asientoVerificado) {
              throw new Error(
                `Asiento contable de nota de crédito no se pudo verificar después de creación para evento ${eventId}`
              );
            }
          } else if (!asientoCreado?.id) {
            throw new Error('Asiento contable de nota de crédito no retornó ID válido después de creación');
          }
        } else {
          // Idempotencia cruzada: venta.procesada / factura.emitida generan el
          // mismo asiento de venta para esta referencia; si ya existe, skip.
          const asientoPrevio = await this.buscarAsientoPorReferenciaVenta(tenantId, referencia);
          if (asientoPrevio) {
            this.logger.log(
              `ℹ️ [ContabilidadEventsListener] cxc.creada ${referencia} ya tiene asiento ${asientoPrevio.numero_asiento}, skip.`,
            );
            return;
          }

          const asientoCreado = await this.asientosGenerator.generarAsientoVenta(ventaData);

          // 🔴 CRÍTICO FIX: Validar que el asiento se haya creado correctamente
          if (eventId) {
            const asientoVerificado = await this.verificarAsientoCreado(
              tenantId,
              eventId,
              referencia
            );
            if (!asientoVerificado) {
              throw new Error(
                `Asiento contable de CxC no se pudo verificar después de creación para evento ${eventId}`
              );
            }
          } else if (!asientoCreado?.id) {
            throw new Error('Asiento contable de CxC no retornó ID válido después de creación');
          }
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
      const totalRecepcion = eventData.totalParcial ?? eventData.total;
      const costoRecepcion =
        eventData.subtotalParcial ?? eventData.subtotal ?? eventData.costo;
      const igvRecepcion = eventData.igvParcial ?? eventData.igv;
      
      const compraData = {
        tenant_id: tenantId,
        fecha: eventData.fechaRecepcion || eventData.fecha || new Date().toISOString(),
        total: totalRecepcion,
        costo: costoRecepcion,
        igv: igvRecepcion,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.numeroRecepcion || eventData.numeroOrden,
        event_id: evento.event_id || eventData.eventId
      };

      const eventId = compraData.event_id;

      const asientoCreado = await this.asientosGenerator.generarAsientoCompra(compraData);

      // 🔴 CRÍTICO FIX: Validar que el asiento se haya creado correctamente
      if (eventId) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          eventId,
          compraData.referencia
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de recepción no se pudo verificar después de creación para evento ${eventId}`
          );
        }
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento contable de recepción no retornó ID válido después de creación');
      }
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleRecepcionRegistrada:`, error);
      throw error;
    }
  }

  private async handleFacturaProveedorRegistrada(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'factura.proveedor.registrada');
    this.logger.log(
      `📄 [Contabilidad] Factura proveedor registrada recibida (evento ${evento.event_id}) tenant=${tenantId} documento=${eventData?.numeroDocumento ?? eventData?.facturaProvId ?? 'sin-documento'}`
    );
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
        // Valuación en moneda local calculada por tesorería. Ausente en pagos
        // en moneda local y en eventos anteriores a la Fase 2.
        montoContabilizado: eventData.montoContabilizado,
        montoLiquidacion: eventData.montoLiquidacion,
        diferenciaCambio: eventData.diferenciaCambio,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.numeroDocumento || eventData.referencia,
        event_id: evento.event_id || eventData.eventId
      };

      const eventId = pagoData.event_id;

      const asientoCreado = await this.asientosGenerator.generarAsientoPago(pagoData);

      // 🔴 CRÍTICO FIX: Validar que el asiento se haya creado correctamente
      if (eventId) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          eventId,
          pagoData.referencia
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de pago no se pudo verificar después de creación para evento ${eventId}`
          );
        }
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento contable de pago no retornó ID válido después de creación');
      }
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handlePagoProveedor:`, error);
      throw error;
    }
  }

  /**
   * Handler liviano para producto.stock_bajo:
   * - Solo marca el evento como procesado para evitar acumulación en dead_letter.
   * - Mantiene trazabilidad con logs; no genera asientos contables.
   */
  private async handleProductoStockBajo(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'producto.stock_bajo');

    try {
      this.logger.log(
        `📦 [Contabilidad] Stock bajo recibido (evento ${evento.event_id}) tenant=${tenantId} producto=${eventData?.productoId || eventData?.sku || 'desconocido'}`
      );

      // Reemitir al EventBus para que el listener de notificaciones (InventoryStockAlertsListener)
      // procese y genere las alertas correspondientes. Este listener ya maneja deduplicación.
      this.eventBus.emit(evento.event_type, eventData, 'outbox-worker');

      // Marcar como procesado en outbox para evitar que quede en dead_letter
      await this.asientosGenerator.marcarEventoComoProcesado(evento.event_id);
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleProductoStockBajo:`, error);
      await this.asientosGenerator.marcarEventoComoFallido(
        evento.event_id,
        `Error manejando stock_bajo: ${error?.message || error}`
      );
      throw error;
    }
  }

  /**
   * Handler liviano para stock.movimiento:
   * Solo lo marca como procesado para evitar que quede en dead_letter.
   * No genera asiento contable.
   */
  private async handleStockMovimiento(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'stock.movimiento');

    try {
      this.logger.log(
        `🚚 [Contabilidad] Movimiento de stock recibido (evento ${evento.event_id}) tenant=${tenantId} producto=${eventData?.productoId || eventData?.sku || 'desconocido'}`
      );

      // Reemitir si otros listeners necesitan enterarse; no afecta contabilidad
      this.eventBus.emit(evento.event_type, eventData, 'outbox-worker');

      // Marcar como procesado para que no se reintente
      await this.asientosGenerator.marcarEventoComoProcesado(evento.event_id);
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleStockMovimiento:`, error);
      await this.asientosGenerator.marcarEventoComoFallido(
        evento.event_id,
        `Error manejando stock.movimiento: ${error?.message || error}`
      );
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
        event_id: evento.event_id || eventData.eventId
      };

      const eventId = ajusteData.event_id;

      const asientoCreado = await this.asientosGenerator.generarAsientoAjusteInventario(ajusteData);

      // 🔴 CRÍTICO FIX: Validar que el asiento se haya creado correctamente
      if (eventId) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          eventId,
          ajusteData.referencia
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de ajuste no se pudo verificar después de creación para evento ${eventId}`
          );
        }
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento contable de ajuste no retornó ID válido después de creación');
      }
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
        retenciones: eventData.totalDescuentos || eventData.retenciones || 0,
        neto: eventData.totalNeto || eventData.neto,
        centro_costo_id: eventData.centro_costo_id,
        planilla_id: eventData.planillaId,
        referencia: eventData.planillaId ? `PLANILLA-${eventData.planillaId}` : eventData.periodo,
        source_event_id: evento.event_id || eventData.eventId || eventData.planillaId || evento.aggregate_id,
        event_id: evento.event_id || eventData.eventId
      };

      const eventId = planillaData.event_id;

      const asientoCreado = await this.asientosGenerator.generarAsientoPlanilla(planillaData);

      // 🔴 CRÍTICO FIX: Validar que el asiento se haya creado correctamente
      if (eventId) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          eventId,
          planillaData.referencia
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de planilla no se pudo verificar después de creación para evento ${eventId}`
          );
        }
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento contable de planilla no retornó ID válido después de creación');
      }
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handlePlanillaLiquidada:`, error);
      throw error;
    }
  }

  /**
   * Handler para eventos de planilla pagada → Asiento: Dr 411 Rem. por Pagar / Cr 10 Bancos
   */
  private async handlePlanillaPagada(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'planilla.pagada');

      const pagoData = {
        tenant_id: tenantId,
        fecha: eventData.fechaPago || new Date().toISOString(),
        monto: eventData.totalPagado,
        metodo_pago: eventData.metodoPago || 'transferencia',
        planilla_id: eventData.planillaId,
        referencia: `PAGO-PLANILLA-${eventData.planillaId}`,
        source_event_id: evento.event_id || eventData.eventId || eventData.planillaId || evento.aggregate_id,
        event_id: evento.event_id || eventData.eventId,
      };

      const asientoCreado = await this.asientosGenerator.generarAsientoPagoPlanilla(pagoData);

      const eventId = pagoData.event_id;
      if (eventId) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          eventId,
          pagoData.referencia,
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de pago planilla no se pudo verificar para evento ${eventId}`,
          );
        }
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento contable de pago planilla no retornó ID válido');
      }
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handlePlanillaPagada:`, error);
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
        event_id: evento.event_id || eventData.eventId
      };

      const eventId = depreciacionData.event_id;

      const asientoCreado = await this.asientosGenerator.generarAsientoDepreciacion(depreciacionData);

      // 🔴 CRÍTICO FIX: Validar que el asiento se haya creado correctamente
      if (eventId) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          eventId,
          depreciacionData.referencia
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de depreciación no se pudo verificar después de creación para evento ${eventId}`
          );
        }
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento contable de depreciación no retornó ID válido después de creación');
      }
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleDepreciacion:`, error);
      throw error;
    }
  }

  /**
   * Handler para eventos de CPE anulado
   * HARDENING E1: Revierte el asiento contable asociado al CPE anulado
   * Genera asiento de reversión con los montos negativos
   */
  private async handleCpeAnulado(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'cpe.anulado');
      
      this.logger.log(
        `🔄 [ContabilidadEventsListener] Revirtiendo asiento contable para CPE anulado: ${eventData.serie}-${eventData.numero}`
      );

      // Buscar el asiento original asociado al CPE
      const referencia = eventData.serie && eventData.numero
        ? `${eventData.serie}-${eventData.numero}`
        : eventData.cpe_id;

      // Generar asiento de nota de crédito con montos positivos y cuentas invertidas.
      // El generador de ventas no acepta importes negativos porque rompe el cuadre.
      const totalAnulado = Math.abs(Number(eventData.total || 0));
      let baseImponible = 0;
      let igvAnulado = 0;

      if (eventData.total) {
        const subtotalCalculado = await this.taxCalculator.calcularSubtotalDesdeTotal(
          totalAnulado,
          tenantId
        );
        baseImponible = subtotalCalculado;
        igvAnulado = totalAnulado - baseImponible;
      }

      const reversoData = {
        tenant_id: tenantId,
        fecha: eventData.anulado_at || new Date().toISOString(),
        total: totalAnulado,
        base_imponible: baseImponible,
        igv: igvAnulado,
        costo_ventas: 0, // No revertir costo si no hay información
        centro_costo_id: eventData.centro_costo_id,
        referencia: `REV-${referencia}`, // Prefijo REV para identificar reversiones
        event_id: evento.event_id || eventData.eventId,
        motivo: `Reversión por anulación: ${eventData.motivo || 'Sin motivo especificado'}`
      };

      const eventId = reversoData.event_id;

      const asientoCreado = await this.asientosGenerator.generarAsientoNotaCredito(reversoData);

      // 🔴 CRÍTICO FIX: Validar que el asiento de reversión se haya creado correctamente
      if (eventId) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          eventId,
          reversoData.referencia
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento contable de reversión (CPE anulado) no se pudo verificar después de creación para evento ${eventId}`
          );
        }
        this.logger.log(
          `✅ [ContabilidadEventsListener] Asiento de reversión ${asientoVerificado.numero_asiento} verificado correctamente`
        );
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento contable de reversión no retornó ID válido después de creación');
      }
      
      this.logger.log(
        `✅ [ContabilidadEventsListener] Asiento contable revertido exitosamente para CPE ${eventData.serie}-${eventData.numero}`
      );
    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleCpeAnulado:`, error);
      throw error;
    }
  }
}
