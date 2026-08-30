import { validate } from 'class-validator';
import { ActualizarEmpresaConfigurationDto } from './actualizar-empresa-configuration.dto';

describe('ActualizarEmpresaConfigurationDto · ARCA', () => {
  it.each([
    [{ arca_punto_venta: 99999 }, 'max'],
    [{ arca_condicion_iva: 'CONSUMIDOR_FINAL' }, 'isIn'],
    [{ arca_environment: 'staging' }, 'isIn'],
    [{ arca_wsaa_url: 'http://127.0.0.1:3000/steal' }, 'isIn'],
    [{ arca_wsfe_url: 'https://servicios1.afip.gov.ar@attacker.invalid/wsfev1/service.asmx' }, 'isIn'],
  ])('rechaza configuración fiscal AR inválida %#', async (patch, constraint) => {
    const dto = Object.assign(new ActualizarEmpresaConfigurationDto(), patch);
    const errors = await validate(dto);
    expect(errors.some((error) => Boolean(error.constraints?.[constraint]))).toBe(true);
  });

  it('acepta punto 99998 y condición de emisor soportada', async () => {
    const dto = Object.assign(new ActualizarEmpresaConfigurationDto(), {
      arca_punto_venta: 99998,
      arca_condicion_iva: 'RESPONSABLE_INSCRIPTO',
      arca_environment: 'produccion',
      arca_wsaa_url: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
      arca_wsfe_url: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });
});
