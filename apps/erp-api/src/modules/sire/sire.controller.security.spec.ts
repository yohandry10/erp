import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { SireController } from './sire.controller';

describe('SireController security metadata', () => {
  const expectedPermissions: Record<string, string> = {
    getStats: 'sire.read',
    getReportes: 'sire.read',
    generarReporte: 'sire.emitir',
    downloadReporte: 'sire.read',
    enviarSunat: 'sire.emitir',
    testEvento: 'system.debug',
    testIntegracionPOS: 'system.debug',
    findAll: 'sire.read',
  };

  it('declara permisos en todos los handlers', () => {
    Object.entries(expectedPermissions).forEach(([methodName, permission]) => {
      const metadata = Reflect.getMetadata(
        PERMISSION_KEY,
        (SireController.prototype as unknown as Record<string, unknown>)[methodName],
      );

      expect(metadata).toBeDefined();
      expect(metadata.raw).toBe(permission);
    });
  });
});
