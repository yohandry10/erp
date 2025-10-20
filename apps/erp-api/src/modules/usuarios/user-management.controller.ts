import { Controller, Get, Post, Put, Delete, UseGuards, Query, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserManagementService } from './user-management.service';
import { PermissionService } from '../permissions/permission.service';
import { Permission } from '../permissions/types';
import { AuditService } from '../audit/audit.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { UserFiltersDto, CreateUserDto, UpdateUserDto, AssignRolesDto } from './dto';

/**
 * User Management Controller
 * Handles all user management operations with tenant isolation
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 9.1, 9.2, 9.3, 9.4
 */
@ApiTags('Gestión de Usuarios')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserManagementController {
  constructor(
    private readonly userManagementService: UserManagementService,
    private readonly permissionService: PermissionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /users - Get paginated list of users
   * Requirements: 2.8, 9.2
   */
  @Get()
  @ApiOperation({ summary: 'Obtener lista de usuarios', description: 'Obtiene una lista paginada de usuarios filtrada por tenant' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getUsers(
    @CurrentTenant() tenantId: string,
    @Query() filters: UserFiltersDto,
  ) {
    return this.userManagementService.getUsers(tenantId, filters);
  }

  /**
   * GET /users/:id - Get user by ID with roles
   * Requirements: 2.8, 9.2
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario por ID', description: 'Obtiene los detalles de un usuario específico con sus roles' })
  @ApiResponse({ status: 200, description: 'Usuario obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async getUserById(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
  ) {
    return this.userManagementService.getUserById(tenantId, userId);
  }

  /**
   * POST /users - Create new user
   * Requirements: 2.1, 9.3
   */
  @Post()
  @ApiOperation({ summary: 'Crear nuevo usuario', description: 'Crea un nuevo usuario en el tenant actual' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 409, description: 'El email ya existe en el tenant' })
  async createUser(
    @CurrentTenant() tenantId: string,
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.userManagementService.createUser(tenantId, createUserDto);
  }

  /**
   * PUT /users/:id - Update user
   * Requirements: 2.2, 9.3
   */
  @Put(':id')
  @ApiOperation({ summary: 'Actualizar usuario', description: 'Actualiza la información de un usuario existente' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async updateUser(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userManagementService.updateUser(tenantId, userId, updateUserDto);
  }

  /**
   * DELETE /users/:id - Delete user
   * Requirements: 2.3, 9.3
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar usuario', description: 'Elimina un usuario del sistema' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async deleteUser(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
  ) {
    await this.userManagementService.deleteUser(tenantId, userId);
    return { message: 'Usuario eliminado exitosamente' };
  }

  /**
   * POST /users/:id/activate - Activate user
   * Requirements: 2.4, 9.3
   */
  @Post(':id/activate')
  @ApiOperation({ summary: 'Activar usuario', description: 'Activa un usuario desactivado' })
  @ApiResponse({ status: 200, description: 'Usuario activado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async activateUser(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
  ) {
    return this.userManagementService.activateUser(tenantId, userId);
  }

  /**
   * POST /users/:id/deactivate - Deactivate user
   * Requirements: 2.6, 9.3
   */
  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar usuario', description: 'Desactiva un usuario y revoca sus sesiones activas' })
  @ApiResponse({ status: 200, description: 'Usuario desactivado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async deactivateUser(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
  ) {
    return this.userManagementService.deactivateUser(tenantId, userId);
  }

  /**
   * POST /users/:id/reset-password - Reset user password
   * Requirements: 2.3, 9.3
   */
  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Resetear contraseña', description: 'Genera un token de reseteo de contraseña para el usuario' })
  @ApiResponse({ status: 200, description: 'Token de reseteo generado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async resetPassword(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
  ) {
    return this.userManagementService.resetPassword(tenantId, userId);
  }

  /**
   * GET /users/:id/roles - Get user's roles
   * Requirements: 2.5, 9.2
   */
  @Get(':id/roles')
  @ApiOperation({ summary: 'Obtener roles del usuario', description: 'Obtiene todos los roles asignados a un usuario' })
  @ApiResponse({ status: 200, description: 'Roles obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async getUserRoles(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
  ) {
    const user = await this.userManagementService.getUserById(tenantId, userId);
    return user.user_roles || [];
  }

  /**
   * POST /users/:id/roles - Assign roles to user
   * Requirements: 2.5, 9.3
   */
  @Post(':id/roles')
  @ApiOperation({ summary: 'Asignar roles al usuario', description: 'Asigna uno o más roles a un usuario' })
  @ApiResponse({ status: 200, description: 'Roles asignados exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario o rol no encontrado' })
  async assignRoles(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
    @Body() assignRolesDto: AssignRolesDto,
  ) {
    await this.userManagementService.assignRoles(tenantId, userId, assignRolesDto.roleIds);
    return { message: 'Roles asignados exitosamente' };
  }

  /**
   * DELETE /users/:id/roles/:roleId - Remove role from user
   * Requirements: 2.5, 9.3
   */
  @Delete(':id/roles/:roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover rol del usuario', description: 'Remueve un rol específico de un usuario' })
  @ApiResponse({ status: 200, description: 'Rol removido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario o rol no encontrado' })
  async removeRole(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
    @Param('roleId') roleId: string,
  ) {
    await this.userManagementService.removeRoles(tenantId, userId, [roleId]);
    return { message: 'Rol removido exitosamente' };
  }

  /**
   * GET /users/:id/permissions - Get user's aggregated permissions
   * Requirements: 9.2
   */
  @Get(':id/permissions')
  @ApiOperation({ summary: 'Obtener permisos del usuario', description: 'Obtiene todos los permisos agregados del usuario desde sus roles' })
  @ApiResponse({ status: 200, description: 'Permisos obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async getUserPermissions(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
  ): Promise<Permission[]> {
    return this.permissionService.getUserPermissions(userId, tenantId);
  }

  /**
   * GET /users/:id/audit-logs - Get user's audit history
   * Requirements: 9.2
   */
  @Get(':id/audit-logs')
  @ApiOperation({ summary: 'Obtener historial de auditoría del usuario', description: 'Obtiene el historial de acciones del usuario' })
  @ApiResponse({ status: 200, description: 'Historial obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async getUserAuditLogs(
    @CurrentTenant() tenantId: string,
    @Param('id') userId: string,
  ) {
    return this.auditService.getUserAuditLogs(tenantId, userId);
  }
}
