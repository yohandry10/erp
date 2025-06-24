import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService } from '../events/event-bus.service';

export interface DashboardMetrics {
  // Métricas principales
  totalCpe: number;
  totalGre: number;
  totalSire: number;
  totalUsers: number;
  totalInventario: number;
  totalCompras: number;
  totalCotizaciones: number;
  
  // Métricas financieras
  ventasMes: number;
  ventasHoy: number;
  comprasMes: number;
  valorInventario: number;
  
  // Indicadores de gestión
  productosConStockBajo: number;
  cotizacionesPendientes: number;
  ordenesCompraPendientes: number;
  movimientosHoy: number;
  
  // Ratios y porcentajes
  tasaConversionCotizaciones: number;
  crecimientoVentas: number;
  
  // Metadatos
  ultimaActualizacion: string;
  periodoCalculado: {
    inicio: string;
    fin: string;
  };
}

export interface ActivityItem {
  id: string;
  type: 'CPE' | 'GRE' | 'COMPRA' | 'COTIZACION' | 'VENTA';
  description: string;
  amount?: number;
  date: string;
  status: 'success' | 'warning' | 'error' | 'pending';
}

@Injectable()
export class DashboardIntegrationService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService
  ) {
    console.log('🚀 [DashboardIntegration] Servicio inicializado');
  }

  async getConsolidatedMetrics(): Promise<DashboardMetrics> {
    try {
      console.log('📊 [DashboardIntegration] Consolidando métricas de todos los módulos...');
      
      const client = this.supabase.getClient();
      
      // Obtener fechas para filtros
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      
      // Ejecutar todas las consultas en paralelo
      const [
        // Módulo POS - Ventas
        ventasHoyData,
        ventasMesData,
        ventasMesAnteriorData,
        
        // Módulo Compras  
        comprasMesData,
        ordenesCompraPendientesData,
        
        // Módulo Inventario
        productosData,
        productosStockBajoData,
        movimientosHoyData,
        
        // Módulo CPE
        cpeDelMesData,
        
        // Módulo GRE
        greDelMesData,
        
        // Módulo SIRE
        sireDelMesData,
        
        // Módulo Cotizaciones
        cotizacionesDelMesData,
        cotizacionesPendientesData,
        cotizacionesAceptadasData,
        
        // Sistema
        usuariosData
      ] = await Promise.all([
        this.getVentasHoy(client, hoy),
        this.getVentasMes(client, inicioMes, finMes),
        this.getVentasMesAnterior(client, mesAnterior, finMesAnterior),
        this.getComprasMes(client, inicioMes, finMes),
        this.getOrdenesCompraPendientes(client),
        this.getProductos(client),
        this.getProductosStockBajo(client),
        this.getMovimientosHoy(client, hoy),
        this.getCpeDelMes(client, inicioMes, finMes),
        this.getGreDelMes(client, inicioMes, finMes),
        this.getSireDelMes(client, inicioMes, finMes),
        this.getCotizacionesDelMes(client, inicioMes, finMes),
        this.getCotizacionesPendientes(client),
        this.getCotizacionesAceptadas(client),
        this.getUsuarios(client)
      ]);

      // Procesar y calcular métricas
      const ventasHoyTotal = this.sumarTotales(ventasHoyData);
      const ventasMesTotal = this.sumarTotales(ventasMesData);
      const ventasMesAnteriorTotal = this.sumarTotales(ventasMesAnteriorData);
      const comprasMesTotal = this.sumarTotales(comprasMesData);
      
      const totalProductos = productosData?.length || 0;
      const valorInventario = this.calcularValorInventario(productosData);
      
      const totalCotizaciones = cotizacionesDelMesData?.length || 0;
      const totalAceptadas = cotizacionesAceptadasData?.length || 0;
      const tasaConversion = totalCotizaciones > 0 ? 
        ((totalAceptadas / totalCotizaciones) * 100) : 0;

      const crecimientoVentas = ventasMesAnteriorTotal > 0 ? 
        (((ventasMesTotal - ventasMesAnteriorTotal) / ventasMesAnteriorTotal) * 100) : 0;

      const metrics: DashboardMetrics = {
        // Métricas principales
        totalCpe: cpeDelMesData?.length || 0,
        totalGre: greDelMesData?.length || 0,
        totalSire: sireDelMesData?.length || 0,
        totalUsers: usuariosData?.length || 0,
        totalInventario: totalProductos,
        totalCompras: comprasMesData?.length || 0,
        totalCotizaciones: totalCotizaciones,
        
        // Métricas financieras
        ventasMes: ventasMesTotal,
        ventasHoy: ventasHoyTotal,
        comprasMes: comprasMesTotal,
        valorInventario: valorInventario,
        
        // Indicadores de gestión
        productosConStockBajo: productosStockBajoData?.length || 0,
        cotizacionesPendientes: cotizacionesPendientesData?.length || 0,
        ordenesCompraPendientes: ordenesCompraPendientesData?.length || 0,
        movimientosHoy: movimientosHoyData?.length || 0,
        
        // Ratios y porcentajes
        tasaConversionCotizaciones: Number(tasaConversion.toFixed(1)),
        crecimientoVentas: Number(crecimientoVentas.toFixed(1)),
        
        // Metadatos
        ultimaActualizacion: new Date().toISOString(),
        periodoCalculado: {
          inicio: inicioMes.toISOString().split('T')[0],
          fin: finMes.toISOString().split('T')[0]
        }
      };

      console.log('✅ [DashboardIntegration] Métricas consolidadas exitosamente:', {
        totalMetricas: Object.keys(metrics).length,
        ventasMes: metrics.ventasMes,
        totalProductos: metrics.totalInventario,
        tasaConversion: metrics.tasaConversionCotizaciones
      });

      // Emitir evento de métricas actualizadas
      this.eventBus.emitDashboardMetricsUpdated(metrics);

      return metrics;
    } catch (error) {
      console.error('❌ [DashboardIntegration] Error consolidando métricas:', error);
      throw error;
    }
  }

  async getRecentActivities(): Promise<ActivityItem[]> {
    try {
      console.log('📋 [DashboardIntegration] Obteniendo actividades recientes...');
      
      const client = this.supabase.getClient();
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Obtener actividades de diferentes módulos
      const [
        ventasRecientes,
        comprasRecientes,
        cotizacionesRecientes,
        cpeRecientes,
        greRecientes
      ] = await Promise.all([
        this.getVentasRecientes(client, hace24h),
        this.getComprasRecientes(client, hace24h),
        this.getCotizacionesRecientes(client, hace24h),
        this.getCpeRecientes(client, hace24h),
        this.getGreRecientes(client, hace24h)
      ]);

      // Consolidar actividades
      const actividades: ActivityItem[] = [];
      
      // Procesar cada tipo de actividad
      this.processVentasActivities(ventasRecientes, actividades);
      this.processComprasActivities(comprasRecientes, actividades);
      this.processCotizacionesActivities(cotizacionesRecientes, actividades);
      this.processCpeActivities(cpeRecientes, actividades);
      this.processGreActivities(greRecientes, actividades);

      // Ordenar por fecha descendente y limitar
      const actividadesOrdenadas = actividades
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20);

      console.log(`✅ [DashboardIntegration] ${actividadesOrdenadas.length} actividades recientes consolidadas`);

      return actividadesOrdenadas;
    } catch (error) {
      console.error('❌ [DashboardIntegration] Error obteniendo actividades:', error);
      return [];
    }
  }

  // Métodos privados para consultas específicas
  private async getVentasHoy(client: any, hoy: Date) {
    const { data } = await client.from('ventas_pos')
      .select('total')
      .gte('fecha', hoy.toISOString().split('T')[0])
      .lt('fecha', new Date(hoy.getTime() + 24*60*60*1000).toISOString().split('T')[0]);
    return data;
  }

  private async getVentasMes(client: any, inicio: Date, fin: Date) {
    const { data } = await client.from('ventas_pos')
      .select('total')
      .gte('fecha', inicio.toISOString().split('T')[0])
      .lte('fecha', fin.toISOString().split('T')[0]);
    return data;
  }

  private async getVentasMesAnterior(client: any, inicio: Date, fin: Date) {
    const { data } = await client.from('ventas_pos')
      .select('total')
      .gte('fecha', inicio.toISOString().split('T')[0])
      .lte('fecha', fin.toISOString().split('T')[0]);
    return data;
  }

  private async getComprasMes(client: any, inicio: Date, fin: Date) {
    const { data } = await client.from('ordenes_compra')
      .select('total')
      .gte('fecha_orden', inicio.toISOString().split('T')[0])
      .lte('fecha_orden', fin.toISOString().split('T')[0]);
    return data;
  }

  private async getOrdenesCompraPendientes(client: any) {
    const { data } = await client.from('ordenes_compra')
      .select('id')
      .eq('estado', 'PENDIENTE');
    return data;
  }

  private async getProductos(client: any) {
    const { data } = await client.from('productos')
      .select('id, precio, stock, stock_minimo');
    return data;
  }

  private async getProductosStockBajo(client: any) {
    const { data } = await client.from('productos')
      .select('id')
      .lt('stock', 'stock_minimo');
    return data;
  }

  private async getMovimientosHoy(client: any, hoy: Date) {
    const { data } = await client.from('movimientos_stock')
      .select('id')
      .gte('created_at', hoy.toISOString().split('T')[0]);
    return data;
  }

  private async getCpeDelMes(client: any, inicio: Date, fin: Date) {
    const { data } = await client.from('cpe')
      .select('id')
      .gte('fecha_emision', inicio.toISOString().split('T')[0])
      .lte('fecha_emision', fin.toISOString().split('T')[0]);
    return data;
  }

  private async getGreDelMes(client: any, inicio: Date, fin: Date) {
    const { data } = await client.from('gre')
      .select('id')
      .gte('fecha_emision', inicio.toISOString().split('T')[0])
      .lte('fecha_emision', fin.toISOString().split('T')[0]);
    return data;
  }

  private async getSireDelMes(client: any, inicio: Date, fin: Date) {
    const { data } = await client.from('sire_files')
      .select('id')
      .gte('created_at', inicio.toISOString().split('T')[0])
      .lte('created_at', fin.toISOString().split('T')[0]);
    return data;
  }

  private async getCotizacionesDelMes(client: any, inicio: Date, fin: Date) {
    const { data } = await client.from('cotizaciones')
      .select('id, total')
      .gte('fecha_cotizacion', inicio.toISOString().split('T')[0])
      .lte('fecha_cotizacion', fin.toISOString().split('T')[0]);
    return data;
  }

  private async getCotizacionesPendientes(client: any) {
    const { data } = await client.from('cotizaciones')
      .select('id')
      .in('estado', ['PENDIENTE', 'ENVIADA']);
    return data;
  }

  private async getCotizacionesAceptadas(client: any) {
    const { data } = await client.from('cotizaciones')
      .select('id')
      .eq('estado', 'ACEPTADA');
    return data;
  }

  private async getUsuarios(client: any) {
    const { data } = await client.from('usuarios')
      .select('id');
    return data;
  }

  // Métodos para obtener actividades recientes
  private async getVentasRecientes(client: any, desde: Date) {
    const { data } = await client.from('ventas_pos')
      .select('id, numero_ticket, total, fecha, estado, created_at')
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);
    return data;
  }

  private async getComprasRecientes(client: any, desde: Date) {
    const { data } = await client.from('ordenes_compra')
      .select('id, numero, total, fecha_orden, estado, created_at')
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);
    return data;
  }

  private async getCotizacionesRecientes(client: any, desde: Date) {
    const { data } = await client.from('cotizaciones')
      .select('id, numero, total, fecha_cotizacion, estado, created_at')
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);
    return data;
  }

  private async getCpeRecientes(client: any, desde: Date) {
    const { data } = await client.from('cpe')
      .select('id, numero_comprobante, total, fecha_emision, estado_sunat, created_at')
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);
    return data;
  }

  private async getGreRecientes(client: any, desde: Date) {
    const { data } = await client.from('gre')
      .select('id, numero, fecha_emision, estado, created_at')
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);
    return data;
  }

  // Métodos de utilidad
  private sumarTotales(data: any[]): number {
    return data?.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0) || 0;
  }

  private calcularValorInventario(productos: any[]): number {
    return productos?.reduce((sum, p) => 
      sum + ((parseFloat(p.precio) || 0) * (parseFloat(p.stock) || 0)), 0) || 0;
  }

  // Métodos para procesar actividades
  private processVentasActivities(ventas: any[], actividades: ActivityItem[]) {
    ventas?.forEach(venta => {
      actividades.push({
        id: `venta-${venta.id}`,
        type: 'VENTA',
        description: `Venta ${venta.numero_ticket}`,
        amount: parseFloat(venta.total) || 0,
        date: venta.fecha || venta.created_at,
        status: this.mapearEstado(venta.estado)
      });
    });
  }

  private processComprasActivities(compras: any[], actividades: ActivityItem[]) {
    compras?.forEach(compra => {
      actividades.push({
        id: `compra-${compra.id}`,
        type: 'COMPRA',
        description: `Orden de Compra ${compra.numero}`,
        amount: parseFloat(compra.total) || 0,
        date: compra.fecha_orden,
        status: this.mapearEstado(compra.estado)
      });
    });
  }

  private processCotizacionesActivities(cotizaciones: any[], actividades: ActivityItem[]) {
    cotizaciones?.forEach(cotizacion => {
      actividades.push({
        id: `cotizacion-${cotizacion.id}`,
        type: 'COTIZACION',
        description: `Cotización ${cotizacion.numero}`,
        amount: parseFloat(cotizacion.total) || 0,
        date: cotizacion.fecha_cotizacion,
        status: this.mapearEstado(cotizacion.estado)
      });
    });
  }

  private processCpeActivities(cpes: any[], actividades: ActivityItem[]) {
    cpes?.forEach(cpe => {
      actividades.push({
        id: `cpe-${cpe.id}`,
        type: 'CPE',
        description: `CPE ${cpe.numero_comprobante}`,
        amount: parseFloat(cpe.total) || 0,
        date: cpe.fecha_emision,
        status: this.mapearEstadoSunat(cpe.estado_sunat)
      });
    });
  }

  private processGreActivities(gres: any[], actividades: ActivityItem[]) {
    gres?.forEach(gre => {
      actividades.push({
        id: `gre-${gre.id}`,
        type: 'GRE',
        description: `Guía de Remisión ${gre.numero}`,
        date: gre.fecha_emision,
        status: this.mapearEstado(gre.estado)
      });
    });
  }

  private mapearEstado(estado: string): 'success' | 'warning' | 'error' | 'pending' {
    const estadosMap = {
      'COMPLETADO': 'success',
      'PAGADA': 'success', 
      'ENTREGADO': 'success',
      'ACEPTADA': 'success',
      'ACEPTADO': 'success',
      'PENDIENTE': 'warning',
      'ENVIADA': 'warning',
      'EN_PROCESO': 'warning',
      'RECHAZADA': 'error',
      'CANCELADA': 'error',
      'ERROR': 'error',
      'BORRADOR': 'pending'
    };
    
    return estadosMap[estado?.toUpperCase()] || 'pending';
  }

  private mapearEstadoSunat(estadoSunat: string): 'success' | 'warning' | 'error' | 'pending' {
    const estadosMap = {
      'ACEPTADO': 'success',
      'ENVIADO': 'warning',
      'RECHAZADO': 'error',
      'PENDIENTE': 'pending'
    };
    
    return estadosMap[estadoSunat?.toUpperCase()] || 'pending';
  }
} 