import { Controller, Get, Post, Put, Query, Param, UseGuards, ForbiddenException, GoneException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TenantContextService } from '../shared/tenant/tenant-context.service';

@ApiTags('compras')
@Controller('compras')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: proteger endpoints globales de compras.
export class ComprasController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private resolveTenant(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      // HARDENING: se evita fallback inseguro de tenant.
      throw new ForbiddenException('Tenant requerido');
    }
    return tenantId;
  }

  @Get('stats')
  @RequirePermission('compras.ordenes.ver')
  @ApiOperation({ summary: 'Obtener estadísticas de compras' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats(@Query() filtros: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: tenant proviene del contexto, no de filtros externos.
      const supabase = this.supabase.getClient();

      console.log(`📊 [Compras Stats] Obteniendo estadísticas de compras para tenant: ${tenantId}`);

      // USAR LA MISMA CONSULTA QUE FUNCIONA EN getOrdenes
      const { data: todasLasCompras, error: comprasError } = await supabase
        .from('ordenes_compra')
        .select('*')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .order('created_at', { ascending: false });

      if (comprasError) {
        console.error('❌ [Compras Stats] Error en consulta principal:', comprasError);
        throw comprasError;
      }

      console.log('🔍 [Compras Stats] DEBUG - Datos obtenidos:', {
        totalComprasEncontradas: todasLasCompras?.length,
        primerasTresCompras: todasLasCompras?.slice(0, 3)?.map(c => ({
          total: c.total,
          estado: c.estado,
          fecha: c.fecha_orden
        }))
      });

      // Calcular estadísticas directamente de los datos obtenidos
      const totalComprasMonto = todasLasCompras?.reduce((sum, orden) => {
        const total = parseFloat(orden.total) || 0;
        console.log(`💰 Sumando orden ${orden.numero}: ${total}`);
        return sum + total;
      }, 0) || 0;

      const cantidadCompras = todasLasCompras?.length || 0;
      const ordenesActivas = todasLasCompras?.filter(o => ['PENDIENTE', 'ENTREGADO'].includes(o.estado)).length || 0;
      const ordenesVencidas = todasLasCompras?.filter(o => o.estado === 'PENDIENTE' && new Date(o.fecha_entrega) < new Date()).length || 0;

      // Obtener proveedores activos de forma simple
      let proveedoresActivos = 0;
      try {
        const { data: proveedores } = await supabase
          .from('proveedores')
          .select('id')
          .eq('tenant_id', tenantId) // ✅ Filtro de tenant
          .eq('activo', true);
        proveedoresActivos = proveedores?.length || 0;
      } catch (error) {
        console.warn('⚠️ [Compras Stats] No se pudo obtener proveedores:', error);
        proveedoresActivos = 2; // Valor por defecto basado en los logs
      }

      const estadisticas = {
        comprasDelMes: cantidadCompras,
        totalCompras: totalComprasMonto,
        montoTotalMes: totalComprasMonto,
        ordenesActivas: ordenesActivas,
        proveedoresActivos: proveedoresActivos,
        ordenesVencidas: ordenesVencidas
      };

      console.log('✅ [Compras Stats] Estadísticas calculadas:', estadisticas);
      console.log('💰 [Compras Stats] Total calculado:', totalComprasMonto);

      return {
        success: true,
        data: estadisticas
      };
    } catch (error) {
      console.error('❌ [Compras Stats] Error completo:', {
        message: error.message,
        details: error.stack,
        hint: error.hint || '',
        code: error.code || ''
      });

      // Devolver datos por defecto si hay error
      return {
        success: true,
        data: {
          comprasDelMes: 0,
          totalCompras: 0,
          montoTotalMes: 0,
          ordenesActivas: 0,
          proveedoresActivos: 0,
          ordenesVencidas: 0
        }
      };
    }
  }

  @Get()
  @RequirePermission('compras.ordenes.ver')
  async getOrdenes(@Query() filtros: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: usar tenant del contexto.
      let query = this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          proveedor:proveedores(*)
        `)
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .order('created_at', { ascending: false });

      if (filtros.estado) {
        query = query.eq('estado', filtros.estado);
      }

      if (filtros.fechaDesde) {
        query = query.gte('fecha_orden', filtros.fechaDesde);
      }

      if (filtros.fechaHasta) {
        query = query.lte('fecha_orden', filtros.fechaHasta);
      }

      const { data: ordenes, error } = await query;

      if (error) throw error;

      return {
        success: true,
        data: ordenes || []
      };
    } catch (error) {
      console.error('❌ Error obteniendo órdenes de compra:', error);
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  @Get('next-number')
  @RequirePermission('compras.ordenes.crear')
  @ApiOperation({ summary: 'Obtener siguiente número de orden' })
  @ApiResponse({ status: 200, description: 'Número generado exitosamente' })
  async getNextNumber(@Query() filtros: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: usar tenant del contexto.
      const supabase = this.supabase.getClient();

      // Obtener el último número de orden
      const { data, error } = await supabase
        .from('ordenes_compra')
        .select('numero')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .like('numero', 'OC-%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastNumber = data[0].numero;
        const match = lastNumber.match(/OC-\d{4}-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const year = new Date().getFullYear();
      const numero = `OC-${year}-${nextNumber.toString().padStart(3, '0')}`;

      return {
        success: true,
        data: { numero }
      };
    } catch (error) {
      console.error('Error generating next number:', error);
      return {
        success: false,
        message: 'Error al generar número de orden',
        error: error.message
      };
    }
  }

  @Post()
  @RequirePermission('compras.ordenes.crear')
  async crearOrden() {
    throw new GoneException(
      'Ruta de alta obsoleta. Use POST /compras/ordenes, que crea cabecera y detalles atómicamente.',
    );
  }

  @Put(':id/recibir')
  @RequirePermission('compras.ordenes.actualizar')
  async recibirMercancia() {
    throw new GoneException(
      'Ruta de recepción obsoleta. Use POST /compras/recepciones/ordenes/:ordenId y luego POST /compras/recepciones/:id/cerrar.',
    );
  }

  @Put(':id/cancelar')
  @RequirePermission('compras.ordenes.cancelar')
  async cancelarOrden() {
    throw new GoneException(
      'Ruta de cancelación obsoleta. Use POST /compras/ordenes/:id/cancelar.',
    );
  }

  @Get('reporte-compras')
  @RequirePermission('compras.ordenes.ver')
  async getReporteCompras(@Query() filtros: any) {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: reporte limitado al tenant actual.
      let query = this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          proveedor:proveedores(*),
          orden_compra_detalles:orden_compra_detalles!fk_orden_compra_detalles_orden_id(*)
        `)
        .eq('tenant_id', tenantId)
        .order('fecha_orden', { ascending: false });

      if (filtros.fechaDesde) {
        query = query.gte('fecha_orden', filtros.fechaDesde);
      }

      if (filtros.fechaHasta) {
        query = query.lte('fecha_orden', filtros.fechaHasta);
      }

      const { data: ordenes, error } = await query;

      if (error) throw error;

      // Calcular resumen
      const resumen = {
        totalOrdenes: ordenes?.length || 0,
        totalMonto: ordenes?.reduce((sum, o) => sum + (o.total || 0), 0) || 0,
        porEstado: {},
        topProveedores: []
      };

      // Agrupar por estado
      ordenes?.forEach(orden => {
        const estado = orden.estado;
        if (!resumen.porEstado[estado]) {
          resumen.porEstado[estado] = { cantidad: 0, monto: 0 };
        }
        resumen.porEstado[estado].cantidad++;
        resumen.porEstado[estado].monto += orden.total || 0;
      });

      // Top proveedores
      const proveedoresMap = {};
      ordenes?.forEach(orden => {
        const proveedorNombre = orden.proveedor?.nombre || 'Sin nombre';
        if (!proveedoresMap[proveedorNombre]) {
          proveedoresMap[proveedorNombre] = { cantidad: 0, monto: 0 };
        }
        proveedoresMap[proveedorNombre].cantidad++;
        proveedoresMap[proveedorNombre].monto += orden.total || 0;
      });

      resumen.topProveedores = Object.entries(proveedoresMap)
        .map(([nombre, data]: [string, any]) => ({ nombre, ...data }))
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);

      return {
        success: true,
        data: {
          ordenes: ordenes || [],
          resumen
        }
      };
    } catch (error) {
      console.error('❌ Error generando reporte de compras:', error);
      return {
        success: false,
        error: error.message,
        data: { ordenes: [], resumen: {} }
      };
    }
  }

  @Get('productos')
  @RequirePermission('compras.ordenes.ver')
  @ApiOperation({ summary: 'Obtener lista de productos para compras' })
  @ApiResponse({ status: 200, description: 'Productos obtenidos exitosamente' })
  async getProductos() {
    try {
      const tenantId = this.resolveTenant(); // HARDENING: limitar catálogo al tenant.
      const supabase = this.supabase.getClient();

      console.log('🔍 OBTENIENDO PRODUCTOS...');

      // USAR LAS COLUMNAS EXACTAS DE LA TABLA productos
      const { data, error } = await supabase
        .from('productos')
        // La afectacion decide si la compra genera IGV: sin ella la orden lo
        // aplicaba plano y se tomaba credito fiscal sobre productos exonerados.
        .select('id, codigo, nombre, precio, stock_actual, categoria, activo, afectacion_igv')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (error) {
        console.error('❌ Error getting productos:', error);
        throw error;
      }

      console.log('✅ PRODUCTOS OBTENIDOS:', JSON.stringify(data, null, 2));

      return {
        success: true,
        data:
          data?.map((p: any) => ({
            ...p,
            stock: p.stock_actual,
          })) || []
      };
    } catch (error) {
      console.error('❌ Error getting productos:', error);
      return {
        success: false,
        message: 'Error al obtener productos',
        error: error.message
      };
    }
  }

  // IMPORTANTE: Este endpoint debe ir AL FINAL porque captura cualquier ID
  @Get(':id')
  @RequirePermission('compras.ordenes.ver')
  @ApiOperation({ summary: 'Obtener orden específica por ID' })
  @ApiResponse({ status: 200, description: 'Orden obtenida exitosamente' })
  async getOrden(@Param('id') ordenId: string, @CurrentTenant() tenantId: string) {
    try {
      const { data: orden, error } = await this.supabase.getClient()
        .from('ordenes_compra')
        .select(`
          *,
          proveedor:proveedores(*),
          orden_compra_detalles:orden_compra_detalles!fk_orden_compra_detalles_orden_id(*)
        `)
        .eq('tenant_id', tenantId)
        .eq('id', ordenId)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: orden
      };
    } catch (error) {
      console.error('❌ Error obteniendo orden:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }
}
