import { BadRequestException } from '@nestjs/common';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationService } from './configuration.service';

describe('ConfigurationController · transporte fiscal Colombia', () => {
  function build() {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { pais: 'CO', pais_id: 2 },
        error: null,
      }),
    };
    const updateEmpresaPatchAtomic = jest.fn().mockResolvedValue({ id: 'empresa-co' });
    const invalidateAllTenantCache = jest.fn().mockResolvedValue(undefined);
    const controller = new ConfigurationController(
      { updateEmpresaPatchAtomic } as any,
      { getClient: () => ({ from: () => query }) } as any,
      { get: jest.fn() } as any,
      {} as any,
      { invalidateAllTenantCache } as any,
      {} as any,
    );
    return { controller, updateEmpresaPatchAtomic, invalidateAllTenantCache };
  }

  it('rechaza OSE y una URL arbitraria aunque el país no venga repetido en el payload', async () => {
    const { controller, updateEmpresaPatchAtomic } = build();

    await expect(controller.updateEmpresaData(
      {
        emisionCpeModo: 'OSE_API',
        oseActivo: true,
        oseUrl: 'http://169.254.169.254/latest/meta-data',
      },
      'tenant-co',
      { id: 'actor-admin', email: 'admin@example.test', roles: ['ADMIN'] },
      'idem-co-ose',
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(updateEmpresaPatchAtomic).not.toHaveBeenCalled();
  });

  it('normaliza cualquier actualización Colombia a DIAN_DIRECTO y desactiva OSE', async () => {
    const { controller, updateEmpresaPatchAtomic, invalidateAllTenantCache } = build();

    await expect(controller.updateEmpresaData(
      { razonSocial: 'Empresa Colombia S.A.S.' },
      'tenant-co',
      { id: 'actor-admin', email: 'admin@example.test', roles: ['ADMIN'] },
      'idem-co-canonical',
    )).resolves.toEqual(expect.objectContaining({ success: true }));

    expect(updateEmpresaPatchAtomic).toHaveBeenCalledWith(
      'tenant-co',
      expect.objectContaining({
        pais: 'CO',
        pais_id: 2,
        moneda_defecto: 'COP',
        emision_cpe_modo: 'DIAN_DIRECTO',
        ose_activo: false,
      }),
      'actor-admin',
      'idem-co-canonical',
      'EMPRESA',
    );
    expect(invalidateAllTenantCache).toHaveBeenCalledWith('tenant-co');
  });

  it('el writer del wizard tampoco acepta OSE para Colombia', async () => {
    const rpc = jest.fn();
    const service = new ConfigurationService(
      { getClient: () => ({ rpc }) } as any,
      {} as any,
      { get: jest.fn() } as any,
    );

    await expect(service.completeWizard(
      'tenant-co',
      {
        pais: 'CO',
        pais_id: 2,
        emision_cpe_modo: 'OSE_API',
        ose_url: 'http://127.0.0.1:5432',
      },
      'actor-admin',
      'idem-co-wizard-ose',
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(rpc).not.toHaveBeenCalled();
  });

  it('la frontera atómica rechaza OSE aunque un llamador interno omita el controlador', async () => {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { pais: 'CO', pais_id: 2, ruc: '900123456-8', dian_activo: false },
        error: null,
      }),
    };
    const rpc = jest.fn();
    const service = new ConfigurationService(
      { getClient: () => ({ from: () => query, rpc }) } as any,
      {} as any,
      { get: jest.fn() } as any,
    );

    await expect(service.updateEmpresaPatchAtomic(
      'tenant-co',
      {
        pais: 'CO',
        pais_id: 2,
        emision_cpe_modo: 'OSE_API',
        ose_url: 'http://127.0.0.1:5432',
      },
      'actor-admin',
      'idem-co-atomic-ose',
      'EMPRESA',
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(rpc).not.toHaveBeenCalled();
  });
});
