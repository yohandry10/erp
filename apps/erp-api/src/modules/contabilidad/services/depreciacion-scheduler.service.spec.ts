import { DepreciacionSchedulerService } from './depreciacion-scheduler.service';

describe('DepreciacionSchedulerService', () => {
  function crearHarness(filas: any[] = []) {
    const query: any = {
      select: jest.fn(() => query),
      or: jest.fn(() => query),
      neq: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn().mockResolvedValue({ data: filas, error: null })
    };
    const rpc = jest.fn().mockResolvedValue({
      data: { eventId: '10000000-0000-4000-8000-000000000001' },
      error: null
    });
    const client = {
      from: jest.fn((tabla: string) => {
        expect(tabla).toBe('depreciaciones');
        return query;
      }),
      rpc
    };
    const service = new DepreciacionSchedulerService({
      getClient: () => client
    } as any);
    return { service, client, query, rpc };
  }

  it('reconcilia todo pendiente sin limitarlo a las últimas 24 horas', async () => {
    const fila = {
      id: '20000000-0000-4000-8000-000000000001',
      tenant_id: '30000000-0000-4000-8000-000000000001'
    };
    const { service, client, query, rpc } = crearHarness([fila]);

    await service.emitirDepreciacionesProgramadas();

    expect(client.from).toHaveBeenCalledWith('depreciaciones');
    expect(query.or).toHaveBeenCalledWith(
      'procesado_outbox.eq.false,evento_id.is.null'
    );
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect((query as any).gte).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('asegurar_depreciacion_outbox_tx', {
      p_tenant_id: fila.tenant_id,
      p_depreciacion_id: fila.id
    });
  });

  it('no marca la fila en JavaScript si la reconciliación SQL falla', async () => {
    const fila = {
      id: '20000000-0000-4000-8000-000000000002',
      tenant_id: '30000000-0000-4000-8000-000000000002'
    };
    const { service, client, rpc } = crearHarness([fila]);
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'outbox unavailable' }
    });

    await expect(service.emitirDepreciacionesProgramadas()).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledTimes(1);
  });
});
