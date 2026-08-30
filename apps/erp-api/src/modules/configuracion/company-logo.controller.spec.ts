import { ConfigurationController } from './configuration.controller';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { BadRequestException } from '@nestjs/common';
import { ConfiguracionController } from '../configuracion.controller';

describe('ConfigurationController - logo empresarial', () => {
  const companyLogoService = {
    upload: jest.fn(),
    remove: jest.fn(),
  };
  const cacheInvalidation = { invalidateAllTenantCache: jest.fn() };
  const controller = new ConfigurationController(
    {} as any,
    {} as any,
    { get: jest.fn() } as any,
    {} as any,
    cacheInvalidation as any,
    companyLogoService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('POST delega el multipart file y devuelve data.logo_url', async () => {
    const file = {
      buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
      mimetype: 'image/png',
      size: 8,
    };
    companyLogoService.upload.mockResolvedValue({
      logo_url: 'https://prod/storage/v1/object/public/company-assets/t/logo.png',
      completed: true,
    });

    const response = await controller.uploadEmpresaLogo(
      'tenant-1',
      { id: 'actor-1' } as any,
      'logo-upload-key',
      file,
    );

    expect(companyLogoService.upload).toHaveBeenCalledWith(
      'tenant-1', 'actor-1', 'logo-upload-key', file,
    );
    expect(response.data.logo_url).toContain('/company-assets/');
    expect(cacheInvalidation.invalidateAllTenantCache).toHaveBeenCalledWith('tenant-1');
  });

  it('DELETE es idempotente y siempre devuelve logo_url nulo', async () => {
    companyLogoService.remove.mockResolvedValue({ completed: true, estado: 'SIN_OBJETO' });
    const response = await controller.deleteEmpresaLogo(
      'tenant-1',
      { id: 'actor-1' } as any,
      'logo-delete-key',
    );
    expect(companyLogoService.remove).toHaveBeenCalledWith(
      'tenant-1', 'actor-1', 'logo-delete-key',
    );
    expect(response.data.logo_url).toBeNull();
  });

  it('ambas rutas exigen configuracion.write', () => {
    expect(Reflect.getMetadata(
      PERMISSION_KEY,
      ConfigurationController.prototype.uploadEmpresaLogo,
    )?.raw).toBe('configuracion.write');
    expect(Reflect.getMetadata(
      PERMISSION_KEY,
      ConfigurationController.prototype.deleteEmpresaLogo,
    )?.raw).toBe('configuracion.write');
  });

  it('PUT empresa rechaza data URLs y obliga a usar el endpoint dedicado', async () => {
    await expect(controller.updateEmpresaData(
      { pais: 'PE', pais_id: 1, logoUrl: 'data:image/png;base64,AAAA' } as any,
      '11111111-1111-4111-8111-111111111111',
      { id: 'actor-1' } as any,
      'empresa-update-key',
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PUT empresa rechaza también el alias legacy logo_url', async () => {
    await expect(controller.updateEmpresaData(
      { pais: 'PE', pais_id: 1, logo_url: 'https://attacker.invalid/logo.png' } as any,
      '11111111-1111-4111-8111-111111111111',
      { id: 'actor-1' } as any,
      'empresa-update-key',
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el PUT legado /configuracion/empresa tampoco puede escribir el logo', async () => {
    const legacy = new ConfiguracionController(
      {} as any,
      {} as any,
      {} as any,
      { updateEmpresaPatchAtomic: jest.fn() } as any,
    );
    await expect(legacy.updateDatosEmpresa(
      { logoUrl: 'https://attacker.invalid/logo.png' } as any,
      'tenant-1',
      { user: { id: 'actor-1' } },
      'legacy-update-key',
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});
