import { SupabaseClient } from '@supabase/supabase-js';
export declare class SupabaseService {
    private supabase;
    private mockDatabase;
    private useMock;
    constructor();
    private initMockDatabase;
    getClient(): SupabaseClient;
    mockSelect(table: string, options?: any): Promise<{
        data: any[];
        error: any;
        status: number;
        statusText: string;
        count: number;
    }>;
    mockInsert(table: string, insertData: any): Promise<{
        data: any;
        error: any;
        status: number;
        statusText: string;
    }>;
    query(table: string): any;
    private mockQueryBuilder;
    private mockExecuteQuery;
    select(table: string, columns?: string): Promise<{
        data: any[];
        error: any;
        status: number;
        statusText: string;
        count: number;
    }>;
    insert(table: string, data: any): Promise<{
        data: any;
        error: any;
        status: number;
        statusText: string;
    }>;
    update(table: string, data: any, filters: any): Promise<import("@supabase/postgrest-js").PostgrestResponseFailure | import("@supabase/postgrest-js").PostgrestResponseSuccess<null> | {
        data: any;
        error: any;
    }>;
    delete(table: string, filters: any): Promise<import("@supabase/postgrest-js").PostgrestResponseFailure | import("@supabase/postgrest-js").PostgrestResponseSuccess<null> | {
        data: any;
        error: any;
    }>;
    isMockMode(): boolean;
}
