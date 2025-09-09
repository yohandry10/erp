import { Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get('/ventas')
  @ApiOperation({ summary: 'Reporte de ventas' })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async reporteVentas(@Req() req: any, @Query('fechaInicio') fechaInicio?: string, @Query('fechaFin') fechaFin?: string) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

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
  @ApiOperation({ summary: 'Reporte de inventario' })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async reporteInventario(@Req() req: any) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

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