import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized successfully');
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  query(table: string) {
    return this.supabase.from(table);
  }

  async select(table: string, columns = '*') {
    return this.supabase.from(table).select(columns);
  }

  async insert(table: string, data: any) {
    return this.supabase.from(table).insert(data);
  }

  async update(table: string, data: any, filters: any) {
    return this.supabase.from(table).update(data).match(filters);
  }

  async delete(table: string, filters: any) {
    return this.supabase.from(table).delete().match(filters);
  }
} 