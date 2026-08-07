import { BadRequestException } from '@nestjs/common';
import { DemoService } from './demo.service';

function serviceWith(client: any, login = jest.fn()) {
  return new DemoService(
    { getClient: () => client, getPublicClient: () => client } as any,
    { login } as any,
    { isConfigured: () => false } as any,
    {} as any,
    { get: () => 'demo-encryption-key-that-is-long-enough' } as any,
    { invalidateAllTenantCache: jest.fn() } as any,
  );
}

describe('DemoService - promoción colombiana real', () => {
  it('rechaza un RUC peruano cuando el tenant demo es Colombia', async () => {
    const service = serviceWith({});
    jest.spyOn(service, 'getDemoStatus').mockResolvedValue({
      is_demo: true,
      pais: 'CO',
    } as any);

    await expect(service.convertToReal('tenant-co', {
      email: 'admin@empresa.co',
      password: 'ClaveSegura123',
      razon_social: 'EMPRESA COLOMBIA SAS',
      ruc: '20123456786',
    })).rejects.toThrow('NIT inválido para CO');
  });

  it('elimina fixtures colombianos mediante el RPC antes de entregar la cuenta real', async () => {
    const rpc = jest.fn((name: string) => Promise.resolve({
      data: name === 'prepare_colombia_real_onboarding'
        ? { prepared: true }
        : { success: true, reinicio: { reiniciado: false } },
      error: null,
    }));
    const from = jest.fn((table: string) => {
      if (table === 'empresa_config') {
        const builder: any = {
          update: jest.fn(() => builder),
          select: jest.fn(() => builder),
          eq: jest.fn(() => builder),
          maybeSingle: jest.fn().mockResolvedValue({ data: { pais: 'CO' }, error: null }),
          then: (resolve: any) => resolve({ data: null, error: null }),
        };
        return builder;
      }
      if (table === 'usuarios_sistema') {
        const builder: any = {
          update: jest.fn(() => builder),
          select: jest.fn(() => builder),
          eq: jest.fn(() => builder),
          in: jest.fn(() => builder),
          // El demo tiene varios usuarios; la conversión los lista para poner el
          // correo del cliente solo en el principal.
          order: jest.fn().mockResolvedValue({ data: [{ id: 'user-real' }], error: null }),
          single: jest.fn().mockResolvedValue({ data: { id: 'user-real' }, error: null }),
          then: (resolve: any) => resolve({ data: null, error: null }),
        };
        return builder;
      }
      throw new Error(`Tabla inesperada: ${table}`);
    });
    const login = jest.fn().mockResolvedValue({ access_token: 'token-real' });
    const service = serviceWith({ from, rpc }, login);

    const result = await service.completarConversion('tenant-co', {
      email: 'admin@empresa.co',
      password: 'ClaveSegura123',
      razon_social: 'EMPRESA COLOMBIA SAS',
      ruc: '900373913-5',
    });

    expect(rpc).toHaveBeenCalledWith('prepare_colombia_real_onboarding', {
      p_tenant_id: 'tenant-co',
    });
    expect(rpc).toHaveBeenCalledWith('completar_conversion_demo', expect.objectContaining({
      p_tenant: 'tenant-co',
      p_ruc: '900373913-5',
      p_email: 'admin@empresa.co',
    }));
    expect(result).toEqual(expect.objectContaining({ success: true, tenant_id: 'tenant-co' }));
    expect(login).toHaveBeenCalled();
  });

  it('falla cerrado si no puede limpiar las credenciales demo colombianas', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: new Error('RPC unavailable') });
    const from = jest.fn(() => {
      const builder: any = {
        update: jest.fn(() => builder),
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        maybeSingle: jest.fn().mockResolvedValue({ data: { pais: 'CO' }, error: null }),
        then: (resolve: any) => resolve({ data: null, error: null }),
      };
      return builder;
    });
    const service = serviceWith({ from, rpc });

    await expect(service.completarConversion('tenant-co', {
      email: 'admin@empresa.co',
      password: 'ClaveSegura123',
      razon_social: 'EMPRESA COLOMBIA SAS',
      ruc: '900373913-5',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
