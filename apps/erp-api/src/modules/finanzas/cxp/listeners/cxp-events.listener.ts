import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ERPEvent,
  EventBusService,
  RecepcionRegistradaEvent,
} from '../../../../shared/events/event-bus.service';

@Injectable()
export class CxpEventsListener implements OnModuleInit {
  private readonly logger = new Logger(CxpEventsListener.name);

  constructor(private readonly eventBus: EventBusService) {}

  onModuleInit(): void {
    this.logger.log('📡 [CxP] Suscribiendo listener de recepcion.registrada');
    this.eventBus.onRecepcionRegistrada(async (event: ERPEvent) => {
      const data = event.data as RecepcionRegistradaEvent;
      await this.handleRecepcionRegistrada(data);
    });
  }

  private async handleRecepcionRegistrada(data: RecepcionRegistradaEvent): Promise<void> {
    const tenantId = data.tenantId;
    if (!tenantId) {
      this.logger.warn('⚠️ [CxP] Evento de recepción sin tenantId, se omite');
      return;
    }

    // Una recepción acredita que la mercadería llegó, no que exista una deuda
    // tributaria documentada. La CxP y el IGV crédito nacen recién al registrar
    // la factura del proveedor, que puede vincularse a esta recepción.
    this.logger.log(
      `⏳ [CxP] Recepción ${data.numeroRecepcion} pendiente de factura; no se crea CxP automáticamente`,
    );
  }

  // La devolución 450 ajusta CxP y publica outbox dentro del mismo commit.
  // No se suscribe un writer post-commit alterno.
}
