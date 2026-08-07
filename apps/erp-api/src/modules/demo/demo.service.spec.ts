import { DemoService } from './demo.service';

describe('DemoService operational seed', () => {
  it('inicializa el stock demo exclusivamente mediante el writer canónico', async () => {
    const insertedByTable = new Map<string, any>();
    const productosInsertados = [
      { id: 'prod-1', codigo: 'DEMO-001', stock_actual: 50 },
      { id: 'prod-2', codigo: 'DEMO-002', stock_actual: 120 },
      { id: 'prod-3', codigo: 'DEMO-003', stock_actual: 80 },
      { id: 'prod-4', codigo: 'DEMO-004', stock_actual: 15 },
      { id: 'prod-5', codigo: 'DEMO-005', stock_actual: 40 },
    ];

    const from = jest.fn((table: string) => {
      const builder: any = {
        insert: jest.fn((payload: any) => {
          insertedByTable.set(table, payload);
          return builder;
        }),
        select: jest.fn(() => {
          if (table === 'productos') {
            return Promise.resolve({ data: productosInsertados, error: null });
          }
          return builder;
        }),
        eq: jest.fn(() => builder),
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'almacen-demo' }, error: null }),
        then: (resolve: (value: any) => void) => resolve({ data: null, error: null }),
      };
      return builder;
    });
    const rpc = jest.fn().mockResolvedValue({ data: 'mov-1', error: null });
    const service = new DemoService(
      { getClient: () => ({ from, rpc }) } as any,
      {} as any,
      {} as any,
      {} as any,
      { get: () => 'demo-encryption-key-that-is-long-enough' } as any,
      {} as any,
    );

    await (service as any).seedProductosDemo('tenant-demo');

    expect(insertedByTable.get('producto_existencias')).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(5);
    expect(rpc).toHaveBeenCalledWith('aplicar_movimiento_inventario_tx', expect.objectContaining({
      p_tenant_id: 'tenant-demo',
      p_almacen_id: 'almacen-demo',
      p_producto_id: 'prod-1',
      p_tipo: 'ENTRADA',
      p_cantidad: 50,
    }));
  });

  it('resuelve certs/demo.pfx desde el workspace sin depender de src o dist', () => {
    const service = new DemoService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: () => 'demo-encryption-key-that-is-long-enough' } as any,
      {} as any,
    );

    expect((service as any).resolveDemoPfxPath('certs/demo.pfx')).toMatch(/[\\/]certs[\\/]demo\.pfx$/);
  });

  it('siembra el catálogo demo colombiano en escala COP', async () => {
    let productos: any[] = [];
    const from = jest.fn((table: string) => {
      const builder: any = {
        insert: jest.fn((payload: any[]) => {
          if (table === 'productos') productos = payload;
          return builder;
        }),
        select: jest.fn(() => table === 'productos'
          ? Promise.resolve({ data: [], error: null })
          : builder),
        eq: jest.fn(() => builder),
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'almacen-co' }, error: null }),
      };
      return builder;
    });
    const service = new DemoService(
      { getClient: () => ({ from }) } as any,
      {} as any,
      {} as any,
      {} as any,
      { get: () => 'demo-encryption-key-that-is-long-enough' } as any,
      {} as any,
    );

    await (service as any).seedProductosDemo('tenant-co', {
      codigo: 'CO', moneda: 'COP', tasaImpuesto: 0.19,
    });

    expect(productos).toEqual(expect.arrayContaining([
      expect.objectContaining({ codigo: 'DEMO-001', precio_venta: 25_000, precio_compra: 18_000 }),
      expect.objectContaining({ codigo: 'DEMO-004', precio_venta: 89_900, precio_compra: 60_000 }),
    ]));
  });

  it('siembra RR. HH. argentino con un CUIL válido y contrato SIPA', async () => {
    const insertedByTable = new Map<string, any>();
    const from = jest.fn((table: string) => {
      const builder: any = {
        insert: jest.fn((payload: any) => {
          insertedByTable.set(table, payload);
          return table === 'empleados'
            ? {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: 'empleado-ar' }, error: null }),
                }),
              }
            : Promise.resolve({ data: null, error: null });
        }),
      };
      return builder;
    });
    const service = new DemoService(
      { getClient: () => ({ from }) } as any,
      {} as any,
      {} as any,
      {} as any,
      { get: () => 'demo-encryption-key-that-is-long-enough' } as any,
      {} as any,
    );

    await (service as any).seedEmpleadoDemo('tenant-ar', {
      codigo: 'AR',
      moneda: 'ARS',
    });

    expect(insertedByTable.get('empleados')).toEqual(expect.objectContaining({
      tipo_documento: 'CUIL',
      numero_documento: '27301234568',
    }));
    expect(insertedByTable.get('contratos')).toEqual(expect.objectContaining({
      id_empleado: 'empleado-ar',
      sueldo_bruto: 1_800_000,
      regimen_pensionario: 'SIPA',
      estado: 'VIGENTE',
    }));
  });
});
