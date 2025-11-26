import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
// import { OutboxService } from '../../erp-api/src/outbox/outbox.service'; // TODO: Fix import path

export class OutboxProcessor {
  constructor(private outboxService: any, private redis: Redis) {} // TODO: Fix OutboxService type

  async processEvent(job: Job) {
    const { eventId, correlationId } = job.data;
    
    console.log(`🔄 Processing outbox event: ${eventId} (correlation: ${correlationId})`);
    
    const lockKey = 'outbox:processing:lock';
    const lockValue = randomUUID();
    const lockTtlMs = 30_000; // 30s para evitar doble procesamiento

    try {
      const acquired = await this.redis.set(lockKey, lockValue, 'PX', lockTtlMs, 'NX');
      if (!acquired) {
        console.log('⏳ Another outbox processor is running. Skipping this job.');
        return { status: 'skipped', reason: 'lock_not_acquired' };
      }

      // El OutboxService ya maneja el procesamiento con su propia idempotencia
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
    } finally {
      // Liberar lock solo si lo adquirimos nosotros
      try {
        const current = await this.redis.get(lockKey);
        if (current === lockValue) {
          await this.redis.del(lockKey);
        }
      } catch (lockError) {
        console.warn('⚠️ Could not release outbox lock:', lockError);
      }
    }
  }
}
