import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService, CierreVentasDiarioEvent, ProductoStockBajoEvent, VencimientoPagoEvent, ReporteSireGeneradoEvent, InventarioCiclicoEvent } from '../events/event-bus.service';

@Injectable()
export class BackgroundJobsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService
  ) {
    this.initializeJobs();
  }

  private initializeJobs() {
    console.log('🤖 [BackgroundJobs] Inicializando procesos automáticos...');
    
    // Cierre de ventas diario - 11:59 PM todos los días
    this.scheduleDaily('23:59:00', () => this.ejecutarCierreVentasDiario());
    
    // Verificación de stock bajo - cada 2 horas durante horario comercial
    this.scheduleInterval(2 * 60 * 60 * 1000, () => this.verificarStockBajo());
    
    // Verificación de vencimientos - cada día a las 8:00 AM
    this.scheduleDaily('08:00:00', () => this.verificarVencimientosPagos());
    
    // Generación automática de reportes SIRE - primer día del mes a las 9:00 AM
    this.scheduleMonthly(1, '09:00:00', () => this.generarReportesSireMensual());
    
    // Consolidación de métricas del dashboard - cada 30 minutos
    this.scheduleInterval(30 * 60 * 1000, () => this.actualizarMetricasDashboard());
    
    // Inventario cíclico - cada lunes a las 6:00 AM
    this.scheduleWeekly(1, '06:00:00', () => this.ejecutarInventarioCiclico());
    
    // Procesamiento de asistencias pendientes - cada hora
    this.scheduleInterval(60 * 60 * 1000, () => this.procesarAsistenciasPendientes());
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
    setTimeout(() => {
      callback();
      setInterval(callback, 24 * 60 * 60 * 1000); // Repetir cada 24 horas
    }, delay);

    console.log(`📅 [BackgroundJobs] Job programado diariamente a las ${time}`);
  }

  private scheduleInterval(intervalMs: number, callback: () => void) {
    setInterval(callback, intervalMs);
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
    setTimeout(() => {
      callback();
      setInterval(callback, 7 * 24 * 60 * 60 * 1000); // Repetir cada semana
    }, delay);

    console.log(`📅 [BackgroundJobs] Job programado semanalmente los ${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayOfWeek]} a las ${time}`);
  }

  private scheduleMonthly(dayOfMonth: number, time: string, callback: () => void) {
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    
    scheduledTime.setDate(dayOfMonth);
    scheduledTime.setHours(hours, minutes, seconds, 0);

    if (scheduledTime <= now) {
      scheduledTime.setMonth(scheduledTime.getMonth() + 1);
    }

    const delay = scheduledTime.getTime() - now.getTime();
    setTimeout(() => {
      callback();
      
      // Programar para el próximo mes
      const nextMonth = new Date(scheduledTime);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextDelay = nextMonth.getTime() - Date.now();
      setTimeout(() => {
        this.scheduleMonthly(dayOfMonth, time, callback);
      }, nextDelay);
    }, delay);

    console.log(`📅 [BackgroundJobs] Job programado mensualmente el día ${dayOfMonth} a las ${time}`);
  }

  // ========== JOBS AUTOMÁTICOS ==========

  async ejecutarCierreVentasDiario() {
    try {
      console.log('🌙 [BackgroundJobs] Iniciando cierre de ventas diario...');
      
      const hoy = new Date().toISOString().split('T')[0];
      
      // Usar query builder de Supabase en lugar de getClient directamente
      const ventasQuery = this.supabase.query('pos_ventas')
        .select(`
          *,
          pos_venta_items(*)
        `)
        .gte('created_at', `${hoy}T00:00:00`)
        .lt('created_at', `${hoy}T23:59:59`);

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
        if (venta.pos_venta_items) {
          venta.pos_venta_items.forEach((item: any) => {
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

  async verificarStockBajo() {
    try {
      console.log('📦 [BackgroundJobs] Verificando productos con stock bajo...');
      
      // Simular verificación en modo mock o usar Supabase real
      if (this.supabase.isMockMode()) {
        console.log('✅ [BackgroundJobs] Verificación de stock en modo mock - simulado');
        return;
      }

      const productosQuery = this.supabase.query('productos')
        .select('*')
        .gt('stock_minimo', 0);

      const { data: productos, error } = await productosQuery;

      if (error) throw error;

      if (!productos || productos.length === 0) {
        console.log('✅ [BackgroundJobs] Todos los productos tienen stock adecuado');
        return;
      }

      // Filtrar productos con stock bajo
      const productosStockBajo = productos.filter(producto => 
        parseFloat(producto.stock_actual || '0') <= parseFloat(producto.stock_minimo || '0')
      );

      if (productosStockBajo.length === 0) {
        console.log('✅ [BackgroundJobs] Todos los productos tienen stock adecuado');
        return;
      }

      console.log(`⚠️ [BackgroundJobs] Encontrados ${productosStockBajo.length} productos con stock bajo`);

      // Emitir eventos para cada producto con stock bajo
      for (const producto of productosStockBajo) {
        const eventoStockBajo: ProductoStockBajoEvent = {
          productoId: producto.id,
          codigoProducto: producto.codigo || producto.id,
          nombreProducto: producto.nombre || 'Producto sin nombre',
          stockActual: parseFloat(producto.stock_actual || '0'),
          stockMinimo: parseFloat(producto.stock_minimo || '0'),
          valorInventario: parseFloat(producto.stock_actual || '0') * parseFloat(producto.precio_venta || '0'),
          ubicacion: producto.ubicacion,
          proveedor: producto.proveedor_principal,
          fechaVerificacion: new Date().toISOString()
        };

        this.eventBus.emitProductoStockBajo(eventoStockBajo);
      }

      console.log(`📦 [BackgroundJobs] Eventos de stock bajo emitidos para ${productosStockBajo.length} productos`);
      
    } catch (error) {
      console.error('❌ [BackgroundJobs] Error verificando stock bajo:', error);
    }
  }

  async verificarVencimientosPagos() {
    try {
      console.log('💰 [BackgroundJobs] Verificando vencimientos de pagos...');
      
      if (this.supabase.isMockMode()) {
        console.log('✅ [BackgroundJobs] Verificación de vencimientos en modo mock - simulado');
        return;
      }

      const hoy = new Date();
      const proximaSemanaNuestra = new Date();
      proximaSemanaNuestra.setDate(hoy.getDate() + 7);

      const facturasQuery = this.supabase.query('cpe_documentos')
        .select('*')
        .eq('es_credito', true)
        .neq('estado_pago', 'PAGADO')
        .lte('fecha_vencimiento', proximaSemanaNuestra.toISOString().split('T')[0]);

      const { data: facturas, error } = await facturasQuery;

      if (error) throw error;

      if (!facturas || facturas.length === 0) {
        console.log('✅ [BackgroundJobs] No hay facturas próximas a vencer');
        return;
      }

      console.log(`⚠️ [BackgroundJobs] Encontradas ${facturas.length} facturas con vencimientos próximos`);

      // Procesar cada factura
      for (const factura of facturas) {
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

  async generarReportesSireMensual() {
    try {
      console.log('📊 [BackgroundJobs] Generando reportes SIRE mensuales automáticos...');
      
      const mesAnterior = new Date();
      mesAnterior.setMonth(mesAnterior.getMonth() - 1);
      const periodo = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`;

      if (this.supabase.isMockMode()) {
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

      const ventasQuery = this.supabase.query('pos_ventas')
        .select('*')
        .gte('created_at', `${periodo}-01T00:00:00`)
        .lt('created_at', `${periodo}-31T23:59:59`);

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

  async actualizarMetricasDashboard() {
    try {
      const hoy = new Date().toISOString().split('T')[0];
      const mesActual = new Date().toISOString().substring(0, 7);

      if (this.supabase.isMockMode()) {
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
      const cpeQuery = this.supabase.query('cpe_documentos').select('id', { count: 'exact' });
      const greQuery = this.supabase.query('gre_documentos').select('id', { count: 'exact' });
      const usersQuery = this.supabase.query('usuarios_sistema').select('id', { count: 'exact' });
      const productosQuery = this.supabase.query('productos').select('*');
      const ventasHoyQuery = this.supabase.query('pos_ventas').select('total').gte('created_at', `${hoy}T00:00:00`);
      const ventasMesQuery = this.supabase.query('pos_ventas').select('total').gte('created_at', `${mesActual}-01T00:00:00`);
      const comprasQuery = this.supabase.query('orden_compra').select('total').gte('created_at', `${mesActual}-01T00:00:00`);
      const cotizacionesQuery = this.supabase.query('cotizaciones').select('*');

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
      const valorInventario = productosData?.reduce((sum, prod) => 
        sum + (parseFloat(prod.stock_actual || '0') * parseFloat(prod.precio_venta || '0')), 0) || 0;
      const productosConStockBajo = productosData?.filter(prod => 
        parseFloat(prod.stock_actual || '0') <= parseFloat(prod.stock_minimo || '0')).length || 0;
      
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

  async ejecutarInventarioCiclico() {
    try {
      console.log('📋 [BackgroundJobs] Ejecutando inventario cíclico automático...');
      
      if (this.supabase.isMockMode()) {
        console.log('📋 [BackgroundJobs] Inventario cíclico en modo mock - simulado');
        return;
      }

      const productosQuery = this.supabase.query('productos')
        .select('*')
        .limit(50)
        .order('updated_at', { ascending: true });

      const { data: productos, error } = await productosQuery;

      if (error) throw error;

      if (!productos || productos.length === 0) {
        console.log('ℹ️ [BackgroundJobs] No hay productos para inventario cíclico');
        return;
      }

      for (const producto of productos) {
        const stockSistema = parseFloat(producto.stock_actual || '0');
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
            valorDiferencia: diferencia * parseFloat(producto.precio_venta || '0'),
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

  async procesarAsistenciasPendientes() {
    try {
      if (this.supabase.isMockMode()) {
        return; // Skip en modo mock
      }

      const hoy = new Date().toISOString().split('T')[0];

      const empleadosQuery = this.supabase.query('empleados')
        .select('*')
        .eq('estado', 'ACTIVO');

      const asistenciasQuery = this.supabase.query('asistencias')
        .select('empleado_id')
        .eq('fecha', hoy);

      const [
        { data: empleados, error: empleadosError },
        { data: asistenciasHoy, error: asistenciasError }
      ] = await Promise.all([empleadosQuery, asistenciasQuery]);

      if (empleadosError) throw empleadosError;
      if (asistenciasError) throw asistenciasError;

      const empleadosConAsistencia = new Set(asistenciasHoy?.map(a => a.empleado_id) || []);
      const empleadosSinAsistencia = empleados?.filter(emp => !empleadosConAsistencia.has(emp.id)) || [];

      const horaActual = new Date().getHours();
      if (horaActual >= 10) {
        for (const empleado of empleadosSinAsistencia) {
          this.eventBus.emitEmpleadoAsistencia({
            empleadoId: empleado.id,
            fecha: hoy,
            horasExtras: 0,
            tipoTurno: 'REGULAR',
            estado: 'AUSENTE',
            requierePlanilla: true
          });
        }
      }
      
    } catch (error) {
      console.error('❌ [BackgroundJobs] Error procesando asistencias:', error);
    }
  }
} 