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
var EnhancedEventBusService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedEventBusService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const uuid_1 = require("uuid");
let EnhancedEventBusService = EnhancedEventBusService_1 = class EnhancedEventBusService {
    constructor(eventEmitter) {
        this.eventEmitter = eventEmitter;
        this.logger = new common_1.Logger(EnhancedEventBusService_1.name);
    }
    async emit(eventType, data, options) {
        const event = {
            eventId: (0, uuid_1.v4)(),
            eventType,
            aggregateId: options.aggregateId,
            aggregateType: options.aggregateType,
            data,
            metadata: options.metadata || {},
            timestamp: new Date(),
            version: 1,
            correlationId: options.correlationId,
            causationId: options.causationId,
            module: options.module,
            priority: options.priority || 'medium',
            source: 'enhanced-event-bus',
        };
        try {
            this.logger.debug(`Emitting event: ${eventType}`, {
                eventId: event.eventId,
                aggregateId: event.aggregateId,
                module: event.module,
            });
            this.eventEmitter.emit(eventType, event);
        }
        catch (error) {
            this.logger.error(`Error emitting event ${eventType}:`, error);
            throw error;
        }
    }
    on(eventType, listener) {
        this.eventEmitter.on(eventType, async (event) => {
            try {
                this.logger.debug(`Processing event: ${eventType}`, {
                    eventId: event.eventId,
                    correlationId: event.correlationId,
                    source: event.source,
                });
                await listener(event);
            }
            catch (error) {
                this.logger.error(`Error processing event ${eventType}:`, error);
            }
        });
    }
    async emitVentaProcessed(data, options) {
        await this.emit('venta.procesada', data, {
            module: 'pos',
            aggregateType: 'venta',
            aggregateId: options?.aggregateId || data.ventaId,
            priority: 'high',
            metadata: options?.metadata,
        });
    }
    async emitComprobanteCreadoEvent(data, options) {
        await this.emit('comprobante.creado', data, {
            module: 'cpe',
            aggregateType: 'comprobante',
            aggregateId: data.cpeId,
            priority: 'high',
            metadata: options?.metadata,
        });
    }
    async emitMovimientoStock(data, options) {
        await this.emit('stock.movimiento', data, {
            module: 'inventario',
            aggregateType: 'producto',
            aggregateId: data.productoId,
            priority: 'medium',
            metadata: options?.metadata,
        });
    }
    async emitPlanillaCalculada(data, options) {
        await this.emit('planilla.calculada', data, {
            module: 'rrhh',
            aggregateType: 'planilla',
            aggregateId: data.planillaId,
            priority: 'high',
            metadata: options?.metadata,
        });
    }
    onVentaProcessed(listener) {
        this.on('venta.procesada', listener);
    }
    onComprobanteCreadoEvent(listener) {
        this.on('comprobante.creado', listener);
    }
    onMovimientoStock(listener) {
        this.on('stock.movimiento', listener);
    }
    onPlanillaCalculada(listener) {
        this.on('planilla.calculada', listener);
    }
    getEventStats() {
        const eventNames = this.eventEmitter.eventNames();
        const stats = {};
        for (const eventName of eventNames) {
            stats[eventName.toString()] = this.eventEmitter.listenerCount(eventName);
        }
        return stats;
    }
};
exports.EnhancedEventBusService = EnhancedEventBusService;
exports.EnhancedEventBusService = EnhancedEventBusService = EnhancedEventBusService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [event_emitter_1.EventEmitter2])
], EnhancedEventBusService);
//# sourceMappingURL=enhanced-event-bus.service.js.map