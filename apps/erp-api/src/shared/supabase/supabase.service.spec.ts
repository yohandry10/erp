import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TenantContextService } from '../tenant/tenant-context.service';
import { SupabaseService } from './supabase.service';
import { ConfigService } from '@nestjs/config';

jest.mock('@supabase/supabase-js', () => {
  const actual = jest.requireActual('@supabase/supabase-js');
  return {
    ...actual,
    createClient: jest.fn(),
  };
});

describe('SupabaseService', () => {
  const createClientMock = createClient as jest.Mock;

  const createMockClient = (): SupabaseClient =>
    ({
      auth: {
        admin: {
          createUser: jest.fn(),
          deleteUser: jest.fn(),
        },
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnValue({
          single: jest.fn(),
        }),
      })),
      rpc: jest.fn(),
    }) as unknown as SupabaseClient;

  const createConfig = (overrides: Record<string, string | undefined> = {}): ConfigService =>
    ({
      get: (key: string, defaultValue?: string) => {
        const map: Record<string, string | undefined> = {
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
          SUPABASE_ANON_KEY: 'public-anon-key',
          SUPABASE_FETCH_TIMEOUT_MS: undefined,
          SUPABASE_FETCH_MAX_RETRIES: undefined,
          SUPABASE_FETCH_RETRY_BASE_MS: undefined,
          SUPABASE_NETWORK_BACKOFF_MS: undefined,
          ...overrides,
        };

        return map[key] ?? defaultValue;
      },
    }) as unknown as ConfigService;

  const tenantContext = { getContext: jest.fn() } as unknown as TenantContextService;

  const buildService = (overrides?: Record<string, string | undefined>) => {
    const mockClient = createMockClient();
    createClientMock.mockReturnValue(mockClient);
    const service = new SupabaseService(tenantContext, createConfig(overrides));
    return { service, mockClient };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('permite tablas públicas permitidas', () => {
    const { service, mockClient } = buildService();
    expect(() => service.getPublicClient().from('paises')).not.toThrow();
    expect(mockClient.from).toHaveBeenCalledWith('paises');
  });

  it('rechaza tablas no permitidas en cliente público', () => {
    const { service } = buildService();
    expect(() => service.getPublicClient().from('app.secrets')).toThrow(
      /Public Supabase client blocked for table "app.secrets"/,
    );
  });

  it('permite RPC público permitido', () => {
    const { service } = buildService();
    const publicClient = service.getPublicClient();

    expect(() => publicClient.rpc('outbox_runtime_health_492')).not.toThrow();
    expect(() => publicClient.rpc('heartbeat_outbox_event_tx')).not.toThrow();
    expect(() => publicClient.rpc('pgrst_reload_schema')).toThrow(
      /Public Supabase client blocked for RPC "pgrst_reload_schema"/,
    );
    expect(service).toBeDefined();
  });

  it('permite sólo el RPC atómico de alta demo y retira el writer parcial', () => {
    const { service } = buildService();
    const publicClient = service.getPublicClient();

    expect(() => publicClient.rpc('create_demo_tenant_ready_tx')).not.toThrow();
    expect(() => publicClient.rpc('create_demo_tenant')).toThrow(
      /Public Supabase client blocked for RPC "create_demo_tenant"/,
    );
  });

  it('rechaza RPC no permitido en cliente público', () => {
    const { service } = buildService();
    const publicClient = service.getPublicClient();

    expect(() => publicClient.rpc('drop_all_tables')).toThrow(
      /Public Supabase client blocked for RPC "drop_all_tables"/,
    );
  });
});
