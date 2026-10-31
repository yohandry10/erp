import { AccountingBooksService } from './accounting-books.service';

describe('AccountingBooksService', () => {
  const buildSupabaseMock = () => {
    const chain: any = {
      order: jest.fn(() => ({ data: [], error: null })),
      gte: jest.fn(() => ({ data: [], error: null })),
      lte: jest.fn(() => ({ data: [], error: null })),
      eq: jest.fn(() => chain),
      select: jest.fn(() => chain),
      insert: jest.fn(() => chain),
      update: jest.fn(() => chain),
      in: jest.fn(() => chain),
      like: jest.fn(() => chain),
      single: jest.fn(() => ({ data: {}, error: null })),
    };

    const from = jest.fn(() => chain);

    const rpc=jest.fn().mockResolvedValue({data:{record:{id:'cons-1',tenant_id:'tenant-seguro',estado:'PENDIENTE',
      cantidad:3,valor_unitario:10.125,valor_total:30.38,consignatario_nombre:'Cliente QA'}},error:null});
    const supabase = {
      getClient: jest.fn(() => ({ from,rpc })),
    };

    return { supabase, from, chain,rpc };
  };

  it('lanza error si no hay tenant en contexto', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    const { supabase } = buildSupabaseMock();
    const tenantContext = { getTenantId: jest.fn(() => null) };
    const service = new AccountingBooksService(supabase as any, tenantContext as any);

    await expect(service.getPlanCuentas()).rejects.toThrow(/Tenant requerido/);
    errorSpy.mockRestore();
  });

  it('filtra por tenant_id en plan de cuentas', async () => {
    const { supabase, from, chain } = buildSupabaseMock();
    const tenantContext = { getTenantId: jest.fn(() => 'tenant-1') };
    const service = new AccountingBooksService(supabase as any, tenantContext as any);

    await service.getPlanCuentas();

    expect(from).toHaveBeenCalledWith('plan_cuentas');
    // Verifica que algún eq fue llamado con tenant_id
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls.some((args: any[]) => args[0] === 'tenant_id' && args[1] === 'tenant-1')).toBe(true);
  });

  it('oculta equivalencias contables internas del plan visible', async () => {
    const { supabase, chain } = buildSupabaseMock();
    chain.order.mockReturnValue({
      data: [
        { codigo: '1105', nombre: 'Caja', metadata: {} },
        { codigo: '10', nombre: 'Equivalencia interna Caja', metadata: { internal_equivalence: true } },
      ],
      error: null,
    });
    const service = new AccountingBooksService(
      supabase as any,
      { getTenantId: jest.fn(() => 'tenant-co') } as any,
    );

    await expect(service.getPlanCuentas()).resolves.toEqual([
      expect.objectContaining({ codigo: '1105', nombre: 'Caja' }),
    ]);
  });

  it('expone un solo registro por código contable aunque existan históricos duplicados', async () => {
    const { supabase, chain } = buildSupabaseMock();
    chain.order.mockReturnValue({
      data: [
        { id: '407-a', codigo: '407', nombre: 'AFP por pagar' },
        { id: '407-b', codigo: '407', nombre: 'Aportes patronales por pagar' },
        { id: '627', codigo: '627', nombre: 'Seguridad social' },
      ],
      error: null,
    });
    const service = new AccountingBooksService(
      supabase as any,
      { getTenantId: jest.fn(() => 'tenant-pe') } as any,
    );

    await expect(service.getPlanCuentas()).resolves.toEqual([
      { id: '407-a', codigo: '407', nombre: 'AFP por pagar' },
      { id: '627', codigo: '627', nombre: 'Seguridad social' },
    ]);
  });

  it('fuerza tenant, estado y total de la consignación desde el servidor', async () => {
    const { supabase, chain, rpc } = buildSupabaseMock();
    chain.single.mockReturnValue({ data: { id: 'cons-1' }, error: null });
    const service = new AccountingBooksService(
      supabase as any,
      { getTenantId: jest.fn(() => 'tenant-seguro') } as any,
    );

    await service.createConsignacion({
      tenant_id: 'tenant-ajeno',
      estado: 'CERRADA',
      cantidad: 3,
      valor_unitario: 10.125,
      valor_total: 1,
      consignatario_nombre: ' Cliente QA ',
    },'11111111-1111-4111-8111-111111111111','consignment-test-create');

    expect(rpc).toHaveBeenCalledWith('gestionar_consignacion_tx',expect.objectContaining({
      p_tenant_id:'tenant-seguro',p_action:'CREATE',p_idempotency_key:'consignment-test-create',
    }));
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('rechaza estados de consignación fuera del flujo permitido', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    const { supabase } = buildSupabaseMock();
    const service = new AccountingBooksService(
      supabase as any,
      { getTenantId: jest.fn(() => 'tenant-1') } as any,
    );

    await expect(service.updateEstadoConsignacion('cons-1','BORRADA','11111111-1111-4111-8111-111111111111')).rejects.toThrow(
      /Estado de consignación no permitido/,
    );
    errorSpy.mockRestore();
  });

  describe('Registro de Compras documental', () => {
    const invoice = (overrides: any = {}) => ({
      id: 'invoice-1', fecha_emision: '2026-10-07', tipo_documento: 'FACTURA',
      numero_documento: 'F570-00000001', estado: 'PAGADA', moneda: 'PEN',
      subtotal: 92, igv: 16.56, total: 108.56,
      metadata: { ultima_devolucion_id: 'return-1', ultima_nota_credito_proveedor_id: 'note-2' },
      original_fiscal_amounts: { subtotal: 288, igv: 51.84, total: 339.84 },
      proveedores: { razon_social: 'Proveedor UAT', ruc: '20123456786' },
      ...overrides,
    });
    const setup = (pages: any[][] = [[]], error: any = null) => {
      let page = 0;
      const chain: any = {};
      for (const method of ['select', 'eq', 'order', 'gte', 'lte']) chain[method] = jest.fn(() => chain);
      chain.range = jest.fn((offset: number) => { page = offset / 1000; return chain; });
      chain.then = (resolve: any) => Promise.resolve({ data: pages[page] || [], error }).then(resolve);
      const from = jest.fn(() => chain);
      const service = new AccountingBooksService({ getClient: () => ({ from }) } as any,
        { getTenantId: () => 'tenant-1' } as any);
      return { service, from, chain };
    };

    it('conserva originales, resta ambas NC y no usa la orden ni el saldo de deuda', async () => {
      const referencia = { documento_referencia_tipo: 'FACTURA', documento_referencia_serie: 'F570', documento_referencia_numero: '00000001' };
      const { service, from, chain } = setup([[
        invoice(),
        invoice({ id: 'invoice-2', numero_documento: 'F570-00000002', subtotal: 192, igv: 34.56, total: 226.56,
          original_fiscal_amounts: null, metadata: {}, estado: 'PARCIAL' }),
        invoice({ id: 'note-1', tipo_documento: 'NOTA_CREDITO', numero_documento: 'FC57-00000001',
          subtotal: 96, igv: 17.28, total: 113.28, original_fiscal_amounts: null, metadata: {}, fiscal_metadata: referencia }),
        invoice({ id: 'note-2', tipo_documento: '07', numero_documento: 'FC57-00000002',
          subtotal: 100, igv: 18, total: 118, original_fiscal_amounts: null, metadata: {}, fiscal_metadata: referencia }),
        invoice({ tipo_documento: 'ORDEN_COMPRA', original_fiscal_amounts: null }),
      ]]);
      const result = await service.getRegistroCompras({ fechaDesde: '2026-10-01', fechaHasta: '2026-10-31' });
      expect(from).toHaveBeenCalledWith('cuentas_por_pagar');
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.gte).toHaveBeenCalledWith('fecha_emision', '2026-10-01');
      expect(chain.lte).toHaveBeenCalledWith('fecha_emision', '2026-10-31');
      expect(result.resumen).toEqual({ cantidadComprobantes: 4, baseImponible: 284, igv: 51.12, total: 335.12, moneda: 'PEN' });
      expect(result.compras[0].importeTotal).toBe(339.84);
      expect(result.compras[2]).toMatchObject({ importeTotal: -113.28, documentoModificado: 'FACTURA-F570-00000001' });
      expect(result.compras[3].importeTotal).toBe(-118);
    });

    it('conserva factura saldada por NC y excluye anulaciones manuales', async () => {
      const { service } = setup([[
        invoice({ estado: 'ANULADA', total: 0, metadata: { ultima_nota_credito_proveedor_id: 'nc-1', cancelada_por_nota_credito: true } }),
        invoice({ estado: 'ANULADA', metadata: {} }),
      ]]);
      expect((await service.getRegistroCompras()).compras).toHaveLength(1);
    });

    it('no presume originales de una factura ajustada que carece de snapshot', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { service } = setup([[invoice({ original_fiscal_amounts: null })]]);
      await expect(service.getRegistroCompras()).rejects.toThrow('Reconcilie');
      errorSpy.mockRestore();
    });

    it('recorre las páginas completas y conserva totales por divisa', async () => {
      const first = Array.from({ length: 1000 }, (_, i) => invoice({ id: `i-${i}`, metadata: {}, original_fiscal_amounts: null, subtotal: 1, igv: 0, total: 1 }));
      const { service, chain } = setup([first, [invoice({ id: 'usd-1', moneda: 'USD', proveedores: [{ ruc: '20123456786' }] })]]);
      const result = await service.getRegistroCompras();
      expect(chain.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
      expect(result.total).toBe(1001);
      expect(result.resumen.total).toBeNull();
      expect(result.resumenPorMoneda).toEqual([
        { moneda: 'PEN', cantidadComprobantes: 1000, baseImponible: 1000, igv: 0, total: 1000 },
        { moneda: 'USD', cantidadComprobantes: 1, baseImponible: 288, igv: 51.84, total: 339.84 },
      ]);
      expect(result.compras[1000].rucProveedor).toBe('20123456786');
    });

    it('propaga una lectura fallida en vez de devolver un reporte vacío', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = { message: 'PostgREST unavailable' };
      const { service } = setup([], error);
      await expect(service.getRegistroCompras()).rejects.toEqual(error);
      errorSpy.mockRestore();
    });
  });
});
