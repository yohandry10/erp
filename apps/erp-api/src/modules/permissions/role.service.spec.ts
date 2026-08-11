import { ForbiddenException } from '@nestjs/common';
import { RoleService } from './role.service';

describe('RoleService contrato atómico 462', () => {
  const rpc = jest.fn();
  const service = new RoleService({ getClient: () => ({ rpc }) } as any);

  beforeEach(() => rpc.mockReset());

  it('crea rol y permisos iniciales mediante una RPC idempotente', async () => {
    rpc.mockResolvedValue({ data: { id: 'role-1', nombre: 'OPERADOR' }, error: null });
    await service.createRole(
      'tenant-1',
      {
        idempotency_key: '11111111-1111-4111-8111-111111111111',
        nombre: 'Operador', permission_ids: ['perm-1'],
      },
      'actor-1',
    );
    expect(rpc).toHaveBeenCalledWith('crear_rol_rbac_tx', {
      p_tenant_id: 'tenant-1', p_actor_id: 'actor-1',
      p_idempotency_key: '11111111-1111-4111-8111-111111111111',
      p_rol: { nombre: 'Operador', descripcion: undefined }, p_permission_ids: ['perm-1'],
    });
  });

  it('actualiza rol y reemplaza permisos en la misma RPC', async () => {
    rpc.mockResolvedValue({ data: { id: 'role-1' }, error: null });
    await service.updateRole('tenant-1', 'role-1', { descripcion: 'Nueva', permission_ids: ['perm-2'] }, 'actor-1');
    expect(rpc).toHaveBeenCalledWith('actualizar_rol_rbac_tx', {
      p_rol_id: 'role-1', p_tenant_id: 'tenant-1', p_actor_id: 'actor-1',
      p_cambios: { descripcion: 'Nueva' }, p_permission_ids: ['perm-2'],
    });
  });

  it('delete es desactivación trazable y no borrado directo', async () => {
    rpc.mockResolvedValue({ data: { id: 'role-1', activo: false }, error: null });
    await service.deleteRole('tenant-1', 'role-1', 'actor-1');
    expect(rpc).toHaveBeenCalledWith('desactivar_rol_rbac_tx', {
      p_rol_id: 'role-1', p_tenant_id: 'tenant-1', p_actor_id: 'actor-1',
    });
  });

  it('rechaza mutación sin actor', async () => {
    await expect(service.deleteRole('tenant-1', 'role-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpc).not.toHaveBeenCalled();
  });
});
