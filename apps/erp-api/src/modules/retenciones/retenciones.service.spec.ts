import { RetencionesService } from './retenciones.service';

describe('RetencionesService', () => {
  it('calcula retención con precisión decimal y tenant explícito', async () => {
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      single: jest
        .fn()
        .mockResolvedValueOnce({ data: { proveedor_id: 'prov-1' }, error: null })
        .mockResolvedValueOnce({
          data: { tasa_porcentaje: 8, monto_minimo: 1500 },
          error: null,
        }),
    };
    const supabase = {
      getClient: () => ({
        from: jest.fn(() => chain),
      }),
    };
    const tenantContext = { getTenantId: jest.fn(() => 'tenant-1') };
    const service = new RetencionesService(supabase as any, {} as any, tenantContext as any);

    const result = await service.calcularRetencion({
      proveedor_id: 'prov-1',
      categoria_retencion: 'CUARTA',
      monto_pago: 2000.15,
    });

    expect(tenantContext.getTenantId).toHaveBeenCalled();
    expect(result.tasa_retencion).toBe(8);
    expect(result.monto_retencion).toBe(160.01);
    expect(result.monto_neto).toBe(1840.14);
    expect(result.exonerado).toBe(false);
  });
});
