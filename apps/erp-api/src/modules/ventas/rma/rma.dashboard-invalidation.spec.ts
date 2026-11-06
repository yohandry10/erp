import { RmaService } from './rma.service';
import { CacheInvalidationService } from '../../../shared/cache/cache-invalidation.service';

describe('RMA: dashboard después de nota de crédito', () => {
  function setup(failure: boolean | string = false) {
    const values = new Map<string, unknown>([
      ['dashboard:stats:tenant-rma:2026-10:v5', { ventasMes: 466.54 }],
      ['dashboard:activities:tenant-rma:v3', ['Factura sin NC']],
      ['dashboard:stats:tenant-other:2026-10:v5', { ventasMes: 900 }],
      ['dashboard:activities:tenant-other:v3', ['Otra empresa']],
    ]);
    const cache = {
      del: async (key: string) => values.delete(key),
      delPattern: async (pattern: string) => {
        let removed = 0;
        for (const key of values.keys()) if (key.startsWith(pattern.replace(/\*$/, ''))) {
          values.delete(key); removed++;
        }
        return removed;
      },
    };
    const rpc = jest.fn().mockResolvedValue(failure
      ? { data: null, error: { code: '23514', message: typeof failure === 'string' ? failure : 'RMA_NOTE_NOT_READY' } }
      : { data: { success: true, total: 53.1, estado: 'CERRADA' }, error: null });
    const query: any = {};
    for (const method of ['select', 'eq']) query[method] = () => query;
    query.maybeSingle = async () => ({ data: { pais: 'PE', is_demo: true }, error: null });
    const supabase = { getClient: () => ({ from: () => query, rpc }) };
    const invalidation = new CacheInvalidationService(cache as any);
    const service = new RmaService(supabase as any, invalidation);
    return { service, values };
  }

  it('D19 elimina métricas y actividades de su empresa después del commit de NC', async () => {
    const { service, values } = setup();
    const result = await service.generarNotaCredito('tenant-rma', 'actor-aprobador', 'rma-1', { motivo: 'Devolución parcial' }, 'note-rma-1');
    expect(result.total).toBe(53.1);
    expect(values.has('dashboard:stats:tenant-rma:2026-10:v5')).toBe(false);
    expect(values.has('dashboard:activities:tenant-rma:v3')).toBe(false);
    expect(values.get('dashboard:stats:tenant-other:2026-10:v5')).toEqual({ ventasMes: 900 });
    expect(values.has('dashboard:activities:tenant-other:v3')).toBe(true);
  });

  it('un rechazo de la RPC conserva el snapshot, sin anunciar una NC aplicada', async () => {
    const { service, values } = setup(true);
    await expect(service.generarNotaCredito('tenant-rma', 'actor-aprobador', 'rma-1', { motivo: 'Rechazo' }, 'note-rma-2')).rejects.toThrow();
    expect(values.has('dashboard:stats:tenant-rma:2026-10:v5')).toBe(true);
    expect(values.has('dashboard:activities:tenant-rma:v3')).toBe(true);
  });

  it.each([
    'CXC_FX_BOOK_REVIEW_REQUIRED',
    'RMA_FX_CREDIT_REVIEW_REQUIRED',
    'RMA_CREDIT_NOTE_PRIOR_ROUNDING_REVIEW_REQUIRED',
    'RMA_SOURCE_LINE_TOTALS_INCONSISTENT',
    'RMA_CREDIT_NOTE_SOURCE_AMOUNTS_INVALID',
  ])('D25 conserva el rechazo %s para explicar la revisión necesaria', async code => {
    const { service, values } = setup(code);
    await expect(service.generarNotaCredito('tenant-rma', 'actor-aprobador', 'rma-1', {}, 'note-rejected'))
      .rejects.toMatchObject({ response: { message: code, statusCode: 400 } });
    expect(values.has('dashboard:stats:tenant-rma:2026-10:v5')).toBe(true);
  });
});
