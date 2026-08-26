import { DEMO_PCGE_ACCOUNTS, DemoService, PERIODOS_CONTRATO } from './demo.service';

describe('DemoService commercial terms', () => {
  const service = new DemoService(
    {} as any,
    {} as any,
    { isConfigured: () => false } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('publica únicamente 3, 6 y 12 meses con las bonificaciones prometidas', () => {
    expect(PERIODOS_CONTRATO).toEqual({
      trimestral: expect.objectContaining({ meses_pagados: 3, meses_bonificados: 0, meses_servicio: 3 }),
      semestral: expect.objectContaining({ meses_pagados: 6, meses_bonificados: 3, meses_servicio: 9 }),
      anual: expect.objectContaining({ meses_pagados: 12, meses_bonificados: 6, meses_servicio: 18 }),
    });

    const catalogo = service.getPlanes();
    expect(catalogo.planes).toHaveLength(3);
    expect(catalogo.periodos.map((periodo) => periodo.id)).toEqual([
      'trimestral', 'semestral', 'anual',
    ]);
    expect(catalogo.planes[0].ofertas).toEqual([
      expect.objectContaining({ id: 'trimestral', monto: 297, meses_servicio: 3 }),
      expect.objectContaining({ id: 'semestral', monto: 594, meses_servicio: 9 }),
      expect.objectContaining({ id: 'anual', monto: 990, meses_servicio: 18 }),
    ]);
  });
});

describe('DemoService operational seed', () => {
  it('incluye todas las cuentas PCGE requeridas por los flujos demo', () => {
    expect(new Set(DEMO_PCGE_ACCOUNTS.map((cuenta) => cuenta.codigo))).toEqual(new Set([
      '10', '12', '20', '40', '403', '411', '42', '4699',
      '50', '60', '621', '627', '69', '70', '94',
    ]));
  });

  it('valida el certificado demo PE sin persistir PFX ni contraseña en empresa_config', async () => {
    const update = jest.fn((_payload: Record<string, unknown>) => ({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    const service = new DemoService(
      {
        getClient: () => ({
          from: jest.fn(() => ({ update })),
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn(() => undefined) } as any,
      {} as any,
    );

    await (service as any).seedFiscalDemo('tenant-demo-pe', { codigo: 'PE' });

    expect(update).toHaveBeenCalledTimes(1);
    const persistedPatch = update.mock.calls[0][0];
    expect(persistedPatch).not.toHaveProperty('certificado_pfx');
    expect(persistedPatch).not.toHaveProperty('certificado_password');
    expect(persistedPatch).not.toHaveProperty('certificado_expira_en');
    expect(persistedPatch).toEqual(
      expect.objectContaining({
        ruc: '20123456786',
        sunat_environment: 'homologacion',
      }),
    );
  });

  function buildSeedService(readiness: any = { ready: true }) {
    const rpc = jest.fn().mockResolvedValue({ data: readiness, error: null });
    const service = new DemoService(
      { getClient: () => ({ rpc }) } as any,
      {} as any,
      {} as any,
      {} as any,
      { get: () => 'demo-encryption-key-that-is-long-enough' } as any,
      {} as any,
    );

    for (const method of [
      'seedAlmacenDefault',
      'seedPlanContableMinimo',
      'seedMetodosPago',
      'seedCajaDefault',
      'seedFiscalDemo',
      'seedProductosDemo',
      'seedClientesDemo',
      'seedProveedoresDemo',
      'seedCuentaBancariaDemo',
      'seedEmpleadoDemo',
    ]) {
      jest.spyOn(service as any, method).mockResolvedValue(undefined);
    }
    jest.spyOn(service as any, 'seedSegundoUserAprobador').mockResolvedValue({
      userId: 'aprobador-id',
      email: 'aprobador@temp.local',
      password: 'temporal',
    });

    return { service, rpc };
  }

  it('solo declara lista la demo después del RPC empresarial transaccional', async () => {
    const { service, rpc } = buildSeedService({ ready: true, productos: 6, pedidos: 2 });

    const result = await (service as any).seedDemoOperationalData('tenant-demo', 'user-demo');

    expect(rpc).toHaveBeenCalledWith('hydrate_demo_business_sample_tx', {
      p_tenant_id: 'tenant-demo',
      p_user_id: 'user-demo',
    });
    expect(rpc).toHaveBeenCalledWith('hydrate_demo_hr_sample_tx', {
      p_tenant_id: 'tenant-demo',
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ aprobadorUserId: 'aprobador-id' }));
  });

  it('falla cerrado y no intenta la semilla empresarial si falta una base requerida', async () => {
    const { service, rpc } = buildSeedService();
    jest.spyOn(service as any, 'seedClientesDemo').mockRejectedValue(new Error('clientes no disponibles'));

    await expect(
      (service as any).seedDemoOperationalData('tenant-demo', 'user-demo'),
    ).rejects.toThrow('clientes=clientes no disponibles');
    expect(rpc).not.toHaveBeenCalled();
  });

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

describe('DemoService atomic creation', () => {
  function buildAtomicService() {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        success: true,
        ready: true,
        tenant_id: 'tenant-demo-464',
        user_id: 'user-demo-464',
        email: 'demo-464@temp.local',
        password: 'DemoPass464!',
        expires_at: '2026-08-24T00:00:00.000Z',
        dias_restantes: 14,
        aprobador_user_id: 'approver-464',
        aprobador_email: 'approver-464@temp.local',
        aprobador_password: 'ApproverPass464!',
        readiness: { ready: true, productos: 6 },
        idempotent: false,
      },
      error: null,
    });
    const login = jest.fn().mockResolvedValue({ access_token: 'session-token-464' });
    const invalidateAllTenantCache = jest.fn().mockResolvedValue(undefined);
    const service = new DemoService(
      { getPublicClient: () => ({ rpc }) } as any,
      { login } as any,
      {} as any,
      {} as any,
      { get: jest.fn(() => undefined) } as any,
      { invalidateAllTenantCache } as any,
    );
    return { service, rpc, login, invalidateAllTenantCache };
  }

  it('crea y entrega únicamente una demo lista mediante el RPC 464', async () => {
    const { service, rpc, login, invalidateAllTenantCache } = buildAtomicService();

    const result = await service.createDemoTenant(
      { nombre: 'Demo Colombia', pais: 'CO', dias_duracion: 14 },
      'demo-create-atomic-464',
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_demo_tenant_ready_tx', {
      p_nombre: 'Demo Colombia',
      p_dias_duracion: 14,
      p_pais_codigo: 'CO',
      p_idempotency_key: 'demo-create-atomic-464',
      p_certificado_pfx: null,
      p_certificado_password: null,
      p_certificado_expira_en: null,
      p_rubro: 'COMERCIO',
    });
    expect(login).toHaveBeenCalledWith(
      { email: 'demo-464@temp.local', password: 'DemoPass464!' },
      'demo-api',
      'demo-create',
    );
    expect(invalidateAllTenantCache).toHaveBeenCalledWith('tenant-demo-464');
    expect(result).toEqual(expect.objectContaining({
      success: true,
      token: 'session-token-464',
      pais: 'CO',
      moneda: 'COP',
      aprobador_user_id: 'approver-464',
      idempotent: false,
    }));
  });

  it('verifica el PFX sintético antes de crear una demo peruana', async () => {
    const { service, rpc } = buildAtomicService();

    await expect(
      service.createDemoTenant(
        { nombre: 'Demo Perú', pais: 'PE', dias_duracion: 14 },
        'demo-create-pe-fiscal-ready',
      ),
    ).resolves.toEqual(expect.objectContaining({ success: true, pais: 'PE' }));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('no crea una demo PE si el artefacto fiscal simulado no está disponible', async () => {
    const { service, rpc } = buildAtomicService();
    (service as any).configService = {
      get: jest.fn((key: string) =>
        key === 'DEMO_PFX_PATH' ? 'certs/no-existe-demo.pfx' : undefined,
      ),
    };

    await expect(
      service.createDemoTenant(
        { nombre: 'Demo Perú incompleta', pais: 'PE', dias_duracion: 14 },
        'demo-create-pe-fiscal-missing',
      ),
    ).rejects.toThrow(/certificado fiscal simulado/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('falla antes de escribir si falta una clave idempotente estable', async () => {
    const { service, rpc } = buildAtomicService();

    await expect(service.createDemoTenant({ pais: 'PE' })).rejects.toThrow(
      'Idempotency-Key es obligatorio',
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
