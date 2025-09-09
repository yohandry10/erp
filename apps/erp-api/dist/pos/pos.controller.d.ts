import { TracingService } from '../shared/tracing/tracing.service';
import { EnhancedEventBusService } from '../shared/events/enhanced-event-bus.service';
export declare class PosController {
    private readonly tracingService;
    private readonly eventBus;
    constructor(tracingService: TracingService, eventBus: EnhancedEventBusService);
    crearVenta(ventaData: any): Promise<{
        success: boolean;
        data: {
            ventaId: string;
            numeroTicket: string;
            clienteId: any;
            total: any;
        };
        traceInfo: {
            correlationId: string;
            eventId: string;
        };
    }>;
}
