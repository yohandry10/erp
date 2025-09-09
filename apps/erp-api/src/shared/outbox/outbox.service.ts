import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface OutboxEvent {
  id?: string;
  event_id: string;
  correlation_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_data: any;
  event_version?: number;
  status?: 'pending' | 'processing' | 'processed' | 'failed';
  retry_count?: number;
  error_message?: string;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async createEvent(event: OutboxEvent): Promise<void> {
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
    } catch (error) {
      this.logger.error('Error creating outbox event:', error);
      throw error;
    }
  }

  async processOutboxEvents(): Promise<void> {
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
    } catch (error) {
      this.logger.error('Error processing outbox events:', error);
    }
  }

  private async processEvent(event: any): Promise<void> {
    try {
      // Mark as processing
      await this.updateEventStatus(event.event_id, 'processing');

      // Process the event (implement your business logic here)
      this.logger.log(`Processing event: ${event.event_type} for ${event.aggregate_type}`);
      
      // For now, just mark as processed
      // In a real implementation, you would emit the event to external systems
      
      // Mark as processed
      await this.updateEventStatus(event.event_id, 'processed');
      
    } catch (error) {
      this.logger.error(`Failed to process event ${event.event_id}:`, error);
      await this.updateEventStatus(event.event_id, 'failed', error.message);
    }
  }

  private async updateEventStatus(
    eventId: string, 
    status: 'pending' | 'processing' | 'processed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    const updateData: any = { 
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

  async getEventsByCorrelationId(correlationId: string): Promise<OutboxEvent[]> {
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
}
