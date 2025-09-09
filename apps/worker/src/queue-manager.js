"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    createQueue(name) {
        const queueOptions = {
            connection: this.redis,
            defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 50,
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            },
        };
        const queue = new bullmq_1.Queue(name, queueOptions);
        const dlqName = `${name}-dlq`;
        const dlq = new bullmq_1.Queue(dlqName, queueOptions);
        this.queues.set(name, queue);
        this.queues.set(dlqName, dlq);
        return queue;
    }
    createWorker(queueName, processor) {
        const worker = new bullmq_1.Worker(queueName, async (job) => {
            try {
                console.log(`Processing job ${job.data.id} (correlation: ${job.data.correlationId})`);
                const processed = await this.isJobProcessed(job.data.id);
                if (processed) {
                    console.log(`Job ${job.data.id} already processed (idempotent)`);
                    return { status: 'already_processed' };
                }
                const result = await processor(job.data);
                await this.markJobProcessed(job.data.id, result);
                return result;
            }
            catch (error) {
                console.error(`Job ${job.data.id} failed:`, error);
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
    async isJobProcessed(jobId) {
        const key = `processed:${jobId}`;
        const exists = await this.redis.exists(key);
        return exists === 1;
    }
    async markJobProcessed(jobId, result) {
        const key = `processed:${jobId}`;
        await this.redis.setex(key, 86400, JSON.stringify(result));
    }
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
    async addJob(queueName, jobType, data, options = {}) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Cola ${queueName} no encontrada`);
        }
        if (data.id && await this.isJobProcessed(data.id)) {
            console.log(`Job ${data.id} ya fue procesado, omitiendo...`);
            return;
        }
        await queue.add(jobType, data, {
            ...options,
            jobId: data.id,
        });
        console.log(`Job added: ${data.id} to queue ${queueName}`);
    }
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
//# sourceMappingURL=queue-manager.js.map