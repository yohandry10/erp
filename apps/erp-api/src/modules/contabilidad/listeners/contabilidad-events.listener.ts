import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { cuadranImportes } from '../../../shared/utils/cuadre-contable.util';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AsientosGeneratorService } from '../services/asientos-generator.service';
import { OutboxEventsService, OutboxEvent } from '../services/outbox-events.service';
import { EventBusService, ERPEvent } from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { OutboxEventBuilder } from '../../../shared/outbox/outbox-event.interface';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { v4 as uuidv4 } from 'uuid';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { ACCOUNTING_EVENT_TYPES } from '../../../shared/outbox/accounting-event-types';

/**
 * Listener que procesa eventos de la tabla outbox_events
 * y genera asientos contables automáticamente
 */
@Injectable()
export class ContabilidadEventsListener implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(ContabilidadEventsListener.name);
  private readonly cronLockKey = 'worker:outbox:contabilidad';
  private readonly cronLockTtlSeconds = 240;
  private static isProcessing = false;
  private readonly accountingEventTypes = new Set<string>(ACCOUNTING_EVENT_TYPES);
  private readonly workerName = `outbox-accounting:${process.env.RENDER_INSTANCE_ID ?? process.pid}`;

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
    
  }

  onApplicationBootstrap(): void {
    setImmediate(() => {
      void this.procesarEventosPendientes().catch((error) => {
        this.logger.error('[ContabilidadEventsListener] Catch-up inicial falló', error);
      });
    });
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

    this.eventBus.on('factura.proveedor.registrada', async (event: ERPEvent) => {
      await this.persistirEventoEnOutbox('factura.proveedor.registrada', 'factura_proveedor', event.data);
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
        throw new Error(`Evento ${eventType} sin tenantId`);
      }

      const aggregateId =
        eventData.ventaId ||
        eventData.cobroId ||
        eventData.recepcionId ||
        eventData.facturaProvId ||
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
        .rpc('enqueue_outbox_event_tx', { p_event: eventToInsert });

      if (error) {
        throw new Error(`No se pudo encolar ${eventType}: ${error.message}`);
      }

      this.logger.log(
        `✅ [ContabilidadEventsListener] Evento ${eventType} persistido en outbox: ${eventToInsert.event_id}`
      );
    } catch (error) {
      this.logger.error(
        `❌ [ContabilidadEventsListener] Excepción persistiendo evento ${eventType}:`,
        error
      );
      throw error;
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
      const eventos = await this.outboxEventsService.reclamarEventosContables(
        this.workerName,
        3,
        50,
      );

      if (eventos.length === 0) {
        this.logger.debug('ℹ️ [ContabilidadEventsListener] No hay eventos pendientes para procesar');
        return;
      }

      this.logger.log(`📋 [ContabilidadEventsListener] Procesando ${eventos.length} eventos pendientes`);

      const activeClaims = new Map(eventos.map((evento) => [evento.id, evento]));
      const heartbeatTimer = setInterval(() => {
        void this.renovarClaimsContables([...activeClaims.values()]);
      }, 60_000);
      heartbeatTimer.unref?.();

      try {
        // Procesar eventos en orden. El heartbeat mantiene también los claims
        // que esperan turno dentro del lote para que no los recupere otro nodo.
        for (const evento of eventos) {
          try {
            await this.outboxEventsService.renovarClaimContable(
              evento.id,
              evento.claim_token ?? '',
            );
            await this.procesarEvento(evento);
          } catch (error) {
            this.logger.error(
              `❌ [ContabilidadEventsListener] Evento ${evento.event_id} falló; se continúa con el siguiente evento del lote:`,
              error,
            );
          } finally {
            activeClaims.delete(evento.id);
          }
        }
      } finally {
        clearInterval(heartbeatTimer);
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

  private async renovarClaimsContables(eventos: OutboxEvent[]): Promise<void> {
    const results = await Promise.allSettled(eventos.map((evento) =>
      this.outboxEventsService.renovarClaimContable(evento.id, evento.claim_token ?? ''),
    ));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `[ContabilidadEventsListener] Heartbeat falló para claim ${eventos[index]?.id}`,
          result.reason,
        );
      }
    });
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
        return false;
      }

      return data === true || data === 'true';
    } catch (error) {
      this.logger.warn(`⚠️ [ContabilidadEventsListener] Error adquiriendo lock distribuido: ${error?.message || error}`);
      return false;
    }
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

    await this.tenantContext.run({
      tenantId,
      isSuperAdmin: true,
      outboxEventRowId: evento.id,
      outboxEventId: evento.event_id,
      outboxClaimToken: evento.claim_token,
      outboxWorker: evento.claimed_by,
    }, async () => {
      try {
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

          case 'caja.cerrada':
            await this.handleCajaCerrada(evento);
            break;

          case 'caja.movimiento_manual.registrado':
          case 'caja.retiro.registrado':
          case 'caja.cambio_turno.completado':
            await this.handleOperacionCaja474(evento);
            break;

          case 'banco.movimiento.registrado':
            await this.handleMovimientoBancario(evento);
            break;

          case 'banco.transferencia.registrada':
            await this.handleTransferenciaBancaria(evento);
            break;

          case 'cobro.registrado':
          case 'CobroRegistrado':
            await this.handleCobroRegistrado(evento);
            break;

          case 'cobro.revertido':
            await this.handleCobroRevertido(evento);
            break;

          case 'cxc.ajuste.registrado':
          case 'CxcAjusteRegistrado':
            await this.handleAjusteCxcRegistrado(evento);
            break;

          case 'cxc.ajuste.revertido':
            await this.handleAjusteCxcRevertido(evento);
            break;

          case 'cxp.ajuste.registrado':
            await this.handleAjusteCxpRegistrado(evento);
            break;

          case 'nota_credito.emitida':
            await this.handleNotaCreditoEmitida(evento);
            break;

          case 'nota_debito.emitida':
            await this.handleNotaDebitoEmitida(evento);
            break;

          case 'saldo_favor.aplicado':
            await this.handleSaldoFavorAplicado(evento);
            break;

          case 'saldo_favor.reembolsado':
            await this.handleSaldoFavorReembolsado(evento);
            break;

          case 'saldo_favor.reembolso_revertido':
            await this.handleSaldoFavorReembolsoRevertido(evento);
            break;

          case 'recepcion.registrada':
          case 'RecepcionRegistrada':
            await this.handleRecepcionRegistrada(evento);
            break;

          case 'factura.proveedor.registrada':
          case 'FacturaProveedorRegistrada':
            await this.handleFacturaProveedorRegistrada(evento);
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

          case 'liquidacion.aprobada':
            await this.handleLiquidacionAprobada(evento);
            break;

          case 'liquidacion.pagada':
            await this.handleLiquidacionPagada(evento);
            break;

          case 'liquidacion.pago.revertido':
            await this.handlePagoLiquidacionRevertido(evento);
            break;

          case 'cts.depositado':
            await this.handleCtsDepositado(evento);
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
        subtotal: Number(evento.event_data?.subtotalContable ?? evento.event_data?.subtotal ?? 0),
        igv: Number(evento.event_data?.igvContable ?? evento.event_data?.igv ?? 0),
        total: Number(evento.event_data?.totalContable ?? evento.event_data?.total ?? 0),
        mercaderia: Number(
          evento.event_data?.mercaderia ?? evento.event_data?.subtotalContable ?? evento.event_data?.subtotal ?? 0,
        ),
        servicios: Number(evento.event_data?.servicios ?? 0),
        no_stock: Number(evento.event_data?.noStock ?? evento.event_data?.no_stock ?? 0),
        cuenta_pasivo: evento.event_data?.cuentaPasivo ?? evento.event_data?.cuenta_pasivo ?? '42',
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
      const truncated = motivo.length > 500 ? `${motivo.slice(0, 497)}...` : motivo;
      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('dead_letter_outbox_event_tx', {
          p_id: evento.id,
          p_claim_token: evento.claim_token,
          p_error: truncated,
        });
      if (error || data !== true) {
        throw new Error(error?.message || `OUTBOX_CLAIM_LOST:${evento.id}`);
      }

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

      // Exacto, no `> 0.01`: con aquello un asiento descuadrado en justo un céntimo
      // pasaba la verificación y se registraba como «verificado correctamente». El
      // writer que lo creó exige `v_total_debe <> v_total_haber`, así que esto tiene
      // que exigir lo mismo o no está verificando nada.
      if (!cuadranImportes(asiento.total_debe, asiento.total_haber)) {
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
        eventData.numeroFiscal || eventData.numeroFactura || eventData.numeroTicket || eventData.cpeId,
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

      const cobros = Array.isArray(eventData.pagos)
        ? eventData.pagos.map((pago: any) => ({
            tipo: String(pago?.tipo ?? pago?.metodo_pago_tipo ?? pago?.codigo ?? '').toUpperCase(),
            codigo: String(pago?.codigo ?? pago?.metodo_pago_codigo ?? '').toLowerCase(),
            monto: Number(pago?.monto ?? 0),
            moneda: String(pago?.moneda ?? eventData.moneda ?? 'PEN').toUpperCase(),
            cuenta_codigo: pago?.cuentaCodigo ?? pago?.cuenta_codigo ?? null,
          }))
        : undefined;
      const montoCredito = Number(
        eventData.montoCredito ??
        cobros?.filter((pago: any) => pago.tipo === 'CREDITO')
          .reduce((sum: number, pago: any) => sum + pago.monto, 0) ??
        0,
      );

      // POS puede ser contado, crédito o mixto. El desglose durable de pagos
      // manda sobre la etiqueta general del método de pago.
      const esContado = cobros
        ? montoCredito <= 0.01
        : eventData.esCredito === false ||
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
        cobros,
        // En POS el total pendiente es el saldo a crédito explícito; para el
        // resto de ventas dejamos que el generador derive el saldo histórico.
        monto_pendiente: cobros && cobros.length > 0 ? montoCredito : undefined,
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
   * Un arqueo con diferencia cambia el efectivo real y debe quedar en libros.
   * Diferencia positiva: Dr Caja / Cr Otros ingresos.
   * Diferencia negativa: Dr Otros gastos / Cr Caja.
   */
  private async handleCajaCerrada(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'caja.cerrada');
    const diferencia = Number(eventData.diferencia ?? 0);

    if (!Number.isFinite(diferencia)) {
      throw new Error('Evento caja.cerrada con diferencia inválida');
    }
    if (Math.abs(diferencia) <= 0.009) {
      this.logger.log(
        `ℹ️ [ContabilidadEventsListener] Cierre ${eventData.sesionCajaId ?? evento.event_id} sin diferencia; no requiere asiento.`,
      );
      return;
    }

    const cierreData = {
      tenant_id: tenantId,
      fecha: eventData.fecha || eventData.timestamp || new Date().toISOString(),
      diferencia,
      referencia:
        eventData.referencia || `CIERRE-CAJA-${eventData.sesionCajaId ?? evento.aggregate_id}`,
      event_id: evento.event_id || eventData.eventId,
      cuenta_caja_codigo: eventData.cuentaCajaCodigo || '10111',
      sesion_caja_id: eventData.sesionCajaId,
      caja_id: eventData.cajaId,
    };

    const asientoCreado = await this.asientosGenerator.generarAsientoCierreCaja(cierreData);
    if (cierreData.event_id) {
      const asientoVerificado = await this.verificarAsientoCreado(
        tenantId,
        cierreData.event_id,
        cierreData.referencia,
      );
      if (!asientoVerificado) {
        throw new Error(
          `Asiento de diferencia de caja no verificable para evento ${cierreData.event_id}`,
        );
      }
    } else if (!asientoCreado?.id) {
      throw new Error('Asiento de diferencia de caja no retornó ID válido');
    }
  }

  /** Procesa exclusivamente el payload contable congelado por Caja 474. */
  private async handleOperacionCaja474(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, evento.event_type);
    const diferencia = Number(eventData.diferencia ?? eventData.diferenciaOrigen ?? 0);
    if (
      evento.event_type === 'caja.cambio_turno.completado' &&
      Number.isFinite(diferencia) &&
      Math.abs(diferencia) <= 0.009
    ) {
      this.logger.log(
        `ℹ️ [ContabilidadEventsListener] Cambio ${eventData.cambioTurnoId ?? evento.aggregate_id} sin diferencia; no requiere asiento.`,
      );
      return;
    }

    const operationData = {
      ...eventData,
      tenant_id: tenantId,
      event_id: evento.event_id || eventData.eventId,
      tipo_evento: evento.event_type,
      fecha: eventData.fecha || evento.created_at || new Date().toISOString(),
      referencia: eventData.referencia || `CAJA-474-${evento.aggregate_id}`,
    };
    const asiento = await this.asientosGenerator.generarAsientoOperacionCaja474(operationData);
    if (!operationData.event_id) {
      throw new Error(`Evento ${evento.event_type} sin source_event_id durable`);
    }
    const asientoVerificado = await this.verificarAsientoCreado(
      tenantId,
      operationData.event_id,
      operationData.referencia,
    );
    if (!asientoVerificado || (!asiento?.id && !asientoVerificado.id)) {
      throw new Error(
        `Asiento Caja 474 no verificable para evento ${operationData.event_id}`,
      );
    }
  }

  /**
   * Dueño contable único de movimientos bancarios manuales/conciliatorios.
   * El payload 457 lleva las cuentas postables y el importe local congelados.
   */
  private async handleMovimientoBancario(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'banco.movimiento.registrado');
    const eventId = evento.event_id || eventData.eventId;
    const referencia = eventData.referencia || `BANCO:${eventData.operacionId ?? evento.aggregate_id}`;
    const asiento = await this.asientosGenerator.generarAsientoMovimientoBancario({
      ...eventData,
      tenant_id: tenantId,
      event_id: eventId,
      referencia,
    });

    if (eventId) {
      const verificado = await this.verificarAsientoCreado(tenantId, eventId, referencia);
      if (!verificado) {
        throw new Error(`Asiento bancario no verificable para evento ${eventId}`);
      }
    } else if (!asiento?.id) {
      throw new Error('El movimiento bancario no retornó un asiento válido');
    }
  }

  /** Transferencia interna: Dr banco destino / Cr banco origen por importe local. */
  private async handleTransferenciaBancaria(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'banco.transferencia.registrada');
    const eventId = evento.event_id || eventData.eventId;
    const referencia =
      eventData.referencia || `TRANSFER:${eventData.operacionId ?? evento.aggregate_id}`;
    const asiento = await this.asientosGenerator.generarAsientoTransferenciaBancaria({
      ...eventData,
      tenant_id: tenantId,
      event_id: eventId,
      referencia,
    });

    if (eventId) {
      const verificado = await this.verificarAsientoCreado(tenantId, eventId, referencia);
      if (!verificado) {
        throw new Error(`Asiento de transferencia bancaria no verificable para evento ${eventId}`);
      }
    } else if (!asiento?.id) {
      throw new Error('La transferencia bancaria no retornó un asiento válido');
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
        costo_ventas: Number(eventData.costoVentas ?? eventData.costo_ventas ?? 0),
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
        tipoMovimiento: eventData.tipoMovimiento ?? eventData.tipo_movimiento ?? eventData.tipo,
        medio: eventData.medio ?? eventData.metodo_pago,
        // La RPC de tesorería valúa la cuenta por cobrar al tipo de cambio de
        // origen y el ingreso a caja/banco al tipo de liquidación. Mantener los
        // tres importes evita que contabilidad vuelva a consultar un TC mutable.
        montoContabilizado: eventData.montoContabilizado ?? eventData.monto_contabilizado,
        montoLiquidacion: eventData.montoLiquidacion ?? eventData.monto_liquidacion,
        diferenciaCambio: eventData.diferenciaCambio ?? eventData.diferencia_cambio,
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

  /** Reversa exacta del cobro original: Dr 12 / Cr 10 y FX opuesto. */
  private async handleCobroRevertido(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'cobro.revertido');
      const asientoData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || eventData.timestamp || new Date().toISOString(),
        monto: eventData.monto,
        montoContabilizado: eventData.montoContabilizado ?? eventData.monto_contabilizado,
        montoLiquidacion: eventData.montoLiquidacion ?? eventData.monto_liquidacion,
        diferenciaCambio: eventData.diferenciaCambio ?? eventData.diferencia_cambio,
        medio: eventData.medio ?? eventData.metodoPago ?? eventData.metodo_pago,
        referencia: eventData.referencia ?? eventData.cobroId ?? eventData.cobro_id,
        event_id: evento.event_id || eventData.eventId,
      };
      const asiento = await this.asientosGenerator.generarAsientoReversaCobro(asientoData);
      if (asientoData.event_id) {
        const verificado = await this.verificarAsientoCreado(
          tenantId, asientoData.event_id, asientoData.referencia,
        );
        if (!verificado) {
          throw new Error(`Asiento de reversa de cobro no verificable para ${asientoData.event_id}`);
        }
      } else if (!asiento?.id) {
        throw new Error('Asiento de reversa de cobro no retornó ID válido');
      }
    } catch (error) {
      this.logger.error('❌ [ContabilidadEventsListener] Error en handleCobroRevertido:', error);
      throw error;
    }
  }

  /** Procesa ajustes de CxC sin tratarlos como entradas de caja o banco. */
  private async handleAjusteCxcRegistrado(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'cxc.ajuste.registrado');
      const ajusteData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || eventData.timestamp || new Date().toISOString(),
        monto: eventData.monto,
        tipoMovimiento: eventData.tipoMovimiento ?? eventData.tipo_movimiento ?? eventData.tipo,
        montoContabilizado: eventData.montoContabilizado ?? eventData.monto_contabilizado,
        baseAjuste: eventData.baseAjuste ?? eventData.base_ajuste,
        igvAjuste: eventData.igvAjuste ?? eventData.igv_ajuste,
        referencia: eventData.numeroDocumento || eventData.referencia,
        event_id: evento.event_id || eventData.eventId,
      };

      const asientoCreado = await this.asientosGenerator.generarAsientoAjusteCxc(ajusteData);
      if (ajusteData.event_id) {
        const asientoVerificado = await this.verificarAsientoCreado(
          tenantId,
          ajusteData.event_id,
          ajusteData.referencia,
        );
        if (!asientoVerificado) {
          throw new Error(
            `Asiento de ajuste CxC no se pudo verificar para evento ${ajusteData.event_id}`,
          );
        }
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento de ajuste CxC no retornó ID válido');
      }
    } catch (error) {
      this.logger.error('❌ [ContabilidadEventsListener] Error en handleAjusteCxcRegistrado:', error);
      throw error;
    }
  }

  /** Reversa fiscal no monetaria: asiento exactamente opuesto al ajuste CxC. */
  private async handleAjusteCxcRevertido(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'cxc.ajuste.revertido');
      const originalEventId = String(
        eventData.eventoOriginalId ?? eventData.evento_original_id ?? '',
      ).trim();
      if (!originalEventId) {
        throw new Error('La reversa de ajuste CxC no conserva eventoOriginalId');
      }
      const asientoOriginal = await this.verificarAsientoCreado(
        tenantId, originalEventId,
      );
      if (!asientoOriginal) {
        throw new Error(
          `El ajuste CxC original ${originalEventId} aún no tiene asiento verificable`,
        );
      }
      const ajusteData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || eventData.timestamp || new Date().toISOString(),
        monto: eventData.monto,
        tipoMovimiento: eventData.tipoMovimiento ?? eventData.tipo_movimiento ?? eventData.tipo,
        montoContabilizado: eventData.montoContabilizado ?? eventData.monto_contabilizado,
        referencia: eventData.referencia ?? eventData.operacionId ?? eventData.operacion_id,
        event_id: evento.event_id || eventData.eventId,
      };
      const asiento = await this.asientosGenerator.generarAsientoReversaAjusteCxc(ajusteData);
      if (ajusteData.event_id) {
        const verificado = await this.verificarAsientoCreado(
          tenantId, ajusteData.event_id, ajusteData.referencia,
        );
        if (!verificado) {
          throw new Error(`Asiento de reversa de ajuste CxC no verificable para ${ajusteData.event_id}`);
        }
      } else if (!asiento?.id) {
        throw new Error('Asiento de reversa de ajuste CxC no retornó ID válido');
      }
    } catch (error) {
      this.logger.error('❌ [ContabilidadEventsListener] Error en handleAjusteCxcRevertido:', error);
      throw error;
    }
  }

  /** Procesa ajustes de CxP sin simular un pago o un movimiento de tesorería. */
  private async handleAjusteCxpRegistrado(evento: OutboxEvent): Promise<void> {
    try {
      const eventData = evento.event_data;
      const tenantId = this.ensureEventTenant(eventData, 'cxp.ajuste.registrado');
      const ajusteData = {
        tenant_id: tenantId,
        fecha: eventData.fecha || eventData.timestamp || new Date().toISOString(),
        monto: eventData.monto,
        montoContabilizado: eventData.montoContabilizado ?? eventData.monto_contabilizado,
        tipoMovimiento: eventData.tipoMovimiento ?? eventData.tipo_movimiento ?? eventData.tipo,
        referencia: eventData.numeroDocumento || eventData.referencia,
        event_id: evento.event_id || eventData.eventId,
      };
      const asientoCreado = await this.asientosGenerator.generarAsientoAjusteCxp(ajusteData);
      if (ajusteData.event_id) {
        const verificado = await this.verificarAsientoCreado(
          tenantId,
          ajusteData.event_id,
          ajusteData.referencia,
        );
        if (!verificado) {
          throw new Error(`Asiento de ajuste CxP no se pudo verificar para evento ${ajusteData.event_id}`);
        }
      } else if (!asientoCreado?.id) {
        throw new Error('Asiento de ajuste CxP no retornó ID válido');
      }
    } catch (error) {
      this.logger.error('❌ [ContabilidadEventsListener] Error en handleAjusteCxpRegistrado:', error);
      throw error;
    }
  }

  /** Dueño contable único de la NC: revierte venta/impuesto y, sólo en RMA, costo. */
  private async handleNotaCreditoEmitida(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'nota_credito.emitida');
    const referencia = this.normalizarReferenciaComprobante(
      eventData.serie && eventData.numero
        ? `${eventData.serie}-${eventData.numero}`
        : eventData.notaCreditoId ?? eventData.nota_credito_id,
    );
    const asientoData = {
      tenant_id: tenantId,
      fecha: eventData.fechaEmision ?? eventData.fecha_emision ?? eventData.fecha,
      base_imponible: eventData.base_imponible ?? eventData.subtotal,
      igv: eventData.igv ?? eventData.impuestos,
      total: eventData.total,
      monto_pendiente: eventData.cxcReduction ?? eventData.monto_pendiente ?? 0,
      customerCreditBalance:
        eventData.customerCreditBalance ?? eventData.customer_credit_balance ?? eventData.saldoFavor ?? 0,
      costo_ventas: eventData.costoVentas ?? eventData.costo_ventas ?? 0,
      referencia,
      event_id: evento.event_id || eventData.eventId,
    };
    const asiento = await this.asientosGenerator.generarAsientoNotaCredito(asientoData);
    if (asientoData.event_id) {
      const verificado = await this.verificarAsientoCreado(
        tenantId, asientoData.event_id, referencia,
      );
      if (!verificado) {
        throw new Error(`Asiento de nota de crédito no verificable para ${asientoData.event_id}`);
      }
    } else if (!asiento?.id) {
      throw new Error('Asiento de nota de crédito no retornó ID válido');
    }
  }

  /** Una ND comercial incrementa la CxC: Dr 12 / Cr 70 + Cr 40, sin stock. */
  private async handleNotaDebitoEmitida(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'nota_debito.emitida');
    const referencia = this.normalizarReferenciaComprobante(
      eventData.serie && eventData.numero
        ? `${eventData.serie}-${eventData.numero}`
        : eventData.notaDocumentoId ?? eventData.nota_documento_id,
    );
    const asientoData = {
      tenant_id: tenantId,
      fecha: eventData.fechaEmision ?? eventData.fecha_emision ?? eventData.fecha,
      base_imponible: eventData.base_imponible ?? eventData.subtotal,
      igv: eventData.igv ?? eventData.impuestos,
      total: eventData.total,
      referencia,
      event_id: evento.event_id || eventData.eventId,
    };
    const asiento = await this.asientosGenerator.generarAsientoNotaDebito(asientoData);
    if (asientoData.event_id) {
      const verificado = await this.verificarAsientoCreado(
        tenantId, asientoData.event_id, referencia,
      );
      if (!verificado) {
        throw new Error(`Asiento de nota de débito no verificable para ${asientoData.event_id}`);
      }
    } else if (!asiento?.id) {
      throw new Error('Asiento de nota de débito no retornó ID válido');
    }
  }

  /** Aplicar saldo no es cobro: Dr 122 / Cr 12, sin movimiento de tesorería. */
  private async handleSaldoFavorAplicado(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'saldo_favor.aplicado');
    const asientoData = {
      tenant_id: tenantId,
      fecha: eventData.fecha,
      monto: eventData.monto,
      montoPasivo: eventData.montoPasivo ?? eventData.monto_pasivo,
      montoCxc: eventData.montoCxc ?? eventData.monto_cxc,
      diferenciaCambio: eventData.diferenciaCambio ?? eventData.diferencia_cambio,
      referencia: eventData.referencia ?? eventData.saldoFavorId,
      event_id: evento.event_id || eventData.eventId,
    };
    const asiento = await this.asientosGenerator.generarAsientoAplicacionSaldoFavor(asientoData);
    if (asientoData.event_id) {
      const verificado = await this.verificarAsientoCreado(
        tenantId, asientoData.event_id, asientoData.referencia,
      );
      if (!verificado) {
        throw new Error(`Asiento de aplicación de saldo no verificable para ${asientoData.event_id}`);
      }
    } else if (!asiento?.id) {
      throw new Error('Asiento de aplicación de saldo no retornó ID válido');
    }
  }

  /** Reembolso real: Dr 122 / Cr 10; la RPC exige caja o banco explícito. */
  private async handleSaldoFavorReembolsado(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'saldo_favor.reembolsado');
    const asientoData = {
      tenant_id: tenantId,
      fecha: eventData.fecha,
      monto: eventData.monto,
      montoPasivo: eventData.montoPasivo ?? eventData.monto_pasivo,
      montoTesoreria: eventData.montoTesoreria ?? eventData.monto_tesoreria,
      diferenciaCambio: eventData.diferenciaCambio ?? eventData.diferencia_cambio,
      medio: eventData.medio,
      referencia: eventData.referencia ?? eventData.saldoFavorId,
      event_id: evento.event_id || eventData.eventId,
    };
    const asiento = await this.asientosGenerator.generarAsientoReembolsoSaldoFavor(asientoData);
    if (asientoData.event_id) {
      const verificado = await this.verificarAsientoCreado(
        tenantId, asientoData.event_id, asientoData.referencia,
      );
      if (!verificado) {
        throw new Error(`Asiento de reembolso de saldo no verificable para ${asientoData.event_id}`);
      }
    } else if (!asiento?.id) {
      throw new Error('Asiento de reembolso de saldo no retornó ID válido');
    }
  }

  /** Reversa del egreso RMA: Dr 10 / Cr 122 y FX exactamente opuesto. */
  private async handleSaldoFavorReembolsoRevertido(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'saldo_favor.reembolso_revertido');
    const asientoData = {
      tenant_id: tenantId,
      fecha: eventData.fecha,
      monto: eventData.monto,
      montoPasivo: eventData.montoPasivo ?? eventData.monto_pasivo,
      montoTesoreria: eventData.montoTesoreria ?? eventData.monto_tesoreria,
      diferenciaCambio: eventData.diferenciaCambio ?? eventData.diferencia_cambio,
      medio: eventData.medio,
      referencia: eventData.referencia ?? eventData.saldoFavorId,
      event_id: evento.event_id || eventData.eventId,
    };
    const asiento = await this.asientosGenerator
      .generarAsientoReversaReembolsoSaldoFavor(asientoData);
    if (asientoData.event_id) {
      const verificado = await this.verificarAsientoCreado(
        tenantId, asientoData.event_id, asientoData.referencia,
      );
      if (!verificado) {
        throw new Error(`Asiento de reversa de reembolso no verificable para ${asientoData.event_id}`);
      }
    } else if (!asiento?.id) {
      throw new Error('Asiento de reversa de reembolso no retornó ID válido');
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
      const costoRecepcion =
        eventData.subtotalParcial ?? eventData.subtotal ?? eventData.costo;
      
      const compraData = {
        tenant_id: tenantId,
        fecha: eventData.fechaRecepcion || eventData.fecha || new Date().toISOString(),
        costo: costoRecepcion,
        mercaderia: eventData.mercaderiaParcial,
        servicios: eventData.serviciosParcial,
        no_stock: eventData.noStockParcial,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.numeroRecepcion || eventData.numeroOrden,
        event_id: evento.event_id || eventData.eventId
      };

      const eventId = compraData.event_id;

      const asientoCreado = await this.asientosGenerator.generarAsientoRecepcion(compraData);

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
    const eventId = evento.event_id || eventData.eventId;
    const asiento = await this.asientosGenerator.generarAsientoFacturaProveedor({
      tenant_id: tenantId,
      fecha: eventData.fechaEmision,
      subtotal: eventData.subtotal,
      igv: eventData.igv,
      total: eventData.total,
      saldoProveedor: eventData.saldoProveedor ?? eventData.saldo_proveedor,
      ajustes: {
        retencion: eventData.retencion ?? 0,
        percepcion: eventData.percepcion ?? 0,
        detraccion: eventData.detraccion ?? 0,
        anticipo: eventData.anticipo ?? 0,
      },
      recepcion_id: eventData.recepcionId ?? null,
      referencia: eventData.numeroDocumento ?? eventData.facturaProvId,
      event_id: eventId,
    });
    if (eventId) {
      const verificado = await this.verificarAsientoCreado(
        tenantId,
        eventId,
        eventData.numeroDocumento ?? eventData.facturaProvId,
      );
      if (!verificado) throw new Error(`No se pudo verificar el asiento de factura proveedor ${eventId}`);
    } else if (!asiento?.id) {
      throw new Error('El asiento de factura proveedor no retornó un ID válido');
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

    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleProductoStockBajo:`, error);
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

    } catch (error) {
      this.logger.error(`❌ [ContabilidadEventsListener] Error en handleStockMovimiento:`, error);
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
        aportes: eventData.totalAportes ?? eventData.aportes ?? eventData.total_aportes ?? 0,
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

      if (planillaData.planilla_id) {
        const { data: projection, error: flagError } = await this.supabaseService
          .getClient()
          .rpc('marcar_planilla_contabilizada_tx_492', {
            p_tenant_id: tenantId,
            p_planilla_id: planillaData.planilla_id,
            p_event_id: eventId,
            p_claim_token: evento.claim_token,
          });
        if (flagError || (projection as { updated?: boolean } | null)?.updated !== true) {
          throw new Error(
            `El asiento existe pero no se pudo sincronizar el flag de planilla: ${flagError?.message || 'RPC no confirmó la proyección'}`,
          );
        }
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
      const cuentaTesoreria = await this.resolverCuentaTesoreriaLaboral(evento, tenantId);

      const pagoData = {
        tenant_id: tenantId,
        fecha: eventData.fechaPago || new Date().toISOString(),
        monto: eventData.totalPagado,
        metodo_pago: eventData.metodoPago || 'transferencia',
        planilla_id: eventData.planillaId,
        referencia: `PAGO-PLANILLA-${eventData.planillaId}`,
        source_event_id: evento.event_id || eventData.eventId || eventData.planillaId || evento.aggregate_id,
        event_id: evento.event_id || eventData.eventId,
        ...cuentaTesoreria,
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

  private async resolverCuentaTesoreriaLaboral(
    evento: OutboxEvent,
    tenantId: string,
  ): Promise<{
    metodo_pago: 'transferencia' | 'efectivo';
    cuenta_tesoreria_id: string;
    cuenta_tesoreria_codigo: string;
    cuenta_bancaria_id?: string;
    movimiento_bancario_id?: string;
    sesion_caja_id?: string;
    movimiento_caja_id?: string;
  }> {
    if (!evento.id || !evento.claim_token) {
      throw new Error(`LABOR_TREASURY_OUTBOX_CLAIM_REQUIRED:${evento.event_id || evento.id}`);
    }
    const { data, error } = await this.supabaseService.getClient().rpc(
      'resolver_cuenta_tesoreria_laboral_492',
      {
        p_tenant_id: tenantId,
        p_outbox_id: evento.id,
        p_claim_token: evento.claim_token,
      },
    );
    if (error) {
      throw new Error(`No se pudo resolver la cuenta tesorera laboral: ${error.message}`);
    }
    const result = (data ?? {}) as Record<string, unknown>;
    const metodo = String(result.metodo_pago ?? '').toLowerCase();
    const cuentaId = String(result.cuenta_tesoreria_id ?? '').trim();
    const cuentaCodigo = String(result.cuenta_tesoreria_codigo ?? '').trim();
    if (!['transferencia', 'efectivo'].includes(metodo) || !cuentaId || !cuentaCodigo) {
      throw new Error('La resolución tesorera laboral no retornó una cuenta contable válida');
    }
    return {
      ...(result as any),
      metodo_pago: metodo as 'transferencia' | 'efectivo',
      cuenta_tesoreria_id: cuentaId,
      cuenta_tesoreria_codigo: cuentaCodigo,
    };
  }

  private async handleLiquidacionAprobada(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'liquidacion.aprobada');
    const eventId = evento.event_id || eventData.eventId;
    const referencia = `LIQUIDACION-${eventData.liquidacionId}`;
    const asiento = await this.asientosGenerator.generarAsientoDevengoLiquidacion({
      tenant_id: tenantId,
      fecha: eventData.fecha || eventData.fechaTerminacion || new Date().toISOString(),
      monto: eventData.totalLiquidacion,
      liquidacion_id: eventData.liquidacionId,
      componentes_liquidacion:
        eventData.componentesLiquidacion ?? eventData.componentes_liquidacion,
      referencia,
      source_event_id: eventId,
      event_id: eventId,
    });
    if (eventId) {
      const verificado = await this.verificarAsientoCreado(tenantId, eventId, referencia);
      if (!verificado) throw new Error(`No se pudo verificar el devengo de liquidación ${eventId}`);
    } else if (!asiento?.id) {
      throw new Error('El devengo de liquidación no retornó un asiento válido');
    }
  }

  private async handleLiquidacionPagada(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'liquidacion.pagada');
    const cuentaTesoreria = await this.resolverCuentaTesoreriaLaboral(evento, tenantId);
    const eventId = evento.event_id || eventData.eventId;
    const referencia = `PAGO-LIQUIDACION-${eventData.liquidacionId}`;
    const asiento = await this.asientosGenerator.generarAsientoPagoLiquidacion({
      tenant_id: tenantId,
      fecha: eventData.fechaPago || new Date().toISOString(),
      monto: eventData.totalPagado,
      liquidacion_id: eventData.liquidacionId,
      referencia,
      source_event_id: eventId,
      event_id: eventId,
      ...cuentaTesoreria,
    });
    if (eventId) {
      const verificado = await this.verificarAsientoCreado(tenantId, eventId, referencia);
      if (!verificado) throw new Error(`No se pudo verificar el pago de liquidación ${eventId}`);
    } else if (!asiento?.id) {
      throw new Error('El pago de liquidación no retornó un asiento válido');
    }
  }

  private async handlePagoLiquidacionRevertido(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'liquidacion.pago.revertido');
    const cuentaTesoreria = await this.resolverCuentaTesoreriaLaboral(evento, tenantId);
    const eventId = evento.event_id || eventData.eventId;
    const referencia = `REVERSA-PAGO-LIQUIDACION-${eventData.liquidacionId}`;
    const asiento = await this.asientosGenerator.generarAsientoReversaPagoLiquidacion({
      tenant_id: tenantId,
      fecha: eventData.fechaReversion || new Date().toISOString(),
      monto: eventData.montoRevertido,
      liquidacion_id: eventData.liquidacionId,
      referencia,
      source_event_id: eventId,
      event_id: eventId,
      ...cuentaTesoreria,
    });
    if (eventId) {
      const verificado = await this.verificarAsientoCreado(tenantId, eventId, referencia);
      if (!verificado) throw new Error(`No se pudo verificar la reversa de liquidación ${eventId}`);
    } else if (!asiento?.id) {
      throw new Error('La reversa de liquidación no retornó un asiento válido');
    }
  }

  private async handleCtsDepositado(evento: OutboxEvent): Promise<void> {
    const eventData = evento.event_data;
    const tenantId = this.ensureEventTenant(eventData, 'cts.depositado');
    const cuentaTesoreria = await this.resolverCuentaTesoreriaLaboral(evento, tenantId);
    const eventId = evento.event_id || eventData.eventId;
    const referencia = `CTS-${eventData.depositoId}`;
    const asiento = await this.asientosGenerator.generarAsientoDepositoCts({
      tenant_id: tenantId,
      fecha: eventData.fechaDeposito || new Date().toISOString(),
      monto: eventData.totalDepositado,
      deposito_id: eventData.depositoId,
      referencia,
      source_event_id: eventId,
      event_id: eventId,
      ...cuentaTesoreria,
    });
    if (eventId) {
      const verificado = await this.verificarAsientoCreado(tenantId, eventId, referencia);
      if (!verificado) throw new Error(`No se pudo verificar el depósito CTS ${eventId}`);
    } else if (!asiento?.id) {
      throw new Error('El depósito CTS no retornó un asiento válido');
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
      const baseDurable = Number(eventData.base_imponible);
      const igvDurable = Number(eventData.igv);
      const costoVentasDurable = Number(eventData.costo_ventas);
      const hasBaseDurable = eventData.base_imponible != null
        && Number.isFinite(baseDurable)
        && baseDurable >= 0;
      const hasIgvDurable = eventData.igv != null
        && Number.isFinite(igvDurable)
        && igvDurable >= 0;
      let baseImponible = hasBaseDurable ? Math.abs(baseDurable) : 0;
      let igvAnulado = hasIgvDurable ? Math.abs(igvDurable) : 0;

      // Los cierres transaccionales publican el snapshot fiscal original. El
      // cálculo por tasa queda únicamente como compatibilidad para eventos
      // históricos que no conservan base/IGV.
      if (!hasBaseDurable && hasIgvDurable) {
        baseImponible = Math.max(totalAnulado - igvAnulado, 0);
      } else if (!hasBaseDurable && totalAnulado > 0) {
        const subtotalCalculado = await this.taxCalculator.calcularSubtotalDesdeTotal(
          totalAnulado,
          tenantId
        );
        baseImponible = subtotalCalculado;
      }
      if (!hasIgvDurable) igvAnulado = Math.max(totalAnulado - baseImponible, 0);

      const reversoData = {
        tenant_id: tenantId,
        fecha: eventData.anulado_at || new Date().toISOString(),
        total: totalAnulado,
        base_imponible: baseImponible,
        igv: igvAnulado,
        costo_ventas: Number.isFinite(costoVentasDurable)
          ? Math.abs(costoVentasDurable)
          : 0,
        ajustes: eventData.ajustes ?? {},
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
