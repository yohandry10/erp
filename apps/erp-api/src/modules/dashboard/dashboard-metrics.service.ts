import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CacheService } from '../../shared/cache/cache.service';
import Decimal from 'decimal.js';
import {
  calcularMetricasInventario,
  InventarioMetrics,
  obtenerPaisMetricasInventario,
} from '../inventario/inventario-metrics.util';
import { paisDelTenant } from '../../shared/utils/fecha-tenant.util';
import { fechaHoyEnPais, rangoDelDiaEnPais } from '../../shared/utils/fecha-peru.util';

// Comprobantes que no son venta: anulados por baja, rechazados o fallidos.
const CPE_SIN_VENTA = new Set(['ANULADO', 'RECHAZADO', 'ERROR']);
// Una cotización espera decisión mientras es borrador o está enviada; la
// conversión cuenta las aprobadas y las ya convertidas en pedido.
const COTIZACION_PENDIENTE = ['BORRADOR', 'ENVIADA'];
const COTIZACION_ACEPTADA = new Set(['APROBADA', 'CONVERTIDA']);

export interface DashboardStats {
  monedaBase: string;
  importesPorMoneda: Array<{ moneda: string; ventasMes: number; ventasHoy: number; comprasMes: number }>;
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
  amount?: number;
  moneda?: string;
  date: string;
  status: 'success' | 'warning' | 'error' | 'pending';
}

@Injectable()
export class DashboardMetricsService implements OnModuleDestroy {
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
    return `dashboard:stats:${tenantId}:${periodoKey}:v5`;
  }

  /**
   * Genera una clave de cache única para actividades
   */
  private getActivitiesCacheKey(tenantId: string): string {
    return `dashboard:activities:${tenantId}:v3`;
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
  async getStats(tenantId: string, forceRefresh = false): Promise<DashboardStats> {
    const client = this.supabase.getClient();

    // El resto del dashboard admite un snapshot breve, pero inventario es un
    // saldo operativo: siempre se contrasta contra el catálogo activo. Así un
    // alta, recepción o ajuste no queda oculto diez minutos por una invalidación
    // omitida, y el botón Actualizar realmente refleja el mismo dato que
    // /inventario/stats.
    // La lectura viva y la del snapshot pueden resolverse en paralelo.
    const [cached, inventario, monedaBase] = await Promise.all([
      forceRefresh ? Promise.resolve(null) : this.getStatsFromCache(tenantId),
      this.getInventarioActual(client, tenantId),
      this.getMonedaBase(client, tenantId),
    ]);
    if (cached && cached.monedaBase === monedaBase && Array.isArray(cached.importesPorMoneda)) {
      return this.aplicarInventario(cached, inventario);
    }

    this.logger.log(`📊 [DashboardMetricsService] Calculando estadísticas para tenant: ${tenantId}`);

    // Día y mes del contribuyente, no del servidor: Render corre en UTC y a las
    // 19:00 de Lima ya contaba «hoy» con las ventas de la noche anterior.
    const pais = await paisDelTenant(client, tenantId);
    const hoyLocal = fechaHoyEnPais(pais);
    const [anio, mes] = hoyLocal.split('-').map(Number);
    const primerDia = (y: number, m: number) =>
      new Date(Date.UTC(y, m - 1, 1, 12));
    const inicioHoy = new Date(rangoDelDiaEnPais(pais).desde);
    const inicioMes = new Date(rangoDelDiaEnPais(pais, primerDia(anio, mes)).desde);
    const inicioMesSiguiente = new Date(
      rangoDelDiaEnPais(pais, primerDia(mes === 12 ? anio + 1 : anio, mes === 12 ? 1 : mes + 1)).desde,
    );
    const finMes = new Date(inicioMesSiguiente.getTime() - 1);

    // Consultas en paralelo para obtener datos reales
    const [
      cpeResult,
      cpeHoyResult,
      greResult,
      comprasTodasResult,
      usuariosResult,
      cotizacionesResult,
      cotizacionesPendientesResult,
      sireResult,
      ventasPosResult
    ] = await Promise.allSettled([
      client.from('cpe')
        .select('total_venta, total, moneda, tipo_documento, estado, created_at, tenant_id, documento_id, simulated_origin, metadata')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioMes.toISOString())
        .lte('created_at', finMes.toISOString())
        .order('created_at', { ascending: false }),
      client.from('cpe')
        .select('total_venta, total, moneda, tipo_documento, estado, documento_id, simulated_origin, metadata')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioHoy.toISOString()),
      client.from('gre_guias')
        .select('id')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioMes.toISOString()),
      client.from('ordenes_compra')
        .select('total, moneda, estado, fecha_orden, created_at, detalles:orden_compra_detalles!fk_orden_compra_detalles_orden_id(cantidad,cantidad_recibida)')
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
        .in('estado', COTIZACION_PENDIENTE),
      client.from('sire_files')
        .select('id')
        .eq('tenant_id', tenantId)
        .gte('created_at', inicioMes.toISOString()),
      // Ventas POS del periodo. Las que aún no tienen CPE emitido (cpe_id null)
      // no aparecen en la tabla `cpe`, así que sin esto el dashboard muestra
      // "Ventas: S/ 0" aunque el POS haya registrado ventas pagadas.
      client.from('ventas_pos')
        .select('total, moneda, cpe_id, created_at')
        .eq('tenant_id', tenantId)
        .neq('estado', 'ANULADA')
        .gte('created_at', inicioMes.toISOString())
        .lte('created_at', finMes.toISOString())
    ]);

    this.requireCompleteSources([
      cpeResult, cpeHoyResult, greResult, comprasTodasResult, usuariosResult,
      cotizacionesResult, cotizacionesPendientesResult, sireResult, ventasPosResult,
    ]);

    // Publicar/cachear sólo cuando todas las fuentes fueron consultadas.
    const cpeData = cpeResult.status === 'fulfilled' ? cpeResult.value.data : [];
    const cpeHoyData = cpeHoyResult.status === 'fulfilled' ? cpeHoyResult.value.data : [];
    const greData = greResult.status === 'fulfilled' ? greResult.value.data : [];
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
    await this.confirmarEfectosDemo(client, tenantId, [...cpeData, ...cpeHoyData]);
    // Sumar por moneda original: no existe una conversión implícita a moneda base.
    // La nota de crédito resta; una orden anulada/rechazada no es inversión vigente.
    const importesPorMoneda = this.agruparImportes(monedaBase, cpeData || [], cpeHoyData || [], ventasPosSinCpe, ventasPosSinCpeHoy, comprasData || []);
    const base = importesPorMoneda.find(row => row.moneda === monedaBase)!;
    const ingresosMes = base.ventasMes;
    const ingresosHoy = base.ventasHoy;
    const inversionCompras = base.comprasMes;
    const comprasPendientes = comprasData?.filter(c => {
      if (!['pendiente', 'aprobada', 'parcial'].includes(this.estadoNormalizado(c.estado))) return false;
      // El estado puede tardar en reflejar el último recibo. Una orden sin
      // cantidades pendientes ya no debe pedir otra recepción.
      return !Array.isArray(c.detalles) || c.detalles.length === 0 || c.detalles.some((line: any) =>
        Number(line.cantidad) > Number(line.cantidad_recibida ?? 0));
    }).length || 0;

    // Calcular tasa de conversión de cotizaciones
    const totalCotizaciones = cotizacionesData?.length || 0;
    const cotizacionesAceptadas = cotizacionesData?.filter(c => COTIZACION_ACEPTADA.has(String(c.estado ?? '').toUpperCase())).length || 0;
    const tasaConversion = totalCotizaciones > 0 ?
      ((cotizacionesAceptadas / totalCotizaciones) * 100) : 0;

    const estadisticas: DashboardStats = {
      monedaBase,
      importesPorMoneda,
      totalCpe: cpeData?.filter(c => !CPE_SIN_VENTA.has(String(c.estado ?? '').toUpperCase())).length || 0,
      totalGre: greData?.length || 0,
      totalSire: sireData?.length || 0,
      totalUsers: usuariosData?.length || 0,
      totalInventario: inventario.totalProductos,
      totalCompras: comprasData?.length || 0,
      totalCotizaciones: totalCotizaciones,
      ventasMes: ingresosMes,
      ventasHoy: ingresosHoy,
      comprasMes: inversionCompras,
      valorInventario: inventario.valorInventario,
      productosConStockBajo: inventario.productosStockBajo,
      cotizacionesPendientes: cotizacionesPendientesData?.length || 0,
      ordenesCompraPendientes: comprasPendientes,
      movimientosHoy: 0,
      tasaConversionCotizaciones: Number(tasaConversion.toFixed(1)),
      crecimientoVentas: 0,
      ultimaActualizacion: new Date().toISOString(),
      periodoCalculado: {
        inicio: `${hoyLocal.slice(0, 7)}-01`,
        fin: `${hoyLocal.slice(0, 7)}-${String(new Date(Date.UTC(anio, mes, 0)).getUTCDate()).padStart(2, '0')}`
      }
    };

    // Guardar en cache
    await this.setStatsCache(tenantId, estadisticas);

    return estadisticas;
  }

  /**
   * Obtiene actividades recientes con cache
   */
  async getActivities(tenantId: string, forceRefresh = false): Promise<Activity[]> {
    // Intentar obtener del cache
    const cached = forceRefresh ? null : await this.getActivitiesFromCache(tenantId);
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
        .select('id, tipo_documento, serie, numero, total_venta, total, moneda, estado, created_at')
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
        .select('id, numero, total, moneda, fecha_orden, estado, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', hace24h.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      client.from('cotizaciones')
        .select('id, numero, total, moneda, fecha_cotizacion, estado, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', hace24h.toISOString())
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    this.requireCompleteSources([cpeResult, greResult, comprasResult, cotizacionesResult]);
    const actividades: Activity[] = [];

    // Procesar CPE
    if (cpeResult.status === 'fulfilled' && cpeResult.value.data) {
      cpeResult.value.data.forEach(cpe => {
        actividades.push({
          id: `cpe-${cpe.id}`,
          type: 'CPE',
          description: `${this.getCpeDocumentLabel(cpe.tipo_documento)} ${cpe.serie}-${cpe.numero.toString().padStart(8, '0')}`,
          amount: this.importe(cpe.total_venta ?? cpe.total).times(this.cpeDocumentType(cpe.tipo_documento) === '07' ? -1 : 1).toNumber(),
          moneda: this.moneda(cpe.moneda),
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
          amount: this.importe(compra.total).toNumber(),
          moneda: this.moneda(compra.moneda),
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
          amount: this.importe(cotizacion.total).toNumber(),
          moneda: this.moneda(cotizacion.moneda),
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

  private requireCompleteSources(results: PromiseSettledResult<{ data: unknown; error?: unknown }>[]) {
    if (results.some(result => result.status === 'rejected'
      || result.value.error || !Array.isArray(result.value.data))) {
      throw new ServiceUnavailableException('No se pudieron consultar todas las fuentes del dashboard; reintente');
    }
  }

  private moneda(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
      throw new ServiceUnavailableException('Moneda del dashboard incompleta; reintente');
    }
    return value;
  }

  private importe(value: unknown): Decimal {
    try {
      if (value === null || value === undefined || value === '' || (typeof value !== 'number' && typeof value !== 'string')) throw new Error();
      const amount = new Decimal(value);
      if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) throw new Error();
      return amount;
    } catch {
      throw new ServiceUnavailableException('Importe del dashboard incompleto; reintente');
    }
  }

  private async getMonedaBase(client: any, tenantId: string): Promise<string> {
    const { data, error } = await client.from('empresa_config').select('moneda').eq('tenant_id', tenantId).maybeSingle();
    if (error) throw new ServiceUnavailableException('No se pudo consultar la moneda base; reintente');
    return this.moneda(data?.moneda);
  }

  private agruparImportes(monedaBase: string, cpe: any[], cpeHoy: any[], pos: any[], posHoy: any[], compras: any[]) {
    const buckets = new Map<string, { moneda: string; ventasMes: Decimal; ventasHoy: Decimal; comprasMes: Decimal }>();
    const bucket = (moneda: unknown) => {
      const code = this.moneda(moneda);
      if (!buckets.has(code)) buckets.set(code, { moneda: code, ventasMes: new Decimal(0), ventasHoy: new Decimal(0), comprasMes: new Decimal(0) });
      return buckets.get(code)!;
    };
    bucket(monedaBase);
    for (const [rows, field] of [[cpe, 'ventasMes'], [cpeHoy, 'ventasHoy']] as const) {
      for (const row of rows) {
        const dest = bucket(row.moneda);
        const amount = this.importe(row.total_venta ?? row.total);
        const estado = this.estadoNormalizado(row.estado);
        const tipoDocumento = this.cpeDocumentType(row.tipo_documento);
        if (!estado) throw new ServiceUnavailableException('Comprobante del dashboard incompleto; reintente');
        const blockedEffect = ['PENDING_FISCAL_ACCEPTANCE', 'REJECTED_NO_FINANCIAL_EFFECT'].includes(row.metadata?.financial_effect_status);
        if (!blockedEffect && (!['borrador', 'anulado', 'cancelado', 'rechazado', 'error'].includes(estado)
          || estado === 'borrador' && row.demoEffectConfirmed === true)) {
          dest[field] = dest[field].plus(amount.times(tipoDocumento === '07' ? -1 : 1));
        }
      }
    }
    for (const [rows, field] of [[pos, 'ventasMes'], [posHoy, 'ventasHoy']] as const) {
      for (const row of rows) { const dest = bucket(row.moneda); dest[field] = dest[field].plus(this.importe(row.total)); }
    }
    for (const row of compras) {
      const dest = bucket(row.moneda); const amount = this.importe(row.total); const estado = this.estadoNormalizado(row.estado);
      if (!estado) throw new ServiceUnavailableException('Orden del dashboard incompleta; reintente');
      if (!['anulada', 'cancelada', 'rechazada'].includes(estado)) dest.comprasMes = dest.comprasMes.plus(amount);
    }
    return [...buckets.values()].sort((a,b) => a.moneda.localeCompare(b.moneda)).map(row => ({ moneda:row.moneda, ventasMes:row.ventasMes.toDecimalPlaces(2).toNumber(), ventasHoy:row.ventasHoy.toDecimalPlaces(2).toNumber(), comprasMes:row.comprasMes.toDecimalPlaces(2).toNumber() }));
  }

  private async confirmarEfectosDemo(client: any, tenantId: string, rows: any[]) {
    const drafts = rows.filter(row => this.estadoNormalizado(row.estado) === 'borrador' && row.simulated_origin === true && row.documento_id);
    const ids = [...new Set(drafts.map(row => row.documento_id))];
    if (!ids.length) return;
    const result = await client.from('documentos').select('id, tenant_id, estado, total, moneda, metadata')
      .eq('tenant_id', tenantId).in('id', ids);
    if (result.error || !Array.isArray(result.data) || new Set(result.data.map((row: any) => row.id)).size !== result.data.length) {
      throw new ServiceUnavailableException('No se pudo verificar el efecto operativo de los comprobantes demo; reintente');
    }
    const documents = new Map<string, any>(result.data.map((row: any) => [row.id, row]));
    for (const row of drafts) {
      const document = documents.get(row.documento_id);
      if (!document || document.tenant_id !== tenantId) throw new ServiceUnavailableException('Documento demo incompleto; reintente');
      row.demoEffectConfirmed = ['EMITIDO', 'ACEPTADO'].includes(String(document.estado).toUpperCase())
        && this.moneda(document.moneda) === this.moneda(row.moneda)
        && this.importe(document.total).equals(this.importe(row.total_venta ?? row.total))
        && !['PENDING_FISCAL_ACCEPTANCE', 'REJECTED_NO_FINANCIAL_EFFECT'].includes(document.metadata?.financial_effect_status);
    }
  }

  private async getInventarioActual(client: any, tenantId: string): Promise<InventarioMetrics> {
    const { data, error } = await client
      .from('productos')
      .select('precio_compra, costo, costo_promedio_base, stock_actual, stock_minimo, es_servicio, controla_stock')
      .eq('tenant_id', tenantId)
      .eq('activo', true);

    if (error) {
      this.logger.error(
        `No se pudo calcular el inventario vigente del tenant ${tenantId}: ${error.message ?? error}`,
      );
      throw error;
    }

    return calcularMetricasInventario(data, await obtenerPaisMetricasInventario(client, tenantId));
  }

  private aplicarInventario(
    stats: DashboardStats,
    inventario: InventarioMetrics,
  ): DashboardStats {
    return {
      ...stats,
      totalInventario: inventario.totalProductos,
      valorInventario: inventario.valorInventario,
      productosConStockBajo: inventario.productosStockBajo,
    };
  }

  private estadoNormalizado(estado: unknown): string {
    return String(estado ?? '').trim().toLowerCase();
  }

  private mapearEstado(estado: string): 'success' | 'warning' | 'error' | 'pending' {
    if (!estado) return 'pending';

    const estadosMap = {
      'COMPLETADO': 'success',
      'RECIBIDA': 'success',
      'CONVERTIDA': 'success',
      'ANULADA': 'error',
      'ANULADO': 'error',
      'RECHAZADO': 'error',
      'CANCELADO': 'error',
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

  private cpeDocumentType(value: unknown): string {
    const types: Record<string, string> = {
      '01': '01', '03': '03', '07': '07', '08': '08',
      FACTURA: '01', BOLETA: '03', NOTA_CREDITO: '07', NOTA_DEBITO: '08',
    };
    const type = typeof value === 'string' && Object.prototype.hasOwnProperty.call(types, value) ? types[value] : null;
    if (!type) throw new ServiceUnavailableException('Comprobante del dashboard incompleto; reintente');
    return type;
  }

  private getCpeDocumentLabel(tipoDocumento: unknown): string {
    const labels: Record<string, string> = {
      '01': 'Factura',
      '03': 'Boleta',
      '07': 'Nota de crédito',
      '08': 'Nota de débito',
    };

    return labels[this.cpeDocumentType(tipoDocumento)];
  }
}
