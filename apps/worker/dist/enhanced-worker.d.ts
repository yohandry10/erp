declare class EnhancedWorker {
    private queueManager;
    constructor();
    private setupQueues;
    private processCPE;
    private processGRE;
    private processSIRE;
    private processAccountingEvent;
    addCPEJob(cpeData: any, correlationId?: string): Promise<void>;
    getStats(): Promise<Record<string, any>>;
}
export default EnhancedWorker;
