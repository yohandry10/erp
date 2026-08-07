import { AccountingBooksService } from './accounting-books.service';

describe('AccountingBooksService', () => {
  const buildSupabaseMock = () => {
    const chain: any = {
      order: jest.fn(() => ({ data: [], error: null })),
      gte: jest.fn(() => ({ data: [], error: null })),
      lte: jest.fn(() => ({ data: [], error: null })),
      eq: jest.fn(() => chain),
      select: jest.fn(() => chain),
      in: jest.fn(() => chain),
      like: jest.fn(() => chain),
    };

    const from = jest.fn(() => chain);

    const supabase = {
      getClient: jest.fn(() => ({ from })),
    };

    return { supabase, from, chain };
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
});
