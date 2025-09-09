import { Job } from 'bullmq';
// import { OutboxService } from '../../erp-api/src/outbox/outbox.service'; // TODO: Fix import path

export class OutboxProcessor {
  constructor(private outboxService: any) {} // TODO: Fix OutboxService type

  async processEvent(job: Job) {
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
    } catch (error) {
      console.error(`❌ Failed to process outbox event ${eventId}:`, error);
      throw error;
    }
  }
}