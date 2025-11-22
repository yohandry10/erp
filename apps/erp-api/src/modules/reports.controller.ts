import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
    @Query() query: any,
  ) {
    try {
      const fechaInicio = query?.fechaInicio;
      const fechaFin = query?.fechaFin;
      const estado = query?.estado;
      const moneda = query?.moneda;
      let listQuery = this.supabaseService
        .getClient()
        .from('ventas')
        .select(`
          id, fecha, estado, numero_documento, tipo_documento,
          subtotal, igv, total, moneda, cliente_id, vendedor_id, sucursal_id, metodo_pago,
          clientes(nombre, numero_documento, tipo_documento)
        `)
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: false });

      if (fechaInicio) listQuery = listQuery.gte('fecha', fechaInicio);
      if (fechaFin) listQuery = listQuery.lte('fecha', fechaFin);
      if (estado) listQuery = listQuery.eq('estado', estado);
      if (moneda) listQuery = listQuery.eq('moneda', moneda);

      const { data: ventas, error: listError } = await listQuery;
      if (listError) throw listError;

      const resumen = (ventas || []).reduce(
        (acc: any, v: any) => {
          acc.subtotal += Number(v.subtotal || 0);
          acc.igv += Number(v.igv || 0);
          acc.total += Number(v.total || 0);
          return acc;
        },
        { subtotal: 0, igv: 0, total: 0 },
      );

      return {
        success: true,
        data: ventas || [],
        total: ventas?.length || 0,
        resumen,
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
