import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);
  private readonly serviceRoleKey: string;

  constructor(private readonly tenantContext: TenantContextService) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Usar SERVICE_ROLE_KEY para el backend (tiene permisos completos)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.serviceRoleKey = serviceRoleKey ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    this.supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        headers: {
          'X-Client-Info': 'erp-api',
        },
        fetch: async (input, init = {}) => {
          const context = this.tenantContext.getContext();
          const tenantId = context?.tenantId ?? null;
          const isSuperAdmin = context?.isSuperAdmin ?? false;
          const headers = new (globalThis as any).Headers((init as any).headers ?? {});

          headers.set('apikey', this.serviceRoleKey);

          if (!tenantId && !isSuperAdmin) {
            // HARDENING: sin tenant no permitimos consultas, evita fuga multi-tenant.
            this.logger.error('SupabaseService: intento de consulta sin tenant en contexto.');
            throw new Error('Tenant context required');
          }

          if (tenantId) {
            headers.set('X-Tenant-Id', tenantId);
          } else if (isSuperAdmin) {
            // HARDENING: superadmin puede operar sin tenant explícito.
            headers.set('X-Superadmin-Bypass', 'true');
          }

          if (context?.userId) {
            headers.set('X-User-Id', context.userId);
          }

          const supabaseAccessToken = context?.supabaseAccessToken?.trim();
          if (supabaseAccessToken) {
            headers.set('Authorization', `Bearer ${supabaseAccessToken}`);
          } else {
            // HARDENING: usamos service role cuando no hay token de usuario, nunca rol anon.
            headers.set('Authorization', `Bearer ${this.serviceRoleKey}`);
          }

          init = { ...init, headers };

          return (globalThis as any).fetch(input as any, init as any);
        },
      },
    });
    console.log('✅ Supabase client initialized successfully');
  }

  private ensureContext(): void {
    const context = this.tenantContext.getContext();
    if (!context?.tenantId && !context?.isSuperAdmin) {
      // HARDENING: prohibir acceso sin tenant salvo superadmin.
      this.logger.error('SupabaseService#getClient llamado sin tenant en contexto.');
      throw new Error('Tenant context required');
    }
  }

  getClient(): SupabaseClient {
    this.ensureContext();
    return this.supabase;
  }

  query(table: string) {
    this.ensureContext();
    return this.supabase.from(table);
  }

  async select(table: string, columns = '*') {
    this.ensureContext();
    return this.supabase.from(table).select(columns);
  }

  async insert(table: string, data: any) {
    this.ensureContext();
    return this.supabase.from(table).insert(data);
  }

  async update(table: string, data: any, filters: any) {
    this.ensureContext();
    return this.supabase.from(table).update(data).match(filters);
  }

  async delete(table: string, filters: any) {
    this.ensureContext();
    return this.supabase.from(table).delete().match(filters);
  }
}
