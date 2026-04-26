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
});
