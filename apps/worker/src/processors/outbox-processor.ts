import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
// import { OutboxService } from '../../erp-api/src/outbox/outbox.service'; // TODO: Fix import path

export interface OutboxProcessingService {
  processOutboxEvents(): Promise<void>;
}

export class OutboxProcessor {
  constructor(private outboxService: OutboxProcessingService, private redis: Redis) {}

  async processEvent(job: Job) {
    const { eventId, correlationId } = job.data;
    
    console.log(`🔄 Processing outbox event: ${eventId} (correlation: ${correlationId})`);
    
    const lockKey = process.env.OUTBOX_PROCESSOR_LOCK_KEY || 'outbox:processing:lock';
    const lockValue = randomUUID();
    const lockTtlMs = Number(process.env.OUTBOX_PROCESSOR_LOCK_TTL_MS || 30_000); // 30s default

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
      // Liberar lock solo si lo adquirimos nosotros (Lua CAS)
      try {
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          end
          return 0
        `;
        await this.redis.eval(script, 1, lockKey, lockValue);
      } catch (lockError) {
        console.warn('⚠️ Could not release outbox lock:', lockError);
      }
    }
  }
}
