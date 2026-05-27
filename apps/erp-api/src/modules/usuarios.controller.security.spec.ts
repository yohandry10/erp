import { UsuariosController } from './usuarios.controller';

const createController = (client: any) =>
  new UsuariosController(
    {
      getClient: () => client,
    } as any,
    {} as any,
    {} as any,
    { registrarCambio: jest.fn().mockResolvedValue(undefined) } as any,
  );

describe('UsuariosController security', () => {
  it('no selecciona campos sensibles ni columnas inexistentes al listar usuarios', async () => {
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    const client = { from: jest.fn().mockReturnValue({ select }) };
    const controller = createController(client);

    await controller.getUsuarios({ tenantId: 'tenant-1', user: { id: 'admin-1' } });

    const selectSql = select.mock.calls[0][0] as string;
    expect(selectSql).not.toContain('*');
    expect(selectSql).not.toContain('password_hash');
    expect(selectSql).not.toContain('password_reset_token');
    expect(selectSql).not.toContain('password_reset_expires');
    expect(selectSql).not.toContain('permisos');
  });

  it('remueve campos sensibles del payload al actualizar usuarios', async () => {
    // getDemoContext() corre al inicio de actualizarUsuario: lee empresa_config
    // con cadena from.select.eq.single (1 sola eq). Si no se mockea, el chain
    // explota cuando el controller llega al SELECT real de usuarios_sistema
    // porque el "primer from()" devuelve un objeto sin el shape correcto.
    const demoSingle = jest.fn().mockResolvedValue({
      data: { is_demo: false, demo_expires_at: null },
      error: null,
    });
    const demoEqTenant = jest.fn().mockReturnValue({ single: demoSingle });
    const demoSelect = jest.fn().mockReturnValue({ eq: demoEqTenant });

    const fetchSingle = jest.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null });
    const fetchEqTenant = jest.fn().mockReturnValue({ single: fetchSingle });
    const fetchEqId = jest.fn().mockReturnValue({ eq: fetchEqTenant });
    const fetchSelect = jest.fn().mockReturnValue({ eq: fetchEqId });

    const updateSingle = jest.fn().mockResolvedValue({
      data: { id: 'user-1', email: 'user@example.com' },
      error: null,
    });
    const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
    const updateEqTenant = jest.fn().mockReturnValue({ select: updateSelect });
    const updateEqId = jest.fn().mockReturnValue({ eq: updateEqTenant });
    const update = jest.fn().mockReturnValue({ eq: updateEqId });

    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce({ select: demoSelect })   // 1° empresa_config (getDemoContext)
        .mockReturnValueOnce({ select: fetchSelect })  // 2° usuarios_sistema (fetch)
        .mockReturnValueOnce({ update }),              // 3° usuarios_sistema (update)
    };
    const controller = createController(client);

    await controller.actualizarUsuario(
      'user-1',
      {
        nombre: 'Usuario Seguro',
        password: 'plain',
        password_hash: 'hash',
        password_reset_token: 'token',
        password_reset_expires: '2030-01-01',
        failed_login_attempts: 99,
        locked_until: '2030-01-01',
        is_super_admin: true,
      },
      { tenantId: 'tenant-1', user: { id: 'admin-1' } },
    );

    const payload = update.mock.calls[0][0];
    expect(payload).toMatchObject({ nombre: 'Usuario Seguro' });
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('password_hash');
    expect(payload).not.toHaveProperty('password_reset_token');
    expect(payload).not.toHaveProperty('password_reset_expires');
    expect(payload).not.toHaveProperty('failed_login_attempts');
    expect(payload).not.toHaveProperty('locked_until');
    expect(payload).not.toHaveProperty('is_super_admin');
  });
});
