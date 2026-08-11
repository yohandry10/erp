import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EmailService } from '../../shared/email/email.service';
import { PermissionService } from '../permissions/permission.service';

describe('UserManagementService contrato atómico 462', () => {
  let service: UserManagementService;
  let rpc: jest.Mock;
  let email: { sendUserActivationEmail: jest.Mock; sendPasswordResetEmail: jest.Mock };
  let permission: { invalidateUserPermissions: jest.Mock };

  beforeEach(async () => {
    rpc = jest.fn();
    email = {
      sendUserActivationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    permission = { invalidateUserPermissions: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserManagementService,
        { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } },
        { provide: EmailService, useValue: email },
        { provide: PermissionService, useValue: permission },
      ],
    }).compile();
    service = module.get(UserManagementService);
  });

  it('crea usuario, roles y auditoría mediante una única RPC con actor e idempotencia', async () => {
    rpc.mockResolvedValue({ data: { id: 'user-1', idempotent: false }, error: null });
    const result = await service.createUser(
      'tenant-1',
      {
        idempotency_key: '11111111-1111-4111-8111-111111111111',
        nombre: 'Usuario',
        email: 'user@example.com',
        password: 'Password1!',
        roles: ['22222222-2222-4222-8222-222222222222'],
      },
      'actor-1',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('crear_usuario_rbac_tx', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_actor_id: 'actor-1',
      p_idempotency_key: '11111111-1111-4111-8111-111111111111',
      p_role_ids: ['22222222-2222-4222-8222-222222222222'],
      p_usuario: expect.objectContaining({ email: 'user@example.com', password_hash: expect.any(String) }),
    }));
    expect(email.sendUserActivationEmail).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'user-1', temporaryPassword: 'Password1!' });
  });

  it('un retry idempotente no vuelve a enviar credenciales', async () => {
    rpc.mockResolvedValue({ data: { id: 'user-1', idempotent: true }, error: null });
    await service.createUser(
      'tenant-1',
      {
        idempotency_key: '11111111-1111-4111-8111-111111111111',
        nombre: 'Usuario', email: 'user@example.com', password: 'Password1!',
        roles: ['22222222-2222-4222-8222-222222222222'],
      },
      'actor-1',
    );
    expect(email.sendUserActivationEmail).not.toHaveBeenCalled();
  });

  it('rechaza mutaciones sin actor antes de tocar la base', async () => {
    await expect(service.createUser(
      'tenant-1',
      {
        idempotency_key: '11111111-1111-4111-8111-111111111111',
        nombre: 'Usuario', email: 'user@example.com', roles: ['role-1'],
      },
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('actualiza datos y reemplaza roles en la misma RPC', async () => {
    rpc.mockResolvedValue({ data: { id: 'user-1', nombre: 'Editado' }, error: null });
    await service.updateUser(
      'tenant-1', 'user-1',
      { nombre: 'Editado', roles: ['role-2'] },
      'actor-1',
    );
    expect(rpc).toHaveBeenCalledWith('actualizar_usuario_rbac_tx', {
      p_usuario_id: 'user-1', p_tenant_id: 'tenant-1', p_actor_id: 'actor-1',
      p_cambios: { nombre: 'Editado' }, p_role_ids: ['role-2'],
    });
    expect(permission.invalidateUserPermissions).toHaveBeenCalledWith('user-1');
  });

  it('asigna y remueve roles sólo por el writer transaccional', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await service.assignRoles('tenant-1', 'user-1', ['role-1'], 'actor-1');
    await service.removeRoles('tenant-1', 'user-1', ['role-1'], 'actor-1');
    expect(rpc.mock.calls).toEqual([
      ['asignar_roles_usuario_rbac_tx', expect.objectContaining({ p_mode: 'ADD', p_actor_id: 'actor-1' })],
      ['asignar_roles_usuario_rbac_tx', expect.objectContaining({ p_mode: 'REMOVE', p_actor_id: 'actor-1' })],
    ]);
  });

  it('desactivar usuario delega revocación de sesiones a la RPC', async () => {
    rpc.mockResolvedValue({ data: { id: 'user-1', estado: 'INACTIVO' }, error: null });
    await service.deactivateUser('tenant-1', 'user-1', 'actor-1');
    expect(rpc).toHaveBeenCalledWith('cambiar_estado_usuario_rbac_tx', {
      p_usuario_id: 'user-1', p_tenant_id: 'tenant-1', p_actor_id: 'actor-1', p_estado: 'INACTIVO',
    });
  });

  it('rota una credencial demo y revoca sesiones dentro del writer 462', async () => {
    rpc.mockResolvedValue({ data: { id: 'user-1', is_demo_user: true }, error: null });
    await service.rotateDemoCredential(
      'tenant-1', 'user-1', 'DemoPassword1!', { nombre: 'Demo' }, 'actor-1',
    );
    expect(rpc).toHaveBeenCalledWith('actualizar_credencial_demo_usuario_rbac_tx', {
      p_usuario_id: 'user-1',
      p_tenant_id: 'tenant-1',
      p_actor_id: 'actor-1',
      p_password_hash: expect.any(String),
      p_perfil: { nombre: 'Demo' },
    });
    expect(permission.invalidateUserPermissions).toHaveBeenCalledWith('user-1');
  });

  it('limpia flags demo sólo mediante la RPC tenant-scoped', async () => {
    rpc.mockResolvedValue({ data: { tenant_id: 'tenant-1', usuarios_actualizados: 1 }, error: null });
    await service.clearDemoUsers('tenant-1', 'actor-1');
    expect(rpc).toHaveBeenCalledWith('desmarcar_usuarios_demo_rbac_tx', {
      p_tenant_id: 'tenant-1', p_actor_id: 'actor-1',
    });
  });
});
