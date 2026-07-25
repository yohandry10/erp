import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CacheService } from '../../shared/cache/cache.service';
import Decimal from 'decimal.js';

export interface DashboardStats {
  totalCpe: number;
  totalGre: number;
  totalSire: number;
  totalUsers: number;
  totalInventario: number;
  totalCompras: number;
  totalCotizaciones: number;
  ventasMes: number;
  ventasHoy: number;
  comprasMes: number;
  valorInventario: number;
  productosConStockBajo: number;
  cotizacionesPendientes: number;
  ordenesCompraPendientes: number;
  movimientosHoy: number;
  tasaConversionCotizaciones: number;
  crecimientoVentas: number;
  ultimaActualizacion: string;
  periodoCalculado: {
    inicio: string;
    fin: string;
  };
}

export interface Activity {
  id: string;
  type: string;
  description: string;
  amount: number;
  date: string;
  status: 'success' | 'warning' | 'error' | 'pending';
}

@Injectable()
export class DashboardMetricsService {
  private readonly logger = new Logger(DashboardMetricsService.name);
  private cacheCleanupInterval?: NodeJS.Timeout;

  // TTL configurable: 10 minutos para stats, 5 minutos para activities (más frecuentes)
  private readonly STATS_CACHE_TTL_SECONDS = 10 * 60; // 10 minutos en segundos
  private readonly ACTIVITIES_CACHE_TTL_SECONDS = 5 * 60; // 5 minutos en segundos

  constructor(
    private readonly supabase: SupabaseService,
    private readonly cacheService: CacheService,
  ) {
    this.logger.log('📊 [DashboardMetricsService] Servicio de métricas inicializado con Redis cache');
    // Limpiar cache expirado cada 5 minutos (solo para fallback)
    this.cacheCleanupInterval = setInterval(() => this.cacheService.cleanExpired(), 5 * 60 * 1000);
    this.cacheCleanupInterval.unref?.();
  }

  onModuleDestroy() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = undefined;
    }
  }

  /**
   * Genera una clave de cache única para estadísticas
   */
  private getStatsCacheKey(tenantId: string, periodo?: string): string {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const periodoKey = periodo || `${inicioMes.getFullYear()}-${inicioMes.getMonth()}`;
    return `dashboard:stats:${tenantId}:${periodoKey}`;
  }

  /**
   * Genera una clave de cache única para actividades
   */
  private getActivitiesCacheKey(tenantId: string): string {
    return `dashboard:activities:${tenantId}`;
  }

  /**
   * Obtiene estadísticas del cache si están disponibles y no han expirado
   */
  private async getStatsFromCache(tenantId: string, periodo?: string): Promise<DashboardStats | null> {
    const key = this.getStatsCacheKey(tenantId, periodo);
    const cached = await this.cacheService.get<DashboardStats>(key);

    if (cached) {
      this.logger.debug(`✅ [Cache] Hit para estadísticas: ${key}`);
      return cached;
    }

    return null;
  }

  /**
   * Obtiene actividades del cache si están disponibles y no han expirado
   */
  private async getActivitiesFromCache(tenantId: string): Promise<Activity[] | null> {
    const key = this.getActivitiesCacheKey(tenantId);
    const cached = await this.cacheService.get<Activity[]>(key);

    if (cached) {
      this.logger.debug(`✅ [Cache] Hit para actividades: ${key}`);
      return cached;
    }

    return null;
  }

  /**
   * Guarda estadísticas en el cache
   */
  private async setStatsCache(tenantId: string, data: DashboardStats, periodo?: string): Promise<void> {
    const key = this.getStatsCacheKey(tenantId, periodo);
    await this.cacheService.set(key, data, this.STATS_CACHE_TTL_SECONDS);
    this.logger.debug(`💾 [Cache] Estadísticas guardadas: ${key} (expira en ${this.STATS_CACHE_TTL_SECONDS / 60} min)`);
  }

  /**
   * Guarda actividades en el cache
   */
  private async setActivitiesCache(tenantId: string, data: Activity[]): Promise<void> {
    const key = this.getActivitiesCacheKey(tenantId);
    await this.cacheService.set(key, data, this.ACTIVITIES_CACHE_TTL_SECONDS);
    this.logger.debug(`💾 [Cache] Actividades guardadas: ${key} (expira en ${this.ACTIVITIES_CACHE_TTL_SECONDS / 60} min)`);
  }

  /**
   * Invalida el cache de estadísticas para un tenant específico
   */
  async invalidateStatsCache(tenantId: string): Promise<void> {
    const pattern = `dashboard:stats:${tenantId}:*`;
    const deleted = await this.cacheService.delPattern(pattern);

    if (deleted > 0) {
      this.logger.log(`🗑️ [Cache] Cache de estadísticas invalidado para tenant ${tenantId}: ${deleted} entradas`);
    }
  }

  /**
   * Invalida el cache de actividades para un tenant específico
   */
  async invalidateActivitiesCache(tenantId: string): Promise<void> {
    const key = this.getActivitiesCacheKey(tenantId);
    await this.cacheService.del(key);
    this.logger.log(`🗑️ [Cache] Cache de actividades invalidado para tenant ${tenantId}`);
  }

  /**
   * Invalida todo el cache para un tenant
   */
  async invalidateTenantCache(tenantId: string): Promise<void> {
    await this.invalidateStatsCache(tenantId);
    await this.invalidateActivitiesCache(tenantId);
  }

  /**
   * Obtiene estadísticas del dashboard con cache
   */
  async getStats(tenantId: string): Promise<DashboardStats> {
    // Intentar obtener del cache
    const cached = await this.getStatsFromCache(tenantId);
    if (cached) {
      return cached;
    }

    this.logger.log(`📊 [DashboardMetricsService] Calculando estadísticas para tenant: ${tenantId}`);

    const client = this.supabase.getClient();

    // Obtener fechas para filtros
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    inicioMes.setHours(0, 0, 0, 0);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    finMes.setHours(23, 59, 59, 999);
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    inicioHoy.setHours(0, 0, 0, 0);

    // Consultas en paralelo para obtener datos reales
    const [
      cpeResult,
      cpeHoyResult,
      greResult,
      productosResult,
      comprasTodasResult,
      usuariosResult,
      cotizacionesResult,
      cotizacionesPendientesResult,
      sireResult,
      ventasPosResult
    ] = await Promise.allSettled([
      client.from('cpe')
        .select('total_venta, total, created_at, tenant_id')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioMes.toISOString())
        .lte('created_at', finMes.toISOString())
        .order('created_at', { ascending: false }),
      client.from('cpe')
        .select('total_venta, total')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioHoy.toISOString()),
      client.from('gre_guias')
        .select('id')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioMes.toISOString()),
      client.from('productos')
        .select('id, precio, precio_venta, stock_actual, stock, stock_minimo')
        .eq('tenant_id', tenantId),
      client.from('ordenes_compra')
        .select('total, estado, fecha_orden, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioMes.toISOString())
        .lte('created_at', finMes.toISOString())
        .order('created_at', { ascending: false }),
      client.from('usuarios_sistema')
        .select('id')
        .eq('tenant_id', tenantId),
      client.from('cotizaciones')
        .select('id, estado')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioMes.toISOString()),
      client.from('cotizaciones')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('estado', 'PENDIENTE'),
      client.from('sire_files')
        .select('id')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioMes.toISOString()),
      // Ventas POS del periodo. Las que aún no tienen CPE emitido (cpe_id null)
      // no aparecen en la tabla `cpe`, así que sin esto el dashboard muestra
      // "Ventas: S/ 0" aunque el POS haya registrado ventas pagadas.
      client.from('ventas_pos')
        .select('total, cpe_id, created_at')
        .eq('tenant_id', tenantId)
        .neq('estado', 'ANULADA')
        .gte('created_at', inicioMes.toISOString())
        .lte('created_at', finMes.toISOString())
    ]);

    // Procesar resultados de forma segura
    const cpeData = cpeResult.status === 'fulfilled' ? cpeResult.value.data : [];
    const cpeHoyData = cpeHoyResult.status === 'fulfilled' ? cpeHoyResult.value.data : [];
    const greData = greResult.status === 'fulfilled' ? greResult.value.data : [];
    const productosData = productosResult.status === 'fulfilled' ? productosResult.value.data : [];
    const comprasData = comprasTodasResult.status === 'fulfilled' ? comprasTodasResult.value.data : [];
    const usuariosData = usuariosResult.status === 'fulfilled' ? usuariosResult.value.data : [];
    const cotizacionesData = cotizacionesResult.status === 'fulfilled' ? cotizacionesResult.value.data : [];
    const cotizacionesPendientesData = cotizacionesPendientesResult.status === 'fulfilled' ? cotizacionesPendientesResult.value.data : [];
    const sireData = sireResult.status === 'fulfilled' ? sireResult.value.data : [];
    const ventasPosData = ventasPosResult.status === 'fulfilled' ? ventasPosResult.value.data : [];

    // Calcular métricas reales. Las ventas POS con CPE emitido ya están
    // contadas en `cpe`; solo se suman las que siguen pendientes de emisión.
    const ventasPosSinCpe = (ventasPosData || []).filter((v) => !v.cpe_id);
    const ventasPosSinCpeHoy = ventasPosSinCpe.filter(
      (v) => new Date(v.created_at) >= inicioHoy,
    );
    const ingresosMes = this.sumarTotalesCpe(cpeData) + this.sumarTotales(ventasPosSinCpe);
    const ingresosHoy = this.sumarTotalesCpe(cpeHoyData) + this.sumarTotales(ventasPosSinCpeHoy);
    const inversionCompras = this.sumarTotales(comprasData);
    const totalProductos = productosData?.length || 0;
    const valorInventario = this.calcularValorInventario(productosData);
    const productosStockBajo = this.contarProductosStockBajo(productosData);
    const comprasPendientes = comprasData?.filter(c => this.estadoNormalizado(c.estado) === 'pendiente').length || 0;

    // Calcular tasa de conversión de cotizaciones
    const totalCotizaciones = cotizacionesData?.length || 0;
    const cotizacionesAceptadas = cotizacionesData?.filter(c => this.estadoNormalizado(c.estado) === 'aceptada').length || 0;
    const tasaConversion = totalCotizaciones > 0 ?
      ((cotizacionesAceptadas / totalCotizaciones) * 100) : 0;

    const estadisticas: DashboardStats = {
      totalCpe: cpeData?.length || 0,
      totalGre: greData?.length || 0,
      totalSire: sireData?.length || 0,
      totalUsers: usuariosData?.length || 0,
      totalInventario: totalProductos,
      totalCompras: comprasData?.length || 0,
      totalCotizaciones: totalCotizaciones,
      ventasMes: ingresosMes,
      ventasHoy: ingresosHoy,
      comprasMes: inversionCompras,
      valorInventario: valorInventario,
      productosConStockBajo: productosStockBajo,
      cotizacionesPendientes: cotizacionesPendientesData?.length || 0,
      ordenesCompraPendientes: comprasPendientes,
      movimientosHoy: 0,
      tasaConversionCotizaciones: Number(tasaConversion.toFixed(1)),
      crecimientoVentas: 0,
      ultimaActualizacion: new Date().toISOString(),
      periodoCalculado: {
        inicio: this.formatDateOnly(inicioMes),
        fin: this.formatDateOnly(finMes)
      }
    };

    // Guardar en cache
    await this.setStatsCache(tenantId, estadisticas);

    return estadisticas;
  }

  /**
   * Obtiene actividades recientes con cache
   */
  async getActivities(tenantId: string): Promise<Activity[]> {
    // Intentar obtener del cache
    const cached = await this.getActivitiesFromCache(tenantId);
    if (cached) {
      return cached;
    }

    this.logger.log(`📋 [DashboardMetricsService] Calculando actividades para tenant: ${tenantId}`);

    const client = this.supabase.getClient();
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Obtener actividades reales de forma segura
    const [
      cpeResult,
      greResult,
      comprasResult,
      cotizacionesResult
    ] = await Promise.allSettled([
      client.from('cpe')
        .select('id, tipo_documento, serie, numero, total_venta, estado, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', hace24h.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      client.from('gre_guias')
        .select('id, numero, fecha_traslado, estado, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', hace24h.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      client.from('ordenes_compra')
        .select('id, numero, total, fecha_orden, estado, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', hace24h.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      client.from('cotizaciones')
        .select('id, numero, total, fecha_cotizacion, estado, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', hace24h.toISOString())
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    const actividades: Activity[] = [];

    // Procesar CPE
    if (cpeResult.status === 'fulfilled' && cpeResult.value.data) {
      cpeResult.value.data.forEach(cpe => {
        actividades.push({
          id: `cpe-${cpe.id}`,
          type: 'CPE',
          description: `${this.getCpeDocumentLabel(cpe.tipo_documento)} ${cpe.serie}-${cpe.numero.toString().padStart(8, '0')}`,
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
          date: gre.created_at || gre.fecha_traslado,
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
          date: compra.created_at || compra.fecha_orden,
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
          date: cotizacion.created_at || cotizacion.fecha_cotizacion,
          status: this.mapearEstado(cotizacion.estado)
        });
      });
    }

    // Ordenar por fecha descendente
    const actividadesOrdenadas = actividades
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    // Guardar en cache
    await this.setActivitiesCache(tenantId, actividadesOrdenadas);

    return actividadesOrdenadas;
  }

  // Métodos de utilidad privados
  // ✅ FIX: Usar Decimal.js para sumas financieras
  private sumarTotales(data: any[]): number {
    if (!Array.isArray(data)) return 0;
    return data.reduce(
      (sum, item) => sum.plus(item.total || 0),
      new Decimal(0)
    ).toDecimalPlaces(2).toNumber();
  }

  private sumarTotalesCpe(data: any[]): number {
    if (!Array.isArray(data)) return 0;
    return data.reduce(
      (sum, item) => sum.plus(item.total_venta ?? item.total ?? 0),
      new Decimal(0)
    ).toDecimalPlaces(2).toNumber();
  }

  private calcularValorInventario(productos: any[]): number {
    if (!Array.isArray(productos)) return 0;
    return productos.reduce(
      (sum, p) => {
        // `precio` es columna legacy que suele venir en 0/null; con `??` ese 0
        // anulaba el fallback a precio_venta y el dashboard mostraba S/ 0.00.
        const precio = Number(p.precio) || Number(p.precio_venta) || 0;
        const stock = Number(p.stock_actual ?? p.stock ?? 0);
        return sum.plus(new Decimal(precio).times(stock));
      },
      new Decimal(0)
    ).toDecimalPlaces(2).toNumber();
  }

  private contarProductosStockBajo(productos: any[]): number {
    if (!Array.isArray(productos)) return 0;
    return productos.filter(p =>
      parseFloat((p as any).stock_actual ?? (p as any).stock ?? 0) <= parseFloat(p.stock_minimo || 0)
    ).length;
  }

  private estadoNormalizado(estado: unknown): string {
    return String(estado ?? '').trim().toLowerCase();
  }

  private formatDateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  private getCpeDocumentLabel(tipoDocumento: unknown): string {
    const labels: Record<string, string> = {
      '01': 'Factura',
      '03': 'Boleta',
      '07': 'Nota de crédito',
      '08': 'Nota de débito',
    };

    return labels[String(tipoDocumento ?? '').trim()] ?? 'Comprobante';
  }
}
