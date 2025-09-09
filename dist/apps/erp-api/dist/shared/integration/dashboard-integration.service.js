"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
const event_bus_service_1 = require("../events/event-bus.service");
let DashboardIntegrationService = class DashboardIntegrationService {
    constructor(supabase, eventBus) {
        this.supabase = supabase;
        this.eventBus = eventBus;
        console.log('🚀 [DashboardIntegration] Servicio inicializado');
    }
    async getConsolidatedMetrics() {
        try {
            console.log('📊 [DashboardIntegration] Consolidando métricas de todos los módulos...');
            const client = this.supabase.getClient();
            const hoy = new Date();
            const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
            const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
            const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
            const [ventasHoyData, ventasMesData, ventasMesAnteriorData, comprasMesData, ordenesCompraPendientesData, productosData, productosStockBajoData, movimientosHoyData, cpeDelMesData, greDelMesData, sireDelMesData, cotizacionesDelMesData, cotizacionesPendientesData, cotizacionesAceptadasData, usuariosData] = await Promise.all([
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
            const metrics = {
                totalCpe: cpeDelMesData?.length || 0,
                totalGre: greDelMesData?.length || 0,
                totalSire: sireDelMesData?.length || 0,
                totalUsers: usuariosData?.length || 0,
                totalInventario: totalProductos,
                totalCompras: comprasMesData?.length || 0,
                totalCotizaciones: totalCotizaciones,
                ventasMes: ventasMesTotal,
                ventasHoy: ventasHoyTotal,
                comprasMes: comprasMesTotal,
                valorInventario: valorInventario,
                productosConStockBajo: productosStockBajoData?.length || 0,
                cotizacionesPendientes: cotizacionesPendientesData?.length || 0,
                ordenesCompraPendientes: ordenesCompraPendientesData?.length || 0,
                movimientosHoy: movimientosHoyData?.length || 0,
                tasaConversionCotizaciones: Number(tasaConversion.toFixed(1)),
                crecimientoVentas: Number(crecimientoVentas.toFixed(1)),
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
            this.eventBus.emitDashboardMetricsUpdated(metrics);
            return metrics;
        }
        catch (error) {
            console.error('❌ [DashboardIntegration] Error consolidando métricas:', error);
            throw error;
        }
    }
    async getRecentActivities() {
        try {
            console.log('📋 [DashboardIntegration] Obteniendo actividades recientes...');
            const client = this.supabase.getClient();
            const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const [ventasRecientes, comprasRecientes, cotizacionesRecientes, cpeRecientes, greRecientes] = await Promise.all([
                this.getVentasRecientes(client, hace24h),
                this.getComprasRecientes(client, hace24h),
                this.getCotizacionesRecientes(client, hace24h),
                this.getCpeRecientes(client, hace24h),
                this.getGreRecientes(client, hace24h)
            ]);
            const actividades = [];
            this.processVentasActivities(ventasRecientes, actividades);
            this.processComprasActivities(comprasRecientes, actividades);
            this.processCotizacionesActivities(cotizacionesRecientes, actividades);
            this.processCpeActivities(cpeRecientes, actividades);
            this.processGreActivities(greRecientes, actividades);
            const actividadesOrdenadas = actividades
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 20);
            console.log(`✅ [DashboardIntegration] ${actividadesOrdenadas.length} actividades recientes consolidadas`);
            return actividadesOrdenadas;
        }
        catch (error) {
            console.error('❌ [DashboardIntegration] Error obteniendo actividades:', error);
            return [];
        }
    }
    async getVentasHoy(client, hoy) {
        const { data } = await client.from('ventas_pos')
            .select('total')
            .gte('fecha', hoy.toISOString().split('T')[0])
            .lt('fecha', new Date(hoy.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        return data;
    }
    async getVentasMes(client, inicio, fin) {
        const { data } = await client.from('ventas_pos')
            .select('total')
            .gte('fecha', inicio.toISOString().split('T')[0])
            .lte('fecha', fin.toISOString().split('T')[0]);
        return data;
    }
    async getVentasMesAnterior(client, inicio, fin) {
        const { data } = await client.from('ventas_pos')
            .select('total')
            .gte('fecha', inicio.toISOString().split('T')[0])
            .lte('fecha', fin.toISOString().split('T')[0]);
        return data;
    }
    async getComprasMes(client, inicio, fin) {
        const { data } = await client.from('ordenes_compra')
            .select('total')
            .gte('fecha_orden', inicio.toISOString().split('T')[0])
            .lte('fecha_orden', fin.toISOString().split('T')[0]);
        return data;
    }
    async getOrdenesCompraPendientes(client) {
        const { data } = await client.from('ordenes_compra')
            .select('id')
            .eq('estado', 'PENDIENTE');
        return data;
    }
    async getProductos(client) {
        const { data } = await client.from('productos')
            .select('id, precio, stock, stock_minimo');
        return data;
    }
    async getProductosStockBajo(client) {
        const { data } = await client.from('productos')
            .select('id')
            .lt('stock', 'stock_minimo');
        return data;
    }
    async getMovimientosHoy(client, hoy) {
        const { data } = await client.from('movimientos_stock')
            .select('id')
            .gte('created_at', hoy.toISOString().split('T')[0]);
        return data;
    }
    async getCpeDelMes(client, inicio, fin) {
        const { data } = await client.from('cpe')
            .select('id')
            .gte('fecha_emision', inicio.toISOString().split('T')[0])
            .lte('fecha_emision', fin.toISOString().split('T')[0]);
        return data;
    }
    async getGreDelMes(client, inicio, fin) {
        const { data } = await client.from('gre')
            .select('id')
            .gte('fecha_emision', inicio.toISOString().split('T')[0])
            .lte('fecha_emision', fin.toISOString().split('T')[0]);
        return data;
    }
    async getSireDelMes(client, inicio, fin) {
        const { data } = await client.from('sire_files')
            .select('id')
            .gte('created_at', inicio.toISOString().split('T')[0])
            .lte('created_at', fin.toISOString().split('T')[0]);
        return data;
    }
    async getCotizacionesDelMes(client, inicio, fin) {
        const { data } = await client.from('cotizaciones')
            .select('id, total')
            .gte('fecha_cotizacion', inicio.toISOString().split('T')[0])
            .lte('fecha_cotizacion', fin.toISOString().split('T')[0]);
        return data;
    }
    async getCotizacionesPendientes(client) {
        const { data } = await client.from('cotizaciones')
            .select('id')
            .in('estado', ['PENDIENTE', 'ENVIADA']);
        return data;
    }
    async getCotizacionesAceptadas(client) {
        const { data } = await client.from('cotizaciones')
            .select('id')
            .eq('estado', 'ACEPTADA');
        return data;
    }
    async getUsuarios(client) {
        const { data } = await client.from('usuarios')
            .select('id');
        return data;
    }
    async getVentasRecientes(client, desde) {
        const { data } = await client.from('ventas_pos')
            .select('id, numero_ticket, total, fecha, estado, created_at')
            .gte('created_at', desde.toISOString())
            .order('created_at', { ascending: false })
            .limit(5);
        return data;
    }
    async getComprasRecientes(client, desde) {
        const { data } = await client.from('ordenes_compra')
            .select('id, numero, total, fecha_orden, estado, created_at')
            .gte('created_at', desde.toISOString())
            .order('created_at', { ascending: false })
            .limit(5);
        return data;
    }
    async getCotizacionesRecientes(client, desde) {
        const { data } = await client.from('cotizaciones')
            .select('id, numero, total, fecha_cotizacion, estado, created_at')
            .gte('created_at', desde.toISOString())
            .order('created_at', { ascending: false })
            .limit(5);
        return data;
    }
    async getCpeRecientes(client, desde) {
        const { data } = await client.from('cpe')
            .select('id, numero_comprobante, total, fecha_emision, estado_sunat, created_at')
            .gte('created_at', desde.toISOString())
            .order('created_at', { ascending: false })
            .limit(5);
        return data;
    }
    async getGreRecientes(client, desde) {
        const { data } = await client.from('gre')
            .select('id, numero, fecha_emision, estado, created_at')
            .gte('created_at', desde.toISOString())
            .order('created_at', { ascending: false })
            .limit(5);
        return data;
    }
    sumarTotales(data) {
        return data?.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0) || 0;
    }
    calcularValorInventario(productos) {
        return productos?.reduce((sum, p) => sum + ((parseFloat(p.precio) || 0) * (parseFloat(p.stock) || 0)), 0) || 0;
    }
    processVentasActivities(ventas, actividades) {
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
    processComprasActivities(compras, actividades) {
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
    processCotizacionesActivities(cotizaciones, actividades) {
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
    processCpeActivities(cpes, actividades) {
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
    processGreActivities(gres, actividades) {
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
    mapearEstado(estado) {
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
    mapearEstadoSunat(estadoSunat) {
        const estadosMap = {
            'ACEPTADO': 'success',
            'ENVIADO': 'warning',
            'RECHAZADO': 'error',
            'PENDIENTE': 'pending'
        };
        return estadosMap[estadoSunat?.toUpperCase()] || 'pending';
    }
};
exports.DashboardIntegrationService = DashboardIntegrationService;
exports.DashboardIntegrationService = DashboardIntegrationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], DashboardIntegrationService);
