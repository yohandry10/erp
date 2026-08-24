import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { PostgrestQueryBuilder } from '@supabase/postgrest-js';
import { TenantContextService } from '../tenant/tenant-context.service';
import { alcanceRestringido, TABLAS_CON_SUCURSAL } from '../tenant/sucursal-scope';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;
  private publicSupabase: SupabaseClient;
  private adminSupabase: SupabaseClient; // Cliente admin para auth operations
  private readonly publicQueryAllowlist = new Set([
    'auth_login_attempts',
    'user_roles',
    'usuarios_sistema',
    'user_sessions',
    'empresa_config',
    'paises',
    'configuracion_fiscal',
    'tipos_documentos_fiscales',
    'tipos_impuestos',
    'tenants',
    'integration_logs',
    'audit_log',
    'demo_conversiones_pendientes',
  ]);

  private readonly publicRpcAllowlist = new Set([
    'create_demo_tenant_ready_tx',
    'acquire_job_lock',
    'release_job_lock',
    'claim_outbox_events_tx',
    'heartbeat_outbox_event_tx',
    'outbox_runtime_health_492',
  ]);
  private readonly logger = new Logger(SupabaseService.name);
  private readonly serviceRoleKey: string;
  private readonly supabaseUrl: string;
  private readonly fetchTimeoutMs: number;
  private readonly fetchMaxRetries: number;
  private readonly fetchRetryBaseMs: number;
  private readonly networkBackoffMs: number;
  private lastNetworkFailureAt: number | null = null;

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
  ) {
    const supabaseUrl =
      this.configService.get<string>('SUPABASE_URL') ??
      this.configService.get<string>('NEXT_PUBLIC_SUPABASE_URL');
    // Usar SERVICE_ROLE_KEY para el backend (tiene permisos completos)
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.serviceRoleKey = serviceRoleKey ?? '';
    this.supabaseUrl = supabaseUrl ?? '';
    this.fetchTimeoutMs = this.readIntEnv('SUPABASE_FETCH_TIMEOUT_MS', 8000);
    this.fetchMaxRetries = this.readIntEnv('SUPABASE_FETCH_MAX_RETRIES', 2);
    this.fetchRetryBaseMs = this.readIntEnv('SUPABASE_FETCH_RETRY_BASE_MS', 250);
    this.networkBackoffMs = this.readIntEnv('SUPABASE_NETWORK_BACKOFF_MS', 30000);

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    // Cliente backend sin contexto tenant para rutas allowlisted (login, catálogo y jobs).
    // Usa service_role del servidor porque RLS no puede evaluar tenant antes del login.
    const publicRawClient = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        headers: {
          'X-Client-Info': 'erp-api-public',
        },
        fetch: (input, init = {}) => this.fetchWithRetry(input, init, 'supabase-public'),
      },
    });
    this.publicSupabase = this.wrapPublicClient(publicRawClient);

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
    const raw = this.configService.get<string>(key);
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
    return this.wrapSucursalScope(this.supabase);
  }

  /**
   * Aplica el alcance por sucursal del usuario a las lecturas y a las
   * modificaciones, en un solo sitio.
   *
   * El motivo de que viva aquí y no en cada servicio: hay más de ochenta puntos
   * de consulta sobre las tablas que llevan `sucursal_id`, y un filtro repetido
   * ochenta veces es un filtro que alguien olvidará la vez ochenta y uno --y el
   * olvido no se nota, porque la consulta sigue devolviendo datos, sólo que de
   * más sucursales de las que tocan--. Aquí no se puede olvidar.
   *
   * Alcance de lo que toca y de lo que no:
   *
   *  - `select`, `update` y `delete` se filtran. `insert` no: qué sucursal le
   *    corresponde a una fila nueva lo decide la base derivándolo de su ancla
   *    (migración 504), no el cliente.
   *  - Sólo actúa sobre las tablas de `TABLAS_CON_SUCURSAL`, que el verificador
   *    504 mantiene sincronizada con las que de verdad llevan la columna.
   *  - Un usuario sin asignaciones tiene alcance total y aquí no se añade nada,
   *    así que el caso mayoritario no paga ni un filtro de más.
   *  - Los caminos de sistema --outbox, sembrados, tareas-- corren sin usuario
   *    en contexto y por tanto sin restricción, que es lo correcto: no son de
   *    nadie.
   */
  private wrapSucursalScope(client: SupabaseClient): SupabaseClient {
    const alcance = this.tenantContext.getSucursalIds();
    if (!alcanceRestringido(alcance)) {
      return client;
    }

    return new Proxy(client as any, {
      get: (target: any, prop: PropertyKey, receiver: any) => {
        if (prop !== 'from') {
          return Reflect.get(target, prop, receiver);
        }

        return (table: string) => {
          const builder = target.from(table);
          const normalizedTable = (table || '').toString().trim();
          if (!TABLAS_CON_SUCURSAL.has(normalizedTable)) {
            return builder;
          }
          return this.wrapSucursalBuilder(builder, alcance);
        };
      },
    }) as SupabaseClient;
  }

  private wrapSucursalBuilder(builder: any, sucursalIds: string[]): any {
    const filtrables = new Set(['select', 'update', 'delete']);

    return new Proxy(builder, {
      get: (target: any, prop: PropertyKey, receiver: any) => {
        const original = Reflect.get(target, prop, receiver);
        if (typeof prop !== 'string' || !filtrables.has(prop) || typeof original !== 'function') {
          return original;
        }

        return (...args: unknown[]) => {
          const result = original.apply(target, args);
          // `.in()` existe en el filter builder que devuelven las tres; si
          // alguna versión futura del cliente dejara de exponerlo, es preferible
          // fallar aquí que devolver filas de otras sucursales en silencio.
          if (!result || typeof result.in !== 'function') {
            throw new Error(
              `Alcance por sucursal: ${prop}() sobre una tabla con sucursal_id no admite filtro`,
            );
          }
          return result.in('sucursal_id', sucursalIds);
        };
      },
    });
  }

  /**
   * Obtiene un cliente público para datos de catálogo que no requieren tenant
   * USAR SOLO para tablas públicas como países, monedas, etc.
   * Este cliente NO tiene validación de tenant y usa service role key
   */
  getPublicClient(): SupabaseClient {
    return this.publicSupabase;
  }

  private wrapPublicClient(client: SupabaseClient): SupabaseClient {
    return new Proxy(client as any, {
      get: (target: any, prop: PropertyKey, receiver: any) => {
        if (prop === 'from') {
          return (table: string) => {
            const normalizedTable = (table || '').toString().trim();
            this.assertPublicTableAllowed(normalizedTable);
            return target.from(normalizedTable);
          };
        }

        if (prop === 'rpc') {
          return (fn: string, params?: Record<string, unknown>) => {
            const normalizedFn = (fn || '').toString().trim();
            this.assertPublicRpcAllowed(normalizedFn);
            return target.rpc(normalizedFn, params);
          };
        }

        return Reflect.get(target, prop, receiver);
      },
    }) as SupabaseClient;
  }

  private assertPublicTableAllowed(table: string): void {
    if (!this.publicQueryAllowlist.has(table)) {
      throw new Error(
        `Public Supabase client blocked for table "${table}". ` +
        'Use getClient() with tenant context o documente esta operación en la auditoría.',
      );
    }
  }

  private assertPublicRpcAllowed(fn: string): void {
    if (!this.publicRpcAllowlist.has(fn)) {
      throw new Error(
        `Public Supabase client blocked for RPC "${fn}". ` +
        'Use getClient() con contexto tenant o getAdminClient() para operaciones sensibles.',
      );
    }
  }

  /**
   * Obtiene el cliente admin para operaciones de autenticación
   * USAR SOLO para crear/eliminar usuarios en auth.users
   * Este cliente tiene permisos de service_role para auth admin API
   */
  getAdminClient(): SupabaseClient {
    return this.adminSupabase;
  }

  query(table: string): PostgrestQueryBuilder<any, any, any> {
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
