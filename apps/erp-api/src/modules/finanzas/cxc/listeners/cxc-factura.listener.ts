import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBusService, ERPEvent, FacturaEmitidaEvent } from '../../../../shared/events/event-bus.service';
import { CxcService } from '../cxc.service';

@Injectable()
export class CxcFacturaListener implements OnModuleInit {
  private readonly logger = new Logger(CxcFacturaListener.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly cxcService: CxcService,
  ) {}

  onModuleInit(): void {
    this.logger.log('📡 [CXC] Suscribiendo listener de factura emitida');

    this.eventBus.onFacturaEmitidaEvent(async (event: ERPEvent) => {
      const payload = event?.data as FacturaEmitidaEvent | undefined;
      if (!payload) {
        this.logger.warn('⚠️ [CXC] Evento factura.emitida sin payload, se omite');
        return;
      }

      try {
        // HARDENING: crear CxC idempotente usando tenant del contexto del evento.
        await this.cxcService.crearCuentaPorCobrarDesdeFactura(payload);
      } catch (error) {
        this.logger.error(
          `❌ [CXC] Error procesando FacturaEmitidaEvent ${payload.eventId || 'sin-id'}:`,
          error,
        );
      }
    });
  }
}
