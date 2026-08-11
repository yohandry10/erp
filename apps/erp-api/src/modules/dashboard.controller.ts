import { Controller, Get, Post, UseGuards, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { DashboardMetricsService } from './dashboard/dashboard-metrics.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private readonly dashboardMetrics: DashboardMetricsService
  ) {}
  
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas generales del dashboard' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats(@CurrentTenant() tenantId: string) {
    try {
      // Usar servicio con cache
      const estadisticas = await this.dashboardMetrics.getStats(tenantId);

      return {
        success: true,
        data: estadisticas
      };
    } catch (error) {
      console.error('❌ [Dashboard Controller] Error obteniendo estadísticas:', error);
      throw new InternalServerErrorException('No se pudieron calcular las estadísticas del dashboard');
    }
  }

  @Get('activities')
  @ApiOperation({ summary: 'Obtener actividades recientes' })
  @ApiResponse({ status: 200, description: 'Actividades obtenidas exitosamente' })
  async getActivities(@CurrentTenant() tenantId: string) {
    try {
      // Usar servicio con cache
      const actividades = await this.dashboardMetrics.getActivities(tenantId);

      return {
        success: true,
        data: actividades
      };
    } catch (error) {
      console.error('❌ [Dashboard Controller] Error obteniendo actividades:', error);
      return {
        success: false,
        data: [],
        message: 'Error al obtener actividades recientes'
      };
    }
  }

  @Post('cache/invalidate')
  @RequirePermission('dashboard.stats.read')
  @ApiOperation({ summary: 'Invalidar cache de métricas del dashboard' })
  @ApiResponse({ status: 200, description: 'Cache invalidado exitosamente' })
  async invalidateCache(@CurrentTenant() tenantId: string) {
    try {
      await this.dashboardMetrics.invalidateTenantCache(tenantId);
      return {
        success: true,
        message: 'Cache de métricas invalidado exitosamente'
      };
    } catch (error) {
      console.error('❌ [Dashboard Controller] Error invalidando cache:', error);
      return {
        success: false,
        message: 'Error al invalidar cache',
        error: error.message
      };
    }
  }

}
 
