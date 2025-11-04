import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CobroRegistradoEvent } from './event-bus.service';
import { v4 as uuidv4 } from 'uuid';

export interface EmitEventOptions {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  eventData: any;
  correlationId?: string;
  eventVersion?: number;
}

/**
 * Service for emitting domain events to the outbox_events table
 * Implements the Transactional Outbox pattern
 */
@Injectable()
export class EventEmitterService {
  private readonly logger = new Logger(EventEmitterService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Emits a domain event to the outbox_events table
   * @param options - Event emission options
   * @returns The created event ID
   */
  async emit(options: EmitEventOptions): Promise<string> {
    const {
      eventType,
      aggregateType,
      aggregateId,
      eventData,
      correlationId = uuidv4(),
      eventVersion = 1
    } = options;

    const eventId = uuidv4();

    try {
      this.logger.log(
        `📤 [EventEmitter] Emitting event: ${eventType} for ${aggregateType}:${aggregateId}`
      );

      const { data, error } = await this.supabaseService
        .getClient()
        .from('outbox_events')
        .insert({
          event_id: eventId,
          correlation_id: correlationId,
          aggregate_type: aggregateType,
          aggregate_id: aggregateId,
          event_type: eventType,
          event_data: eventData,
          event_version: eventVersion,
          status: 'pending',
          retry_count: 0,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        this.logger.error(
          `❌ [EventEmitter] Error emitting event ${eventType}:`,
          error
        );
        throw new Error(`Error emitting event: ${error.message}`);
      }

      this.logger.log(
        `✅ [EventEmitter] Event emitted successfully: ${eventId}`
      );

      return eventId;
    } catch (error) {
      this.logger.error(
        `❌ [EventEmitter] Exception emitting event ${eventType}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Emits a sales event (venta.procesada)
   * @param ventaData - Sales data
   * @returns The created event ID
   */
  async emitVentaProcesada(ventaData: {
    ventaId: string;
    tenantId: string;
    fecha: string;
    total: number;
    subtotal: number;
    impuestos: number;
    costoVentas: number;
    centroCostoId?: string;
    numeroTicket?: string;
    numeroFactura?: string;
    cpeId?: string;
  }): Promise<string> {
    return this.emit({
      eventType: 'venta.procesada',
      aggregateType: 'venta',
      aggregateId: ventaData.ventaId,
      eventData: {
        tenant_id: ventaData.tenantId,
        venta_id: ventaData.ventaId,
        fecha: ventaData.fecha,
        total: ventaData.total,
        subtotal: ventaData.subtotal,
        base_imponible: ventaData.subtotal,
        impuestos: ventaData.impuestos,
        igv: ventaData.impuestos,
        costo_ventas: ventaData.costoVentas,
        centro_costo_id: ventaData.centroCostoId,
        numeroTicket: ventaData.numeroTicket,
        numeroFactura: ventaData.numeroFactura,
        cpeId: ventaData.cpeId,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Emits a collection event (cobro.registrado)
   * @param cobroData - Collection data
   * @returns The created event ID
   */
  async emitCobroRegistrado(evento: CobroRegistradoEvent): Promise<string> {
    // HARDENING: normalizar payload asegurando compatibilidad snake_case/camelCase.
    const payload = {
      ...evento,
      tenant_id: evento.tenantId,
      cobro_id: evento.cobroId,
      cxc_id: evento.cxcId,
      cuenta_bancaria_id: evento.cuentaBancariaId ?? null,
      numeroDocumento: evento.numeroDocumento ?? null,
      numero_documento: evento.numeroDocumento ?? null,
      documento_id: evento.documentoId ?? null,
      metodo_pago: evento.medio,
      referencia: evento.referencia ?? null,
      timestamp: evento.timestamp ?? new Date().toISOString(),
    };

    return this.emit({
      eventType: 'cobro.registrado',
      aggregateType: 'cobro',
      aggregateId: evento.cobroId,
      eventData: payload,
      correlationId: evento.idempotencyKey,
    });
  }

  /**
   * Emits a reception event (recepcion.registrada)
   * @param recepcionData - Reception data
   * @returns The created event ID
   */
  async emitRecepcionRegistrada(recepcionData: {
    recepcionId: string;
    tenantId: string;
    fechaRecepcion: string;
    total: number;
    subtotal: number;
    igv: number;
    centroCostoId?: string;
    numeroRecepcion?: string;
    numeroOrden?: string;
  }): Promise<string> {
    return this.emit({
      eventType: 'recepcion.registrada',
      aggregateType: 'recepcion',
      aggregateId: recepcionData.recepcionId,
      eventData: {
        tenant_id: recepcionData.tenantId,
        recepcion_id: recepcionData.recepcionId,
        fechaRecepcion: recepcionData.fechaRecepcion,
        fecha: recepcionData.fechaRecepcion,
        total: recepcionData.total,
        subtotal: recepcionData.subtotal,
        costo: recepcionData.subtotal,
        igv: recepcionData.igv,
        centro_costo_id: recepcionData.centroCostoId,
        numeroRecepcion: recepcionData.numeroRecepcion,
        numeroOrden: recepcionData.numeroOrden,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Emits a supplier payment event (pago.proveedor.registrado)
   * @param pagoData - Payment data
   * @returns The created event ID
   */
  async emitPagoProveedorRegistrado(pagoData: {
    pagoId: string;
    tenantId: string;
    fechaPago: string;
    monto: number;
    centroCostoId?: string;
    numeroDocumento?: string;
    referencia?: string;
  }): Promise<string> {
    return this.emit({
      eventType: 'pago.proveedor.registrado',
      aggregateType: 'pago',
      aggregateId: pagoData.pagoId,
      eventData: {
        tenant_id: pagoData.tenantId,
        pago_id: pagoData.pagoId,
        fechaPago: pagoData.fechaPago,
        fecha: pagoData.fechaPago,
        monto: pagoData.monto,
        centro_costo_id: pagoData.centroCostoId,
        numeroDocumento: pagoData.numeroDocumento,
        referencia: pagoData.referencia,
        timestamp: new Date().toISOString()
      }
    });
  }
}
