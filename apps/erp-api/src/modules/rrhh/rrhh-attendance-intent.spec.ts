import { RrhhService } from './rrhh.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';

describe('asistencia automática: intención confirmada por DB', () => {
  const row = {
    id: 'attendance-1', tenant_id: 'tenant-1', id_empleado: 'employee-1', empleado_id: 'employee-1',
    marcado_por: 'actor-1', fecha: '2026-11-06', hora_entrada: '23:59:58', hora_salida: null,
  };
  let rpc: jest.Mock;
  let emit: jest.Mock;
  let service: RrhhService;
  const mark = (type: 'entrada' | 'salida' = 'entrada', key = 'attendance-intent-1') =>
    service.registrarAsistencia('employee-1', type, 'tenant-1', 'actor-1', key);
  beforeEach(() => {
    rpc = jest.fn(); emit = jest.fn();
    service = new RrhhService({ getClient: () => ({ rpc }) } as unknown as SupabaseService,
      { emitEmpleadoAsistencia: emit } as unknown as EventBusService);
  });

  it('envía una intención estable sin reloj de Node y conserva la hora del recibo al reintentar', async () => {
    rpc.mockResolvedValueOnce({ data: { data: row, replayed: false }, error: null })
      .mockResolvedValueOnce({ data: { data: row, replayed: true }, error: null });
    const first = await mark();
    expect(await mark()).toEqual(first);
    expect(rpc).toHaveBeenNthCalledWith(1, 'registrar_asistencia_actual_tx', {
      p_tenant_id: 'tenant-1', p_actor_id: 'actor-1', p_empleado_id: 'employee-1',
      p_tipo: 'entrada', p_idempotency_key: 'attendance-intent-1',
    });
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ fecha: row.fecha, horaEntrada: row.hora_entrada }));
  });

  it('emite la salida confirmada una vez, incluso si la fecha del servidor es distinta', async () => {
    const exit = { ...row, fecha: '2026-11-05', hora_entrada: '08:00:00', hora_salida: '18:00:00', horas_trabajadas: 10 };
    rpc.mockResolvedValueOnce({ data: { data: exit, replayed: false }, error: null })
      .mockResolvedValueOnce({ data: { data: exit, replayed: true }, error: null });
    expect((await mark('salida')).data).toEqual(exit);
    await mark('salida');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ fecha: exit.fecha, horaEntrada: '08:00:00', horaSalida: '18:00:00', horasExtras: 2 }));
  });

  it.each([
    null, { data: row }, { data: row, replayed: 'true' },
    ...['id', 'fecha', 'hora_entrada'].map(field => ({ data: { ...row, [field]: null }, replayed: false })),
    ...['tenant_id', 'id_empleado', 'empleado_id', 'marcado_por'].map(field => ({ data: { ...row, [field]: 'foreign' }, replayed: false })),
    { data: { ...row, hora_entrada: '25:00:00' }, replayed: false },
  ])('no publica éxito ni evento ante un recibo incompleto o ajeno: %j', async result => {
    rpc.mockResolvedValue({ data: result, error: null });
    await expect(mark()).rejects.toMatchObject({ status: 503 });
    expect(emit).not.toHaveBeenCalled();
  });

  it('rechaza una salida sin hora confirmada', async () => {
    rpc.mockResolvedValue({ data: { data: row, replayed: false }, error: null });
    await expect(mark('salida')).rejects.toMatchObject({ status: 503 });
    expect(emit).not.toHaveBeenCalled();
  });

  it.each([['42501', 403], ['P0002', 404], ['23505', 409], ['23514', 400]])(
    'conserva el rechazo de negocio %s como HTTP %s', async (code, status) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: 'rechazo' } });
      await expect(mark()).rejects.toMatchObject({ status });
      expect(emit).not.toHaveBeenCalled();
    },
  );
  it('valida actor, tenant, tipo y llave antes del RPC', async () => {
    await expect(service.registrarAsistencia('employee-1', 'entrada', undefined, 'actor-1')).rejects.toMatchObject({ status: 400 });
    await expect(service.registrarAsistencia('employee-1', 'entrada', 'tenant-1')).rejects.toMatchObject({ status: 403 });
    await expect(service.registrarAsistencia('employee-1', 'invalid' as 'entrada', 'tenant-1', 'actor-1')).rejects.toMatchObject({ status: 400 });
    await expect(mark('entrada', 'short')).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
