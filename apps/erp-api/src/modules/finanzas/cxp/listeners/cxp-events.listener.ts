import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ERPEvent,
  EventBusService,
  RecepcionRegistradaEvent,
} from '../../../../shared/events/event-bus.service';
import { CxpService } from '../cxp.service';
import { CondicionesPagoCxp, CrearCxpDto } from '../dto/crear-cxp.dto';

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
  }

  private async handleRecepcionRegistrada(data: RecepcionRegistradaEvent): Promise<void> {
    const tenantId = data.tenantId;
    if (!tenantId) {
      this.logger.warn('⚠️ [CxP] Evento de recepción sin tenantId, se omite');
      return;
    }

    try {
      const dto: CrearCxpDto = {
        proveedor_id: data.proveedorId,
        orden_id: data.ordenId,
        recepcion_id: data.recepcionId,
        numero_documento: data.numeroRecepcion,
        fecha_emision: data.fechaRecepcion,
        fecha_vencimiento: data.fechaRecepcion,
        condiciones_pago: (data.condicionesPago as CondicionesPagoCxp | undefined) ?? undefined,
        dias_credito: data.diasCredito ?? undefined,
        subtotal: data.subtotalParcial ?? data.subtotal,
        igv: data.igvParcial ?? data.igv,
        total: data.totalParcial ?? data.total,
        moneda: data.moneda,
        observaciones: data.greProveedor
          ? `Recepción ${data.numeroRecepcion} - GRE Proveedor: ${data.greProveedor}`
          : `Recepción ${data.numeroRecepcion} de OC ${data.numeroOrden}`,
        numero: data.numeroRecepcion,
        tipo_documento: 'RECEPCION',
        referencia_tipo: 'RECEPCION',
        referencia_id: data.recepcionId,
        idempotency_key: data.idempotencyKey,
      };

      // Idempotencia: el servicio valida unicidad por proveedor + número_documento.
      await this.cxpService.crearCuentaPorPagar(tenantId, dto, null);
      this.logger.log(
        `✅ [CxP] Cuenta por pagar creada automáticamente para recepción ${data.numeroRecepcion}`,
      );
    } catch (error: any) {
      // No bloquear el flujo de eventos; solo registrar.
      this.logger.error(
        `❌ [CxP] Error creando CxP automática para recepción ${data.numeroRecepcion}: ${error?.message}`,
      );
    }
  }
}
