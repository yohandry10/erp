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
var OutboxService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
let OutboxService = OutboxService_1 = class OutboxService {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
        this.logger = new common_1.Logger(OutboxService_1.name);
    }
    async createEvent(event) {
        try {
            const { error } = await this.supabaseService.getClient()
                .from('outbox_events')
                .insert({
                event_id: event.event_id,
                correlation_id: event.correlation_id,
                aggregate_type: event.aggregate_type,
                aggregate_id: event.aggregate_id,
                event_type: event.event_type,
                event_data: event.event_data,
                event_version: event.event_version || 1,
                status: 'pending',
            });
            if (error) {
                this.logger.error('Failed to create outbox event:', error);
                throw error;
            }
            this.logger.log(`Outbox event created: ${event.event_id}`);
        }
        catch (error) {
            this.logger.error('Error creating outbox event:', error);
            throw error;
        }
    }
    async processOutboxEvents() {
        try {
            const { data: events, error } = await this.supabaseService.getClient()
                .from('outbox_events')
                .select('*')
                .eq('status', 'pending')
                .order('created_at', { ascending: true })
                .limit(100);
            if (error) {
                this.logger.error('Failed to fetch outbox events:', error);
                return;
            }
            for (const event of events || []) {
                await this.processEvent(event);
            }
        }
        catch (error) {
            this.logger.error('Error processing outbox events:', error);
        }
    }
    async processEvent(event) {
        try {
            await this.updateEventStatus(event.event_id, 'processing');
            this.logger.log(`Processing event: ${event.event_type} for ${event.aggregate_type}`);
            await this.updateEventStatus(event.event_id, 'processed');
        }
        catch (error) {
            this.logger.error(`Failed to process event ${event.event_id}:`, error);
            await this.updateEventStatus(event.event_id, 'failed', error.message);
        }
    }
    async updateEventStatus(eventId, status, errorMessage) {
        const updateData = {
            status,
            ...(status === 'processed' && { processed_at: new Date().toISOString() }),
            ...(errorMessage && { error_message: errorMessage })
        };
        const { error } = await this.supabaseService.getClient()
            .from('outbox_events')
            .update(updateData)
            .eq('event_id', eventId);
        if (error) {
            this.logger.error(`Failed to update event status for ${eventId}:`, error);
        }
    }
    async getEventsByCorrelationId(correlationId) {
        const { data, error } = await this.supabaseService.getClient()
            .from('outbox_events')
            .select('*')
            .eq('correlation_id', correlationId)
            .order('created_at', { ascending: true });
        if (error) {
            this.logger.error('Failed to fetch events by correlation ID:', error);
            throw error;
        }
        return data || [];
    }
};
exports.OutboxService = OutboxService;
exports.OutboxService = OutboxService = OutboxService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], OutboxService);
//# sourceMappingURL=outbox.service.js.map