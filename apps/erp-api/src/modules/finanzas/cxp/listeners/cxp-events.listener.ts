import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ERPEvent,
  EventBusService,
  DevolucionProveedorEmitidaEvent,
  RecepcionRegistradaEvent,
} from '../../../../shared/events/event-bus.service';
import { CxpService } from '../cxp.service';

@Injectable()
export class CxpEventsListener implements OnModuleInit {
  private readonly logger = new Logger(CxpEventsListener.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly cxpService: CxpService,
  ) {}

  onModuleInit(): void {
    this.logger.log('📡 [CxP] Suscribiendo listener de recepcion.registrada');
    this.eventBus.onRecepcionRegistrada(async (event: ERPEvent) => {
      const data = event.data as RecepcionRegistradaEvent;
      await this.handleRecepcionRegistrada(data);
    });

    this.logger.log('📡 [CxP] Suscribiendo listener de devolucion.proveedor.emitida');
    this.eventBus.onDevolucionProveedorEmitida(async (event: ERPEvent) => {
      const data = event.data as DevolucionProveedorEmitidaEvent;
      await this.handleDevolucionProveedorEmitida(data);
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

  private async handleDevolucionProveedorEmitida(
    data: DevolucionProveedorEmitidaEvent,
  ): Promise<void> {
    const tenantId = data.tenantId;
    if (!tenantId) {
      this.logger.warn('⚠️ [CxP] Evento de devolución proveedor sin tenantId, se omite');
      return;
    }

    if (!data.recepcionId) {
      this.logger.warn(
        `⚠️ [CxP] Devolución proveedor ${data.numeroDevolucion} no tiene recepcionId; no se puede revertir CxP automáticamente`,
      );
      return;
    }

    try {
      await this.cxpService.aplicarDevolucionProveedorEmitida(tenantId, data);
      this.logger.log(
        `✅ [CxP] Devolución ${data.numeroDevolucion} aplicada a CxP (recepción ${data.numeroRecepcion ?? data.recepcionId})`,
      );
    } catch (error: any) {
      this.logger.error(
        `❌ [CxP] Error aplicando devolución ${data.numeroDevolucion} a CxP: ${error?.message}`,
      );
    }
  }
}
