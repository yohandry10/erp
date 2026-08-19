import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService, CierreVentasDiarioEvent, ProductoStockBajoEvent, VencimientoPagoEvent, ReporteSireGeneradoEvent, InventarioCiclicoEvent } from '../events/event-bus.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { v4 as uuidv4 } from 'uuid';
import { fechaHoyDelTenant, rangoDelDiaDelTenant } from '../utils/fecha-tenant.util';

@Injectable()
export class BackgroundJobsService {
  private readonly intervals: NodeJS.Timeout[] = [];
  private readonly timeouts: NodeJS.Timeout[] = [];

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly tenantContext: TenantContextService
  ) {
    this.initializeJobs();
  }

  onModuleDestroy() {
    for (const interval of this.intervals) clearInterval(interval);
    for (const timeout of this.timeouts) clearTimeout(timeout);
    this.intervals.length = 0;
    this.timeouts.length = 0;
  }

  private initializeJobs() {
    console.log('🤖 [BackgroundJobs] Inicializando procesos automáticos...');

    if (process.env.BACKGROUND_JOBS_ENABLED === 'false') {
      console.log('⏸️ [BackgroundJobs] Deshabilitado por env BACKGROUND_JOBS_ENABLED=false');
      return;
    }

    if (process.env.BACKGROUND_JOBS_LEADER !== 'true') {
      console.log('⏸️ [BackgroundJobs] Saltando schedule en esta instancia (BACKGROUND_JOBS_LEADER!=true)');
      return;
    }

    // Cierre de ventas diario - 11:59 PM todos los días
    this.scheduleDaily('23:59:00', () => this.runPerTenant('cierre-ventas', (t) => this.ejecutarCierreVentasDiario(t)));
    
    // Verificación de stock bajo - cada 2 horas durante horario comercial
    this.scheduleInterval(2 * 60 * 60 * 1000, () => this.runPerTenant('stock-bajo', (t) => this.verificarStockBajo(t)));
    
    // Verificación de vencimientos - cada día a las 8:00 AM
    this.scheduleDaily('08:00:00', () => this.runPerTenant('vencimientos', (t) => this.verificarVencimientosPagos(t)));
    
    // Generación automática de reportes SIRE - primer día del mes a las 9:00 AM
    this.scheduleMonthly(1, '09:00:00', () => this.runPerTenant('sire', (t) => this.generarReportesSireMensual(t)));
    
    // Consolidación de métricas del dashboard - cada 30 minutos
    this.scheduleInterval(30 * 60 * 1000, () => this.runPerTenant('metricas-dashboard', (t) => this.actualizarMetricasDashboard(t)));
    
    // Inventario cíclico - cada lunes a las 6:00 AM (opcional)
    if (process.env.BACKGROUND_JOBS_INVENTARIO_ENABLED === 'true') {
      this.scheduleWeekly(1, '06:00:00', () => this.runPerTenant('inventario-ciclico', (t) => this.ejecutarInventarioCiclico(t)));
    } else {
      console.log('⏸️ [BackgroundJobs] Inventario cíclico deshabilitado (BACKGROUND_JOBS_INVENTARIO_ENABLED!=true)');
    }
    
    // Procesamiento de asistencias pendientes - cada hora (opcional)
    if (process.env.BACKGROUND_JOBS_ASISTENCIAS_ENABLED === 'true') {
      this.scheduleInterval(60 * 60 * 1000, () => this.runPerTenant('asistencias', (t) => this.procesarAsistenciasPendientes(t)));
    } else {
      console.log('⏸️ [BackgroundJobs] Asistencias pendientes deshabilitado (BACKGROUND_JOBS_ASISTENCIAS_ENABLED!=true)');
    }
  }

  // ========== GESTIÓN DE SCHEDULING ==========

  private scheduleDaily(time: string, callback: () => void) {
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, seconds, 0);

    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const delay = scheduledTime.getTime() - now.getTime();
    this.setSafeTimeout(delay, () => {
      callback();
      this.registerInterval(callback, 24 * 60 * 60 * 1000); // Repetir cada 24 horas
    });

    console.log(`📅 [BackgroundJobs] Job programado diariamente a las ${time}`);
  }

  private scheduleInterval(intervalMs: number, callback: () => void) {
    this.registerInterval(callback, intervalMs);
    console.log(`⏰ [BackgroundJobs] Job programado cada ${intervalMs / 1000} segundos`);
  }

  private scheduleWeekly(dayOfWeek: number, time: string, callback: () => void) {
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    
    scheduledTime.setDate(now.getDate() + (dayOfWeek - now.getDay() + 7) % 7);
    scheduledTime.setHours(hours, minutes, seconds, 0);

    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 7);
    }

    const delay = scheduledTime.getTime() - now.getTime();
    this.setSafeTimeout(delay, () => {
      callback();
      this.registerInterval(callback, 7 * 24 * 60 * 60 * 1000); // Repetir cada semana
    });

    console.log(`📅 [BackgroundJobs] Job programado semanalmente los ${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayOfWeek]} a las ${time}`);
  }

  private scheduleMonthly(dayOfMonth: number, time: string, callback: () => void) {
    const nextRun = this.getNextMonthlyDate(dayOfMonth, time);
    const delay = nextRun.getTime() - Date.now();

    this.setSafeTimeout(delay, () => {
      callback();
      this.scheduleMonthly(dayOfMonth, time, callback); // reprogramar siguiente mes
    });

    console.log(`📅 [BackgroundJobs] Job programado mensualmente el día ${dayOfMonth} a las ${time}`);
  }

  private getNextMonthlyDate(dayOfMonth: number, time: string): Date {
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const now = new Date();
    const next = new Date(now);

    next.setDate(dayOfMonth);
    next.setHours(hours, minutes, seconds, 0);

    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }

    return next;
  }

  // Node timers se limitan a 2^31-1 ms; este helper divide delays largos (p.ej., >24 días) para evitar overflow.
  private setSafeTimeout(delayMs: number, callback: () => void) {
    const MAX_TIMEOUT_MS = 2_147_483_647;
    if (delayMs <= MAX_TIMEOUT_MS) {
      this.registerTimeout(() => callback(), delayMs);
      return;
    }

    this.registerTimeout(() => this.setSafeTimeout(delayMs - MAX_TIMEOUT_MS, callback), MAX_TIMEOUT_MS);
  }

  private registerInterval(callback: () => void, intervalMs: number) {
    const handle = setInterval(callback, intervalMs);
    handle.unref?.();
    this.intervals.push(handle);
    return handle;
  }

  private registerTimeout(callback: () => void, delayMs: number) {
    const handle = setTimeout(callback, delayMs);
    handle.unref?.();
    this.timeouts.push(handle);
    return handle;
  }

  // ========== JOBS AUTOMÁTICOS ==========

  private async runPerTenant(
    jobName: string,
    perTenant: (tenantId: string) => Promise<void> | void,
  ) {
    const tenants = await this.fetchTenants();
    for (const tenantId of tenants) {
      const lockKey = `${jobName}:${tenantId}`;
      const acquired = await this.tryAcquireLock(lockKey);
      if (!acquired) {
        await this.logJob(jobName, tenantId, 'SKIP', 'Lock no adquirido');
        continue;
      }

      try {
        await this.tenantContext.run(
          { tenantId, userId: null, supabaseAccessToken: null, isSuperAdmin: true },
          async () => {
            await this.supabase.prepareTenantContext();
            await perTenant(tenantId);
          },
        );
        await this.logJob(jobName, tenantId, 'SUCCESS');
      } catch (err: any) {
        await this.logJob(jobName, tenantId, 'ERROR', err?.message || String(err));
      } finally {
        await this.releaseLock(lockKey);
      }
    }
  }

  private async fetchTenants(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase.getPublicClient()
        .from('tenants')
        .select('id')
        .eq('estado', 'ACTIVO');
      if (error) {
        console.error('❌ [BackgroundJobs] Error obteniendo tenants:', error);
        return [];
      }
      return (data || []).map((t: any) => t.id).filter(Boolean);
    } catch (err: any) {
      console.error('❌ [BackgroundJobs] Excepción obteniendo tenants:', err);
      return [];
    }
  }

  private async tryAcquireLock(lockKey: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .getPublicClient()
        .rpc('acquire_job_lock', {
          p_lock_key: lockKey,
          p_lock_ttl_seconds: 300,
        });
      if (error) {
        console.warn(`⚠️ [BackgroundJobs] No se pudo adquirir lock ${lockKey}: ${error.message}`);
        return false;
      }
      return data === true || data === 'true';
    } catch (err: any) {
      console.warn(`⚠️ [BackgroundJobs] Error adquiriendo lock ${lockKey}: ${err?.message || err}`);
      return false;
    }
  }

  private async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.supabase
        .getPublicClient()
        .rpc('release_job_lock', { p_lock_key: lockKey });
    } catch (err: any) {
      console.warn(`⚠️ [BackgroundJobs] Error liberando lock ${lockKey}: ${err?.message || err}`);
    }
  }

  private async logJob(jobName: string, tenantId: string, status: 'SUCCESS' | 'ERROR' | 'SKIP', errorMessage?: string) {
    try {
      await this.supabase.getPublicClient()
        .from('integration_logs')
        .insert({
          id: uuidv4(),
          tenant_id: tenantId,
          servicio: 'BACKGROUND_JOBS',
          operacion: jobName,
          status,
          error_message: errorMessage || null,
          timestamp: new Date().toISOString(),
        });
    } catch (err) {
      console.warn(`⚠️ [BackgroundJobs] No se pudo registrar log de ${jobName} (${tenantId}): ${err?.message || err}`);
    }
  }

  private nowInLima(): Date {
    const now = new Date();
    const peruString = now.toLocaleString('en-US', { timeZone: 'America/Lima' });
    return new Date(peruString);
  }

  // Revisa si ya existe un SUCCESS reciente del mismo job para evitar duplicados
  private async hasRecentSuccess(jobName: string, tenantId: string, sinceIso: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.getPublicClient()
        .from('integration_logs')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('servicio', 'BACKGROUND_JOBS')
        .eq('operacion', jobName)
        .eq('status', 'SUCCESS')
        .gte('timestamp', sinceIso)
        .limit(1);

      if (error) {
        console.warn(`⚠️ [BackgroundJobs] No se pudo verificar duplicados para ${jobName} (${tenantId}): ${error.message}`);
        return false;
      }
      return (data?.length || 0) > 0;
    } catch (err: any) {
      console.warn(`⚠️ [BackgroundJobs] Error verificando duplicados para ${jobName} (${tenantId}): ${err?.message || err}`);
      return false;
    }
  }

  async ejecutarCierreVentasDiario(tenantId: string) {
    try {
      console.log(`🌙 [BackgroundJobs] Iniciando cierre de ventas diario (tenant ${tenantId})...`);
      
      // La ventana del cierre se toma en la zona del tenant. En UTC abarcaba desde
      // las 19:00 del día anterior y dejaba fuera las últimas cinco horas de venta.
      const { desde, hasta } = await rangoDelDiaDelTenant(this.supabase.getClient(), tenantId);
      const hoy = await fechaHoyDelTenant(this.supabase.getClient(), tenantId);

      // Usar query builder de Supabase en lugar de getClient directamente
      const ventasQuery = this.supabase.query('ventas_pos')
        .select(`
          *,
          detalle_ventas_pos(*)
        `)
        .eq('tenant_id', tenantId)
        .gte('created_at', desde)
        .lt('created_at', hasta);

      const { data: ventas, error: ventasError } = await ventasQuery;

      if (ventasError) throw ventasError;

      if (!ventas || ventas.length === 0) {
        console.log('ℹ️ [BackgroundJobs] No hay ventas para procesar hoy');
        return;
      }

      // Calcular métricas del día
      const totalVentas = ventas.reduce((sum, venta) => sum + parseFloat(venta.total || '0'), 0);
      const cantidadVentas = ventas.length;

      // Agrupar por método de pago
      const ventasPorMetodoPago: Record<string, number> = {};
      ventas.forEach(venta => {
        const metodo = venta.metodo_pago_id || 'EFECTIVO';
        ventasPorMetodoPago[metodo] = (ventasPorMetodoPago[metodo] || 0) + parseFloat(venta.total || '0');
      });

      // Productos vendidos
      const productosVendidos: Record<string, { cantidad: number; montoVendido: number }> = {};
      ventas.forEach(venta => {
        if (venta.detalle_ventas_pos) {
          venta.detalle_ventas_pos.forEach((item: any) => {
            const productoId = item.producto_id;
            if (!productosVendidos[productoId]) {
              productosVendidos[productoId] = { cantidad: 0, montoVendido: 0 };
            }
            productosVendidos[productoId].cantidad += parseFloat(item.cantidad || '0');
            productosVendidos[productoId].montoVendido += parseFloat(item.subtotal || '0');
          });
        }
      });

      const productosVendidosArray = Object.entries(productosVendidos).map(([productoId, data]) => ({
        productoId,
        cantidad: data.cantidad,
        montoVendido: data.montoVendido
      }));

      // Emitir evento de cierre diario
      const eventoCierre: CierreVentasDiarioEvent = {
        fecha: hoy,
        totalVentas,
        cantidadVentas,
        ventasPorMetodoPago,
        ventasPorVendedor: [], // Se puede implementar después
        productosVendidos: productosVendidosArray,
        requiereReporteSire: totalVentas > 0
      };

      this.eventBus.emitCierreVentasDiario(eventoCierre);
      
      console.log(`✅ [BackgroundJobs] Cierre diario completado: ${cantidadVentas} ventas, S/ ${totalVentas.toFixed(2)}`);
      
    } catch (error) {
      console.error('❌ [BackgroundJobs] Error en cierre de ventas diario:', error);
    }
  }

  async verificarStockBajo(tenantId: string) {
    try {
      console.log(`📦 [BackgroundJobs] Verificando productos con stock bajo (tenant ${tenantId})...`);
      const { data: productos, error } = await this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('tenant_id', tenantId)
        .gt('stock_minimo', 0);

      if (error) {
        console.error(`❌ [BackgroundJobs] Error obteniendo productos para tenant ${tenantId}:`, error);
        return;
      }

      if (!productos || productos.length === 0) {
        console.log(`ℹ️ [BackgroundJobs] No hay productos para evaluar en tenant ${tenantId}`);
        return;
      }

      const productosStockBajo = productos.filter(producto =>
        parseFloat((producto as any).stock || '0') <= parseFloat((producto as any).stock_minimo || '0')
      );

      if (productosStockBajo.length === 0) {
        console.log(`✅ [BackgroundJobs] Stock adecuado para tenant ${tenantId}`);
        return;
      }

      for (const producto of productosStockBajo) {
        const eventoStockBajo: ProductoStockBajoEvent = {
          productoId: producto.id,
          codigoProducto: (producto as any).codigo || producto.id,
          nombreProducto: producto.nombre || 'Producto sin nombre',
          stockActual: parseFloat((producto as any).stock || '0'),
          stockMinimo: parseFloat((producto as any).stock_minimo || '0'),
          valorInventario:
            parseFloat((producto as any).stock || '0') *
            parseFloat(((producto as any).precio_venta ?? (producto as any).precio) || '0'),
          ubicacion: (producto as any).ubicacion,
          proveedor: (producto as any).proveedor_principal,
          fechaVerificacion: new Date().toISOString()
        };

        await this.eventBus.emitProductoStockBajo(eventoStockBajo, tenantId);
      }

      console.log(`📦 [BackgroundJobs] Eventos de stock bajo emitidos para ${productosStockBajo.length} productos (tenant ${tenantId})`);
      
    } catch (error) {
      console.error('❌ [BackgroundJobs] Error verificando stock bajo:', error);
    }
  }

  async verificarVencimientosPagos(tenantId: string) {
    try {
      console.log(`💰 [BackgroundJobs] Verificando vencimientos de pagos (tenant ${tenantId})...`);
      
      // TODO: Implement isMockMode() in SupabaseService if needed
      // if (this.supabase.isMockMode()) {
      //   console.log('✅ [BackgroundJobs] Verificación de vencimientos en modo mock - simulado');
      //   return;
      // }

      const hoy = new Date();
      const proximaSemanaNuestra = new Date();
      proximaSemanaNuestra.setDate(hoy.getDate() + 7);

      // Usar tabla disponible en schema público
      const facturasQuery = this.supabase.query('documentos')
        .select('*')
        .eq('tenant_id', tenantId)
        .lte('fecha_vencimiento', proximaSemanaNuestra.toISOString().split('T')[0]);

      const { data: facturas, error } = await facturasQuery;

      if (error) throw error;

      const facturasFiltradas = (facturas || []).filter((factura: any) => {
        const estadoPago = (factura as any)?.estado_pago;
        const saldoPendiente = Number((factura as any)?.saldo_pendiente ?? 0);
        const total = Number((factura as any)?.total ?? 0);
        const fechaVenc = (factura as any)?.fecha_vencimiento;
        if (!fechaVenc) return false;
        const fechaV = new Date(fechaVenc);
        return (estadoPago ? estadoPago !== 'PAGADO' : true) && (saldoPendiente > 0 || total > 0);
      });

      if (facturasFiltradas.length === 0) {
        console.log('✅ [BackgroundJobs] No hay facturas próximas a vencer');
        return;
      }

      console.log(`⚠️ [BackgroundJobs] Encontradas ${facturasFiltradas.length} facturas con vencimientos próximos`);

      // Procesar cada factura
      for (const factura of facturasFiltradas) {
        const fechaVencimiento = new Date(factura.fecha_vencimiento);
        const diasVencido = Math.floor((hoy.getTime() - fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24));
        const montoVencido = parseFloat(factura.saldo_pendiente || factura.total || '0');

        const eventoVencimiento: VencimientoPagoEvent = {
          facturaId: factura.id,
          clienteId: factura.cliente_id,
          numeroFactura: `${factura.serie}-${factura.numero}`,
          montoVencido,
          diasVencido,
          fechaVencimiento: factura.fecha_vencimiento,
          estado: diasVencido > 0 ? 'VENCIDO' : 'POR_VENCER',
          requiereGestion: diasVencido > 7 || montoVencido > 1000
        };

        this.eventBus.emitVencimientoPago(eventoVencimiento);
      }

      console.log(`💰 [BackgroundJobs] Eventos de vencimiento emitidos para ${facturas.length} facturas`);
      
    } catch (error) {
      console.error('❌ [BackgroundJobs] Error verificando vencimientos:', error);
    }
  }

  async generarReportesSireMensual(tenantId: string) {
    try {
      console.log(`📊 [BackgroundJobs] Generando reportes SIRE mensuales automáticos (tenant ${tenantId})...`);
      
      const mesAnterior = new Date();
      mesAnterior.setMonth(mesAnterior.getMonth() - 1);
      const periodo = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`;
      const inicioPeriodoIso = new Date(Date.UTC(mesAnterior.getFullYear(), mesAnterior.getMonth(), 1)).toISOString();
      const siguientePeriodoIso = new Date(Date.UTC(mesAnterior.getFullYear(), mesAnterior.getMonth() + 1, 1)).toISOString();

      // Evitar duplicados: si ya hay SUCCESS desde el inicio del periodo, no volver a generar
      const yaEjecutado = await this.hasRecentSuccess('sire', tenantId, inicioPeriodoIso);
      if (yaEjecutado) {
        console.log(`⏸️ [BackgroundJobs] Reporte SIRE ya generado para periodo ${periodo} (tenant ${tenantId}), se omite`);
        return;
      }

      // TODO: Implement isMockMode() in SupabaseService if needed
      const isMockMode = false; // Placeholder
      if (isMockMode) {
        console.log(`📊 [BackgroundJobs] Generación SIRE en modo mock para periodo ${periodo}`);
        
        const eventoSire: ReporteSireGeneradoEvent = {
          reporteId: `SIRE-${periodo}-MOCK`,
          periodo,
          tipoReporte: 'VENTAS',
          cantidadRegistros: 50, // Simular registros
          fechaGeneracion: new Date().toISOString(),
          requiereEnvioSunat: true,
          archivoGenerado: `sire_ventas_${periodo}_mock.txt`
        };

        this.eventBus.emitReporteSireGenerado(eventoSire);
        return;
      }

      const ventasQuery = this.supabase.query('ventas_pos')
        .select('*')
        .gte('created_at', inicioPeriodoIso)
        .lt('created_at', siguientePeriodoIso);

      const { data: ventas, error: ventasError } = await ventasQuery;

      if (ventasError) throw ventasError;

      if (!ventas || ventas.length === 0) {
        console.log(`ℹ️ [BackgroundJobs] No hay ventas para SIRE en periodo ${periodo}`);
        return;
      }

      // Simular generación de reporte SIRE
      const reporteId = `SIRE-${periodo}-${Date.now()}`;
      const archivoGenerado = `sire_ventas_${periodo}.txt`;

      const eventoSire: ReporteSireGeneradoEvent = {
        reporteId,
        periodo,
        tipoReporte: 'VENTAS',
        cantidadRegistros: ventas.length,
        fechaGeneracion: new Date().toISOString(),
        requiereEnvioSunat: true,
        archivoGenerado
      };

      this.eventBus.emitReporteSireGenerado(eventoSire);
      
      console.log(`📊 [BackgroundJobs] Reporte SIRE generado: ${reporteId} con ${ventas.length} registros`);
      
    } catch (error) {
      console.error('❌ [BackgroundJobs] Error generando reportes SIRE:', error);
    }
  }

  async actualizarMetricasDashboard(tenantId: string) {
    try {
      const { desde: inicioDia } = await rangoDelDiaDelTenant(this.supabase.getClient(), tenantId);
      const mesActual = (await fechaHoyDelTenant(this.supabase.getClient(), tenantId)).substring(0, 7);

      // TODO: Implement isMockMode() in SupabaseService if needed
      const isMockMode = false; // Placeholder
      if (isMockMode) {
        // DATOS REALES EN CERO - NO MÁS HARDCODEOS DE MIERDA
        this.eventBus.emitDashboardMetricsUpdated({
          totalCpe: 0,
          totalGre: 0,
          totalSire: 0,
          totalUsers: 0,
          totalInventario: 0,
          totalCompras: 0,
          totalCotizaciones: 0,
          ventasMes: 0.00,
          ventasHoy: 0.00,
          comprasMes: 0.00,
          valorInventario: 0.00,
          productosConStockBajo: 0,
          cotizacionesPendientes: 0,
          ordenesCompraPendientes: 0,
          movimientosHoy: 0,
          tasaConversionCotizaciones: 0,
          crecimientoVentas: 0,
          ultimaActualizacion: new Date().toISOString()
        });
        return;
      }

      // Obtener métricas básicas en paralelo usando query builder
      const cpeQuery = this.supabase.query('cpe_documentos').select('id', { count: 'exact' }).eq('tenant_id', tenantId);
      const greQuery = this.supabase.query('gre_documentos').select('id', { count: 'exact' }).eq('tenant_id', tenantId);
      const usersQuery = this.supabase.query('usuarios_sistema').select('id', { count: 'exact' }).eq('tenant_id', tenantId);
      const productosQuery = this.supabase.query('productos').select('*').eq('tenant_id', tenantId);
      const ventasHoyQuery = this.supabase.query('ventas_pos').select('total').eq('tenant_id', tenantId).gte('created_at', inicioDia);
      const ventasMesQuery = this.supabase.query('ventas_pos').select('total').eq('tenant_id', tenantId).gte('created_at', `${mesActual}-01T00:00:00`);
      const comprasQuery = this.supabase.query('orden_compra').select('total').eq('tenant_id', tenantId).gte('created_at', `${mesActual}-01T00:00:00`);
      const cotizacionesQuery = this.supabase.query('cotizaciones').select('*').eq('tenant_id', tenantId);

      const [
        { data: cpeData },
        { data: greData },
        { data: usersData },
        { data: productosData },
        { data: ventasHoyData },
        { data: ventasMesData },
        { data: comprasData },
        { data: cotizacionesData }
      ] = await Promise.all([
        cpeQuery,
        greQuery,
        usersQuery,
        productosQuery,
        ventasHoyQuery,
        ventasMesQuery,
        comprasQuery,
        cotizacionesQuery
      ]);

      // Calcular métricas
      const totalCpe = cpeData?.length || 0;
      const totalGre = greData?.length || 0;
      const totalUsers = usersData?.length || 0;
      const totalInventario = productosData?.length || 0;
      const valorInventario =
        productosData?.reduce(
          (sum, prod) =>
            sum +
            parseFloat((prod as any).stock || '0') *
              parseFloat(((prod as any).precio_venta ?? (prod as any).precio) || '0'),
          0,
        ) || 0;
      const productosConStockBajo =
        productosData?.filter(
          (prod) => parseFloat((prod as any).stock || '0') <= parseFloat((prod as any).stock_minimo || '0'),
        ).length || 0;
      
      const ventasHoy = ventasHoyData?.reduce((sum, venta) => sum + parseFloat(venta.total || '0'), 0) || 0;
      const ventasMes = ventasMesData?.reduce((sum, venta) => sum + parseFloat(venta.total || '0'), 0) || 0;
      const comprasMes = comprasData?.reduce((sum, compra) => sum + parseFloat(compra.total || '0'), 0) || 0;
      
      const totalCotizaciones = cotizacionesData?.length || 0;
      const cotizacionesPendientes = cotizacionesData?.filter(cot => cot.estado === 'PENDIENTE').length || 0;

      // Emitir evento de actualización de métricas
      this.eventBus.emitDashboardMetricsUpdated({
        totalCpe,
        totalGre,
        totalSire: 0,
        totalUsers,
        totalInventario,
        totalCompras: comprasData?.length || 0,
        totalCotizaciones,
        ventasMes,
        ventasHoy,
        comprasMes,
        valorInventario,
        productosConStockBajo,
        cotizacionesPendientes,
        ordenesCompraPendientes: 0,
        movimientosHoy: 0,
        tasaConversionCotizaciones: totalCotizaciones > 0 ? (totalCotizaciones - cotizacionesPendientes) / totalCotizaciones * 100 : 0,
        crecimientoVentas: 0,
        ultimaActualizacion: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ [BackgroundJobs] Error actualizando métricas del dashboard:', error);
    }
  }

  async ejecutarInventarioCiclico(tenantId: string) {
    if (process.env.BACKGROUND_JOBS_INVENTARIO_ENABLED !== 'true') {
      return;
    }
    try {
      console.log(`📋 [BackgroundJobs] Ejecutando inventario cíclico automático (tenant ${tenantId})...`);
      
      const productosQuery = this.supabase.query('productos')
        .select('*')
        .eq('tenant_id', tenantId)
        .limit(50)
        .order('updated_at', { ascending: true });

      const { data: productos, error } = await productosQuery;

      if (error) throw error;

      if (!productos || productos.length === 0) {
        console.log('ℹ️ [BackgroundJobs] No hay productos para inventario cíclico');
        return;
      }

      for (const producto of productos) {
        const stockSistema = parseFloat((producto as any).stock || '0');
        const variacion = (Math.random() - 0.5) * 0.1;
        const stockFisico = Math.max(0, Math.round(stockSistema * (1 + variacion)));
        const diferencia = stockFisico - stockSistema;

        if (Math.abs(diferencia) > 0) {
          const eventoInventario: InventarioCiclicoEvent = {
            productoId: producto.id,
            ubicacion: producto.ubicacion || 'ALMACEN-PRINCIPAL',
            stockSistema,
            stockFisico,
            diferencia,
            valorDiferencia:
              diferencia *
              parseFloat(((producto as any).precio_venta ?? (producto as any).precio) || '0'),
            responsable: 'SISTEMA-AUTO',
            fechaConteo: new Date().toISOString(),
            requiereAjuste: Math.abs(diferencia) > 2
          };

          this.eventBus.emitInventarioCiclico(eventoInventario);
        }
      }
      
    } catch (error) {
      console.error('❌ [BackgroundJobs] Error en inventario cíclico:', error);
    }
  }

  async procesarAsistenciasPendientes(tenantId: string) {
    if (process.env.BACKGROUND_JOBS_ASISTENCIAS_ENABLED !== 'true') {
      return;
    }
    const actorId = String(process.env.BACKGROUND_JOBS_ACTOR_ID || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)) {
      console.error(
        '❌ [BackgroundJobs] Asistencias bloqueadas: BACKGROUND_JOBS_ACTOR_ID debe ser un UUID explícito, activo y autorizado en cada tenant.',
      );
      return;
    }
    try {
      const nowLima = this.nowInLima();
      const hoy = nowLima.toISOString().split('T')[0];

      // Saltar feriados (si existe tabla feriados)
      try {
        const { data: feriados } = await this.supabase.getClient()
          .from('feriados')
          .select('fecha')
          .eq('fecha', hoy)
          .eq('pais', 'PE');
        if (feriados && feriados.length > 0) {
          console.log('⏸️ [BackgroundJobs] Día feriado en PE, no se marcan ausencias');
          return;
        }
      } catch {
        // Ignorar si tabla no existe
      }

      // Solo marcar ausentes después de las 18:00 hora Lima (jornada diurna típica de 8h)
      if (nowLima.getHours() < 18) {
        return;
      }

      const client = this.supabase.getClient();

      const empleadosQuery = client
        .from('empleados')
        .select('id')
        .eq('estado', 'ACTIVO')
        .eq('activo', true)
        .eq('tenant_id', tenantId);

      const { data: empleados, error: empleadosError } = await empleadosQuery;
      if (empleadosError) throw empleadosError;

      for (const empleado of empleados || []) {
        const { data, error } = await client.rpc('ejecutar_operacion_rrhh_tx', {
          p_tenant_id: tenantId,
          p_actor_id: actorId,
          p_operacion: 'ATTENDANCE_ABSENCE_MARK',
          p_payload: { empleado_id: empleado.id, fecha: hoy },
          p_idempotency_key: `rrhh-absence:${hoy}:${empleado.id}`,
        });
        if (error) {
          console.error(
            `❌ [BackgroundJobs] Ausencia bloqueada para empleado ${empleado.id}: ${error.message || error.code || 'RPC_ERROR'}`,
          );
          continue;
        }
        if (data?.action !== 'CREATED') continue;

        this.eventBus.emitEmpleadoAsistencia({
          empleadoId: empleado.id,
          fecha: hoy,
          horasExtras: 0,
          tipoTurno: 'REGULAR',
          estado: 'AUSENTE',
          requierePlanilla: true
        });
      }
      
    } catch (error) {
      console.error('❌ [BackgroundJobs] Error procesando asistencias:', error);
    }
  }
} 
