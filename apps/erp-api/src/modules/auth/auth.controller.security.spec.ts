import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { AuthController } from './auth.controller';

describe('AuthController security metadata', () => {
  it('protege switch-tenant con permiso explicito de gestion de tenants', () => {
    const metadata = Reflect.getMetadata(
      PERMISSION_KEY,
      AuthController.prototype.switchTenant,
    );

    expect(metadata?.raw).toBe('tenants.manage');
  });
});
