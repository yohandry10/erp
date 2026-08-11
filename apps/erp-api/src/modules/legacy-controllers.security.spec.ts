import { PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { ConfiguracionController } from './configuracion.controller';
import { ConfiguracionFiscalController } from './configuracion/configuracion-fiscal.controller';
import { ConfigurationController } from './configuracion/configuration.controller';
import { FinanzasController } from './finanzas.controller';

describe('Legacy ERP controllers security metadata', () => {
  type ControllerClass = {
    prototype: object;
  };

  const getClassPermission = (controller: ControllerClass) =>
    Reflect.getMetadata(PERMISSION_KEY, controller as object);

  const getHandlerPermission = (
    controller: ControllerClass,
    methodName: string,
  ) =>
    Reflect.getMetadata(
      PERMISSION_KEY,
      (controller.prototype as Record<string, unknown>)[methodName],
    );

  it('declara permisos por defecto en controladores legacy autenticados', () => {
    expect(getClassPermission(ConfiguracionController)?.raw).toBe('configuracion.read');
    expect(getClassPermission(ConfiguracionFiscalController)?.raw).toBe('configuracion.read');
    expect(getClassPermission(ConfigurationController)?.raw).toBe('configuracion.read');
    expect(getClassPermission(FinanzasController)?.raw).toBe('finanzas.read');
  });

  it('declara permisos de escritura en handlers mutables de configuracion', () => {
    [
      'verificarConectividadSunat',
      'updateDatosEmpresa',
      'updateSerie',
      'updateParametrosFacturacion',
      'uploadCertificado',
    ].forEach((methodName) => {
      expect(getHandlerPermission(ConfiguracionController, methodName)?.raw).toBe(
        'configuracion.write',
      );
    });
  });

  it('declara permisos de escritura en handlers mutables de configuration', () => {
    [
      'validateWizardCertificate',
      'saveWizardStep',
      'resetWizard',
      'completeConfiguration',
      'updateGREThresholds',
      'updateEmpresaData',
    ].forEach((methodName) => {
      expect(getHandlerPermission(ConfigurationController, methodName)?.raw).toBe(
        'configuracion.write',
      );
    });
  });

  it('declara permiso de escritura para analisis de credito', () => {
    expect(getHandlerPermission(FinanzasController, 'getAnalisisCredito')?.raw).toBe(
      'finanzas.write',
    );
  });
});
