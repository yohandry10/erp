import { AuditService } from './audit.service';

describe('auditoría complementaria durable', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const actor = '22222222-2222-4222-8222-222222222222';
  const rpc = jest.fn();
  const insert = jest.fn().mockResolvedValue({ error: null });
  const service = new AuditService({ getClient: () => ({ rpc, from: () => ({ insert }) }) } as any);
  beforeEach(() => { jest.clearAllMocks(); rpc.mockReset().mockResolvedValue({ error: null }); });

  it('persiste por RPC, conserva el actor y oculta secretos anidados sin mutar la entrada', async () => {
    const input = { tenant_id: tenant, user_id: actor, table_name: 'recepciones', operation: 'UPDATE' as const,
      record_id: 'receipt-1', new_values: { estado: 'CERRADA', nested: [{ solPassword: 'clave-sol', authorization: 'Bearer secreto' }] },
      metadata: { certificadoPfx: 'material-privado' } };
    await service.logAction(input);
    expect(insert).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('registrar_auditoria_backend_tx', expect.objectContaining({
      p_tenant_id: tenant, p_kind: 'audit', p_event: expect.objectContaining({ user_id: actor, record_id: 'receipt-1' }),
    }));
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/clave-sol|Bearer secreto|material-privado/);
    expect(input.metadata.certificadoPfx).toBe('material-privado');
  });

  it('reintenta una respuesta incierta con el mismo identificador y contenido', async () => {
    rpc.mockRejectedValueOnce(new Error('connection lost after commit'));
    await service.logAction({ tenant_id: tenant, user_id: actor, table_name: 'recepciones', operation: 'UPDATE' });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });

  it('registra campos eliminados en una modificación', async () => {
    await service.registrarCambio('recepciones', 'UPDATE', actor, { old: { nota: 'anterior' }, new: {} }, tenant);
    expect(rpc.mock.calls[0][1].p_event.changed_fields).toEqual(['nota']);
  });

  it('resúmenes extensos siguen siendo JSON válido y metadatos y errores se depuran', async () => {
    await service.logIntegracion('SUNAT', 'send', { items: Array.from({ length: 500 }, () => ({ text: 'x'.repeat(100) })) },
      { status: 'ERROR', message: 'Authorization: Bearer private-value' }, {}, tenant, 'ERROR', 100,
      { clientSecret: 'private-meta' });
    const payload = rpc.mock.calls[0][1].p_event;
    expect(JSON.stringify(payload)).not.toMatch(/private-value|private-meta/);
    expect(payload.request_summary._truncated).toBe(true);
    expect(payload.status_code).toBeNull();
  });

  it('no transforma un actor desconocido en una acción de sistema', async () => {
    await service.logAction({ tenant_id: tenant, user_id: 'usuario-inexistente', table_name: 'recepciones', operation: 'UPDATE' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lee todos los bloques antes de construir una página posterior al límite de PostgREST', async () => {
    const records = Array.from({ length: 12 }, (_, index) => ({ id: String(12 - index).padStart(2, '0'), table_name: 'recepciones',
      timestamp: '2026-09-06T12:00:00Z', new_values: { solPassword: 'historical-secret' } }));
    const query: any = { select: () => query, eq: () => query, order: () => query,
      range: jest.fn(async (from: number, to: number) => ({ data: records.slice(from, Math.min(to + 1, from + 3)), count: records.length, error: null })) };
    const reader = new AuditService({ getClient: () => ({ from: () => query }) } as any);
    const page = await reader.getAuditLogs(tenant, { table_name: 'recepciones', page: 3, limit: 3 });
    expect(page.data.map(row => row.id)).toEqual(['06', '05', '04']);
    expect(page.pagination.total).toBe(12);
    expect(query.range).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(page.data)).not.toContain('historical-secret');
  });

  it('consulta actores por empresa y continúa después del límite efectivo del proveedor', async () => {
    const pages = [[{ id: 'a', nombre: 'Ana', email: 'a@example.test', password: 'never-return' }],
      [{ id: 'b', nombre: 'Luis', email: 'b@example.test' }], []];
    const query: any = { select: jest.fn(() => query), eq: jest.fn(() => query), order: () => query,
      gt: jest.fn(() => query), limit: () => query,
      then: (resolve: any) => Promise.resolve({ data: pages.shift(), error: null }).then(resolve) };
    const reader = new AuditService({ getClient: () => ({ from: () => query }) } as any);
    const actors = await reader.getActors(tenant);
    expect(actors.map(row => row.id)).toEqual(['a', 'b']);
    expect(query.eq).toHaveBeenCalledWith('tenant_id', tenant);
    expect(query.select).toHaveBeenCalledWith('id,nombre,email');
    expect(query.gt.mock.calls).toEqual([['id', 'a'], ['id', 'b']]);
    expect(JSON.stringify(actors)).not.toContain('never-return');
  });

  it('un fallo al consultar actores no se presenta como listado vacío', async () => {
    const query: any = { select: () => query, eq: () => query, order: () => query,
      limit: async () => ({ error: { code: '42501' } }) };
    const reader = new AuditService({ getClient: () => ({ from: () => query }) } as any);
    await expect(reader.getActors(tenant)).rejects.toThrow('No se pudieron cargar los actores');
  });
});
