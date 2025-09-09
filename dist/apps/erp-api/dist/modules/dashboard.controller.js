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
exports.DashboardController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
let DashboardController = class DashboardController {
    constructor(supabase) {
        this.supabase = supabase;
    }
    async seedTestData() {
        try {
            console.log('🌱 [Dashboard] Creando datos de prueba...');
            const client = this.supabase.getClient();
            const tenantId = '550e8400-e29b-41d4-a716-446655440000';
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
            }
            else {
                console.log('✅ CPE insertados:', cpeInserted?.length);
            }
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
            }
            else {
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
        }
        catch (error) {
            console.error('❌ [Dashboard] Error creando datos de prueba:', error);
            return {
                success: false,
                message: 'Error creando datos de prueba',
                error: error.message
            };
        }
    }
    async getStats() {
        try {
            console.log('📊 [Dashboard Controller] Obteniendo métricas reales...');
            const client = this.supabase.getClient();
            const tenantId = '550e8400-e29b-41d4-a716-446655440000';
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
            const [cpeResult, cpeHoyResult, greResult, productosResult, comprasTodasResult, usuariosResult, cotizacionesResult, cotizacionesPendientesResult, sireResult] = await Promise.allSettled([
                client.from('cpe')
                    .select('total_venta, created_at, tenant_id')
                    .order('created_at', { ascending: false }),
                client.from('cpe')
                    .select('total_venta')
                    .gte('created_at', inicioHoy.toISOString()),
                client.from('gre_guias')
                    .select('id')
                    .gte('created_at', inicioMes.toISOString()),
                client.from('productos')
                    .select('id, precio, stock, stock_minimo'),
                client.from('ordenes_compra')
                    .select('total, estado, fecha_orden, created_at')
                    .order('created_at', { ascending: false }),
                client.from('usuarios')
                    .select('id'),
                client.from('cotizaciones')
                    .select('id, estado')
                    .gte('created_at', inicioMes.toISOString()),
                client.from('cotizaciones')
                    .select('id')
                    .eq('estado', 'PENDIENTE'),
                client.from('sire_files')
                    .select('id')
                    .gte('created_at', inicioMes.toISOString())
            ]);
            const cpeData = cpeResult.status === 'fulfilled' ? cpeResult.value.data : [];
            const cpeHoyData = cpeHoyResult.status === 'fulfilled' ? cpeHoyResult.value.data : [];
            const greData = greResult.status === 'fulfilled' ? greResult.value.data : [];
            const productosData = productosResult.status === 'fulfilled' ? productosResult.value.data : [];
            const comprasData = comprasTodasResult.status === 'fulfilled' ? comprasTodasResult.value.data : [];
            const usuariosData = usuariosResult.status === 'fulfilled' ? usuariosResult.value.data : [];
            const cotizacionesData = cotizacionesResult.status === 'fulfilled' ? cotizacionesResult.value.data : [];
            const cotizacionesPendientesData = cotizacionesPendientesResult.status === 'fulfilled' ? cotizacionesPendientesResult.value.data : [];
            const sireData = sireResult.status === 'fulfilled' ? sireResult.value.data : [];
            if (cpeResult.status === 'rejected') {
                console.error('❌ [Dashboard] Error en consulta CPE:', cpeResult.reason);
            }
            else {
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
            const ingresosMes = this.sumarTotalesCpe(cpeData);
            const ingresosHoy = this.sumarTotalesCpe(cpeHoyData);
            const inversionCompras = this.sumarTotales(comprasData);
            const totalProductos = productosData?.length || 0;
            const valorInventario = this.calcularValorInventario(productosData);
            const productosStockBajo = this.contarProductosStockBajo(productosData);
            const comprasPendientes = comprasData?.filter(c => c.estado === 'PENDIENTE').length || 0;
            const totalCotizaciones = cotizacionesData?.length || 0;
            const cotizacionesAceptadas = cotizacionesData?.filter(c => c.estado === 'ACEPTADA').length || 0;
            const tasaConversion = totalCotizaciones > 0 ?
                ((cotizacionesAceptadas / totalCotizaciones) * 100) : 0;
            const estadisticas = {
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
        }
        catch (error) {
            console.error('❌ [Dashboard Controller] Error obteniendo estadísticas:', error);
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
    async getActivities() {
        try {
            console.log('📋 [Dashboard Controller] Obteniendo actividades recientes reales...');
            const client = this.supabase.getClient();
            const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const [cpeResult, greResult, comprasResult, cotizacionesResult] = await Promise.allSettled([
                client.from('cpe')
                    .select('id, serie, numero, total_venta, estado, created_at')
                    .gte('created_at', hace24h.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(10),
                client.from('gre_guias')
                    .select('id, numero, fecha_traslado, estado, created_at')
                    .gte('created_at', hace24h.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(10),
                client.from('ordenes_compra')
                    .select('id, numero, total, fecha_orden, estado, created_at')
                    .gte('created_at', hace24h.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(10),
                client.from('cotizaciones')
                    .select('id, numero, total, fecha_cotizacion, estado, created_at')
                    .gte('created_at', hace24h.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(10)
            ]);
            const actividades = [];
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
            const actividadesOrdenadas = actividades
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 20);
            console.log(`✅ [Dashboard Controller] ${actividadesOrdenadas.length} actividades reales obtenidas`);
            return {
                success: true,
                data: actividadesOrdenadas
            };
        }
        catch (error) {
            console.error('❌ [Dashboard Controller] Error obteniendo actividades:', error);
            return {
                success: false,
                data: [],
                message: 'Error al obtener actividades recientes'
            };
        }
    }
    sumarTotales(data) {
        if (!Array.isArray(data))
            return 0;
        return data.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    }
    sumarTotalesCpe(data) {
        if (!Array.isArray(data))
            return 0;
        return data.reduce((sum, item) => sum + (parseFloat(item.total_venta) || 0), 0);
    }
    calcularValorInventario(productos) {
        if (!Array.isArray(productos))
            return 0;
        return productos.reduce((sum, p) => sum + ((parseFloat(p.precio) || 0) * (parseFloat(p.stock) || 0)), 0);
    }
    contarProductosStockBajo(productos) {
        if (!Array.isArray(productos))
            return 0;
        return productos.filter(p => parseFloat(p.stock || 0) <= parseFloat(p.stock_minimo || 0)).length;
    }
    mapearEstado(estado) {
        if (!estado)
            return 'pending';
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
};
exports.DashboardController = DashboardController;
__decorate([
    (0, common_1.Post)('seed-test-data'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear datos de prueba para CPE y GRE' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Datos de prueba creados exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "seedTestData", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener estadísticas generales del dashboard' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estadísticas obtenidas exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('activities'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener actividades recientes' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Actividades obtenidas exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getActivities", null);
exports.DashboardController = DashboardController = __decorate([
    (0, swagger_1.ApiTags)('dashboard'),
    (0, common_1.Controller)('dashboard'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], DashboardController);
