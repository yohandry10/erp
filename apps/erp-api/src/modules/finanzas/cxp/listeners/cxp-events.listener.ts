import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ERPEvent,
  EventBusService,
  DevolucionProveedorEmitidaEvent,
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

    try {
      const dto: CrearCxpDto = {
        proveedor_id: data.proveedorId,
        orden_id: data.ordenId,
        recepcion_id: data.recepcionId,
        numero_documento: data.numeroRecepcion,
        fecha_emision: data.fechaRecepcion,
        // No se fija fecha_vencimiento: forzarla a la fecha de recepción hacía vencer
        // la CxP el mismo día. Se deja que crearCxp la calcule desde fecha_emision +
        // dias_credito según las condiciones de pago del proveedor/orden.
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
      if (/Ya existe una cuenta por pagar/i.test(error?.message || '')) {
        this.logger.log(
          `⏭️ [CxP] Cuenta por pagar ya existente para recepción ${data.numeroRecepcion}; evento idempotente omitido`,
        );
        return;
      }
      // No bloquear el flujo de eventos; solo registrar.
      this.logger.error(
        `❌ [CxP] Error creando CxP automática para recepción ${data.numeroRecepcion}: ${error?.message}`,
      );
    }
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
