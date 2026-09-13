import { PosService } from './pos.service';

describe('Configuración de empresa expuesta al POS', () => {
  function fixture(data: unknown, error: unknown = null) {
    const query: any = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data, error }),
    };
    const receiver: any = {
      runWithTenantContext: (_user: unknown, callback: () => Promise<unknown>) => callback(),
      supabase: { getClient: () => ({ from: () => query }) },
      logger: { error: jest.fn() },
    };
    return { query, read: () => PosService.prototype.getEmpresaConfig.call(receiver, { tenant_id: 'tenant' }) };
  }

  it('preserva los datos del ticket y excluye certificados, claves e incluso columnas futuras', async () => {
    const { query, read } = fixture({
      razon_social: 'Empresa Perú', ruc: '20123456786', direccion_fiscal: 'Lima',
      pais: 'PE', moneda_defecto: 'PEN', serie_factura: 'F001', logo_url: '/logo.png',
      certificado_pfx: 'synthetic-pfx', certificado_password: 'synthetic-password',
      sunat_password: 'synthetic-sol', ose_api_key: 'synthetic-ose',
      dian_software_pin: 'synthetic-pin', future_private_credential: 'synthetic-secret',
    });
    expect(await read()).toEqual({ success: true, data: {
      razon_social: 'Empresa Perú', ruc: '20123456786', direccion_fiscal: 'Lima',
      pais: 'PE', moneda_defecto: 'PEN', serie_factura: 'F001', logo_url: '/logo.png',
    } });
    expect(query.select.mock.calls[0][0]).not.toContain('*');
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
  });

  it('distingue una empresa sin configuración de un fallo al leerla', async () => {
    expect(await fixture(null).read()).toEqual({ success: true, data: null });
    const error = new Error('database unavailable');
    await expect(fixture(null, error).read()).rejects.toBe(error);
  });
});
