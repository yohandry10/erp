import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get('/ventas')
  @RequirePermission('reports.ventas.read') // HARDENING: reporte de ventas protegido.
  @ApiOperation({ summary: 'Reporte de ventas' })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async reporteVentas(
    @CurrentTenant() tenantId: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string
  ) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('ventas')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('fecha', fechaInicio || '2024-01-01')
        .lte('fecha', fechaFin || new Date().toISOString().split('T')[0]);

      if (error) throw error;

      return {
        success: true,
        data: data || [],
        total: data?.length || 0
      };
    } catch (error) {
      console.error('Error generando reporte de ventas:', error);
      throw error;
    }
  }

  @Get('/inventario')
  @RequirePermission('reports.inventario.read') // HARDENING: reporte inventario protegido.
  @ApiOperation({ summary: 'Reporte de inventario' })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async reporteInventario(@CurrentTenant() tenantId: string) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('productos')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) throw error;

      return {
        success: true,
        data: data || [],
        total: data?.length || 0
      };
    } catch (error) {
      console.error('Error generando reporte de inventario:', error);
      throw error;
    }
  }
}
