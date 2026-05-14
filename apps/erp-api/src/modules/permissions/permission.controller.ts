import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionService } from './permission.service';
import { Permission } from './types';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

/**
 * Permission Controller
 * Handles permission query operations with tenant isolation
 * Requirements: 5.1, 9.2
 */
@ApiTags('Permisos')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  /**
   * GET /permissions - Get all permissions for tenant
   * Requirements: 5.1, 9.2
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todos los permisos', description: 'Obtiene todos los permisos disponibles en el tenant actual' })
  @ApiResponse({ status: 200, description: 'Lista de permisos obtenida exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Permiso insuficiente' })
  @RequirePermission('users.manage')
  async getPermissions(@CurrentTenant() tenantId: string): Promise<Permission[]> {
    return this.permissionService.getPermissions(tenantId);
  }
}
