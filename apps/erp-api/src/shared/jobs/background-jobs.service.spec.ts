import { BackgroundJobsService } from './background-jobs.service';

const createSupabaseMock = () => {
  const rpc = jest.fn(async (_fn: string, _args?: any) => ({ data: true, error: null }));

  const integrationLogsInsert = jest.fn(async () => ({ data: null, error: null }));
  const from = jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({ data: [{ id: 'tenant-1' }, { id: 'tenant-2' }], error: null })),
    })),
    insert: integrationLogsInsert,
  }));

  const query = jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        gte: jest.fn(() => ({
          lt: jest.fn(() => ({ data: [], error: null })),
        })),
      })),
    })),
  }));

  const supabase = {
    getPublicClient: jest.fn(() => ({ rpc, from })),
    getClient: jest.fn(() => ({ rpc, from, query })),
    query,
    prepareTenantContext: jest.fn(async () => undefined),
  };

  return { supabase, rpc, from, integrationLogsInsert, query };
};

describe('BackgroundJobsService - runPerTenant', () => {
  it('adquiere lock por tenant, ejecuta handler y libera lock', async () => {
    process.env.BACKGROUND_JOBS_ENABLED = 'false'; // evita timers reales
    const { supabase, rpc, integrationLogsInsert } = createSupabaseMock();

    const tenantContext = {
      run: jest.fn((_ctx, cb) => cb()),
      getContext: jest.fn(() => null),
    };

    const eventBus: any = {};

    const service = new BackgroundJobsService(supabase as any, eventBus, tenantContext as any) as any;

    const handler = jest.fn(async () => undefined);

    await service.runPerTenant('job-test', handler);

    // Dos tenants -> dos locks acquire y dos release
    expect(rpc).toHaveBeenCalledWith('acquire_job_lock', expect.any(Object));
    expect(rpc).toHaveBeenCalledWith('release_job_lock', expect.any(Object));

    // Handler ejecutado por tenant
    expect(handler).toHaveBeenCalledTimes(2);

    // Se registran logs en integration_logs
    expect(integrationLogsInsert).toHaveBeenCalled();
  });
});
