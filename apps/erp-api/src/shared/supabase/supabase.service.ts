import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;
  private publicSupabase: SupabaseClient;
  private adminSupabase: SupabaseClient; // Cliente admin para auth operations
  private readonly logger = new Logger(SupabaseService.name);
  private readonly serviceRoleKey: string;
  private readonly supabaseUrl: string;
  private readonly fetchTimeoutMs: number;
  private readonly fetchMaxRetries: number;
  private readonly fetchRetryBaseMs: number;
  private readonly networkBackoffMs: number;
  private lastNetworkFailureAt: number | null = null;

  constructor(private readonly tenantContext: TenantContextService) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Usar SERVICE_ROLE_KEY para el backend (tiene permisos completos)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const publicSupabaseKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    this.serviceRoleKey = serviceRoleKey ?? '';
    this.supabaseUrl = supabaseUrl ?? '';
    this.fetchTimeoutMs = this.readIntEnv('SUPABASE_FETCH_TIMEOUT_MS', 8000);
    this.fetchMaxRetries = this.readIntEnv('SUPABASE_FETCH_MAX_RETRIES', 2);
    this.fetchRetryBaseMs = this.readIntEnv('SUPABASE_FETCH_RETRY_BASE_MS', 250);
    this.networkBackoffMs = this.readIntEnv('SUPABASE_NETWORK_BACKOFF_MS', 30000);

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    // Cliente público para datos de catálogo (sin tenant)
    this.publicSupabase = createClient(supabaseUrl, publicSupabaseKey || serviceRoleKey, {
      global: {
        headers: {
          'X-Client-Info': 'erp-api-public',
        },
        fetch: (input, init = {}) => this.fetchWithRetry(input, init, 'supabase-public'),
      },
    });

    // Cliente admin para operaciones de auth (crear/eliminar usuarios)
    this.adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        fetch: (input, init = {}) => this.fetchWithRetry(input, init, 'supabase-admin'),
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

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
            headers.set('x-tenant-id', tenantId);
          } else if (isSuperAdmin) {
            // HARDENING: superadmin puede operar sin tenant explícito.
            headers.set('X-Superadmin-Bypass', 'true');
          }

          if (context?.userId) {
            headers.set('X-User-Id', context.userId);
            headers.set('x-user-id', context.userId);
          }

          // Siempre utilizar la service role key para operar desde el backend.
          headers.set('Authorization', `Bearer ${this.serviceRoleKey}`);

          // NOTA: El contexto se establece via headers HTTP (X-Tenant-Id, X-User-Id)
          // Las funciones app.current_tenant_id() y app.current_user_id() intentan leer
          // estos headers desde request.headers. Si Supabase PostgREST no expone
          // request.headers, las políticas allow_login_select permiten SELECT sin contexto.

          init = { ...init, headers };

          return this.fetchWithRetry(input, init, 'supabase');
        },
      },
    });
    console.log('✅ Supabase client initialized successfully');
  }

  private readIntEnv(key: string, fallback: number): number {
    const raw = process.env[key];
    if (!raw) {
      return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private mergeAbortSignals(primary: AbortSignal, secondary: AbortSignal): AbortSignal {
    const anySignal = (AbortSignal as any)?.any;
    if (typeof anySignal === 'function') {
      return anySignal([primary, secondary]);
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (!primary.aborted) {
      primary.addEventListener('abort', onAbort);
    }
    if (!secondary.aborted) {
      secondary.addEventListener('abort', onAbort);
    }
    return controller.signal;
  }

  private isRetryableFetchError(error: any): boolean {
    const code = error?.cause?.code;
    if (code && ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(code)) {
      return true;
    }
    return error?.name === 'AbortError' || error instanceof TypeError;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchWithRetry(input: any, init: any, context: string): Promise<Response> {
    const maxRetries = Math.max(0, this.fetchMaxRetries);
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
      const signal = init?.signal
        ? this.mergeAbortSignals(init.signal, controller.signal)
        : controller.signal;

      try {
        const response = await (globalThis as any).fetch(input as any, { ...init, signal } as any);
        this.clearNetworkFailure();
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && this.isRetryableFetchError(error)) {
          const delay = this.fetchRetryBaseMs * Math.pow(2, attempt);
          this.logger.warn(
            `Supabase fetch fallo (${context}) intento ${attempt + 1}/${maxRetries + 1}: ${error?.message || error}`,
          );
          await this.sleep(delay);
          continue;
        }
        this.recordNetworkFailure(error);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  }

  isInNetworkBackoff(): boolean {
    return this.getNetworkBackoffRemainingMs() > 0;
  }

  getNetworkBackoffRemainingMs(): number {
    if (!this.lastNetworkFailureAt) {
      return 0;
    }
    const elapsed = Date.now() - this.lastNetworkFailureAt;
    return Math.max(0, this.networkBackoffMs - elapsed);
  }

  private recordNetworkFailure(error: any): void {
    if (!this.lastNetworkFailureAt) {
      this.logger.warn(
        `Supabase no disponible. Activando backoff de ${Math.ceil(this.networkBackoffMs / 1000)}s. ` +
        `Error: ${error?.message || error}`,
      );
    }
    this.lastNetworkFailureAt = Date.now();
  }

  private clearNetworkFailure(): void {
    this.lastNetworkFailureAt = null;
  }

  private ensureContext(silent: boolean = false): void {
    const context = this.tenantContext.getContext();
    if (!context?.tenantId && !context?.isSuperAdmin) {
      // HARDENING: prohibir acceso sin tenant salvo superadmin.
      if (!silent) {
        this.logger.error('SupabaseService#getClient llamado sin tenant en contexto.');
      }
      throw new Error('Tenant context required');
    }
  }

  /**
   * Obtiene el cliente de Supabase
   * NOTA: El contexto se establece automáticamente via headers HTTP (X-Tenant-Id, X-User-Id)
   * que son leídos por app.current_tenant_id() y app.current_user_id()
   */
  getClient(options?: { silent?: boolean }): SupabaseClient {
    this.ensureContext(options?.silent);
    return this.supabase;
  }

  /**
   * Obtiene un cliente público para datos de catálogo que no requieren tenant
   * USAR SOLO para tablas públicas como países, monedas, etc.
   * Este cliente NO tiene validación de tenant y usa service role key
   */
  getPublicClient(): SupabaseClient {
    return this.publicSupabase;
  }

  /**
   * Obtiene el cliente admin para operaciones de autenticación
   * USAR SOLO para crear/eliminar usuarios en auth.users
   * Este cliente tiene permisos de service_role para auth admin API
   */
  getAdminClient(): SupabaseClient {
    return this.adminSupabase;
  }

  query(table: string) {
    this.ensureContext();
    return this.supabase.from(table);
  }

  async prepareTenantContext(): Promise<void> {
    const context = this.tenantContext.getContext();
    if (!context?.tenantId) {
      return;
    }

    try {
      await this.supabase.rpc('app.set_tenant_context', {
        p_tenant_id: context.tenantId,
        p_user_id: context.userId ?? null,
      });
    } catch (error) {
      this.logger.warn(
        `SupabaseService: no se pudo establecer contexto de tenant (${context.tenantId}): ${error?.message ?? error}`,
      );
    }
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
