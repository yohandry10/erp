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

describe('BackgroundJobsService - asistencias RRHH 475', () => {
  const tenantId = '47500000-0000-4000-8000-000000000010';
  const actorId = '47500000-0000-4000-8000-000000000001';

  afterEach(() => {
    delete process.env.BACKGROUND_JOBS_ASISTENCIAS_ENABLED;
    delete process.env.BACKGROUND_JOBS_ACTOR_ID;
    jest.restoreAllMocks();
  });

  it('falla cerrado sin actor técnico explícito y no consulta ni escribe', async () => {
    process.env.BACKGROUND_JOBS_ASISTENCIAS_ENABLED = 'true';
    delete process.env.BACKGROUND_JOBS_ACTOR_ID;
    const getClient = jest.fn();
    const service = new BackgroundJobsService(
      { getClient } as any,
      { emitEmpleadoAsistencia: jest.fn() } as any,
      { run: jest.fn() } as any,
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await service.procesarAsistenciasPendientes(tenantId);

    expect(getClient).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('BACKGROUND_JOBS_ACTOR_ID'));
  });

  it('delega en la única RPC 475 y emite evento sólo cuando creó la ausencia', async () => {
    process.env.BACKGROUND_JOBS_ASISTENCIAS_ENABLED = 'true';
    process.env.BACKGROUND_JOBS_ACTOR_ID = actorId;
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({ data: { action: 'CREATED', data: { id: 'attendance-1' } }, error: null })
      .mockResolvedValueOnce({ data: { action: 'UNCHANGED', data: { id: 'attendance-2' } }, error: null });
    const from = jest.fn((table: string) => {
      if (table === 'feriados') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(async () => ({ data: [], error: null })),
            })),
          })),
        };
      }
      if (table === 'empleados') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  data: [{ id: 'employee-1' }, { id: 'employee-2' }],
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      throw new Error(`Tabla inesperada en prueba: ${table}`);
    });
    const eventBus = { emitEmpleadoAsistencia: jest.fn() };
    const service = new BackgroundJobsService(
      { getClient: jest.fn(() => ({ from, rpc })) } as any,
      eventBus as any,
      { run: jest.fn() } as any,
    ) as any;
    // 23:00 UTC es 18:00 en Lima y conserva la misma fecha en ambos husos.
    // Así la prueba no depende del TZ del runner (GitHub usa UTC).
    service.nowInLima = jest.fn(() => new Date('2026-08-11T23:00:00.000Z'));

    await service.procesarAsistenciasPendientes(tenantId);

    expect(from).not.toHaveBeenCalledWith('asistencias');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, 'ejecutar_operacion_rrhh_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_operacion: 'ATTENDANCE_ABSENCE_MARK',
      p_payload: { empleado_id: 'employee-1', fecha: '2026-08-11' },
      p_idempotency_key: 'rrhh-absence:2026-08-11:employee-1',
    });
    expect(eventBus.emitEmpleadoAsistencia).toHaveBeenCalledTimes(1);
    expect(eventBus.emitEmpleadoAsistencia).toHaveBeenCalledWith(expect.objectContaining({
      empleadoId: 'employee-1',
      estado: 'AUSENTE',
    }));
  });
});
