import { Controller, Get, Post, Put, Delete, UseGuards, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RoleService } from './role.service';
import { PermissionService } from './permission.service';
import { Role, Permission } from './types';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

/**
 * Role Management Controller
 * Handles all role management operations with tenant isolation
 * Requirements: 5.1, 5.4, 9.2, 9.3
 */
@ApiTags('Gestión de Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RoleController {
  constructor(
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * GET /roles - Get all roles for tenant
   * Requirements: 5.1, 9.2
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todos los roles', description: 'Obtiene todos los roles del tenant actual' })
  @ApiResponse({ status: 200, description: 'Lista de roles obtenida exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async getRoles(@CurrentTenant() tenantId: string): Promise<Role[]> {
    return this.roleService.getRoles(tenantId);
  }

  /**
   * GET /roles/:id - Get role by ID with permissions
   * Requirements: 5.1, 9.2
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener rol por ID', description: 'Obtiene los detalles de un rol específico con sus permisos' })
  @ApiResponse({ status: 200, description: 'Rol obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async getRoleById(
    @CurrentTenant() tenantId: string,
    @Param('id') roleId: string,
  ) {
    return this.roleService.getRoleById(tenantId, roleId);
  }

  /**
   * POST /roles - Create new role
   * Requirements: 5.1, 9.3
   */
  @Post()
  @ApiOperation({ summary: 'Crear nuevo rol', description: 'Crea un nuevo rol en el tenant actual' })
  @ApiResponse({ status: 201, description: 'Rol creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 409, description: 'El nombre del rol ya existe en el tenant' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async createRole(
    @CurrentTenant() tenantId: string,
    @Body() createRoleDto: CreateRoleDto,
    @CurrentUser('id') actorId?: string,
  ): Promise<Role> {
    return this.roleService.createRole(tenantId, createRoleDto, actorId);
  }

  /**
   * PUT /roles/:id - Update role
   * Requirements: 5.1, 9.3
   */
  @Put(':id')
  @ApiOperation({ summary: 'Actualizar rol', description: 'Actualiza la información de un rol existente' })
  @ApiResponse({ status: 200, description: 'Rol actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async updateRole(
    @CurrentTenant() tenantId: string,
    @Param('id') roleId: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @CurrentUser('id') actorId?: string,
  ): Promise<Role> {
    return this.roleService.updateRole(tenantId, roleId, updateRoleDto, actorId);
  }

  /**
   * DELETE /roles/:id - Delete role
   * Requirements: 5.1, 9.3
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar rol', description: 'Elimina un rol del sistema (no se pueden eliminar roles del sistema)' })
  @ApiResponse({ status: 200, description: 'Rol eliminado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  @ApiResponse({ status: 409, description: 'No se puede eliminar un rol del sistema' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async deleteRole(
    @CurrentTenant() tenantId: string,
    @Param('id') roleId: string,
    @CurrentUser('id') actorId?: string,
  ) {
    await this.roleService.deleteRole(tenantId, roleId, actorId);
    return { message: 'Rol eliminado exitosamente' };
  }

  /**
   * GET /roles/:id/permissions - Get role's permissions
   * Requirements: 5.1, 9.2
   */
  @Get(':id/permissions')
  @ApiOperation({ summary: 'Obtener permisos del rol', description: 'Obtiene todos los permisos asignados a un rol' })
  @ApiResponse({ status: 200, description: 'Permisos obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async getRolePermissions(
    @CurrentTenant() tenantId: string,
    @Param('id') roleId: string,
  ): Promise<Permission[]> {
    return this.permissionService.getRolePermissions(tenantId, roleId);
  }

  /**
   * POST /roles/:id/permissions - Assign permission to role
   * Requirements: 5.1, 9.3
   */
  @Post(':id/permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Asignar permiso al rol', description: 'Asigna un permiso específico a un rol' })
  @ApiResponse({ status: 200, description: 'Permiso asignado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Rol o permiso no encontrado' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async assignPermissionToRole(
    @CurrentTenant() tenantId: string,
    @Param('id') roleId: string,
    @Body() assignPermissionDto: AssignPermissionDto,
    @CurrentUser('id') actorId?: string,
  ) {
    await this.permissionService.assignPermissionToRole(
      tenantId,
      roleId,
      assignPermissionDto.permiso_id,
      actorId,
    );
    return { message: 'Permiso asignado exitosamente' };
  }

  /**
   * DELETE /roles/:id/permissions/:permissionId - Revoke permission from role
   * Requirements: 5.5, 9.3
   */
  @Delete(':id/permissions/:permissionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revocar permiso del rol', description: 'Revoca un permiso específico de un rol' })
  @ApiResponse({ status: 200, description: 'Permiso revocado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Rol o permiso no encontrado' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async revokePermissionFromRole(
    @CurrentTenant() tenantId: string,
    @Param('id') roleId: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser('id') actorId?: string,
  ) {
    await this.permissionService.revokePermissionFromRole(tenantId, roleId, permissionId, actorId);
    return { message: 'Permiso revocado exitosamente' };
  }

  /**
   * GET /roles/:id/users - Get users assigned to role
   * Requirements: 5.1, 9.2
   */
  @Get(':id/users')
  @ApiOperation({ summary: 'Obtener usuarios del rol', description: 'Obtiene todos los usuarios que tienen asignado este rol' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async getRoleUsers(
    @CurrentTenant() tenantId: string,
    @Param('id') roleId: string,
  ) {
    return this.roleService.getRoleUsers(tenantId, roleId);
  }
}
