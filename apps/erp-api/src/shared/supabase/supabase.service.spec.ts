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

  const tenantContext = {
    getContext: jest.fn(),
    getSucursalIds: jest.fn(() => null),
  } as unknown as TenantContextService;

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

  describe('alcance por sucursal', () => {
    // El filtro vive en el cliente y no en cada servicio porque hay mas de
    // ochenta puntos de consulta sobre tablas con `sucursal_id`. Estas pruebas
    // fijan las tres reglas que lo hacen seguro: filtra lo que debe, no toca lo
    // que no lleva la columna, y nunca filtra un INSERT.
    const buildScopedService = (sucursalIds: string[] | null) => {
      const filterBuilder: any = { in: jest.fn(() => filterBuilder) };
      const queryBuilder: any = {
        select: jest.fn(() => filterBuilder),
        update: jest.fn(() => filterBuilder),
        delete: jest.fn(() => filterBuilder),
        insert: jest.fn(() => filterBuilder),
      };
      const mockClient = {
        from: jest.fn(() => queryBuilder),
        rpc: jest.fn(),
      } as unknown as SupabaseClient;

      createClientMock.mockReturnValue(mockClient);
      const context = {
        getContext: jest.fn(() => ({ tenantId: 'tenant-1', userId: 'user-1' })),
        getSucursalIds: jest.fn(() => sucursalIds),
      } as unknown as TenantContextService;

      const service = new SupabaseService(context, createConfig());
      return { service, queryBuilder, filterBuilder };
    };

    it('filtra las lecturas de una tabla que lleva sucursal_id', () => {
      const { service, filterBuilder } = buildScopedService(['suc-1']);

      service.getClient().from('ventas_pos').select('*');

      expect(filterBuilder.in).toHaveBeenCalledWith('sucursal_id', ['suc-1']);
    });

    it('filtra tambien update y delete, no solo la lectura', () => {
      const { service, filterBuilder } = buildScopedService(['suc-1']);

      service.getClient().from('sesiones_caja').update({ estado: 'CERRADA' });
      service.getClient().from('documentos').delete();

      expect(filterBuilder.in).toHaveBeenCalledTimes(2);
    });

    it('no filtra un INSERT: la sucursal de una fila nueva la deriva la base', () => {
      const { service, filterBuilder } = buildScopedService(['suc-1']);

      service.getClient().from('ventas_pos').insert({ total: 10 });

      expect(filterBuilder.in).not.toHaveBeenCalled();
    });

    it('no toca las tablas que no llevan la columna', () => {
      const { service, filterBuilder } = buildScopedService(['suc-1']);

      service.getClient().from('productos').select('*');

      expect(filterBuilder.in).not.toHaveBeenCalled();
    });

    it('un usuario sin asignaciones no paga ningun filtro', () => {
      const { service, filterBuilder } = buildScopedService(null);

      service.getClient().from('ventas_pos').select('*');

      expect(filterBuilder.in).not.toHaveBeenCalled();
    });
  });

  describe('cliente para operaciones largas', () => {
    const nativo = globalThis.fetch;
    afterEach(() => { globalThis.fetch = nativo; });

    it('usa su propio límite, no reintenta y conserva el contexto tenant', async () => {
      buildService({ SUPABASE_FETCH_TIMEOUT_MS: '40', SUPABASE_FETCH_MAX_RETRIES: '2', SUPABASE_FETCH_RETRY_BASE_MS: '1',
        SUPABASE_LONG_FETCH_TIMEOUT_MS: '250' });
      const opciones = (cliente: string) => createClientMock.mock.calls.find((c) => c[2]?.global?.headers?.['X-Client-Info'] === cliente)![2];
      (tenantContext.getContext as jest.Mock).mockReturnValue({ tenantId: 't-1', userId: 'u-1' });
      const llamadas: Array<{ headers: any }> = [];
      globalThis.fetch = jest.fn((_url: any, init: any) => new Promise((_ok, mal) => {
        llamadas.push({ headers: init.headers });
        init.signal.addEventListener('abort', () => mal(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })) as any;
      const t0 = Date.now();
      await expect(opciones('erp-api-largo').global.fetch('http://x/rpc/ensayar', {})).rejects.toThrow('aborted');
      expect(llamadas).toHaveLength(1);
      expect(Date.now() - t0).toBeGreaterThanOrEqual(200);
      expect(llamadas[0].headers.get('x-tenant-id')).toBe('t-1');
      llamadas.length = 0;
      // El cliente normal conserva su límite corto y sus reintentos.
      await expect(opciones('erp-api').global.fetch('http://x/rpc/corta', {})).rejects.toThrow('aborted');
      expect(llamadas).toHaveLength(3);
    });
  });
});
