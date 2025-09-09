"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosController = void 0;
const common_1 = require("@nestjs/common");
const tracing_service_1 = require("../shared/tracing/tracing.service");
const enhanced_event_bus_service_1 = require("../shared/events/enhanced-event-bus.service");
const tracing_interceptor_1 = require("../shared/tracing/tracing.interceptor");
let PosController = class PosController {
    constructor(tracingService, eventBus) {
        this.tracingService = tracingService;
        this.eventBus = eventBus;
    }
    async crearVenta(ventaData) {
        this.tracingService.log('info', 'Iniciando creación de venta', { ventaData });
        try {
            const venta = {
                ventaId: 'venta_123',
                numeroTicket: 'T001-00001',
                clienteId: ventaData.clienteId,
                total: ventaData.total,
            };
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
        }
        catch (error) {
            this.tracingService.log('error', 'Error creando venta', { error: error.message });
            throw error;
        }
    }
};
exports.PosController = PosController;
__decorate([
    (0, common_1.Post)('ventas'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PosController.prototype, "crearVenta", null);
exports.PosController = PosController = __decorate([
    (0, common_1.Controller)('pos'),
    (0, common_1.UseInterceptors)(tracing_interceptor_1.TracingInterceptor),
    __metadata("design:paramtypes", [tracing_service_1.TracingService,
        enhanced_event_bus_service_1.EnhancedEventBusService])
], PosController);
//# sourceMappingURL=pos.controller.js.map