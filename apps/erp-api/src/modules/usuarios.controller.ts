import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { TenantContextService } from '../shared/tenant/tenant-context.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionService } from './permissions/permission.service';
import { UserEstado } from './usuarios/dto';
import { UserManagementService } from './usuarios/user-management.service';

const USER_SAFE_COLUMNS = `
  id, tenant_id, email, nombre, apellido, telefono, cargo, departamento,
  activo, estado, is_super_admin, is_demo_user, fecha_ultimo_acceso,
  created_at, updated_at,
  roles_usuario:user_roles!user_roles_usuario_sistema_id_fkey(
    role_id,
    roles!user_roles_role_id_fkey(id, nombre, descripcion, activo)
  )
`;

const DEMO_RECOMMENDED_ROLE_NAMES = new Set([
  'ADMIN_DEMO', 'GERENCIA', 'COMPRAS', 'ALMACEN', 'VENDEDOR',
  'CAJERO', 'FINANZAS', 'CONTADOR', 'RRHH',
]);

@ApiTags('usuarios-sistema')
@Controller(['usuarios-sistema', 'usuarios'])
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsuariosController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly permissionService: PermissionService,
    private readonly tenantContext: TenantContextService,
    private readonly userManagementService: UserManagementService,
  ) {}

  private resolveTenantOrThrow(req: any): string {
    const value = req?.tenantId || req?.tenant_id || req?.user?.tenant_id
      || req?.headers?.['x-tenant-id'] || req?.headers?.['x-tenant'] || req?.headers?.['tenant-id'];
    const tenantId = value?.toString().trim();
    if (!tenantId) throw new BadRequestException('Tenant requerido en la sesión actual');
    req.tenantId = tenantId;
    req.tenant_id = tenantId;
    return tenantId;
  }

  private requireActor(req: any): string {
    const actor = req?.user?.id?.toString().trim();
    if (!actor) throw new ForbiddenException('Usuario no autenticado');
    return actor;
  }

  private normalizeEstado(value?: string): UserEstado {
    const normalized = (value || 'ACTIVO').trim().toUpperCase();
    if (!Object.values(UserEstado).includes(normalized as UserEstado)) {
      throw new BadRequestException('Estado de usuario inválido');
    }
    return normalized as UserEstado;
  }

  @Get('/')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Listar usuarios del tenant' })
  async getUsuarios(
    @Req() req: any,
    @Query('rol') rol?: string,
    @Query('estado') estado?: string,
    @Query('activo') activo?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = this.resolveTenantOrThrow(req);
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const { data, error } = await this.supabaseService.getClient()
      .from('usuarios_sistema')
      .select(USER_SAFE_COLUMNS)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (error) throw new BadRequestException(`Error cargando usuarios: ${error.message}`);
    let users = data || [];
    if (estado && estado !== 'todos') users = users.filter((user: any) => user.estado === estado.toUpperCase());
    if (activo === 'true' || activo === 'false') users = users.filter((user: any) => user.activo === (activo === 'true'));
    if (rol && rol !== 'todos') {
      users = users.filter((user: any) => (user.roles_usuario || []).some((link: any) => link.role_id === rol));
    }
    return { success: true, data: users };
  }

  @Get('/stats')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Métricas de usuarios y roles' })
  async getStats(@Req() req: any) {
    const tenantId = this.resolveTenantOrThrow(req);
    const [usersResult, rolesResult] = await Promise.all([
      this.supabaseService.getClient().from('usuarios_sistema')
        .select('id, activo, estado').eq('tenant_id', tenantId),
      this.supabaseService.getClient().from('roles')
        .select('id').eq('tenant_id', tenantId).eq('activo', true),
    ]);
    if (usersResult.error || rolesResult.error) throw new BadRequestException('Error calculando estadísticas de acceso');
    const users = usersResult.data || [];
    return {
      success: true,
      data: {
        totalUsuarios: users.length,
        usuariosActivos: users.filter((user: any) => user.activo && user.estado === 'ACTIVO').length,
        usuariosInactivos: users.filter((user: any) => !user.activo || user.estado !== 'ACTIVO').length,
        totalRoles: (rolesResult.data || []).length,
      },
    };
  }

  @Get('/roles')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Roles activos con usuarios y permisos' })
  async getRoles(@Req() req: any) {
    const tenantId = this.resolveTenantOrThrow(req);
    const { data, error } = await this.supabaseService.getClient()
      .from('roles')
      .select(`
        id, tenant_id, nombre, descripcion, is_system_role, activo,
        user_roles!user_roles_role_id_fkey(
          usuario_sistema_id,
          usuarios_sistema!user_roles_usuario_sistema_id_fkey(id, estado, activo)
        ),
        rol_permisos(concedido, permisos(id, tenant_id, modulo, recurso, accion, activo))
      `)
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) throw new BadRequestException(`Error cargando roles: ${error.message}`);
    const roles = (data || []).map((role: any) => {
      const permissions = (role.rol_permisos || [])
        .filter((link: any) => link.concedido)
        .flatMap((link: any) => Array.isArray(link.permisos) ? link.permisos : [link.permisos])
        .filter((permission: any) => permission?.tenant_id === tenantId && permission?.activo);
      const summaries = [...new Set(permissions.map((permission: any) =>
        `${permission.modulo}.${permission.recurso || '__global__'}.${permission.accion}`,
      ))];
      return {
        ...role,
        usuariosCount: (role.user_roles || []).length,
        usuariosActivos: (role.user_roles || []).filter((link: any) => {
          const user = Array.isArray(link.usuarios_sistema) ? link.usuarios_sistema[0] : link.usuarios_sistema;
          return user?.activo && user?.estado === 'ACTIVO';
        }).length,
        permisos: summaries,
        permisosDetalle: permissions,
        recomendadoDemo: DEMO_RECOMMENDED_ROLE_NAMES.has(String(role.nombre).toUpperCase()),
      };
    }).sort((a: any, b: any) => Number(b.recomendadoDemo) - Number(a.recomendadoDemo) || a.nombre.localeCompare(b.nombre));
    return { success: true, data: roles };
  }

  @Post('/crear')
  @RequirePermission('configuracion', 'crear', 'usuarios')
  @ApiOperation({ summary: 'Crear usuario mediante el writer RBAC canónico' })
  @ApiResponse({ status: 201, description: 'Usuario y rol creados atómicamente' })
  async crearUsuario(@Body() body: any, @Req() req: any) {
    const tenantId = this.resolveTenantOrThrow(req);
    const actor = this.requireActor(req);
    const created = await this.userManagementService.createUser(tenantId, {
      idempotency_key: body.idempotency_key,
      nombre: body.nombre,
      apellido: body.apellido,
      email: body.email,
      password: body.password,
      telefono: body.telefono,
      cargo: body.cargo,
      departamento: body.departamento,
      roles: [body.rol_id].filter(Boolean),
    }, actor);
    return {
      success: true,
      data: created,
      message: `Usuario "${body.nombre}" creado exitosamente. Ya puede iniciar sesión con su email y contraseña.`,
    };
  }

  @Put('/:id')
  @RequirePermission('configuracion', 'editar', 'usuarios')
  @ApiOperation({ summary: 'Actualizar usuario y rol en una transacción' })
  async actualizarUsuario(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const tenantId = this.resolveTenantOrThrow(req);
    const updated = await this.userManagementService.updateUser(tenantId, id, {
      nombre: body.nombre,
      apellido: body.apellido,
      email: body.email,
      telefono: body.telefono,
      cargo: body.cargo,
      departamento: body.departamento,
      estado: body.estado ? this.normalizeEstado(body.estado) : undefined,
      roles: body.rol_id ? [body.rol_id] : undefined,
    }, this.requireActor(req));
    return { success: true, data: updated, message: 'Usuario actualizado exitosamente' };
  }

  @Put('/:id/estado')
  @RequirePermission('configuracion', 'editar', 'usuarios')
  @ApiOperation({ summary: 'Cambiar estado y revocar sesiones cuando corresponda' })
  async cambiarEstado(@Param('id') id: string, @Body() body: { estado: string }, @Req() req: any) {
    const estado = this.normalizeEstado(body.estado);
    const updated = await this.userManagementService.updateUser(
      this.resolveTenantOrThrow(req), id, { estado }, this.requireActor(req),
    );
    return { success: true, data: updated, message: `Usuario ${estado.toLowerCase()} exitosamente` };
  }

  @Delete('/:id')
  @RequirePermission('configuracion', 'eliminar', 'usuarios')
  @ApiOperation({ summary: 'Inactivar usuario de forma trazable' })
  async eliminarUsuario(@Param('id') id: string, @Req() req: any) {
    await this.userManagementService.deleteUser(this.resolveTenantOrThrow(req), id, this.requireActor(req));
    return { success: true, message: 'Usuario inactivado exitosamente' };
  }

  @Get('/me/permissions')
  @ApiOperation({ summary: 'Permisos efectivos del usuario autenticado' })
  async getMyPermissions(@Req() req: any) {
    const tenantId = this.resolveTenantOrThrow(req);
    const userId = this.requireActor(req);
    this.tenantContext.setContext({
      tenantId, userId, isSuperAdmin: req?.user?.is_super_admin === true,
    });
    const permissions = await this.permissionService.getUserPermissions(userId, tenantId);
    return { success: true, data: permissions };
  }

  @Get('/:id/permissions')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Permisos efectivos de un usuario del tenant' })
  async getUserPermissions(@Param('id') id: string, @Req() req: any) {
    const tenantId = this.resolveTenantOrThrow(req);
    await this.userManagementService.getUserById(tenantId, id);
    const permissions = await this.permissionService.getUserPermissions(id, tenantId);
    return { success: true, data: permissions };
  }

  @Get('/:id')
  @RequirePermission('configuracion', 'ver', 'usuarios')
  @ApiOperation({ summary: 'Detalle seguro de usuario' })
  async getUsuario(@Param('id') id: string, @Req() req: any) {
    const user = await this.userManagementService.getUserById(this.resolveTenantOrThrow(req), id);
    return { success: true, data: user };
  }
}
