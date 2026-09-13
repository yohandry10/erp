import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';
import { CurrentUser as CanonicalCurrentUser } from '../../common/decorators/current-user.decorator';

class ExampleController {
  handler(@CurrentUser('id') id: string, @CurrentUser() user: unknown) { return { id, user }; }
}

describe('CurrentUser compartido', () => {
  const metadata = Object.values(Reflect.getMetadata(ROUTE_ARGS_METADATA, ExampleController, 'handler')) as any[];
  const resolve = (index: number, user?: unknown) => {
    const param = metadata.find(value => value.index === index);
    return param.factory(param.data, { switchToHttp: () => ({ getRequest: () => ({ user }) }) });
  };
  it('mantiene una sola implementación entre imports legacy y comunes', () => {
    expect(CurrentUser).toBe(CanonicalCurrentUser);
  });
  it('resuelve el id sin convertir el objeto autenticado en texto', () => {
    expect(resolve(0, { id: 'actor-local', tenant_id: 'tenant-local' })).toBe('actor-local');
  });
  it('preserva el usuario completo para los controladores que lo solicitan', () => {
    const user = { id: 'actor-local', tenant_id: 'tenant-local' };
    expect(resolve(1, user)).toBe(user);
  });
  it('no inventa actor si falta el contexto autenticado', () => {
    expect(resolve(0)).toBeUndefined();
    expect(resolve(1)).toBeUndefined();
  });
});
