import { Job } from 'bullmq';
export declare class OutboxProcessor {
    private outboxService;
    constructor(outboxService: any);
    processEvent(job: Job): Promise<{
        status: string;
        eventId: any;
        correlationId: any;
        processedAt: Date;
    }>;
}
