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
