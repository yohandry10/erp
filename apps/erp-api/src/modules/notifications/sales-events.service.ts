import { Injectable, Logger } from '@nestjs/common';
import { NotificationTriggersService } from './notification-triggers.service';

/**
 * Sales event types
 */
export enum SalesEventType {
  COTIZACION_CONVERTIDA = 'cotizacion.convertida',
  PEDIDO_CONFIRMADO = 'pedido.confirmado',
  PEDIDO_LISTO_DESPACHO = 'pedido.listo_despacho',
  PEDIDO_LISTO_FACTURAR = 'pedido.listo_facturar',
  STOCK_BAJO = 'stock.bajo',
  FACTURA_EMITIDA = 'factura.emitida',
  GRE_GENERADA = 'gre.generada'
}

/**
 * Base event data interface
 */
export interface BaseEventData {
  tenant_id: string;
  usuario_id?: string;
  timestamp?: Date;
}

/**
 * Event data interfaces for each event type
 */
export interface CotizacionConvertidaEventData extends BaseEventData {
  cotizacion_id: string;
  cotizacion_numero: string;
  pedido_id: string;
  pedido_numero: string;
  cliente_nombre: string;
}

export interface PedidoConfirmadoEventData extends BaseEventData {
  pedido_id: string;
  pedido_numero: string;
  cliente_nombre: string;
  total: number;
  stock_warnings?: Array<{
    producto: string;
    disponible: number;
    solicitado: number;
  }>;
}

export interface PedidoListoDespachoEventData extends BaseEventData {
  pedido_id: string;
  pedido_numero: string;
  cliente_nombre: string;
}

export interface PedidoListoFacturarEventData extends BaseEventData {
  pedido_id: string;
  pedido_numero: string;
  cliente_nombre: string;
  total: number;
}

export interface StockBajoEventData extends BaseEventData {
  producto_id: string;
  producto_nombre: string;
  stock_actual: number;
  stock_minimo: number;
}

export interface FacturaEmitidaEventData extends BaseEventData {
  factura_id: string;
  factura_numero: string;
  pedido_numero: string;
  cliente_nombre: string;
  total: number;
}

export interface GREGeneradaEventData extends BaseEventData {
  gre_id: string;
  gre_numero: string;
  factura_numero: string;
  cliente_nombre: string;
}

/**
 * Union type for all event data
 */
export type SalesEventData =
  | CotizacionConvertidaEventData
  | PedidoConfirmadoEventData
  | PedidoListoDespachoEventData
  | PedidoListoFacturarEventData
  | StockBajoEventData
  | FacturaEmitidaEventData
  | GREGeneradaEventData;

/**
 * Service for emitting and handling sales events
 * This service acts as an event bus for the sales module
 */
@Injectable()
export class SalesEventsService {
  private readonly logger = new Logger(SalesEventsService.name);

  constructor(
    private readonly notificationTriggersService: NotificationTriggersService
  ) {}

  /**
   * Generic emit method for sales events
   * This method logs the event and triggers appropriate notifications
   */
  async emit(event: SalesEventType, data: SalesEventData): Promise<void> {
    try {
      // Add timestamp if not provided
      const eventData = {
        ...data,
        timestamp: data.timestamp || new Date()
      };

      // Log the event
      this.logger.log(`Event emitted: ${event}`, {
        event,
        tenant_id: eventData.tenant_id,
        timestamp: eventData.timestamp
      });

      // Route to appropriate handler
      await this.handleEvent(event, eventData);
    } catch (error) {
      this.logger.error(`Failed to emit event ${event}: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Handle event by routing to appropriate notification trigger
   */
  private async handleEvent(event: SalesEventType, data: SalesEventData): Promise<void> {
    switch (event) {
      case SalesEventType.COTIZACION_CONVERTIDA:
        await this.handleCotizacionConvertida(data as CotizacionConvertidaEventData);
        break;

      case SalesEventType.PEDIDO_CONFIRMADO:
        await this.handlePedidoConfirmado(data as PedidoConfirmadoEventData);
        break;

      case SalesEventType.PEDIDO_LISTO_DESPACHO:
        await this.handlePedidoListoDespacho(data as PedidoListoDespachoEventData);
        break;

      case SalesEventType.PEDIDO_LISTO_FACTURAR:
        await this.handlePedidoListoFacturar(data as PedidoListoFacturarEventData);
        break;

      case SalesEventType.STOCK_BAJO:
        await this.handleStockBajo(data as StockBajoEventData);
        break;

      case SalesEventType.FACTURA_EMITIDA:
        await this.handleFacturaEmitida(data as FacturaEmitidaEventData);
        break;

      case SalesEventType.GRE_GENERADA:
        await this.handleGREGenerada(data as GREGeneradaEventData);
        break;

      default:
        this.logger.warn(`Unknown event type: ${event}`);
    }
  }

  /**
   * Event handlers
   */
  private async handleCotizacionConvertida(data: CotizacionConvertidaEventData): Promise<void> {
    await this.notificationTriggersService.triggerCotizacionConvertida(
      data.tenant_id,
      data.cotizacion_numero,
      data.pedido_id,
      data.pedido_numero,
      data.cliente_nombre,
      data.usuario_id
    );
  }

  private async handlePedidoConfirmado(data: PedidoConfirmadoEventData): Promise<void> {
    await this.notificationTriggersService.triggerPedidoConfirmado(
      data.tenant_id,
      data.pedido_id,
      data.pedido_numero,
      data.cliente_nombre,
      data.total,
      data.stock_warnings,
      data.usuario_id
    );
  }

  private async handlePedidoListoDespacho(data: PedidoListoDespachoEventData): Promise<void> {
    await this.notificationTriggersService.triggerPedidoListoDespacho(
      data.tenant_id,
      data.pedido_id,
      data.pedido_numero,
      data.cliente_nombre,
      data.usuario_id
    );
  }

  private async handlePedidoListoFacturar(data: PedidoListoFacturarEventData): Promise<void> {
    await this.notificationTriggersService.triggerPedidoListoFacturar(
      data.tenant_id,
      data.pedido_id,
      data.pedido_numero,
      data.cliente_nombre,
      data.total,
      data.usuario_id
    );
  }

  private async handleStockBajo(data: StockBajoEventData): Promise<void> {
    await this.notificationTriggersService.triggerStockBajo(
      data.tenant_id,
      data.producto_id,
      data.producto_nombre,
      data.stock_actual,
      data.stock_minimo,
      data.usuario_id
    );
  }

  private async handleFacturaEmitida(data: FacturaEmitidaEventData): Promise<void> {
    await this.notificationTriggersService.triggerFacturaEmitida(
      data.tenant_id,
      data.factura_id,
      data.factura_numero,
      data.pedido_numero,
      data.cliente_nombre,
      data.total,
      data.usuario_id
    );
  }

  private async handleGREGenerada(data: GREGeneradaEventData): Promise<void> {
    await this.notificationTriggersService.triggerGREGenerada(
      data.tenant_id,
      data.gre_id,
      data.gre_numero,
      data.factura_numero,
      data.cliente_nombre,
      data.usuario_id
    );
  }
}
