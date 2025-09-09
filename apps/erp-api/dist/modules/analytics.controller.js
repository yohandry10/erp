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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const inventory_integration_service_1 = require("../shared/integration/inventory-integration.service");
let AnalyticsController = class AnalyticsController {
    constructor(supabase, inventoryService) {
        this.supabase = supabase;
        this.inventoryService = inventoryService;
    }
    async getVentasTiempo(filtros) {
        try {
            console.log('📊 [Analytics] Analizando ventas por tiempo...');
            const fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - 30);
            const { data: ventas, error: ventasError } = await this.supabase.getClient()
                .from('ventas_pos')
                .select('fecha, total')
                .gte('fecha', fechaInicio.toISOString())
                .order('fecha');
            if (ventasError) {
                console.error('❌ Error obteniendo ventas:', ventasError);
                throw new Error(`Error consultando ventas: ${ventasError.message}`);
            }
            console.log(`📊 Se encontraron ${ventas?.length || 0} ventas en los últimos 30 días`);
            const ventasPorDia = ventas ? this.procesarVentasDiarias(ventas) : [];
            const labels = ventasPorDia.map(v => v.fecha);
            const data = ventasPorDia.map(v => v.total);
            const ventasActuales = ventas?.reduce((sum, v) => sum + parseFloat(v.total || 0), 0) || 0;
            const ventasAnterior = await this.calcularVentasMesAnterior();
            const crecimiento = ventasAnterior > 0 ?
                ((ventasActuales - ventasAnterior) / ventasAnterior * 100).toFixed(1) + '%' :
                'SIN DATOS';
            return {
                success: true,
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Ventas Diarias',
                            data,
                            backgroundColor: '#3b82f6',
                            borderColor: '#1d4ed8',
                            fill: false
                        }
                    ],
                    totales: {
                        ventasActuales,
                        ventasAnterior,
                        crecimiento
                    }
                }
            };
        }
        catch (error) {
            console.error('❌ Error analizando ventas por tiempo:', error);
            return {
                success: false,
                message: error.message,
                data: {
                    labels: [],
                    datasets: [],
                    totales: { ventasActuales: 0, ventasAnterior: 0, crecimiento: 'ERROR' }
                }
            };
        }
    }
    procesarVentasDiarias(ventas) {
        const ventasPorDia = new Map();
        ventas.forEach(venta => {
            const fecha = new Date(venta.fecha).toLocaleDateString('es-PE', {
                day: '2-digit',
                month: '2-digit'
            });
            const total = parseFloat(venta.total || 0);
            ventasPorDia.set(fecha, (ventasPorDia.get(fecha) || 0) + total);
        });
        return Array.from(ventasPorDia.entries()).map(([fecha, total]) => ({
            fecha,
            total
        }));
    }
    async calcularVentasMesAnterior() {
        try {
            const fechaInicio = new Date();
            fechaInicio.setDate(fechaInicio.getDate() - 60);
            const fechaFin = new Date();
            fechaFin.setDate(fechaFin.getDate() - 30);
            const { data: ventas } = await this.supabase.getClient()
                .from('ventas_pos')
                .select('total')
                .gte('fecha', fechaInicio.toISOString())
                .lte('fecha', fechaFin.toISOString());
            return ventas?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
        }
        catch (error) {
            console.error('❌ Error calculando ventas mes anterior:', error);
            return 0;
        }
    }
    async getDeudasClientes() {
        try {
            const { data: cuentasPorCobrar, error } = await this.supabase.getClient()
                .from('cuentas_por_cobrar')
                .select('*, clientes(nombre, ruc)')
                .order('fecha_vencimiento', { ascending: true });
            if (error)
                throw error;
            const ahora = new Date();
            const edadSaldos = {
                '0-30 días': 0,
                '31-60 días': 0,
                '61-90 días': 0,
                '90+ días': 0
            };
            const topDeudores = [];
            let totalPorCobrar = 0;
            let totalVencido = 0;
            cuentasPorCobrar?.forEach(cuenta => {
                const diasVencido = Math.floor((ahora.getTime() - new Date(cuenta.fecha_vencimiento).getTime()) / (1000 * 60 * 60 * 24));
                const monto = parseFloat(cuenta.monto || 0);
                totalPorCobrar += monto;
                if (diasVencido > 0) {
                    totalVencido += monto;
                    if (diasVencido <= 30)
                        edadSaldos['0-30 días'] += monto;
                    else if (diasVencido <= 60)
                        edadSaldos['31-60 días'] += monto;
                    else if (diasVencido <= 90)
                        edadSaldos['61-90 días'] += monto;
                    else
                        edadSaldos['90+ días'] += monto;
                }
                topDeudores.push({
                    cliente: cuenta.clientes?.nombre || 'Cliente sin nombre',
                    ruc: cuenta.clientes?.ruc || 'Sin RUC',
                    monto: monto,
                    diasVencido: Math.max(0, diasVencido)
                });
            });
            return {
                success: true,
                data: {
                    graficoEdadSaldos: {
                        labels: Object.keys(edadSaldos),
                        data: Object.values(edadSaldos),
                        backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#7c2d12']
                    },
                    topDeudores: topDeudores.slice(0, 10),
                    alertasCobranza: this.generarAlertasCobranza(cuentasPorCobrar),
                    totales: {
                        totalPorCobrar,
                        vencido: totalVencido,
                        porcentajeVencido: totalPorCobrar > 0 ? (totalVencido / totalPorCobrar * 100).toFixed(1) : 0
                    }
                }
            };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async getRentabilidadProductos() {
        try {
            const { data: productos, error } = await this.supabase.getClient()
                .from('productos')
                .select('*, ventas_detalle(cantidad, precio_unitario), compras_detalle(cantidad, precio_unitario)');
            if (error)
                throw error;
            const productosRentabilidad = productos?.map(producto => {
                const costoPromedio = this.calcularCostoPromedio(producto.compras_detalle);
                const precioVentaPromedio = this.calcularPrecioVentaPromedio(producto.ventas_detalle);
                const margenBruto = precioVentaPromedio - costoPromedio;
                const margenPorcentaje = precioVentaPromedio > 0 ? (margenBruto / precioVentaPromedio * 100) : 0;
                return {
                    producto: producto.nombre,
                    margenPorcentaje: parseFloat(margenPorcentaje.toFixed(2)),
                    volumen: this.calcularVolumenVentas(producto.ventas_detalle),
                    rentabilidadTotal: parseFloat((margenBruto * this.calcularVolumenVentas(producto.ventas_detalle)).toFixed(2))
                };
            }) || [];
            const recomendaciones = this.generarRecomendacionesRentabilidad(productosRentabilidad);
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
                    recomendaciones
                }
            };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async getPuntoEquilibrio() {
        try {
            const { data: productos, error } = await this.supabase.getClient()
                .from('productos')
                .select('*, ventas_detalle(cantidad, precio_unitario), compras_detalle(cantidad, precio_unitario)');
            if (error)
                throw error;
            const { data: costosFijos, error: costosError } = await this.supabase.getClient()
                .from('costos_fijos')
                .select('monto, descripcion, fecha');
            if (costosError)
                throw costosError;
            const totalCostosFijos = costosFijos?.reduce((sum, costo) => sum + parseFloat(costo.monto || 0), 0) || 0;
            const analisisPorProducto = productos?.map(producto => {
                const costoVariable = this.calcularCostoPromedio(producto.compras_detalle);
                const precioVenta = this.calcularPrecioVentaPromedio(producto.ventas_detalle);
                const margenContribucion = precioVenta - costoVariable;
                const puntoEquilibrioUnidades = margenContribucion > 0 ? totalCostosFijos / margenContribucion : 0;
                return {
                    producto: producto.nombre,
                    precioVenta,
                    costoVariable,
                    margenContribucion,
                    puntoEquilibrioUnidades: Math.ceil(puntoEquilibrioUnidades),
                    puntoEquilibrioSoles: Math.ceil(puntoEquilibrioUnidades * precioVenta)
                };
            }) || [];
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
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async getEscenariosFinancieros(escenario = 'base') {
        try {
            const ventasActuales = await this.obtenerVentasUltimos12Meses();
            const costosActuales = await this.obtenerCostosUltimos12Meses();
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
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    calcularCostoPromedio(compras) {
        if (!compras || compras.length === 0)
            return 0;
        const totalCosto = compras.reduce((sum, compra) => sum + (parseFloat(compra.precio_unitario || 0) * parseInt(compra.cantidad || 0)), 0);
        const totalCantidad = compras.reduce((sum, compra) => sum + parseInt(compra.cantidad || 0), 0);
        return totalCantidad > 0 ? totalCosto / totalCantidad : 0;
    }
    calcularPrecioVentaPromedio(ventas) {
        if (!ventas || ventas.length === 0)
            return 0;
        const totalIngresos = ventas.reduce((sum, venta) => sum + (parseFloat(venta.precio_unitario || 0) * parseInt(venta.cantidad || 0)), 0);
        const totalCantidad = ventas.reduce((sum, venta) => sum + parseInt(venta.cantidad || 0), 0);
        return totalCantidad > 0 ? totalIngresos / totalCantidad : 0;
    }
    calcularVolumenVentas(ventas) {
        return ventas ? ventas.reduce((sum, venta) => sum + parseInt(venta.cantidad || 0), 0) : 0;
    }
    generarRecomendacionesRentabilidad(productos) {
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
    generarAlertasCobranza(cuentas) {
        const ahora = new Date();
        return cuentas?.filter(cuenta => {
            const diasVencido = Math.floor((ahora.getTime() - new Date(cuenta.fecha_vencimiento).getTime()) / (1000 * 60 * 60 * 24));
            return diasVencido > 30;
        }).map(cuenta => ({
            tipo: 'VENCIDO',
            mensaje: `Cliente ${cuenta.clientes?.nombre} tiene ${Math.floor((ahora.getTime() - new Date(cuenta.fecha_vencimiento).getTime()) / (1000 * 60 * 60 * 24))} días de atraso`,
            monto: parseFloat(cuenta.monto || 0),
            fechaVencimiento: cuenta.fecha_vencimiento
        })) || [];
    }
    async obtenerVentasUltimos12Meses() {
        const ventas = [];
        for (let i = 11; i >= 0; i--) {
            const fechaInicio = new Date();
            fechaInicio.setMonth(fechaInicio.getMonth() - i);
            fechaInicio.setDate(1);
            const fechaFin = new Date(fechaInicio);
            fechaFin.setMonth(fechaFin.getMonth() + 1);
            const { data } = await this.supabase.getClient()
                .from('ventas_pos')
                .select('total')
                .gte('fecha', fechaInicio.toISOString())
                .lt('fecha', fechaFin.toISOString());
            ventas.push(data?.reduce((sum, v) => sum + parseFloat(v.total || 0), 0) || 0);
        }
        return ventas;
    }
    async obtenerCostosUltimos12Meses() {
        return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    simularEscenarios(ventas, costos, escenario) {
        const factorCrecimiento = escenario === 'optimista' ? 1.2 : escenario === 'pesimista' ? 0.8 : 1.0;
        const ventasProyectadas = ventas.map(v => v * factorCrecimiento);
        return {
            ventasProyectadas,
            costosProyectados: costos.map(c => c * 0.95),
            utilidadProyectada: ventasProyectadas.map((v, i) => v - costos[i]),
            roi: ventasProyectadas.reduce((a, b) => a + b, 0) / costos.reduce((a, b) => a + b, 0)
        };
    }
    generarAnalisisSensibilidad(ventas, costos) {
        return {
            impacto5Porciento: ventas.map(v => v * 0.05),
            impacto10Porciento: ventas.map(v => v * 0.10),
            umbralRiesgo: Math.min(...ventas) * 0.9
        };
    }
    generarRecomendacionesEscenarios(escenarios) {
        return [
            'Monitorear costos variables mensualmente',
            'Establecer límites de gasto por categoría',
            'Considerar diversificación de ingresos'
        ];
    }
    generarRecomendacionPuntoEquilibrio(productos, costosFijos) {
        if (costosFijos > 10000) {
            return 'Considerar reducción de costos fijos o aumento de precios';
        }
        return 'El punto de equilibrio está dentro de rangos aceptables';
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('ventas-tiempo'),
    (0, swagger_1.ApiOperation)({ summary: 'Gráfico de ventas en el tiempo' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de ventas en el tiempo obtenidos exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getVentasTiempo", null);
__decorate([
    (0, common_1.Get)('deudas-clientes'),
    (0, swagger_1.ApiOperation)({ summary: 'Gráfico de deudas de clientes' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de deudas de clientes obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getDeudasClientes", null);
__decorate([
    (0, common_1.Get)('rentabilidad-productos'),
    (0, swagger_1.ApiOperation)({ summary: 'Análisis de rentabilidad por productos' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Análisis de rentabilidad obtenido exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getRentabilidadProductos", null);
__decorate([
    (0, common_1.Get)('punto-equilibrio'),
    (0, swagger_1.ApiOperation)({ summary: 'Cálculo del punto de equilibrio' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Análisis de punto de equilibrio obtenido exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getPuntoEquilibrio", null);
__decorate([
    (0, common_1.Get)('escenarios-financieros'),
    (0, swagger_1.ApiOperation)({ summary: 'Simulaciones de escenarios financieros' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Escenarios financieros simulados exitosamente' }),
    __param(0, (0, common_1.Query)('escenario')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getEscenariosFinancieros", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, swagger_1.ApiTags)('analytics'),
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        inventory_integration_service_1.InventoryIntegrationService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map