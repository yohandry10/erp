import { ForbiddenException } from '@nestjs/common';
import { ConfigurationController } from './configuration.controller';

describe('ConfigurationController · constancia DIAN', () => {
  const registrarHabilitacionPortal = jest.fn().mockResolvedValue({
    validation: { ready: true },
  });
  const invalidateAllTenantCache = jest.fn().mockResolvedValue(undefined);
  const controller = new ConfigurationController(
    {} as any,
    {} as any,
    {} as any,
    { registrarHabilitacionPortal } as any,
    { invalidateAllTenantCache } as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rechaza a un usuario con configuracion.write que no es administrador', async () => {
    await expect(controller.registerColombiaDianApproval(
      { confirmed: true, evidenceReference: 'RADICADO-DIAN-123' },
      'tenant-co',
      { id: 'actor-vendedor', email: 'vendedor@example.test', roles: ['VENDEDOR'] },
      'idem-dian-approval-1',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(registrarHabilitacionPortal).not.toHaveBeenCalled();
  });

  it('registra e invalida cache para ADMIN del mismo tenant', async () => {
    await expect(controller.registerColombiaDianApproval(
      { confirmed: true, evidenceReference: 'RADICADO-DIAN-123' },
      'tenant-co',
      { id: 'actor-admin', email: 'admin@example.test', roles: ['ADMIN'] },
      'idem-dian-approval-2',
    )).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(registrarHabilitacionPortal).toHaveBeenCalledWith(
      'tenant-co', 'actor-admin', 'idem-dian-approval-2', 'RADICADO-DIAN-123',
    );
    expect(invalidateAllTenantCache).toHaveBeenCalledWith('tenant-co');
  });
});
