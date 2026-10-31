import { ServiceUnavailableException } from '@nestjs/common';
import { BancosService } from '../bancos.service';

describe('BancosService catálogo completo antes de habilitar cobros', () => {
  const tenant = 'aa460000-0000-4000-8000-000000000001';
  const bank = (n: number) => ({ id: `aa460000-0000-4000-8000-${String(n + 10).padStart(12, '0')}`, tenant_id: tenant });
  const setup = (pages: any[]) => {
    const range = jest.fn().mockImplementation(async () => pages.shift());
    const q: any = { select: jest.fn(() => q), eq: jest.fn(() => q), order: jest.fn(() => q), range };
    const client = { from: jest.fn(() => q), rpc: jest.fn() };
    return { service: new BancosService({ getClient: () => client } as any), client, q, range };
  };
  it('confirma vacío real con metadata íntegra y filtro de empresa', async () => {
    const s = setup([{ data: [], error: null, count: 0 }]);
    await expect(s.service.obtenerCuentasBancarias(tenant)).resolves.toEqual({ success: true, data: [], complete: true, count: 0, total: 0 });
    expect(s.q.eq).toHaveBeenCalledWith('tenant_id', tenant);
    expect(s.client.rpc).not.toHaveBeenCalled();
  });
  it('retorna1001 bancos únicos a través de dos páginas y orden estable', async () => {
    const rows = Array.from({ length: 1001 }, (_, n) => bank(n));
    const s = setup([{ data: rows.slice(0, 1000), error: null, count: 1001 }, { data: rows.slice(1000), error: null, count: 1001 }]);
    await expect(s.service.obtenerCuentasBancarias(tenant)).resolves.toEqual({ success: true, data: rows, complete: true, count: 1001, total: 1001 });
    expect(s.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(s.q.order).toHaveBeenCalledWith('id', { ascending: false });
  });
  it.each([
    ['sin conteo', { data: [bank(0)], error: null }],
    ['fila ajena', { data: [{ ...bank(0), tenant_id: 'other' }], count: 1 }],
    ['duplicado', { data: [bank(0), bank(0)], count: 2 }],
    ['truncado', { data: [bank(0)], count: 2 }],
    ['fuente fallida', { data: null, count: null, error: { message: 'unavailable' } }],
    ['respuesta parcial', { data: null, count: 0 }],
  ])('rechaza503 sin catálogo parcial: %s', async (_name, page) => {
    const s = setup([page]);
    await expect(s.service.obtenerCuentasBancarias(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(s.client.rpc).not.toHaveBeenCalled();
  });
  it.each(['changed-count', 'page-error', 'page-duplicate'])('descarta todo ante segunda página %s', async mode => {
    const rows = Array.from({ length: 1000 }, (_, n) => bank(n));
    const second = mode === 'changed-count' ? { data: [bank(1000)], count: 1002 }
      : mode === 'page-error' ? { data: null, error: { message: 'unavailable' }, count: 1001 }
        : { data: [bank(0)], count: 1001 };
    const s = setup([{ data: rows, count: 1001 }, second]);
    await expect(s.service.obtenerCuentasBancarias(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
