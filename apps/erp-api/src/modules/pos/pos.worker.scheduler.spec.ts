import { PosWorkerScheduler } from './pos.worker.scheduler';

describe('PosWorkerScheduler', () => {
  it('incluye tenants demo PRUEBA al buscar ventas POS pendientes de CPE', async () => {
    const inFilter = jest.fn().mockResolvedValue({
      data: [{ id: 'tenant-activo' }, { id: 'tenant-demo' }],
      error: null,
    });
    const select = jest.fn(() => ({ in: inFilter }));
    const from = jest.fn(() => ({ select }));
    const scheduler = new PosWorkerScheduler(
      {} as any,
      { getPublicClient: () => ({ from }) } as any,
    );

    const tenants = await (scheduler as any).fetchTenants();

    expect(from).toHaveBeenCalledWith('tenants');
    expect(inFilter).toHaveBeenCalledWith('estado', ['ACTIVO', 'PRUEBA']);
    expect(tenants).toEqual(['tenant-activo', 'tenant-demo']);
  });
});
