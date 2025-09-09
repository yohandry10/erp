"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxProcessor = void 0;
// import { OutboxService } from '../../erp-api/src/outbox/outbox.service'; // TODO: Fix import path
class OutboxProcessor {
    constructor(outboxService) {
        this.outboxService = outboxService;
    } // TODO: Fix OutboxService type
    async processEvent(job) {
        const { eventId, correlationId } = job.data;
        console.log(`🔄 Processing outbox event: ${eventId} (correlation: ${correlationId})`);
        try {
            // El OutboxService ya maneja el procesamiento
            await this.outboxService.processOutboxEvents();
            return {
                status: 'processed',
                eventId,
                correlationId,
                processedAt: new Date()
            };
        }
        catch (error) {
            console.error(`❌ Failed to process outbox event ${eventId}:`, error);
            throw error;
        }
    }
}
exports.OutboxProcessor = OutboxProcessor;
