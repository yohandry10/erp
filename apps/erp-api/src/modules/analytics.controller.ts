import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsNativeRead } from './analytics-native-read';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { InventoryIntegrationService } from '../shared/integration/inventory-integration.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class AnalyticsController {
  
  constructor(
    private readonly supabase: SupabaseService,
    private readonly inventoryService: InventoryIntegrationService
  ) {}
  
  // Contrato v2: agregados nativos por moneda; no hay total multimoneda.
  @Get('ventas-tiempo')
  @RequirePermission('analytics.ventas.read')
  async getVentasTiempo(@CurrentTenant() tenantId: string, @Query() filtros: any): Promise<any> {
    return new AnalyticsNativeRead(this.supabase.getClient()).sales(tenantId, filtros);
  }

  @Get('deudas-clientes')
  @RequirePermission('analytics.cobranza.read')
  async getDeudasClientes(@CurrentTenant() tenantId: string, @Query() filtros: any): Promise<any> {
    return new AnalyticsNativeRead(this.supabase.getClient()).debt(tenantId, false);
  }

  @Get('deudas-proveedores')
  @RequirePermission('analytics.cobranza.read')
  async getDeudasProveedores(@CurrentTenant() tenantId: string, @Query() filtros: any): Promise<any> {
    return new AnalyticsNativeRead(this.supabase.getClient()).debt(tenantId, true);
  }

  @Get('ventas-categoria')
  @RequirePermission('analytics.ventas.read')
  async getVentasCategoria(@CurrentTenant() tenantId: string, @Query() filtros: any = {}): Promise<any> {
    return new AnalyticsNativeRead(this.supabase.getClient()).categories(tenantId, filtros);
  }

  @Get('kpis-visuales')
  @RequirePermission('analytics.finanzas.read')
  async getKpisVisuales(@CurrentTenant() tenantId: string): Promise<any> {
    return new AnalyticsNativeRead(this.supabase.getClient()).kpis(tenantId);
  }

  private async obtenerVentasEmitidas(
    tenantId: string,
    opts: { gte: string; lte?: string; lt?: string },
  ): Promise<Array<{ fecha: string; total: number }>> {
    let query = this.supabase.getClient()
      .from('documentos')
      .select('fecha_emision, total')
      .eq('tenant_id', tenantId) // ✅ Filtro de tenant
      .in('tipo_documento', ['FACTURA', 'BOLETA'])
      .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")')
      .gte('fecha_emision', opts.gte);

    if (opts.lt) query = query.lt('fecha_emision', opts.lt);
    if (opts.lte) query = query.lte('fecha_emision', opts.lte);

    const { data, error } = await query.order('fecha_emision');
    if (error) {
      throw new Error(`Error consultando ventas: ${error.message}`);
    }
    return (data ?? []).map((d: any) => ({
      fecha: d.fecha_emision,
      total: Number(d.total ?? 0),
    }));
  }

  @Get('rentabilidad-productos')
  @RequirePermission('analytics.rentabilidad.read') // HARDENING: análisis sensible de rentabilidad.
  @ApiOperation({ summary: 'Análisis de rentabilidad por productos' })
  @ApiResponse({ status: 200, description: 'Análisis de rentabilidad obtenido exitosamente' })
  async getRentabilidadProductos(@CurrentTenant() tenantId: string, @Query() filtros: any) {
    try {
      console.log(`📊 [Analytics] [Tenant: ${tenantId}] Analizando rentabilidad por productos`);

      // Obtener productos con sus ventas y compras
      const { data: productos, error: productosError } = await this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, precio, costo')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      if (productosError) {
        console.error('❌ Error obteniendo productos:', productosError);
        throw new Error(`Error consultando productos: ${productosError.message}`);
      }

      console.log(`📦 Se encontraron ${productos?.length || 0} productos`);

      // Obtener detalles de ventas
      const { data: ventasDetalles, error: ventasError } = await this.supabase.getClient()
        .from('venta_detalles')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      if (ventasError) {
        console.error('⚠️ Error obteniendo ventas:', ventasError);
      }

      // Obtener detalles de compras
      const { data: comprasDetalles, error: comprasError } = await this.supabase.getClient()
        .from('orden_compra_detalles')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      if (comprasError) {
        console.error('⚠️ Error obteniendo compras:', comprasError);
      }

      const productosRentabilidad = productos?.map(producto => {
        const ventasProducto = ventasDetalles?.filter(v => v.producto_id === producto.id) || [];
        const comprasProducto = comprasDetalles?.filter(c => c.producto_id === producto.id) || [];
        
        const costoPromedio = this.calcularCostoPromedio(comprasProducto) || parseFloat(producto.costo || 0);
        const precioVentaPromedio = this.calcularPrecioVentaPromedio(ventasProducto) || parseFloat(producto.precio || 0);
        const margenBruto = precioVentaPromedio - costoPromedio;
        const margenPorcentaje = precioVentaPromedio > 0 ? (margenBruto / precioVentaPromedio * 100) : 0;
        const volumen = this.calcularVolumenVentas(ventasProducto);
        
        return {
          producto: producto.nombre,
          codigo: producto.codigo,
          margenPorcentaje: parseFloat(margenPorcentaje.toFixed(2)),
          volumen: volumen,
          rentabilidadTotal: parseFloat((margenBruto * volumen).toFixed(2)),
          costoPromedio: parseFloat(costoPromedio.toFixed(2)),
          precioVentaPromedio: parseFloat(precioVentaPromedio.toFixed(2))
        };
      }) || [];

      const recomendaciones = this.generarRecomendacionesRentabilidad(productosRentabilidad);

      console.log(`✅ Análisis de rentabilidad completado: ${productosRentabilidad.length} productos analizados`);

      return {
        success: true,
        data: {
          graficoBarras: {
            labels: productosRentabilidad.map(p => p.producto),
            datasets: [{
              label: 'Margen Bruto (%)',
              data: productosRentabilidad.map(p => p.margenPorcentaje),
              backgroundColor: '#3b82f6'
            }]
          },
          graficoScatter: {
            datasets: [{
              label: 'Productos',
              data: productosRentabilidad.map(p => ({
                x: p.volumen,
                y: p.margenPorcentaje,
                producto: p.producto
              })),
              backgroundColor: '#10b981'
            }]
          },
          tablaDetalle: productosRentabilidad,
          recomendaciones
        }
      };
    } catch (error) {
      console.error('❌ Error analizando rentabilidad:', error);
      return { 
        success: false, 
        message: error.message,
        data: {
          graficoBarras: { labels: [], datasets: [] },
          graficoScatter: { datasets: [] },
          tablaDetalle: [],
          recomendaciones: ['Error al calcular rentabilidad. Verifique que existan productos y ventas.']
        }
      };
    }
  }

  @Get('punto-equilibrio')
  @RequirePermission('analytics.finanzas.read') // HARDENING: cálculo financiero restringido.
  @ApiOperation({ summary: 'Cálculo del punto de equilibrio' })
  @ApiResponse({ status: 200, description: 'Análisis de punto de equilibrio obtenido exitosamente' })
  async getPuntoEquilibrio(@CurrentTenant() tenantId: string, @Query() filtros: any) {
    try {
      console.log(`📊 [Analytics] [Tenant: ${tenantId}] Calculando punto de equilibrio`);

      // Obtener productos
      const { data: productos, error: productosError } = await this.supabase.getClient()
        .from('productos')
        .select('id, codigo, nombre, precio, costo')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      if (productosError) {
        console.error('❌ Error obteniendo productos:', productosError);
        throw new Error(`Error consultando productos: ${productosError.message}`);
      }

      // Obtener detalles de ventas
      const { data: ventasDetalles } = await this.supabase.getClient()
        .from('venta_detalles')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      // Obtener detalles de compras
      const { data: comprasDetalles } = await this.supabase.getClient()
        .from('orden_compra_detalles')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId); // ✅ Filtro de tenant

      // Calcular costos fijos estimados (gastos operativos del último mes)
      // Como no existe la tabla costos_fijos, vamos a estimarlos desde gastos
      const { data: gastos } = await this.supabase.getClient()
        .from('gastos')
        .select('monto')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .gte('fecha', new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString());

      const totalCostosFijos = gastos?.reduce((sum, gasto) => sum + parseFloat(gasto.monto || 0), 0) || 10000; // Default 10,000 si no hay datos
      
      console.log(`💰 Costos fijos estimados: S/ ${totalCostosFijos.toFixed(2)}`);

      const analisisPorProducto = productos?.map(producto => {
        const ventasProducto = ventasDetalles?.filter(v => v.producto_id === producto.id) || [];
        const comprasProducto = comprasDetalles?.filter(c => c.producto_id === producto.id) || [];
        
        const costoVariable = this.calcularCostoPromedio(comprasProducto) || parseFloat(producto.costo || 0);
        const precioVenta = this.calcularPrecioVentaPromedio(ventasProducto) || parseFloat(producto.precio || 0);
        const margenContribucion = precioVenta - costoVariable;
        const puntoEquilibrioUnidades = margenContribucion > 0 ? totalCostosFijos / margenContribucion : 0;
        
        return {
          producto: producto.nombre,
          codigo: producto.codigo,
          precioVenta: parseFloat(precioVenta.toFixed(2)),
          costoVariable: parseFloat(costoVariable.toFixed(2)),
          margenContribucion: parseFloat(margenContribucion.toFixed(2)),
          puntoEquilibrioUnidades: Math.ceil(puntoEquilibrioUnidades),
          puntoEquilibrioSoles: Math.ceil(puntoEquilibrioUnidades * precioVenta)
        };
      }) || [];

      console.log(`✅ Punto de equilibrio calculado: ${analisisPorProducto.length} productos analizados`);

      return {
        success: true,
        data: {
          totalCostosFijos,
          analisisPorProducto,
          resumen: {
            productosRentables: analisisPorProducto.filter(p => p.margenContribucion > 0).length,
            productosNoRentables: analisisPorProducto.filter(p => p.margenContribucion <= 0).length,
            recomendacion: this.generarRecomendacionPuntoEquilibrio(analisisPorProducto, totalCostosFijos)
          }
        }
      };
    } catch (error) {
      console.error('❌ Error calculando punto de equilibrio:', error);
      return { 
        success: false, 
        message: error.message,
        data: {
          totalCostosFijos: 0,
          analisisPorProducto: [],
          resumen: {
            productosRentables: 0,
            productosNoRentables: 0,
            recomendacion: 'Error al calcular punto de equilibrio. Verifique que existan productos y datos de costos.'
          }
        }
      };
    }
  }

  @Get('escenarios-financieros')
  @RequirePermission('analytics.finanzas.read') // HARDENING: simulaciones financieras restringidas.
  @ApiOperation({ summary: 'Simulaciones de escenarios financieros' })
  @ApiResponse({ status: 200, description: 'Escenarios financieros simulados exitosamente' })
  async getEscenariosFinancieros(@CurrentTenant() tenantId: string, @Query('escenario') escenario: string = 'base', @Query() filtros: any) {
    try {
      console.log(`📊 [Analytics] [Tenant: ${tenantId}] Simulando escenarios financieros`);
      const ventasActuales = await this.obtenerVentasUltimos12Meses(tenantId);
      const costosActuales = await this.obtenerCostosUltimos12Meses(tenantId);
      
      const escenarios = this.simularEscenarios(ventasActuales, costosActuales, escenario);
      
      return {
        success: true,
        data: {
          escenarioActual: escenario,
          proyecciones: escenarios,
          analisisSensibilidad: this.generarAnalisisSensibilidad(ventasActuales, costosActuales),
          recomendaciones: this.generarRecomendacionesEscenarios(escenarios)
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Métodos auxiliares privados para cálculos financieros
  private calcularCostoPromedio(compras: any[]): number {
    if (!compras || compras.length === 0) return 0;
    const totalCosto = compras.reduce((sum, compra) => sum + (parseFloat(compra.precio_unitario || 0) * parseInt(compra.cantidad || 0)), 0);
    const totalCantidad = compras.reduce((sum, compra) => sum + parseInt(compra.cantidad || 0), 0);
    return totalCantidad > 0 ? totalCosto / totalCantidad : 0;
  }

  private calcularPrecioVentaPromedio(ventas: any[]): number {
    if (!ventas || ventas.length === 0) return 0;
    const totalIngresos = ventas.reduce((sum, venta) => sum + (parseFloat(venta.precio_unitario || 0) * parseInt(venta.cantidad || 0)), 0);
    const totalCantidad = ventas.reduce((sum, venta) => sum + parseInt(venta.cantidad || 0), 0);
    return totalCantidad > 0 ? totalIngresos / totalCantidad : 0;
  }

  private calcularVolumenVentas(ventas: any[]): number {
    return ventas ? ventas.reduce((sum, venta) => sum + parseInt(venta.cantidad || 0), 0) : 0;
  }

  private generarRecomendacionesRentabilidad(productos: any[]): string[] {
    const recomendaciones = [];
    const productosBajoMargen = productos.filter(p => p.margenPorcentaje < 10);
    
    if (productosBajoMargen.length > 0) {
      recomendaciones.push(`Considerar aumentar precios de ${productosBajoMargen.length} productos con márgenes bajos`);
    }
    
    const productosAltoVolumenBajoMargen = productos.filter(p => p.volumen > 100 && p.margenPorcentaje < 15);
    if (productosAltoVolumenBajoMargen.length > 0) {
      recomendaciones.push(`Optimizar costos de productos de alto volumen`);
    }
    
    return recomendaciones;
  }

  private generarAlertasCobranza(cuentas: any[]): any[] {
    const ahora = new Date();
    return cuentas?.filter(cuenta => {
      const diasVencido = Math.floor((ahora.getTime() - new Date(cuenta.fecha_vencimiento).getTime()) / (1000 * 60 * 60 * 24));
      return diasVencido > 30;
    }).map(cuenta => ({
      tipo: 'VENCIDO',
      mensaje: `Cliente ${cuenta.numero || cuenta.cliente_id || 'sin nombre'} tiene ${Math.floor((ahora.getTime() - new Date(cuenta.fecha_vencimiento).getTime()) / (1000 * 60 * 60 * 24))} días de atraso`,
      monto: parseFloat(cuenta.saldo ?? cuenta.monto_pendiente ?? cuenta.monto_total ?? 0),
      fechaVencimiento: cuenta.fecha_vencimiento
    })) || [];
  }

  private async obtenerVentasUltimos12Meses(tenantId: string): Promise<number[]> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const ventas = [];
    for (let i = 11; i >= 0; i--) {
      const fechaInicio = new Date();
      fechaInicio.setMonth(fechaInicio.getMonth() - i);
      fechaInicio.setDate(1);
      
      const fechaFin = new Date(fechaInicio);
      fechaFin.setMonth(fechaFin.getMonth() + 1);
      
      const data = await this.obtenerVentasEmitidas(tenantId, {
        gte: fechaInicio.toISOString(),
        lt: fechaFin.toISOString(),
      });

      ventas.push(data.reduce((sum, v) => sum + parseFloat(String(v.total || 0)), 0) || 0);
    }
    return ventas;
  }

  private async obtenerCostosUltimos12Meses(tenantId: string): Promise<number[]> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const costos = [];
    for (let i = 11; i >= 0; i--) {
      const fechaInicio = new Date();
      fechaInicio.setMonth(fechaInicio.getMonth() - i);
      fechaInicio.setDate(1);
      
      const fechaFin = new Date(fechaInicio);
      fechaFin.setMonth(fechaFin.getMonth() + 1);
      
      const { data } = await this.supabase.getClient()
        .from('gastos')
        .select('monto')
        .eq('tenant_id', tenantId) // ✅ Filtro de tenant
        .gte('fecha', fechaInicio.toISOString())
        .lt('fecha', fechaFin.toISOString());
      
      costos.push(data?.reduce((sum, g) => sum + parseFloat(g.monto || 0), 0) || 0);
    }
    return costos;
  }

  private simularEscenarios(ventas: number[], costos: number[], escenario: string): any {
    const factorCrecimiento = escenario === 'optimista' ? 1.2 : escenario === 'pesimista' ? 0.8 : 1.0;
    const ventasProyectadas = ventas.map(v => v * factorCrecimiento);
    
    return {
      ventasProyectadas,
      costosProyectados: costos.map(c => c * 0.95), // Asumiendo 5% de reducción de costos
      utilidadProyectada: ventasProyectadas.map((v, i) => v - costos[i]),
      roi: ventasProyectadas.reduce((a, b) => a + b, 0) / costos.reduce((a, b) => a + b, 0)
    };
  }

  private generarAnalisisSensibilidad(ventas: number[], costos: number[]): any {
    return {
      impacto5Porciento: ventas.map(v => v * 0.05),
      impacto10Porciento: ventas.map(v => v * 0.10),
      umbralRiesgo: Math.min(...ventas) * 0.9
    };
  }

  private generarRecomendacionesEscenarios(escenarios: any): string[] {
    return [
      'Monitorear costos variables mensualmente',
      'Establecer límites de gasto por categoría',
      'Considerar diversificación de ingresos'
    ];
  }

  private generarRecomendacionPuntoEquilibrio(productos: any[], costosFijos: number): string {
    if (costosFijos > 10000) {
      return 'Considerar reducción de costos fijos o aumento de precios';
    }
    return 'El punto de equilibrio está dentro de rangos aceptables';
  }
}
