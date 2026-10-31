import { HttpException } from '@nestjs/common';
import { validate } from 'class-validator';
import { ConfigurationController } from './configuration.controller';
import { ActualizarEmpresaConfigurationDto } from './dto/actualizar-empresa-configuration.dto';

function setup() {
  const service = { updateEmpresaPatchAtomic: jest.fn().mockResolvedValue({}) };
  const cache = { invalidateAllTenantCache: jest.fn() };
  const builder: any = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: { pais_id: 1, pais: 'PE' }, error: null }) };
  const controller = new ConfigurationController(service as any, { getClient: () => ({ from: () => builder }) } as any, {} as any, {} as any, cache as any, {} as any);
  return { service, cache, controller };
}

describe('Company optional fields · explicit clear versus omitted patch', () => {
  it('omitted profile fields do not clear values; actor and key reach the atomic writer', async () => {
    const { controller, service, cache } = setup();
    await controller.updateEmpresaData({}, 'tenant-a', { id: 'actor-a' } as any, 'company-key-570');
    const patch = service.updateEmpresaPatchAtomic.mock.calls[0][1];
    for (const field of ['razon_social', 'direccion_fiscal', 'nombre_comercial', 'telefono', 'email']) expect(patch).not.toHaveProperty(field);
    expect(service.updateEmpresaPatchAtomic).toHaveBeenCalledWith('tenant-a', expect.any(Object), 'actor-a', 'company-key-570', 'EMPRESA');
    expect(cache.invalidateAllTenantCache).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['nombreComercial', 'nombre_comercial'], ['telefono', 'telefono'], ['email', 'email'],
  ])('%s explicit empty, whitespace and null clear only its own column', async (field, column) => {
    for (const value of ['', '  ', null]) {
      const { controller, service } = setup();
      await controller.updateEmpresaData({ [field]: value } as any, 'tenant-a', { id: 'actor-a' } as any, 'company-key-570');
      const patch = service.updateEmpresaPatchAtomic.mock.calls[0][1];
      expect(patch[column]).toBeNull();
      for (const other of ['nombre_comercial', 'telefono', 'email'].filter(name => name !== column)) expect(patch).not.toHaveProperty(other);
    }
  });
  it.each([
    ['nombreComercial', 'nombre_comercial', '  Empresa  '], ['telefono', 'telefono', '  987570011  '], ['email', 'email', '  empresa@uat.local  '],
  ])('%s nonempty value is preserved without surrounding whitespace', async (field, column, value) => {
    const { controller, service } = setup();
    await controller.updateEmpresaData({ [field]: value }, 'tenant-a', { id: 'actor-a' } as any, 'company-key-570');
    expect(service.updateEmpresaPatchAtomic.mock.calls[0][1][column]).toBe(value.trim());
  });
  it.each(['razonSocial', 'direccion'])('%s cannot be explicitly cleared before the writer', async field => {
    for (const value of ['', '  ', null]) {
      const { controller, service, cache } = setup();
      await expect(controller.updateEmpresaData({ [field]: value } as any, 'tenant-a', { id: 'actor-a' } as any, 'company-key-570')).rejects.toMatchObject({ status: 400 });
      expect(service.updateEmpresaPatchAtomic).not.toHaveBeenCalled();expect(cache.invalidateAllTenantCache).not.toHaveBeenCalled();
    }
  });
  it.each(['nombreComercial', 'telefono', 'email'])('%s rejects nontext values in DTO and controller', async field => {
    for (const value of [false, 0, [], {}]) {
      expect((await validate(Object.assign(new ActualizarEmpresaConfigurationDto(), { [field]: value }))).length).toBeGreaterThan(0);
      const { controller, service } = setup();
      await expect(controller.updateEmpresaData({ [field]: value } as any, 'tenant-a', { id: 'actor-a' } as any, 'company-key-570')).rejects.toBeInstanceOf(HttpException);
      expect(service.updateEmpresaPatchAtomic).not.toHaveBeenCalled();
    }
  });
});
