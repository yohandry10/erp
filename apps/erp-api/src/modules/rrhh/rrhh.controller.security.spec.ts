import { PERMISSION_KEY, ParsedPermission } from '../../common/decorators/require-permission.decorator';
import { RrhhController } from './rrhh.controller';

function permissionFor(method: keyof RrhhController): ParsedPermission {
  return Reflect.getMetadata(PERMISSION_KEY, RrhhController.prototype[method]);
}

describe('RrhhController RBAC contable', () => {
  it('separa la consulta de planillas del acceso global de RRHH', () => {
    expect(permissionFor('getPlanillas')).toMatchObject({
      module: 'rrhh',
      resource: 'planillas',
      action: 'read',
    });
    expect(permissionFor('getDetallePlanilla')).toMatchObject({
      module: 'rrhh',
      resource: 'planillas',
      action: 'read',
    });
    expect(permissionFor('getBoleta')).toMatchObject({
      module: 'rrhh',
      resource: 'planillas',
      action: 'read',
    });
    expect(permissionFor('generarAsientosContables')).toMatchObject({
      module: 'rrhh',
      resource: 'planillas',
      action: 'accounting',
    });
  });

  it('distingue lectura y escritura de PLAME/T-Registro', () => {
    for (const method of [
      'previsualizarPlanillaElectronicaPeru',
      'historialPlanillaElectronicaPeru',
      'descargarPaquetePlanillaElectronicaPeru',
    ] as const) {
      expect(permissionFor(method)).toMatchObject({
        module: 'rrhh',
        resource: 'planilla_electronica',
        action: 'read',
      });
    }

    for (const method of [
      'guardarFichaLaboralPeru',
      'guardarJornadaPlamePeru',
      'guardarPaquetePlanillaElectronicaPeru',
      'registrarEvidenciaPlanillaElectronicaPeru',
    ] as const) {
      expect(permissionFor(method)).toMatchObject({
        module: 'rrhh',
        resource: 'planilla_electronica',
        action: 'write',
      });
    }
  });
});
