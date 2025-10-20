import { Controller, Get, UseGuards, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from './audit.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { AuditFiltersDto } from './dto';

/**
 * Audit Controller
 * Handles all audit log query operations with tenant isolation
 * Requirements: 8.6, 9.2
 */
@ApiTags('Auditoría')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /audit-logs - Get paginated audit logs with filters
   * Requirements: 8.6, 9.2
   */
  @Get()
  @ApiOperation({ summary: 'Obtener logs de auditoría', description: 'Obtiene una lista paginada de logs de auditoría con filtros opcionales' })
  @ApiResponse({ status: 200, description: 'Logs de auditoría obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getAuditLogs(
    @CurrentTenant() tenantId: string,
    @Query() filters: AuditFiltersDto,
  ) {
    return this.auditService.getAuditLogs(tenantId, filters);
  }

  /**
   * GET /audit-logs/user/:userId - Get audit logs for a specific user
   * Requirements: 8.6, 9.2
   */
  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtener logs de auditoría de un usuario', description: 'Obtiene el historial de acciones de un usuario específico' })
  @ApiResponse({ status: 200, description: 'Logs de auditoría del usuario obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async getUserAuditLogs(
    @CurrentTenant() tenantId: string,
    @Param('userId') userId: string,
  ) {
    return this.auditService.getUserAuditLogs(tenantId, userId);
  }

  /**
   * GET /audit-logs/resource/:tableName/:resourceId - Get audit logs for a specific resource
   * Requirements: 8.6, 9.2
   */
  @Get('resource/:tableName/:resourceId')
  @ApiOperation({ summary: 'Obtener logs de auditoría de un recurso', description: 'Obtiene el historial de cambios de un recurso específico' })
  @ApiResponse({ status: 200, description: 'Logs de auditoría del recurso obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Recurso no encontrado' })
  async getResourceAuditLogs(
    @CurrentTenant() tenantId: string,
    @Param('tableName') tableName: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.auditService.getResourceAuditLogs(tenantId, tableName, resourceId);
  }

  /**
   * GET /audit-logs/integrations - Get integration logs with filters
   * Requirements: 27.3, 27.5
   */
  @Get('integrations')
  @ApiOperation({ summary: 'Obtener logs de integraciones', description: 'Obtiene logs de llamadas a servicios externos (SUNAT, GRE, etc.)' })
  @ApiResponse({ status: 200, description: 'Logs de integración obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getIntegrationLogs(
    @CurrentTenant() tenantId: string,
    @Query('servicio') servicio?: string,
    @Query('correlacion_id') correlacion_id?: string,
    @Query('correlacion_tipo') correlacion_tipo?: string,
    @Query('status') status?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.getIntegrationLogs(tenantId, {
      servicio,
      correlacion_id,
      correlacion_tipo,
      status,
      start_date,
      end_date,
      page,
      limit,
    });
  }
}
