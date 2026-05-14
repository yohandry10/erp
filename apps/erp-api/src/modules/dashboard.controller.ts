import { Controller, Get, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
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
    private readonly supabase: SupabaseService,
    private readonly dashboardMetrics: DashboardMetricsService
  ) {}
  
  @Post('seed-test-data')
  @RequirePermission('system.debug')
  @ApiOperation({ summary: 'Crear datos de prueba para CPE y GRE' })
  @ApiResponse({ status: 200, description: 'Datos de prueba creados exitosamente' })
  async seedTestData(@CurrentTenant() tenantId?: string) {
    try {
      // HARDENING: bloquear ejecución en producción.
      if (process.env.NODE_ENV === 'production') {
        throw new ForbiddenException('Endpoint restringido en producción');
      }

      console.log('🌱 [Dashboard] Creando datos de prueba...');
      
      const client = this.supabase.getClient();
      if (!tenantId) {
        throw new ForbiddenException('Tenant requerido para datos de prueba');
      }
      
      // Crear datos de prueba para CPE
      const cpeData = [
        {
          tenant_id: tenantId,
          serie: 'F001',
          numero: 1,
          tipo_comprobante: 'FACTURA',
          fecha_emision: new Date().toISOString().split('T')[0],
          cliente_nombre: 'Cliente Test 1',
          cliente_documento: '12345678901',
          subtotal: 1000.00,
          igv: 180.00,
          total: 1180.00,
          estado: 'EMITIDO',
          created_at: new Date().toISOString()
        },
        {
          tenant_id: tenantId,
          serie: 'F001',
          numero: 2,
          tipo_comprobante: 'FACTURA',
          fecha_emision: new Date().toISOString().split('T')[0],
          cliente_nombre: 'Cliente Test 2',
          cliente_documento: '98765432109',
          subtotal: 500.00,
          igv: 90.00,
          total: 590.00,
          estado: 'EMITIDO',
          created_at: new Date().toISOString()
        },
        {
          tenant_id: tenantId,
          serie: 'B001',
          numero: 1,
          tipo_comprobante: 'BOLETA',
          fecha_emision: new Date().toISOString().split('T')[0],
          cliente_nombre: 'Cliente Test 3',
          cliente_documento: '87654321',
          subtotal: 680.00,
          igv: 122.40,
          total: 802.40,
          estado: 'EMITIDO',
          created_at: new Date().toISOString()
        }
      ];

      console.log('📄 Insertando datos CPE...');
      const { data: cpeInserted, error: cpeError } = await client
        .from('cpe')
        .insert(cpeData)
        .select();

      if (cpeError) {
        console.error('❌ Error insertando CPE:', cpeError);
      } else {
        console.log('✅ CPE insertados:', cpeInserted?.length);
      }

      // Crear datos de prueba para GRE
      const greData = [
        {
          numero: 'GRE-001',
          destinatario: 'Cliente Test 1',
          direccion_destino: 'Av. Lima 123, Lima',
          fecha_traslado: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          modalidad: 'TRANSPORTE_PUBLICO',
          motivo: 'VENTA',
          peso_total: 25.5,
          estado: 'PENDIENTE',
          transportista: 'Transportes Lima SAC',
          observaciones: 'Entrega urgente',
          created_at: new Date().toISOString()
        },
        {
          numero: 'GRE-002',
          destinatario: 'Cliente Test 2',
          direccion_destino: 'Jr. Callao 456, Callao',
          fecha_traslado: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
          modalidad: 'TRANSPORTE_PRIVADO',
          motivo: 'VENTA',
          peso_total: 15.8,
          estado: 'EMITIDO',
          transportista: 'Flota Propia',
          placa_vehiculo: 'ABC-123',
          licencia_conducir: 'Q12345678',
          observaciones: 'Producto frágil',
          created_at: new Date().toISOString()
        }
      ];

      console.log('🚚 Insertando datos GRE...');
      const { data: greInserted, error: greError } = await client
        .from('gre_guias')
        .insert(greData)
        .select();

      if (greError) {
        console.error('❌ Error insertando GRE:', greError);
      } else {
        console.log('✅ GRE insertadas:', greInserted?.length);
      }

      return {
        success: true,
        data: {
          cpe_insertados: cpeInserted?.length || 0,
          gre_insertadas: greInserted?.length || 0,
          errores: {
            cpe: cpeError?.message || null,
            gre: greError?.message || null
          }
        },
        message: 'Datos de prueba creados exitosamente'
      };
    } catch (error) {
      console.error('❌ [Dashboard] Error creando datos de prueba:', error);
      return {
        success: false,
        message: 'Error creando datos de prueba',
        error: error.message
      };
    } finally {
      // Invalidar cache después de crear datos de prueba para reflejar cambios
      if (tenantId) {
        await this.dashboardMetrics.invalidateTenantCache(tenantId);
      }
    }
  }
  
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
      
      // Devolver estructura por defecto en caso de error
      return {
        success: false,
        data: {
          totalCpe: 0,
          totalGre: 0,
          totalSire: 0,
          totalUsers: 0,
          totalInventario: 0,
          totalCompras: 0,
          totalCotizaciones: 0,
          ventasMes: 0,
          ventasHoy: 0,
          comprasMes: 0,
          valorInventario: 0,
          productosConStockBajo: 0,
          cotizacionesPendientes: 0,
          ordenesCompraPendientes: 0,
          movimientosHoy: 0,
          tasaConversionCotizaciones: 0,
          crecimientoVentas: 0,
          ultimaActualizacion: new Date().toISOString(),
          error: error.message
        },
        message: 'Error al obtener estadísticas, mostrando valores por defecto'
      };
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
 
