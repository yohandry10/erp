import { ComprasController } from './compras.controller';

describe('ComprasController · órdenes activas', () => {
  it('incluye la orden aprobada y la recepción parcial sin contar las terminadas', async () => {
    const orders = ['BORRADOR', 'APROBACION', 'APROBADA', 'PARCIAL', 'RECIBIDA', 'ANULADA', 'RECHAZADA']
      .map((estado) => ({ estado, total: '10.00', fecha_entrega: '2099-01-01' }));
    const orderQuery: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: orders, error: null }) };
    const providersQuery: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
    const from = jest.fn((table: string) => table === 'ordenes_compra' ? orderQuery : providersQuery);
    const controller = new ComprasController({ getClient: () => ({ from }) } as any,
      { getTenantId: () => 'tenant-demo' } as any);
    const result = await controller.getStats({});
    expect(result.data.ordenesActivas).toBe(4);
    expect(orderQuery.eq).toHaveBeenCalledWith('tenant_id', 'tenant-demo');
    expect(providersQuery.eq).toHaveBeenCalledWith('tenant_id', 'tenant-demo');
  });
});

describe('ComprasController · compras del mes', () => {
  afterAll(() => jest.useRealTimers());
  it('suma sólo el mes calendario del contribuyente y excluye anuladas y rechazadas', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-04T18:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const orders = [
      { estado: 'BORRADOR', total: '17.70', fecha_orden: '2026-11-04T15:00:00+00:00' },
      { estado: 'PARCIAL', total: '354.00', fecha_orden: '2026-11-01T06:00:00+00:00' },
      // 31-oct 22:00 en Lima: en UTC ya es noviembre, pero la compra es de octubre.
      { estado: 'RECIBIDA', total: '118.00', fecha_orden: '2026-11-01T03:00:00+00:00' },
      { estado: 'ANULADA', total: '500.00', fecha_orden: '2026-11-02T15:00:00+00:00' },
    ];
    const orderQuery: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: orders, error: null }) };
    const otherQuery: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { pais: 'PE' }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
    const from = jest.fn((table: string) => table === 'ordenes_compra' ? orderQuery : otherQuery);
    const controller = new ComprasController({ getClient: () => ({ from }) } as any,
      { getTenantId: () => 'tenant-mes' } as any);
    const result = await controller.getStats({});
    expect(result.data).toMatchObject({ comprasDelMes: 2, montoTotalMes: 371.7 });
  });
});

describe('ComprasController · proveedores activos', () => {
  it('un fallo al leer proveedores es indisponibilidad, no un número inventado', async () => {
    const orderQuery: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }) };
    const failing: any = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { pais: 'PE' }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: null, error: { code: 'PGRST000', message: 'caída' } }).then(resolve) };
    const from = jest.fn((table: string) => table === 'ordenes_compra' ? orderQuery : failing);
    const controller = new ComprasController({ getClient: () => ({ from }) } as any,
      { getTenantId: () => 'tenant-prov' } as any);
    await expect(controller.getStats({})).rejects.toMatchObject({ status: 503 });
  });
});
