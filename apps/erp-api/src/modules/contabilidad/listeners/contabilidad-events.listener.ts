import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AsientosGeneratorService } from '../services/asientos-generator.service';
import { OutboxEventsService, OutboxEvent } from '../services/outbox-events.service';
import { EventBusService, ERPEvent } from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { OutboxEventBuilder } from '../../../shared/outbox/outbox-event.interface';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
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
    private readonly supabaseService: SupabaseService,
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

      const aggregateId = eventData.ventaId || eventData.cobroId || eventData.recepcionId || eventData.pagoId || eventData.cuentaId || eventData.facturaId || uuidv4();

      this.logger.log(
        `💾 [ContabilidadEventsListener] Persistiendo evento ${eventType} en outbox`
      );

      // Usar el builder para garantizar estructura consistente
      const eventToInsert = OutboxEventBuilder.build({
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        eventData,
      });

      const { error } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .insert(eventToInsert);

      if (error) {
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
      // Silenciar errores de tenant context - es normal cuando no hay eventos con tenant
      if (error.message !== 'Tenant context required') {
        this.logger.error('❌ [ContabilidadEventsListener] Error procesando eventos pendientes:', error);
      }
    } finally {
      this.isProcessing = false;
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
    const maxRetries = 3;
    const retryCount = evento.retry_count || 0;
    let logId: string | null = null;

    try {
      this.logger.log(
        `🎯 [ContabilidadEventsListener] Procesando evento: ${evento.event_type} (${evento.event_id}) - Intento ${retryCount + 1}/${maxRetries}`
      );

      // Extraer tenantId del evento para logging
      const tenantId = evento.event_data?.tenantId || evento.event_data?.tenant_id || null;
      
      // Registrar inicio del procesamiento
      if (tenantId) {
        logId = await this.registrarInicioProcesamiento(evento, tenantId);
      }

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

        case 'cpe.anulado':
        case 'CPEAnulado':
          await this.handleCpeAnulado(evento);
          break;

        default:
          this.logger.debug(`⚠️ [ContabilidadEventsListener] Tipo de evento no manejado: ${evento.event_type}`);
          // No marcar como procesado, simplemente ignorar
          return;
      }

      this.logger.log(`✅ [ContabilidadEventsListener] Evento procesado exitosamente: ${evento.event_id}`);
      
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
      this.logger.error(
        `❌ [ContabilidadEventsListener] Excepción verificando asiento para evento ${sourceEventId}:`,
        error
      );
      return null;
    }
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
        aportes: eventData.totalAportes || eventData.aportes,
        retenciones: eventData.totalDescuentos || eventData.retenciones || 0,
        neto: eventData.totalNeto || eventData.neto,
        centro_costo_id: eventData.centro_costo_id,
        referencia: eventData.planillaId || eventData.periodo,
        event_id: eventData.eventId || evento.event_id
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

      // Generar asiento de reversión (montos negativos)
      // Este asiento revierte el asiento original de venta
      // ✅ FIX H09: Usar TaxCalculatorService en lugar de hardcodear 1.18
      const totalAnulado = -(eventData.total || 0);
      let baseImponible = 0;
      let igvAnulado = 0;

      if (eventData.total) {
        const subtotalCalculado = await this.taxCalculator.calcularSubtotalDesdeTotal(
          Math.abs(eventData.total),
          tenantId
        );
        baseImponible = -subtotalCalculado;
        igvAnulado = totalAnulado - baseImponible;
      }

      const reversoData = {
        tenant_id: tenantId,
        fecha: eventData.anulado_at || new Date().toISOString(),
        total: totalAnulado, // Negativo para revertir
        base_imponible: baseImponible, // Negativo
        igv: igvAnulado, // Negativo
        costo_ventas: 0, // No revertir costo si no hay información
        centro_costo_id: eventData.centro_costo_id,
        referencia: `REV-${referencia}`, // Prefijo REV para identificar reversiones
        event_id: eventData.eventId || evento.event_id,
        motivo: `Reversión por anulación: ${eventData.motivo || 'Sin motivo especificado'}`
      };

      const eventId = reversoData.event_id;

      // Usar generarAsientoVenta con montos negativos para revertir
      const asientoCreado = await this.asientosGenerator.generarAsientoVenta(reversoData);

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







