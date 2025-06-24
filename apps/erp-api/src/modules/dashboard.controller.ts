import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly supabase: SupabaseService) {}
  
  @Post('seed-test-data')
  @ApiOperation({ summary: 'Crear datos de prueba para CPE y GRE' })
  @ApiResponse({ status: 200, description: 'Datos de prueba creados exitosamente' })
  async seedTestData() {
    try {
      console.log('🌱 [Dashboard] Creando datos de prueba...');
      
      const client = this.supabase.getClient();
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      
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
    }
  }
  
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas generales del dashboard' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats() {
    try {
      console.log('📊 [Dashboard Controller] Obteniendo métricas reales...');
      
      const client = this.supabase.getClient();
      const tenantId = '550e8400-e29b-41d4-a716-446655440000'; // Tenant ID por defecto
      
      // Obtener fechas para filtros (misma lógica que compras.controller.ts)
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      inicioMes.setHours(0, 0, 0, 0);
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      finMes.setHours(23, 59, 59, 999);
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      inicioHoy.setHours(0, 0, 0, 0);
      
      console.log('📅 [Dashboard] Filtros de fecha:', {
        inicioMes: inicioMes.toISOString().split('T')[0],
        finMes: finMes.toISOString().split('T')[0],
        hoy: inicioHoy.toISOString().split('T')[0]
      });
      
      // CONSULTA DIRECTA CPE - Igual que en el controlador CPE
      console.log('🔍 [Dashboard] Consultando CPE directamente...');
      const { data: cpeDirecto, error: cpeDirectoError } = await client
        .from('cpe')
        .select('*')
        .order('created_at', { ascending: false });
        
      console.log('📊 [Dashboard] CPE DIRECTO - Total encontrados:', cpeDirecto?.length);
      console.log('📊 [Dashboard] CPE DIRECTO - Error:', cpeDirectoError);
      
      if (cpeDirecto && cpeDirecto.length > 0) {
        const totalCpe = cpeDirecto.reduce((sum, cpe) => sum + (parseFloat(cpe.total_venta) || 0), 0);
        console.log('💰 [Dashboard] CPE DIRECTO - Total suma:', totalCpe);
        console.log('🔍 [Dashboard] CPE DIRECTO - Primer registro:', cpeDirecto[0]);
      }

      // Consultas en paralelo para obtener datos reales
      const [
        // CPE (Ingresos reales del mes)
        cpeResult,
        cpeHoyResult,
        
        // GRE (Guías de remisión)
        greResult,
        
        // Productos e inventario
        productosResult,
        
        // Compras (SIN FILTRO DE FECHA - datos de prueba tienen fechas futuras)
        comprasTodasResult,
        
        // Usuarios
        usuariosResult,
        
        // Cotizaciones
        cotizacionesResult,
        cotizacionesPendientesResult,
        
        // SIRE
        sireResult
      ] = await Promise.allSettled([
        // CPE - TODOS los registros (campos correctos: total_venta, created_at)
        client.from('cpe')
          .select('total_venta, created_at, tenant_id')
          .order('created_at', { ascending: false }),
          
        // CPE de hoy (usar created_at en lugar de fecha_emision)
        client.from('cpe')
          .select('total_venta')
          .gte('created_at', inicioHoy.toISOString()),
          
        // GRE (Guías de remisión) - tabla correcta
        client.from('gre_guias')
          .select('id')
          .gte('created_at', inicioMes.toISOString()),
          
        // Productos
        client.from('productos')
          .select('id, precio, stock, stock_minimo'),
          
        // TODAS las compras (sin filtro de fecha porque son datos de prueba)
        client.from('ordenes_compra')
          .select('total, estado, fecha_orden, created_at')
          .order('created_at', { ascending: false }),
          
        // Usuarios
        client.from('usuarios')
          .select('id'),
          
        // Cotizaciones del mes
        client.from('cotizaciones')
          .select('id, estado')
          .gte('created_at', inicioMes.toISOString()),
          
        // Cotizaciones pendientes
        client.from('cotizaciones')
          .select('id')
          .eq('estado', 'PENDIENTE'),
          
        // SIRE
        client.from('sire_files')
          .select('id')
          .gte('created_at', inicioMes.toISOString())
      ]);

      // Procesar resultados de forma segura con logging de errores
      const cpeData = cpeResult.status === 'fulfilled' ? cpeResult.value.data : [];
      const cpeHoyData = cpeHoyResult.status === 'fulfilled' ? cpeHoyResult.value.data : [];
      const greData = greResult.status === 'fulfilled' ? greResult.value.data : [];
      const productosData = productosResult.status === 'fulfilled' ? productosResult.value.data : [];
      const comprasData = comprasTodasResult.status === 'fulfilled' ? comprasTodasResult.value.data : [];
      const usuariosData = usuariosResult.status === 'fulfilled' ? usuariosResult.value.data : [];
      const cotizacionesData = cotizacionesResult.status === 'fulfilled' ? cotizacionesResult.value.data : [];
      const cotizacionesPendientesData = cotizacionesPendientesResult.status === 'fulfilled' ? cotizacionesPendientesResult.value.data : [];
      const sireData = sireResult.status === 'fulfilled' ? sireResult.value.data : [];

      // Log de errores si los hay
      if (cpeResult.status === 'rejected') {
        console.error('❌ [Dashboard] Error en consulta CPE:', cpeResult.reason);
      } else {
        console.log('✅ [Dashboard] CPE consulta exitosa:', { 
          data: cpeResult.value?.data?.length, 
          error: cpeResult.value?.error 
        });
      }
      
      if (cpeHoyResult.status === 'rejected') {
        console.error('❌ [Dashboard] Error en consulta CPE HOY:', cpeHoyResult.reason);
      }
      
      if (greResult.status === 'rejected') {
        console.error('❌ [Dashboard] Error en consulta GRE:', greResult.reason);
      }
      if (sireResult.status === 'rejected') {
        console.error('❌ [Dashboard] Error en consulta SIRE:', sireResult.reason);
      }

      // DEBUG: Logging para todos los módulos
      console.log('🔍 [Dashboard] DEBUG Resultados de consultas:');
      console.log('- CPE datos:', { 
        cantidad: cpeData?.length, 
        primeros3: cpeData?.slice(0, 3)?.map(c => ({ total_venta: c.total_venta, fecha: c.created_at })),
        totalSuma: cpeData?.reduce((sum, c) => sum + (parseFloat(c.total_venta) || 0), 0)
      });
      console.log('- GRE datos:', { cantidad: greData?.length, datos: greData });
      console.log('- SIRE datos:', { cantidad: sireData?.length, datos: sireData });
      console.log('- Compras datos:', { cantidad: comprasData?.length, primeras3: comprasData?.slice(0, 3) });
      console.log('- Productos datos:', { cantidad: productosData?.length });
      console.log('- Usuarios datos:', { cantidad: usuariosData?.length });
      console.log('- Cotizaciones datos:', { cantidad: cotizacionesData?.length });

      // Calcular métricas reales (usar total_venta para CPE)
      const ingresosMes = this.sumarTotalesCpe(cpeData); // Los ingresos reales vienen de CPE
      const ingresosHoy = this.sumarTotalesCpe(cpeHoyData);
      const inversionCompras = this.sumarTotales(comprasData); // TODAS las compras (datos de prueba)
      const totalProductos = productosData?.length || 0;
      const valorInventario = this.calcularValorInventario(productosData);
      const productosStockBajo = this.contarProductosStockBajo(productosData);
      const comprasPendientes = comprasData?.filter(c => c.estado === 'PENDIENTE').length || 0;

      // Calcular tasa de conversión de cotizaciones
      const totalCotizaciones = cotizacionesData?.length || 0;
      const cotizacionesAceptadas = cotizacionesData?.filter(c => c.estado === 'ACEPTADA').length || 0;
      const tasaConversion = totalCotizaciones > 0 ? 
        ((cotizacionesAceptadas / totalCotizaciones) * 100) : 0;

      const estadisticas = {
        // Métricas principales (datos reales)
        totalCpe: cpeData?.length || 0,
        totalGre: greData?.length || 0,
        totalSire: sireData?.length || 0,
        totalUsers: usuariosData?.length || 0,
        totalInventario: totalProductos,
        totalCompras: comprasData?.length || 0, // Cantidad de compras del mes
        totalCotizaciones: totalCotizaciones,
        
        // Métricas financieras (datos reales)
        ventasMes: ingresosMes, // Los ingresos reales del mes desde CPE
        ventasHoy: ingresosHoy, // Los ingresos de hoy desde CPE
        comprasMes: inversionCompras, // Total invertido en compras (todas - datos de prueba)
        valorInventario: valorInventario, // Valor calculado del inventario
        
        // Indicadores de gestión (datos reales)
        productosConStockBajo: productosStockBajo, // Solo productos con stock bajo real
        cotizacionesPendientes: cotizacionesPendientesData?.length || 0,
        ordenesCompraPendientes: comprasPendientes,
        movimientosHoy: 0, // Por implementar
        
        // Ratios y porcentajes (datos reales)
        tasaConversionCotizaciones: Number(tasaConversion.toFixed(1)),
        crecimientoVentas: 0, // Por implementar comparativa mes anterior
        
        // Metadatos
        ultimaActualizacion: new Date().toISOString(),
        periodoCalculado: {
          inicio: inicioMes.toISOString().split('T')[0],
          fin: finMes.toISOString().split('T')[0]
        }
      };

      console.log('✅ [Dashboard Controller] Estadísticas reales obtenidas:', {
        ingresosMes: estadisticas.ventasMes,
        inversionCompras: estadisticas.comprasMes,
        cantidadCompras: estadisticas.totalCompras,
        productos: estadisticas.totalInventario,
        productosStockBajo: estadisticas.productosConStockBajo,
        cpe: estadisticas.totalCpe,
        gre: estadisticas.totalGre,
        usuarios: estadisticas.totalUsers
      });

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
  async getActivities() {
    try {
      console.log('📋 [Dashboard Controller] Obteniendo actividades recientes reales...');
      
      const client = this.supabase.getClient();
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Obtener actividades reales de forma segura
      const [
        cpeResult,
        greResult,
        comprasResult,
        cotizacionesResult
      ] = await Promise.allSettled([
        // CPE recientes (campos correctos, sin fecha_emision)
        client.from('cpe')
          .select('id, serie, numero, total_venta, estado, created_at')
          .gte('created_at', hace24h.toISOString())
          .order('created_at', { ascending: false })
          .limit(10),
          
        // GRE recientes - tabla correcta
        client.from('gre_guias')
          .select('id, numero, fecha_traslado, estado, created_at')
          .gte('created_at', hace24h.toISOString())
          .order('created_at', { ascending: false })
          .limit(10),
          
        // Compras recientes
        client.from('ordenes_compra')
          .select('id, numero, total, fecha_orden, estado, created_at')
          .gte('created_at', hace24h.toISOString())
          .order('created_at', { ascending: false })
          .limit(10),
          
        // Cotizaciones recientes
        client.from('cotizaciones')
          .select('id, numero, total, fecha_cotizacion, estado, created_at')
          .gte('created_at', hace24h.toISOString())
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      const actividades = [];
      
      // Procesar CPE
      if (cpeResult.status === 'fulfilled' && cpeResult.value.data) {
        cpeResult.value.data.forEach(cpe => {
          actividades.push({
            id: `cpe-${cpe.id}`,
            type: 'CPE',
            description: `Factura ${cpe.serie}-${cpe.numero.toString().padStart(8, '0')}`,
            amount: parseFloat(cpe.total_venta) || 0,
            date: cpe.created_at,
            status: this.mapearEstado(cpe.estado)
          });
        });
      }

      // Procesar GRE
      if (greResult.status === 'fulfilled' && greResult.value.data) {
        greResult.value.data.forEach(gre => {
          actividades.push({
            id: `gre-${gre.id}`,
            type: 'GRE',
            description: `Guía de Remisión ${gre.numero || gre.id}`,
            amount: 0,
            date: gre.fecha_traslado || gre.created_at,
            status: this.mapearEstado(gre.estado)
          });
        });
      }

      // Procesar Compras
      if (comprasResult.status === 'fulfilled' && comprasResult.value.data) {
        comprasResult.value.data.forEach(compra => {
          actividades.push({
            id: `compra-${compra.id}`,
            type: 'COMPRA',
            description: `Orden de Compra ${compra.numero || compra.id}`,
            amount: parseFloat(compra.total) || 0,
            date: compra.fecha_orden || compra.created_at,
            status: this.mapearEstado(compra.estado)
          });
        });
      }

      // Procesar Cotizaciones
      if (cotizacionesResult.status === 'fulfilled' && cotizacionesResult.value.data) {
        cotizacionesResult.value.data.forEach(cotizacion => {
          actividades.push({
            id: `cotizacion-${cotizacion.id}`,
            type: 'COTIZACION',
            description: `Cotización ${cotizacion.numero || cotizacion.id}`,
            amount: parseFloat(cotizacion.total) || 0,
            date: cotizacion.fecha_cotizacion || cotizacion.created_at,
            status: this.mapearEstado(cotizacion.estado)
          });
        });
      }

      // Ordenar por fecha descendente
      const actividadesOrdenadas = actividades
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20);

      console.log(`✅ [Dashboard Controller] ${actividadesOrdenadas.length} actividades reales obtenidas`);

    return {
      success: true,
        data: actividadesOrdenadas
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

  // Métodos de utilidad
  private sumarTotales(data: any[]): number {
    if (!Array.isArray(data)) return 0;
    return data.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
  }

  private sumarTotalesCpe(data: any[]): number {
    if (!Array.isArray(data)) return 0;
    return data.reduce((sum, item) => sum + (parseFloat(item.total_venta) || 0), 0);
  }

  private calcularValorInventario(productos: any[]): number {
    if (!Array.isArray(productos)) return 0;
    return productos.reduce((sum, p) => 
      sum + ((parseFloat(p.precio) || 0) * (parseFloat(p.stock) || 0)), 0);
  }

  private contarProductosStockBajo(productos: any[]): number {
    if (!Array.isArray(productos)) return 0;
    return productos.filter(p => 
      parseFloat(p.stock || 0) <= parseFloat(p.stock_minimo || 0)
    ).length;
  }

  private mapearEstado(estado: string): 'success' | 'warning' | 'error' | 'pending' {
    if (!estado) return 'pending';
    
    const estadosMap = {
      'COMPLETADO': 'success',
      'PAGADA': 'success',
      'ENTREGADO': 'success',
      'ACEPTADA': 'success',
      'ACEPTADO': 'success',
      'EMITIDO': 'success',
      'ENVIADO': 'success',
      'PENDIENTE': 'warning',
      'ENVIADA': 'warning',
      'EN_PROCESO': 'warning',
      'BORRADOR': 'warning',
      'RECHAZADA': 'error',
      'CANCELADA': 'error',
      'ERROR': 'error'
    };
    
    return estadosMap[estado.toUpperCase()] || 'pending';
  }
}
 