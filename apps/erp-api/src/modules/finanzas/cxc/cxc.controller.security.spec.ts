import { PERMISSION_KEY } from '../../../common/decorators/require-permission.decorator';
import { CxcController } from './cxc.controller';

describe('CxcController permission contract', () => {
  const permissionFor = (method: keyof CxcController) =>
    Reflect.getMetadata(PERMISSION_KEY, CxcController.prototype[method]);

  it('exige el permiso financiero de cobros al registrar un pago CxC', () => {
    expect(permissionFor('registrarPago')?.raw).toBe('finanzas.cxc.cobros.write');
  });

  it('mantiene el mismo permiso financiero en las acciones de cobranza', () => {
    expect(permissionFor('aplicarNotaCredito')?.raw).toBe('finanzas.cxc.cobros.write');
    expect(permissionFor('reprogramarCuenta')?.raw).toBe('finanzas.cxc.cobros.write');
  });
});
