import { validate } from 'class-validator';
import { ConfigurationController } from './configuration.controller';
import { ActualizarEmpresaConfigurationDto } from './dto/actualizar-empresa-configuration.dto';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('ConfigurationController - reportes de ventas', () => {
  it('PUT conserva false/cero y delega actor/empresa/intención al writer; invalida cache', async () => {
    const service = { updateEmpresaPatchAtomic: jest.fn().mockResolvedValue({ habilitar_dashboards_otif: false, objetivo_otif: 0 }) };
    const cache = { invalidateAllTenantCache: jest.fn() };
    const builder: any = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: { pais_id: 1, pais: 'PE' }, error: null }) };
    const controller = new ConfigurationController(service as any, { getClient: () => ({ from: () => builder }) } as any, {} as any, {} as any, cache as any, {} as any);
    const patch = { habilitar_dashboards_otif: false, habilitar_dashboards_sunat: true, objetivo_otif: 0, frecuencia_actualizacion_dashboards: 1 };
    const result = await controller.updateEmpresaData(patch, 'tenant-a', { id: 'actor-a' } as any, 'reports-key-570');
    expect(service.updateEmpresaPatchAtomic).toHaveBeenCalledWith('tenant-a', expect.objectContaining(patch), 'actor-a', 'reports-key-570', 'EMPRESA');
    expect(result.success).toBe(true);
    expect(cache.invalidateAllTenantCache).toHaveBeenCalledWith('tenant-a');
    expect(Reflect.getMetadata(PERMISSION_KEY, controller.updateEmpresaData)).toMatchObject({ raw: 'configuracion.write' });
  });
  it.each([
    { habilitar_dashboards_otif: 'true' }, { habilitar_dashboards_sunat: null },
    { objetivo_otif: 100.01 }, { objetivo_otif: -1 }, { objetivo_otif: 95.001 }, { objetivo_otif: null },
    { frecuencia_actualizacion_dashboards: 0 }, { frecuencia_actualizacion_dashboards: 86401 }, { frecuencia_actualizacion_dashboards: 1.5 },
  ])('rechaza parámetros inválidos %j antes del writer', async patch => {
    const dto = Object.assign(new ActualizarEmpresaConfigurationDto(), patch);
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
  it('admite extremos, objetivo 95.01 y false', async () => {
    for (const objetivo_otif of [0, 95.01, 100]) {
      const dto = Object.assign(new ActualizarEmpresaConfigurationDto(), { objetivo_otif, habilitar_dashboards_otif: false, frecuencia_actualizacion_dashboards: 86400 });
      expect(await validate(dto)).toEqual([]);
    }
  });
});
