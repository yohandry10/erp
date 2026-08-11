import { UsuariosController } from './usuarios.controller';

const createController = (client: any, userManagement: any = {}) =>
  new UsuariosController(
    { getClient: () => client } as any,
    {} as any,
    {} as any,
    userManagement as any,
  );

describe('UsuariosController security', () => {
  it('no selecciona campos sensibles al listar usuarios', async () => {
    const limit = jest.fn().mockResolvedValue({ data: [], error: null });
    const order = jest.fn().mockReturnValue({ limit });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    const controller = createController({ from: jest.fn().mockReturnValue({ select }) });
    await controller.getUsuarios({ tenantId: 'tenant-1', user: { id: 'admin-1' } });
    const selectSql = select.mock.calls[0][0] as string;
    expect(selectSql).not.toContain('*');
    expect(selectSql).not.toContain('password_hash');
    expect(selectSql).not.toContain('password_reset_token');
  });

  it('el alias visual actualiza sólo campos permitidos y delega roles a la RPC', async () => {
    const updateUser = jest.fn().mockResolvedValue({ id: 'user-1', nombre: 'Seguro' });
    const controller = createController({}, { updateUser });
    await controller.actualizarUsuario(
      'user-1',
      {
        nombre: 'Seguro', rol_id: 'role-1', password_hash: 'no',
        password_reset_token: 'no', is_super_admin: true,
      },
      { tenantId: 'tenant-1', user: { id: 'admin-1' } },
    );
    expect(updateUser).toHaveBeenCalledWith(
      'tenant-1', 'user-1',
      expect.objectContaining({ nombre: 'Seguro', roles: ['role-1'] }),
      'admin-1',
    );
    const changes = updateUser.mock.calls[0][2];
    expect(changes).not.toHaveProperty('password_hash');
    expect(changes).not.toHaveProperty('password_reset_token');
    expect(changes).not.toHaveProperty('is_super_admin');
  });
});
