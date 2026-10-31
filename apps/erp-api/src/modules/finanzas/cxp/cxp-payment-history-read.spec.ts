import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { readCxpPaymentHistory } from './cxp-payment-history-read';

const id = (n: number) => `aa510000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), account = id(2), bankId = id(3);
const bank = (n = 1): any => ({ id: id(100 + n), tenant_id: tenant, cxp_id: account, fecha: '2026-10-07', monto: 0.01,
  tipo: 'CARGO', metodo_pago: 'TRANSFERENCIA', conciliado: false, cuenta_bancaria_id: bankId,
  cuenta_bancaria: { id: bankId, banco: 'Fixture', numero_cuenta: '000', moneda: 'USD' }, created_at: '2026-10-07T12:00:00Z' });
const cash = (n = 1): any => ({ id: id(10000 + n), tenant_id: tenant, cuenta_por_pagar_id: account, fecha_pago: '2026-10-06', monto: 0.01,
  moneda: 'USD', metodo_pago: 'EFECTIVO', estado: 'APLICADO', activo: true, created_at: '2026-10-06T12:00:00Z' });
const page = (data: any, count: any = Array.isArray(data) ? data.length : null, error: any = null) => ({ data, count, error });
function harness(bankPages: any[] = [page([])], cashPages: any[] = [page([])], parent: any = { data: { id: account, tenant_id: tenant, moneda: 'USD' }, error: null }) {
  const calls: any[] = [], index: Record<string, number> = { movimientos_bancarios: 0, pagos_facturas: 0 };
  const rpc = jest.fn(() => { throw Error('Writer forbidden'); });
  const client = { rpc, from: (table: string) => {
    const call: any = { table, filters: [], orders: [] }; calls.push(call); let result: any;
    const query: any = {
      select: (columns: string, options: any) => { call.columns = columns; call.options = options; return query; },
      eq: (key: string, value: any) => { call.filters.push([key, value]); return query; },
      order: (key: string, options: any) => { call.orders.push([key, options]); return query; },
      range: (start: number, end: number) => { call.range = [start, end]; result = (table === 'movimientos_bancarios' ? bankPages : cashPages)[index[table]++]; return query; },
      maybeSingle: async () => { if (parent instanceof Error) throw parent; return parent; },
      then: (resolve: any, reject: any) => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject),
    }; return query;
  } };
  return { read: () => readCxpPaymentHistory(client, tenant, account), calls, rpc };
}

describe('CxP payment history complete scoped sources', () => {
  it.each(['bank', 'cash'])('retains the1001st%s payment with stable scoped pagination', async kind => {
    const rows = Array.from({ length: 1001 }, (_, i) => kind === 'bank' ? bank(i) : cash(i));
    const pages = [page(rows.slice(0, 1000), 1001), page(rows.slice(1000), 1001)];
    const h = harness(kind === 'bank' ? pages : [page([])], kind === 'cash' ? pages : [page([])]), result = await h.read();
    expect(result.total).toBe(1001); expect(result.data.map(r => r.id)).toContain(rows[1000].id);
    expect(result).toMatchObject({ tenant_id: tenant, cuenta_por_pagar_id: account, moneda: 'USD', fuentes_pagos: { complete: true, total: 1001, bank_total: kind === 'bank' ? 1001 : 0, cash_total: kind === 'cash' ? 1001 : 0, page_size: 1000 } });
    const source = h.calls.filter(c => c.table === (kind === 'bank' ? 'movimientos_bancarios' : 'pagos_facturas'));
    expect(source.map(c => c.range)).toEqual([[0, 999], [1000, 1999]]);
    for (const c of source) { expect(c.options).toEqual({ count: 'exact' }); expect(c.orders).toEqual([['id', { ascending: true }]]); expect(c.filters).toContainEqual(['tenant_id', tenant]); expect(c.filters).toContainEqual([kind === 'bank' ? 'cxp_id' : 'cuenta_por_pagar_id', account]); }
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('combines bank and cash once, retaining amounts and original identifiers', async () => {
    const b = bank(), c = cash(); b.monto = '2.00'; c.monto = '1.50'; const h = harness([page([b])], [page([c])]), result = await h.read();
    expect(result.data.map(r => [r.id, r.monto, r.fuente])).toEqual([[b.id, 2, 'BANCO'], [c.id, 1.5, 'CAJA']]);
    expect(result.fuentes_pagos).toEqual({ complete: true, total: 2, bank_total: 1, cash_total: 1, page_size: 1000 });
    expect(result.data.every(r => r.tenant_id === tenant && r.cxp_id === account && r.cuenta_por_pagar_id === account && r.moneda === 'USD')).toBe(true); expect(h.rpc).not.toHaveBeenCalled();
  });
  it('confirms actual empty sources explicitly', async () => { const result = await harness().read(); expect(result.data).toEqual([]); expect(result.fuentes_pagos).toEqual({ complete: true, total: 0, bank_total: 0, cash_total: 0, page_size: 1000 }); });
  it.each([1000, 2000])('exact page multiple%s needs no extra empty page', async count => {
    const rows = Array.from({ length: count }, (_, i) => bank(i)), h = harness(Array.from({ length: count / 1000 }, (_, i) => page(rows.slice(i * 1000, (i + 1) * 1000), count)));
    expect((await h.read()).total).toBe(count); expect(h.calls.filter(c => c.table === 'movimientos_bancarios')).toHaveLength(count / 1000);
  });
  it.each([null, undefined, page(null, 0), page([], null), page([], -1), page([], 1), page([], 0, { code: '42501' }), new Error('transport')])('unknown bank source%s fails without claiming complete empty', async value => { const h = harness([value]); await expect(h.read()).rejects.toBeInstanceOf(ServiceUnavailableException); expect(h.rpc).not.toHaveBeenCalled(); });
  it.each([null, page(null, 0), page([], null), page([], 1), page([], 0, { code: '08006' }), new Error('transport')])('unknown cash source%s never returns a partial bank history', async value => { const h = harness([page([bank()])], [value]); await expect(h.read()).rejects.toBeInstanceOf(ServiceUnavailableException); expect(h.rpc).not.toHaveBeenCalled(); });
  it.each(['countChanged', 'truncated', 'unknown', 'failed', 'duplicate', 'foreign'])('second page%s never returns first1000 as complete', async kind => {
    const rows = Array.from({ length: 1000 }, (_, i) => bank(i)); let tail: any = page([bank(1000)], 1001);
    if (kind === 'countChanged') tail.count = 1002; if (kind === 'truncated') tail.data = []; if (kind === 'unknown') tail = null;
    if (kind === 'failed') tail.error = { code: '08006' }; if (kind === 'duplicate') tail.data = [rows[0]]; if (kind === 'foreign') tail.data[0].tenant_id = id(20);
    await expect(harness([page(rows, 1001), tail]).read()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  const badBank: Record<string, (r: any) => void> = {
    foreignTenant: r => { r.tenant_id = id(20); }, foreignAccount: r => { r.cxp_id = id(20); }, missingID: r => { delete r.id; },
    wrongType: r => { r.tipo = 'ABONO'; }, missingBank: r => { r.cuenta_bancaria = null; }, wrongBank: r => { r.cuenta_bancaria.id = id(20); },
    wrongCurrency: r => { r.cuenta_bancaria.moneda = 'PEN'; }, missingBankName: r => { delete r.cuenta_bancaria.banco; },
    wrongMethod: r => { r.metodo_pago = 'OTHER'; }, unknownReconciled: r => { r.conciliado = null; }, impossibleDate: r => { r.fecha = '2026-02-30'; },
    unknownAmount: r => { r.monto = null; }, zeroAmount: r => { r.monto = 0; }, negativeAmount: r => { r.monto = -1; }, fractionalCent: r => { r.monto = 0.001; },
  };
  it.each(Object.keys(badBank))('invalid bank%s cannot confirm another payment', async kind => { const row = bank(); badBank[kind](row); await expect(harness([page([row])]).read()).rejects.toBeInstanceOf(ServiceUnavailableException); });
  const badCash: Record<string, (r: any) => void> = {
    foreignTenant: r => { r.tenant_id = id(20); }, foreignAccount: r => { r.cuenta_por_pagar_id = id(20); }, foreignCurrency: r => { r.moneda = 'PEN'; },
    inactive: r => { r.activo = false; }, unapplied: r => { r.estado = 'ANULADO'; }, wrongMethod: r => { r.metodo_pago = 'TRANSFERENCIA'; },
    invalidDate: r => { r.fecha_pago = '2026-02-30'; }, unknownAmount: r => { r.monto = null; }, fractionalCent: r => { r.monto = 0.001; },
  };
  it.each(Object.keys(badCash))('invalid cash%s cannot confirm another payment', async kind => { const row = cash(); badCash[kind](row); await expect(harness([page([])], [page([row])]).read()).rejects.toBeInstanceOf(ServiceUnavailableException); });
  it('rejects a duplicate ID across bank and cash', async () => { const b = bank(), c = cash(); c.id = b.id; await expect(harness([page([b])], [page([c])]).read()).rejects.toBeInstanceOf(ServiceUnavailableException); });
  it.each([{ data: null, error: { code: '08006' } }, new Error('transport'), null, { data: undefined, error: null }])('unreadable parent%s is503 and never a false404', async value => { const h = harness([], [], value); await expect(h.read()).rejects.toBeInstanceOf(ServiceUnavailableException); expect(h.calls).toHaveLength(1); });
  it('confirmed absent account is404 without child queries', async () => { const h = harness([], [], { data: null, error: null }); await expect(h.read()).rejects.toBeInstanceOf(NotFoundException); expect(h.calls).toHaveLength(1); });
  it.each(['tenant_id', 'id', 'moneda'])('foreign or missing parent%s is unavailable', async key => { const parent: any = { id: account, tenant_id: tenant, moneda: 'USD' }; parent[key] = 'other'; await expect(harness([], [], { data: parent, error: null }).read()).rejects.toBeInstanceOf(ServiceUnavailableException); });
  it('preserves valid leap-day history', async () => { const row = bank(); row.fecha = '2024-02-29'; expect((await harness([page([row])]).read()).data[0].fecha).toBe('2024-02-29'); });
});
