import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Headers,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { TenantManagementService } from './tenant-management.service';
import { CreateTenantDto, UpdateTenantDto, TenantFiltersDto, ActivateDemoTenantDto } from './dto';

/**
 * TenantManagementController - Super-Admin only endpoints for tenant management
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.1, 9.2, 9.3, 9.4
 * 
 * All endpoints in this controller require super-admin privileges.
 * The SuperAdminGuard validates the is_super_admin flag from the JWT token.
 */
@ApiTags('Gestión de Tenants (Super-Admin)')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantManagementController {
  constructor(
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  /**
   * GET /tenants - Get all tenants with filters and pagination
   * Requirements: 1.4, 9.1
   */
  @UseGuards(SuperAdminGuard, PermissionGuard)
  @Get()
  @RequirePermission('tenants.manage') // HARDENING: solo usuarios autorizados gestionan tenants.
  @ApiOperation({ summary: 'Obtener todos los tenants', description: 'Obtiene una lista paginada de todos los tenants del sistema (solo super-admin)' })
  @ApiResponse({ status: 200, description: 'Lista de tenants obtenida exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Se requieren privilegios de super-administrador' })
  async getTenants(@Query() filters: TenantFiltersDto, @Req() req: any) {
    return this.tenantManagementService.getTenants(filters, req.user);
  }

  /**
   * GET /tenants/me - Get current user's tenant (no super-admin required)
   * Requirements: 1.4
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtener tenant del usuario actual', description: 'Obtiene los detalles del tenant del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Tenant obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getCurrentUserTenant(@Req() req: any, @CurrentTenant() tenantId?: string) {
    const currentTenantId = tenantId ?? req.user?.tenant_id;
    if (!currentTenantId) { throw new ForbiddenException('Tenant no asociado a la sesión actual'); }
    return this.tenantManagementService.getTenantById(currentTenantId);
  }

  /**
   * GET /tenants/:id - Get tenant by ID with configuration
   * Requirements: 1.4, 9.1
   * 
   * Permite a usuarios normales obtener su propio tenant, pero requiere super-admin para otros tenants
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtener tenant por ID', description: 'Obtiene los detalles de un tenant específico con su configuración' })
  @ApiResponse({ status: 200, description: 'Tenant obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Solo puedes ver tu propio tenant o ser super-admin' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado' })
  async getTenantById(@Param('id') tenantId: string, @Req() req: any) {
    const userTenantId = req.user?.tenant_id;
    const isSuperAdmin = req.user?.is_super_admin || false;
    
    // Permitir si es el tenant del usuario o si es super admin
    if (tenantId !== userTenantId && !isSuperAdmin) {
      throw new ForbiddenException('No tienes permisos para ver este tenant');
    }
    
    return this.tenantManagementService.getTenantById(tenantId);
  }

  /**
   * POST /tenants - Create new tenant with first admin user
   * Requirements: 1.2, 1.3, 9.1
   */
  @Post()
  @UseGuards(SuperAdminGuard, PermissionGuard) // ✅ F1: Solo super-admins pueden crear tenants
  @RequirePermission('tenants.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nuevo tenant', description: 'Crea un nuevo tenant con su primer usuario administrador' })
  @ApiResponse({ status: 201, description: 'Tenant creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Se requieren privilegios de super-administrador' })
  @ApiResponse({ status: 409, description: 'El email del tenant ya existe' })
  async createTenant(
    @Body() createTenantDto: CreateTenantDto,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tenantManagementService.createTenant(
      createTenantDto,
      req.user?.id || req.user?.sub,
      idempotencyKey,
    );
  }

  /**
   * PUT /tenants/:id - Update tenant information
   * Requirements: 1.1, 9.1
   */
  @Put(':id')
  @UseGuards(SuperAdminGuard, PermissionGuard) // ✅ F1: Solo super-admins pueden actualizar tenants
  @RequirePermission('tenants.manage')
  @ApiOperation({ summary: 'Actualizar tenant', description: 'Actualiza la información de un tenant existente' })
  @ApiResponse({ status: 200, description: 'Tenant actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Se requieren privilegios de super-administrador' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado' })
  async updateTenant(
    @Param('id') tenantId: string,
    @Body() updateTenantDto: UpdateTenantDto,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tenantManagementService.updateTenant(
      tenantId,
      updateTenantDto,
      req.user?.id || req.user?.sub,
      idempotencyKey,
    );
  }

  /**
   * POST /tenants/:id/activate - Activate tenant
   * Requirements: 1.1, 9.1
   */
  @Post(':id/activate')
  @UseGuards(SuperAdminGuard, PermissionGuard) // ✅ F1: Solo super-admins pueden activar tenants
  @RequirePermission('tenants.manage')
  @ApiOperation({ summary: 'Activar tenant', description: 'Activa un tenant y habilita el acceso de sus usuarios' })
  @ApiResponse({ status: 200, description: 'Tenant activado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Se requieren privilegios de super-administrador' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado' })
  async activateTenant(
    @Param('id') tenantId: string,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tenantManagementService.activateTenant(
      tenantId,
      req.user?.id || req.user?.sub,
      idempotencyKey,
    );
  }

  /**
   * POST /tenants/:id/deactivate - Deactivate tenant and revoke sessions
   * Requirements: 1.6, 9.1
   */
  @Post(':id/deactivate')
  @UseGuards(SuperAdminGuard, PermissionGuard) // ✅ F1: Solo super-admins pueden desactivar tenants
  @RequirePermission('tenants.manage')
  @ApiOperation({ summary: 'Desactivar tenant', description: 'Desactiva un tenant y revoca todas las sesiones activas de sus usuarios' })
  @ApiResponse({ status: 200, description: 'Tenant desactivado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Se requieren privilegios de super-administrador' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado' })
  async deactivateTenant(
    @Param('id') tenantId: string,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tenantManagementService.deactivateTenant(
      tenantId,
      req.user?.id || req.user?.sub,
      idempotencyKey,
    );
  }

  /**
   * GET /tenants/:id/users - Get all users for a tenant
   * Requirements: 1.4, 9.1
   */
  @Get(':id/users')
  @UseGuards(SuperAdminGuard, PermissionGuard) // ✅ F1: Solo super-admins pueden ver usuarios de otros tenants
  @RequirePermission('tenants.manage')
  @ApiOperation({ summary: 'Obtener usuarios del tenant', description: 'Obtiene todos los usuarios de un tenant específico' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Se requieren privilegios de super-administrador' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado' })
  async getTenantUsers(@Param('id') tenantId: string) {
    return this.tenantManagementService.getTenantUsers(tenantId);
  }

  /**
   * GET /tenants/:id/stats - Get tenant statistics
   * Requirements: 1.4, 9.1
   */
  @Get(':id/stats')
  @UseGuards(SuperAdminGuard, PermissionGuard) // ✅ F1: Solo super-admins pueden ver estadísticas de otros tenants
  @RequirePermission('tenants.manage')
  @ApiOperation({ summary: 'Obtener estadísticas del tenant', description: 'Obtiene estadísticas de uso del tenant (usuarios activos, almacenamiento, etc.)' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado - Se requieren privilegios de super-administrador' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado' })
  async getTenantStats(@Param('id') tenantId: string) {
    return this.tenantManagementService.getTenantStats(tenantId);
  }

  /**
   * POST /tenants/:id/demo/activate - Activate demo mode for an existing tenant
   */
  @Post(':id/demo/activate')
  @UseGuards(SuperAdminGuard, PermissionGuard)
  @RequirePermission('tenants.manage')
  @ApiOperation({ summary: 'Activar demo para tenant existente', description: 'Marca el tenant como demo por N días y crea/actualiza usuario demo' })
  @ApiResponse({ status: 200, description: 'Demo activada exitosamente' })
  async activateDemoTenant(
    @Param('id') tenantId: string,
    @Body() dto: ActivateDemoTenantDto,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tenantManagementService.activateDemoTenant(
      tenantId,
      dto,
      req.user,
      idempotencyKey,
    );
  }

  /**
   * POST /tenants/:id/demo/deactivate - Deactivate demo mode for a tenant
   */
  @Post(':id/demo/deactivate')
  @UseGuards(SuperAdminGuard, PermissionGuard)
  @RequirePermission('tenants.manage')
  @ApiOperation({ summary: 'Desactivar demo de tenant', description: 'Quita el modo demo del tenant y limpia flags de usuarios demo' })
  @ApiResponse({ status: 200, description: 'Demo desactivada exitosamente' })
  async deactivateDemoTenant(
    @Param('id') tenantId: string,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tenantManagementService.deactivateDemoTenant(
      tenantId,
      req.user,
      idempotencyKey,
    );
  }
}
