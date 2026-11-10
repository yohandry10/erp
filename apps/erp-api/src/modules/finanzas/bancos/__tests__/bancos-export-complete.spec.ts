import { ServiceUnavailableException } from '@nestjs/common';
import { BancosService } from '../bancos.service';

jest.mock('../../../../shared/utils/fecha-tenant.util', () => ({
  paisDelTenant: jest.fn().mockResolvedValue('PE'),
}));

describe('D41 exportación bancaria completa y con moneda explícita', () => {
  const tenant = 'b4100000-0000-4000-8000-000000000001';
  const bankId = 'b4100000-0000-4000-8000-000000000002';
  const account = { id: bankId, tenant_id: tenant, banco: 'Banco local', numero_cuenta: '001', moneda: 'USD' };
  const movement = (n = 0) => ({
    id: `b4100000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`,
    tenant_id: tenant, cuenta_bancaria_id: bankId, moneda: 'USD', monto: '0.07',
    fecha: '2026-11-06', created_at: '2026-11-06T21:00:00Z', tipo: 'CARGO',
    descripcion: `Movimiento ${n}`, referencia: `REF-${n}`, conciliado: false,
  });
  function setup(pages: any[], bank: any = account) {
    const take = jest.fn(async () => pages.shift());
    const q: any = {};
    for (const method of ['select', 'eq', 'gte', 'lte', 'or', 'order']) q[method] = jest.fn(() => q);
    q.range = jest.fn(take);
    // Emula también el límite del servidor cuando el lector omite paginación.
    q.then = (resolve: any, reject: any) => take().then(resolve, reject);
    const bankQuery: any = { select: jest.fn(() => bankQuery), eq: jest.fn(() => bankQuery), maybeSingle: jest.fn(async () => ({ data: bank, error: null })) };
    const client = { from: jest.fn((table: string) => table === 'cuentas_bancarias' ? bankQuery : q), rpc: jest.fn() };
    return { service: new BancosService({ getClient: () => client } as any), q, bankQuery, client };
  }
  it('conserva los 1001 movimientos, la moneda y las dos páginas', async () => {
    const rows = Array.from({ length: 1001 }, (_, n) => movement(n));
    const s = setup([{ data: rows.slice(0, 1000), count: 1001 }, { data: rows.slice(1000), count: 1001 }]);
    const result = await s.service.exportarMovimientosBancarios(tenant, bankId, {});
    const lines = result.data.split('\r\n');
    expect(lines).toHaveLength(1002);
    expect(lines[0]).toContain('"Moneda","Monto"');
    expect(lines[1001]).toContain('"REF-1000","USD","0.07"');
    expect(s.q.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(s.q.order).toHaveBeenCalledWith('id', { ascending: false });
    expect(s.client.rpc).not.toHaveBeenCalled();
  });
  it('confirma un vacío real y conserva encabezados con moneda', async () => {
    const s = setup([{ data: [], count: 0 }]);
    const result = await s.service.exportarMovimientosBancarios(tenant, bankId, {});
    expect(result.data.split('\r\n')).toHaveLength(1);
    expect(result.data).toContain('"Moneda","Monto"');
  });
  it('usa la moneda inmutable de la cuenta en cobros/pagos sin copia de moneda', async () => {
    const s = setup([{ data: [{ ...movement(), moneda: null }, { ...movement(1), moneda: undefined }], count: 2 }]);
    const result = await s.service.exportarMovimientosBancarios(tenant, bankId, {});
    expect(result.data.split('\r\n').slice(1).every(line => line.includes('"USD","0.07"'))).toBe(true);
  });
  it('conserva filtros, fecha fiscal y protección de fórmulas CSV', async () => {
    const s = setup([{ data: [{ ...movement(), descripcion: '=1+1', referencia: 'Texto, "citado"' }], count: 1 }]);
    const result = await s.service.exportarMovimientosBancarios(tenant, bankId, {
      fecha_desde: '2026-11-06', fecha_hasta: '2026-11-06', tipo: 'CARGO', conciliado: false,
    } as any);
    expect(s.q.gte).toHaveBeenCalledWith('fecha', '2026-11-06');
    expect(s.q.lte).toHaveBeenCalledWith('fecha', '2026-11-06');
    expect(s.q.eq).toHaveBeenCalledWith('tipo', 'CARGO');
    expect(s.q.or).toHaveBeenCalledWith('conciliado.is.false,conciliado.is.null');
    expect(result.data).toContain('"06/11/2026","CARGO","\'=1+1"');
    expect(result.data).toContain('"Texto, ""citado""","USD","0.07"');
  });
  it.each([
    ['sin conteo', { data: [movement()] }],
    ['truncada', { data: [movement()], count: 2 }],
    ['duplicada', { data: [movement(), movement()], count: 2 }],
    ['otra empresa', { data: [{ ...movement(), tenant_id: 'other' }], count: 1 }],
    ['otra cuenta', { data: [{ ...movement(), cuenta_bancaria_id: 'other' }], count: 1 }],
    ['otra moneda', { data: [{ ...movement(), moneda: 'PEN' }], count: 1 }],
    ['moneda vacía explícita', { data: [{ ...movement(), moneda: '' }], count: 1 }],
    ['importe inválido', { data: [{ ...movement(), monto: 'NaN' }], count: 1 }],
    ['lectura fallida', { data: null, error: { message: 'unavailable' }, count: null }],
  ])('rechaza 503 ante %s y no publica CSV parcial', async (_name, page) => {
    const s = setup([page]);
    await expect(s.service.exportarMovimientosBancarios(tenant, bankId, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['changed-count', 'page-error'])('descarta la exportación si falla la segunda página: %s', async mode => {
    const rows = Array.from({ length: 1000 }, (_, n) => movement(n));
    const s = setup([{ data: rows, count: 1001 }, mode === 'changed-count'
      ? { data: [movement(1000)], count: 1002 } : { data: null, count: 1001, error: { message: 'unavailable' } }]);
    await expect(s.service.exportarMovimientosBancarios(tenant, bankId, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([{ ...account, moneda: null }, { ...account, tenant_id: 'other' }, { ...account, id: 'other' }])('rechaza una identidad bancaria incompleta o ajena', async bank => {
    const s = setup([{ data: [], count: 0 }], bank);
    await expect(s.service.exportarMovimientosBancarios(tenant, bankId, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
