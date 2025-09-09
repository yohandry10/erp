import { Controller, Post, Body, UseInterceptors } from '@nestjs/common';
import { TracingService } from '../shared/tracing/tracing.service';
import { EnhancedEventBusService } from '../shared/events/enhanced-event-bus.service';
import { TracingInterceptor } from '../shared/tracing/tracing.interceptor';

@Controller('pos')
@UseInterceptors(TracingInterceptor)
export class PosController {
  constructor(
    private readonly tracingService: TracingService,
    private readonly eventBus: EnhancedEventBusService
  ) {}

  @Post('ventas')
  async crearVenta(@Body() ventaData: any) {
    // El contexto de trazabilidad ya está disponible gracias al interceptor
    this.tracingService.log('info', 'Iniciando creación de venta', { ventaData });

    try {
      // Simular procesamiento de venta
      const venta = {
        ventaId: 'venta_123',
        numeroTicket: 'T001-00001',
        clienteId: ventaData.clienteId,
        total: ventaData.total,
        // ... otros datos
      };

      // Emitir evento con trazabilidad automática
      await this.eventBus.emitVentaProcessed(venta, {
        aggregateId: venta.ventaId,
        metadata: {
          origen: 'pos-web',
          vendedor: ventaData.vendedorId,
        },
      });

      this.tracingService.log('info', 'Venta creada exitosamente', { ventaId: venta.ventaId });

      return {
        success: true,
        data: venta,
        traceInfo: {
          correlationId: this.tracingService.getCurrentContext()?.correlationId,
          eventId: this.tracingService.getCurrentContext()?.eventId,
        },
      };
    } catch (error) {
      this.tracingService.log('error', 'Error creando venta', { error: error.message });
      throw error;
    }
  }
}