import { AuthService } from './auth.service';

describe('contexto de sesión con administrador global', () => {
  const rpc=jest.fn();
  const service=new AuthService({ getAdminClient: () => ({ rpc }) } as any, {} as any, {} as any, {} as any);
  beforeEach(() => rpc.mockReset().mockResolvedValue({ data: { valid: true }, error: null }));

  it('valida al administrador global sin inventar una empresa', async () => {
    expect(await service.validateSessionContext({ sub: 'global-admin', session_token: 'session', is_super_admin: true })).toBe(true);
    expect(rpc).toHaveBeenCalledWith('validar_contexto_sesion_auth_tx', {
      p_usuario_id: 'global-admin', p_session_token: 'session', p_tenant_id: null, p_super_admin: true,
    });
  });

  it('rechaza usuario ordinario sin contexto antes de consultar', async () => {
    expect(await service.validateSessionContext({ sub: 'ordinary', session_token: 'session' })).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('no autentica si la base rechaza el contexto aunque exista un token firmado', async () => {
    rpc.mockResolvedValueOnce({ data: { valid: false }, error: null });
    expect(await service.validateSessionContext({ sub: 'global-admin', session_token: 'session', is_super_admin: true })).toBe(false);
  });

  it('falla cerrado durante un corte de la base', async () => {
    rpc.mockRejectedValueOnce(new Error('network unavailable'));
    expect(await service.validateSessionContext({ sub: 'global-admin', session_token: 'session', is_super_admin: true })).toBe(false);
  });
});
