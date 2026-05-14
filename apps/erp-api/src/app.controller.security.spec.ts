import { PERMISSION_KEY } from './common/decorators/require-permission.decorator';
import { AppController } from './app.controller';

describe('AppController security metadata', () => {
  it('protege el diagnostico de conexion con permiso system.debug', () => {
    const metadata = Reflect.getMetadata(
      PERMISSION_KEY,
      AppController.prototype.testConnection,
    );

    expect(metadata?.raw).toBe('system.debug');
  });
});
