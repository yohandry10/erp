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
export declare class OutboxService {
    private readonly supabaseService;
    private readonly logger;
    constructor(supabaseService: SupabaseService);
    createEvent(event: OutboxEvent): Promise<void>;
    processOutboxEvents(): Promise<void>;
    private processEvent;
    private updateEventStatus;
    getEventsByCorrelationId(correlationId: string): Promise<OutboxEvent[]>;
}
