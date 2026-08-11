import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

describe('PermissionService contrato RBAC 462', () => {
  let service: PermissionService;
  let client: any;

  beforeEach(async () => {
    client = {
      rpc: jest.fn(), from: jest.fn(), select: jest.fn(), eq: jest.fn(), in: jest.fn(),
      order: jest.fn(), maybeSingle: jest.fn(),
    };
    for (const method of ['from', 'select', 'eq', 'in', 'order']) client[method].mockReturnValue(client);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: SupabaseService, useValue: { getClient: () => client } },
      ],
    }).compile();
    service = module.get(PermissionService);
  });

  it('consulta sólo permisos activos del tenant', async () => {
    client.order
      .mockReturnValueOnce(client)
      .mockReturnValueOnce(client)
      .mockResolvedValueOnce({ data: [{ id: 'perm-1', tenant_id: 'tenant-1' }], error: null });
    const result = await service.getPermissions('tenant-1');
    expect(result).toHaveLength(1);
    expect(client.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(client.eq).toHaveBeenCalledWith('activo', true);
  });

  it('superadmin sólo obtiene bypass si está activo y pertenece al tenant', async () => {
    client.maybeSingle.mockResolvedValue({
      data: { is_super_admin: true, activo: true, estado: 'ACTIVO' }, error: null,
    });
    await expect(service.checkUserPermission('user-1', 'tenant-1', 'ventas', 'read', 'pedidos')).resolves.toBe(true);
    expect(client.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
  });

  it('un superadmin inactivo no obtiene bypass', async () => {
    client.maybeSingle.mockResolvedValue({
      data: { is_super_admin: true, activo: false, estado: 'INACTIVO' }, error: null,
    });
    client.eq.mockReturnValueOnce(client).mockReturnValueOnce(client).mockResolvedValueOnce({ data: [], error: null });
    await expect(service.checkUserPermission('user-1', 'tenant-1', 'ventas', 'read', 'pedidos')).resolves.toBe(false);
  });

  it('asigna permiso mediante una sola RPC con actor', async () => {
    client.rpc.mockResolvedValue({ data: {}, error: null });
    jest.spyOn(service as any, 'invalidateCacheForRoleUsers').mockResolvedValue(undefined);
    await service.assignPermissionToRole('tenant-1', 'role-1', 'perm-1', 'actor-1');
    expect(client.rpc).toHaveBeenCalledWith('asignar_permisos_rol_rbac_tx', {
      p_rol_id: 'role-1', p_tenant_id: 'tenant-1', p_actor_id: 'actor-1',
      p_permission_ids: ['perm-1'], p_mode: 'ADD',
    });
  });

  it('revoca permiso mediante el mismo writer transaccional', async () => {
    client.rpc.mockResolvedValue({ data: {}, error: null });
    jest.spyOn(service as any, 'invalidateCacheForRoleUsers').mockResolvedValue(undefined);
    await service.revokePermissionFromRole('tenant-1', 'role-1', 'perm-1', 'actor-1');
    expect(client.rpc).toHaveBeenCalledWith('asignar_permisos_rol_rbac_tx', expect.objectContaining({ p_mode: 'REMOVE' }));
  });

  it('rechaza asignación sin actor', async () => {
    await expect(service.assignPermissionToRole('tenant-1', 'role-1', 'perm-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('invalida sólo las entradas del usuario indicado', () => {
    const cache = (service as any).permissionCache as Map<string, any>;
    cache.set('user-1:tenant-1:x', { permissions: ['x'], timestamp: Date.now() });
    cache.set('user-2:tenant-1:x', { permissions: ['x'], timestamp: Date.now() });
    service.invalidateUserPermissions('user-1');
    expect(cache.has('user-1:tenant-1:x')).toBe(false);
    expect(cache.has('user-2:tenant-1:x')).toBe(true);
  });
});
