import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RetencionesController } from './retenciones.controller';

describe('RetencionesController security', () => {
  const permission = (method: string) => Reflect.getMetadata(
    PERMISSION_KEY,
    (RetencionesController.prototype as any)[method],
  )?.raw;

  it('combina autenticación y RBAC', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RetencionesController) || [];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, PermissionGuard]));
  });

  it('separa lectura/cálculo de los writers financieros', () => {
    expect(permission('listar')).toBe('finanzas.read');
    expect(permission('listarAnticipos')).toBe('finanzas.read');
    expect(permission('calcular')).toBe('finanzas.read');
    expect(permission('registrarAjuste')).toBe('finanzas.write');
    expect(permission('registrarAnticipo')).toBe('finanzas.write');
    expect(permission('depositarDetraccion')).toBe('finanzas.write');
    expect(permission('revertirAjusteCxc')).toBe('finanzas.write');
  });
});
