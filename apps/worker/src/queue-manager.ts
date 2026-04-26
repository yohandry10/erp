// Nuevo sistema de colas con idempotencia y DLQ
import { Queue, Worker, QueueOptions } from 'bullmq';
import { Redis } from 'ioredis';

interface JobData {
  id: string; // Para idempotencia
  correlationId: string; // Para trazabilidad
  eventId: string;
  payload: any;
  retryCount?: number;
}

class QueueManager {
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3
    });
  }

  // Crear cola con DLQ y configuración avanzada
  createQueue(name: string): Queue {
    const queueOptions: QueueOptions = {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s, 16s, 32s
        },
      },
    };

    const queue = new Queue(name, queueOptions);
    
    // DLQ - Dead Letter Queue
    const dlqName = `${name}-dlq`;
    const dlq = new Queue(dlqName, queueOptions);
    
    this.queues.set(name, queue);
    this.queues.set(dlqName, dlq);
    
    return queue;
  }

  // Worker con manejo de DLQ
  createWorker(queueName: string, processor: Function): Worker {
    const worker = new Worker(queueName, async (job) => {
      try {
        console.log(`Processing job ${job.data.id} (correlation: ${job.data.correlationId})`);
        
        // Verificar idempotencia
        const processed = await this.isJobProcessed(job.data.id);
        if (processed) {
          console.log(`Job ${job.data.id} already processed (idempotent)`);
          return { status: 'already_processed' };
        }

        const result = await processor(job.data);
        
        // Marcar como procesado
        await this.markJobProcessed(job.data.id, result);
        
        return result;
      } catch (error) {
        console.error(`Job ${job.data.id} failed:`, error);
        
        // Si agotó reintentos, enviar a DLQ
        if (job.attemptsMade >= (job.opts.attempts || 5)) {
          await this.sendToDLQ(queueName, job.data, error);
        }
        
        throw error;
      }
    }, {
      connection: this.redis,
      concurrency: 5
    });

    this.workers.set(queueName, worker);
    return worker;
  }

  // Verificar si job ya fue procesado (idempotencia)
  private async isJobProcessed(jobId: string): Promise<boolean> {
    const key = `processed:${jobId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  // Marcar job como procesado
  private async markJobProcessed(jobId: string, result: any): Promise<void> {
    const key = `processed:${jobId}`;
    await this.redis.setex(key, 86400, JSON.stringify(result)); // 24h TTL
  }

  // Enviar a Dead Letter Queue
  private async sendToDLQ(queueName: string, jobData: JobData, error: any): Promise<void> {
    const dlqName = `${queueName}-dlq`;
    const dlq = this.queues.get(dlqName);
    
    if (dlq) {
      await dlq.add('failed-job', {
        ...jobData,
        originalQueue: queueName,
        failedAt: new Date().toISOString(),
        error: error.message,
        retryCount: jobData.retryCount || 0
      });
      
      console.log(`Job ${jobData.id} sent to DLQ: ${dlqName}`);
    }
  }

  // Agregar job con trazabilidad
  async addJob(queueName: string, jobType: string, data: any, options: any = {}): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Cola ${queueName} no encontrada`);
    }
  
    // Verificar idempotencia
    if (data.id && await this.isJobProcessed(data.id)) {
      console.log(`Job ${data.id} ya fue procesado, omitiendo...`);
      return;
    }
  
    await queue.add(jobType, data, {
      ...options,
      jobId: data.id, // Idempotencia a nivel de job individual
    });
  
    console.log(`Job added: ${data.id} to queue ${queueName}`);
  }

  // Métricas y monitoreo
  async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  }
}

export default QueueManager;