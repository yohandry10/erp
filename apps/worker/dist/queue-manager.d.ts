import { Queue, Worker } from 'bullmq';
declare class QueueManager {
    private redis;
    private queues;
    private workers;
    constructor();
    createQueue(name: string): Queue;
    createWorker(queueName: string, processor: Function): Worker;
    private isJobProcessed;
    private markJobProcessed;
    private sendToDLQ;
    addJob(queueName: string, jobType: string, data: any, options?: any): Promise<void>;
    getQueueStats(queueName: string): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    } | null>;
}
export default QueueManager;
