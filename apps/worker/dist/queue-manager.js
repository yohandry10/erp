"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Nuevo sistema de colas con idempotencia y DLQ
const bullmq_1 = require("bullmq");
const ioredis_1 = require("ioredis");
class QueueManager {
    constructor() {
        this.queues = new Map();
        this.workers = new Map();
        this.redis = new ioredis_1.Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: 3
        });
    }
    // Crear cola con DLQ y configuración avanzada
    createQueue(name) {
        const queueOptions = {
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
        const queue = new bullmq_1.Queue(name, queueOptions);
        // DLQ - Dead Letter Queue
        const dlqName = `${name}-dlq`;
        const dlq = new bullmq_1.Queue(dlqName, queueOptions);
        this.queues.set(name, queue);
        this.queues.set(dlqName, dlq);
        return queue;
    }
    // Worker con manejo de DLQ
    createWorker(queueName, processor) {
        const worker = new bullmq_1.Worker(queueName, async (job) => {
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
            }
            catch (error) {
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
    async isJobProcessed(jobId) {
        const key = `processed:${jobId}`;
        const exists = await this.redis.exists(key);
        return exists === 1;
    }
    // Marcar job como procesado
    async markJobProcessed(jobId, result) {
        const key = `processed:${jobId}`;
        await this.redis.setex(key, 86400, JSON.stringify(result)); // 24h TTL
    }
    // Enviar a Dead Letter Queue
    async sendToDLQ(queueName, jobData, error) {
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
    async addJob(queueName, jobType, data, options = {}) {
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
    async getQueueStats(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue)
            return null;
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
exports.default = QueueManager;
