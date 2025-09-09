"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundJobsService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
const event_bus_service_1 = require("../events/event-bus.service");
let BackgroundJobsService = class BackgroundJobsService {
    constructor(supabase, eventBus) {
        this.supabase = supabase;
        this.eventBus = eventBus;
        this.initializeJobs();
    }
    initializeJobs() {
        console.log('🤖 [BackgroundJobs] Inicializando procesos automáticos...');
        this.scheduleDaily('23:59:00', () => this.ejecutarCierreVentasDiario());
        this.scheduleInterval(2 * 60 * 60 * 1000, () => this.verificarStockBajo());
        this.scheduleDaily('08:00:00', () => this.verificarVencimientosPagos());
        this.scheduleMonthly(1, '09:00:00', () => this.generarReportesSireMensual());
        this.scheduleInterval(30 * 60 * 1000, () => this.actualizarMetricasDashboard());
        this.scheduleWeekly(1, '06:00:00', () => this.ejecutarInventarioCiclico());
        this.scheduleInterval(60 * 60 * 1000, () => this.procesarAsistenciasPendientes());
    }
    scheduleDaily(time, callback) {
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
            setInterval(callback, 24 * 60 * 60 * 1000);
        }, delay);
        console.log(`📅 [BackgroundJobs] Job programado diariamente a las ${time}`);
    }
    scheduleInterval(intervalMs, callback) {
        setInterval(callback, intervalMs);
        console.log(`⏰ [BackgroundJobs] Job programado cada ${intervalMs / 1000} segundos`);
    }
    scheduleWeekly(dayOfWeek, time, callback) {
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
            setInterval(callback, 7 * 24 * 60 * 60 * 1000);
        }, delay);
        console.log(`📅 [BackgroundJobs] Job programado semanalmente los ${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayOfWeek]} a las ${time}`);
    }
    scheduleMonthly(dayOfMonth, time, callback) {
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
            const nextMonth = new Date(scheduledTime);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const nextDelay = nextMonth.getTime() - Date.now();
            setTimeout(() => {
                this.scheduleMonthly(dayOfMonth, time, callback);
            }, nextDelay);
        }, delay);
        console.log(`📅 [BackgroundJobs] Job programado mensualmente el día ${dayOfMonth} a las ${time}`);
    }
    async ejecutarCierreVentasDiario() {
        try {
            console.log('🌙 [BackgroundJobs] Iniciando cierre de ventas diario...');
            const hoy = new Date().toISOString().split('T')[0];
            const ventasQuery = this.supabase.query('pos_ventas')
                .select(`
          *,
          pos_venta_items(*)
        `)
                .gte('created_at', `${hoy}T00:00:00`)
                .lt('created_at', `${hoy}T23:59:59`);
            const { data: ventas, error: ventasError } = await ventasQuery;
            if (ventasError)
                throw ventasError;
            if (!ventas || ventas.length === 0) {
                console.log('ℹ️ [BackgroundJobs] No hay ventas para procesar hoy');
                return;
            }
            const totalVentas = ventas.reduce((sum, venta) => sum + parseFloat(venta.total || '0'), 0);
            const cantidadVentas = ventas.length;
            const ventasPorMetodoPago = {};
            ventas.forEach(venta => {
                const metodo = venta.metodo_pago_id || 'EFECTIVO';
                ventasPorMetodoPago[metodo] = (ventasPorMetodoPago[metodo] || 0) + parseFloat(venta.total || '0');
            });
            const productosVendidos = {};
            ventas.forEach(venta => {
                if (venta.pos_venta_items) {
                    venta.pos_venta_items.forEach((item) => {
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
            const eventoCierre = {
                fecha: hoy,
                totalVentas,
                cantidadVentas,
                ventasPorMetodoPago,
                ventasPorVendedor: [],
                productosVendidos: productosVendidosArray,
                requiereReporteSire: totalVentas > 0
            };
            this.eventBus.emitCierreVentasDiario(eventoCierre);
            console.log(`✅ [BackgroundJobs] Cierre diario completado: ${cantidadVentas} ventas, S/ ${totalVentas.toFixed(2)}`);
        }
        catch (error) {
            console.error('❌ [BackgroundJobs] Error en cierre de ventas diario:', error);
        }
    }
    async verificarStockBajo() {
        try {
            console.log('📦 [BackgroundJobs] Verificando productos con stock bajo...');
            if (this.supabase.isMockMode()) {
                console.log('✅ [BackgroundJobs] Verificación de stock en modo mock - simulado');
                return;
            }
            const productosQuery = this.supabase.query('productos')
                .select('*')
                .gt('stock_minimo', 0);
            const { data: productos, error } = await productosQuery;
            if (error)
                throw error;
            if (!productos || productos.length === 0) {
                console.log('✅ [BackgroundJobs] Todos los productos tienen stock adecuado');
                return;
            }
            const productosStockBajo = productos.filter(producto => parseFloat(producto.stock_actual || '0') <= parseFloat(producto.stock_minimo || '0'));
            if (productosStockBajo.length === 0) {
                console.log('✅ [BackgroundJobs] Todos los productos tienen stock adecuado');
                return;
            }
            console.log(`⚠️ [BackgroundJobs] Encontrados ${productosStockBajo.length} productos con stock bajo`);
            for (const producto of productosStockBajo) {
                const eventoStockBajo = {
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
        }
        catch (error) {
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
            if (error)
                throw error;
            if (!facturas || facturas.length === 0) {
                console.log('✅ [BackgroundJobs] No hay facturas próximas a vencer');
                return;
            }
            console.log(`⚠️ [BackgroundJobs] Encontradas ${facturas.length} facturas con vencimientos próximos`);
            for (const factura of facturas) {
                const fechaVencimiento = new Date(factura.fecha_vencimiento);
                const diasVencido = Math.floor((hoy.getTime() - fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24));
                const montoVencido = parseFloat(factura.saldo_pendiente || factura.total || '0');
                const eventoVencimiento = {
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
        }
        catch (error) {
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
                const eventoSire = {
                    reporteId: `SIRE-${periodo}-MOCK`,
                    periodo,
                    tipoReporte: 'VENTAS',
                    cantidadRegistros: 50,
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
            if (ventasError)
                throw ventasError;
            if (!ventas || ventas.length === 0) {
                console.log(`ℹ️ [BackgroundJobs] No hay ventas para SIRE en periodo ${periodo}`);
                return;
            }
            const reporteId = `SIRE-${periodo}-${Date.now()}`;
            const archivoGenerado = `sire_ventas_${periodo}.txt`;
            const eventoSire = {
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
        }
        catch (error) {
            console.error('❌ [BackgroundJobs] Error generando reportes SIRE:', error);
        }
    }
    async actualizarMetricasDashboard() {
        try {
            const hoy = new Date().toISOString().split('T')[0];
            const mesActual = new Date().toISOString().substring(0, 7);
            if (this.supabase.isMockMode()) {
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
            const cpeQuery = this.supabase.query('cpe_documentos').select('id', { count: 'exact' });
            const greQuery = this.supabase.query('gre_documentos').select('id', { count: 'exact' });
            const usersQuery = this.supabase.query('usuarios_sistema').select('id', { count: 'exact' });
            const productosQuery = this.supabase.query('productos').select('*');
            const ventasHoyQuery = this.supabase.query('pos_ventas').select('total').gte('created_at', `${hoy}T00:00:00`);
            const ventasMesQuery = this.supabase.query('pos_ventas').select('total').gte('created_at', `${mesActual}-01T00:00:00`);
            const comprasQuery = this.supabase.query('orden_compra').select('total').gte('created_at', `${mesActual}-01T00:00:00`);
            const cotizacionesQuery = this.supabase.query('cotizaciones').select('*');
            const [{ data: cpeData }, { data: greData }, { data: usersData }, { data: productosData }, { data: ventasHoyData }, { data: ventasMesData }, { data: comprasData }, { data: cotizacionesData }] = await Promise.all([
                cpeQuery,
                greQuery,
                usersQuery,
                productosQuery,
                ventasHoyQuery,
                ventasMesQuery,
                comprasQuery,
                cotizacionesQuery
            ]);
            const totalCpe = cpeData?.length || 0;
            const totalGre = greData?.length || 0;
            const totalUsers = usersData?.length || 0;
            const totalInventario = productosData?.length || 0;
            const valorInventario = productosData?.reduce((sum, prod) => sum + (parseFloat(prod.stock_actual || '0') * parseFloat(prod.precio_venta || '0')), 0) || 0;
            const productosConStockBajo = productosData?.filter(prod => parseFloat(prod.stock_actual || '0') <= parseFloat(prod.stock_minimo || '0')).length || 0;
            const ventasHoy = ventasHoyData?.reduce((sum, venta) => sum + parseFloat(venta.total || '0'), 0) || 0;
            const ventasMes = ventasMesData?.reduce((sum, venta) => sum + parseFloat(venta.total || '0'), 0) || 0;
            const comprasMes = comprasData?.reduce((sum, compra) => sum + parseFloat(compra.total || '0'), 0) || 0;
            const totalCotizaciones = cotizacionesData?.length || 0;
            const cotizacionesPendientes = cotizacionesData?.filter(cot => cot.estado === 'PENDIENTE').length || 0;
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
        }
        catch (error) {
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
            if (error)
                throw error;
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
                    const eventoInventario = {
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
        }
        catch (error) {
            console.error('❌ [BackgroundJobs] Error en inventario cíclico:', error);
        }
    }
    async procesarAsistenciasPendientes() {
        try {
            if (this.supabase.isMockMode()) {
                return;
            }
            const hoy = new Date().toISOString().split('T')[0];
            const empleadosQuery = this.supabase.query('empleados')
                .select('*')
                .eq('estado', 'ACTIVO');
            const asistenciasQuery = this.supabase.query('asistencias')
                .select('empleado_id')
                .eq('fecha', hoy);
            const [{ data: empleados, error: empleadosError }, { data: asistenciasHoy, error: asistenciasError }] = await Promise.all([empleadosQuery, asistenciasQuery]);
            if (empleadosError)
                throw empleadosError;
            if (asistenciasError)
                throw asistenciasError;
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
        }
        catch (error) {
            console.error('❌ [BackgroundJobs] Error procesando asistencias:', error);
        }
    }
};
exports.BackgroundJobsService = BackgroundJobsService;
exports.BackgroundJobsService = BackgroundJobsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], BackgroundJobsService);
//# sourceMappingURL=background-jobs.service.js.map