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
exports.ComprasController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const event_bus_service_1 = require("../shared/events/event-bus.service");
const inventory_integration_service_1 = require("../shared/integration/inventory-integration.service");
let ComprasController = class ComprasController {
    constructor(supabase, eventBus, inventoryIntegration) {
        this.supabase = supabase;
        this.eventBus = eventBus;
        this.inventoryIntegration = inventoryIntegration;
    }
    async getStats() {
        try {
            const supabase = this.supabase.getClient();
            console.log('📊 [Compras Stats] Obteniendo estadísticas de compras...');
            const { data: todasLasCompras, error: comprasError } = await supabase
                .from('ordenes_compra')
                .select('*')
                .order('created_at', { ascending: false });
            if (comprasError) {
                console.error('❌ [Compras Stats] Error en consulta principal:', comprasError);
                throw comprasError;
            }
            console.log('🔍 [Compras Stats] DEBUG - Datos obtenidos:', {
                totalComprasEncontradas: todasLasCompras?.length,
                primerasTresCompras: todasLasCompras?.slice(0, 3)?.map(c => ({
                    total: c.total,
                    estado: c.estado,
                    fecha: c.fecha_orden
                }))
            });
            const totalComprasMonto = todasLasCompras?.reduce((sum, orden) => {
                const total = parseFloat(orden.total) || 0;
                console.log(`💰 Sumando orden ${orden.numero}: ${total}`);
                return sum + total;
            }, 0) || 0;
            const cantidadCompras = todasLasCompras?.length || 0;
            const ordenesActivas = todasLasCompras?.filter(o => ['PENDIENTE', 'ENTREGADO'].includes(o.estado)).length || 0;
            const ordenesVencidas = todasLasCompras?.filter(o => o.estado === 'PENDIENTE' && new Date(o.fecha_entrega) < new Date()).length || 0;
            let proveedoresActivos = 0;
            try {
                const { data: proveedores } = await supabase
                    .from('proveedores')
                    .select('id')
                    .eq('activo', true);
                proveedoresActivos = proveedores?.length || 0;
            }
            catch (error) {
                console.warn('⚠️ [Compras Stats] No se pudo obtener proveedores:', error);
                proveedoresActivos = 2;
            }
            const estadisticas = {
                comprasDelMes: cantidadCompras,
                totalCompras: totalComprasMonto,
                montoTotalMes: totalComprasMonto,
                ordenesActivas: ordenesActivas,
                proveedoresActivos: proveedoresActivos,
                ordenesVencidas: ordenesVencidas
            };
            console.log('✅ [Compras Stats] Estadísticas calculadas:', estadisticas);
            console.log('💰 [Compras Stats] Total calculado:', totalComprasMonto);
            return {
                success: true,
                data: estadisticas
            };
        }
        catch (error) {
            console.error('❌ [Compras Stats] Error completo:', {
                message: error.message,
                details: error.stack,
                hint: error.hint || '',
                code: error.code || ''
            });
            return {
                success: true,
                data: {
                    comprasDelMes: 0,
                    totalCompras: 0,
                    montoTotalMes: 0,
                    ordenesActivas: 0,
                    proveedoresActivos: 0,
                    ordenesVencidas: 0
                }
            };
        }
    }
    async getOrdenes(filtros) {
        try {
            let query = this.supabase.getClient()
                .from('ordenes_compra')
                .select(`
          *,
          proveedor:proveedores(*)
        `)
                .order('created_at', { ascending: false });
            if (filtros.estado) {
                query = query.eq('estado', filtros.estado);
            }
            if (filtros.fechaDesde) {
                query = query.gte('fecha_orden', filtros.fechaDesde);
            }
            if (filtros.fechaHasta) {
                query = query.lte('fecha_orden', filtros.fechaHasta);
            }
            const { data: ordenes, error } = await query;
            if (error)
                throw error;
            return {
                success: true,
                data: ordenes || []
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo órdenes de compra:', error);
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    }
    async getNextNumber() {
        try {
            const supabase = this.supabase.getClient();
            const { data, error } = await supabase
                .from('ordenes_compra')
                .select('numero')
                .like('numero', 'OC-%')
                .order('created_at', { ascending: false })
                .limit(1);
            if (error)
                throw error;
            let nextNumber = 1;
            if (data && data.length > 0) {
                const lastNumber = data[0].numero;
                const match = lastNumber.match(/OC-\d{4}-(\d+)/);
                if (match) {
                    nextNumber = parseInt(match[1]) + 1;
                }
            }
            const year = new Date().getFullYear();
            const numero = `OC-${year}-${nextNumber.toString().padStart(3, '0')}`;
            return {
                success: true,
                data: { numero }
            };
        }
        catch (error) {
            console.error('Error generating next number:', error);
            return {
                success: false,
                message: 'Error al generar número de orden',
                error: error.message
            };
        }
    }
    async crearOrden(ordenData) {
        try {
            console.log('🛒 Creando nueva orden de compra');
            const subtotal = ordenData.items.reduce((sum, item) => sum + (item.cantidad * item.precio_unitario), 0);
            const igv = subtotal * 0.18;
            const total = subtotal + igv;
            const { data: orden, error: ordenError } = await this.supabase.getClient()
                .from('ordenes_compra')
                .insert({
                numero_orden: `OC-${Date.now()}`,
                proveedor_id: ordenData.proveedor_id,
                fecha_orden: new Date().toISOString(),
                fecha_requerida: ordenData.fecha_requerida,
                estado: 'PENDIENTE',
                subtotal: subtotal,
                igv: igv,
                total: total,
                observaciones: ordenData.observaciones,
                usuario_id: ordenData.usuario_id || 'sistema'
            })
                .select()
                .single();
            if (ordenError)
                throw ordenError;
            const detalles = ordenData.items.map(item => ({
                orden_id: orden.id,
                producto_id: item.producto_id,
                descripcion: item.descripcion,
                cantidad: item.cantidad,
                precio_unitario: item.precio_unitario,
                subtotal: item.cantidad * item.precio_unitario
            }));
            const { error: detallesError } = await this.supabase.getClient()
                .from('orden_compra_detalles')
                .insert(detalles);
            if (detallesError)
                throw detallesError;
            console.log(`✅ Orden de compra creada: ${orden.numero_orden}`);
            return {
                success: true,
                message: 'Orden de compra creada exitosamente',
                data: orden
            };
        }
        catch (error) {
            console.error('❌ Error creando orden de compra:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async recibirMercancia(ordenId, recepcionData) {
        try {
            console.log(`📦 Procesando recepción de mercancía para orden: ${ordenId}`);
            const { data: orden, error: ordenError } = await this.supabase.getClient()
                .from('ordenes_compra')
                .select(`
          *,
          orden_compra_detalles(*),
          proveedor:proveedores(*)
        `)
                .eq('id', ordenId)
                .single();
            if (ordenError || !orden)
                throw new Error('Orden de compra no encontrada');
            if (orden.estado !== 'PENDIENTE' && orden.estado !== 'PARCIAL') {
                throw new Error('La orden no está en estado válido para recepción');
            }
            for (const itemRecibido of recepcionData.items) {
                const detalleOrden = orden.orden_compra_detalles.find(d => d.id === itemRecibido.detalle_id);
                if (!detalleOrden)
                    continue;
                await this.inventoryIntegration.actualizarStockProducto(detalleOrden.producto_id, itemRecibido.cantidad_recibida, 'ENTRADA', `Recepción OC: ${orden.numero_orden}`, detalleOrden.precio_unitario);
                await this.supabase.getClient()
                    .from('orden_compra_detalles')
                    .update({
                    cantidad_recibida: (detalleOrden.cantidad_recibida || 0) + itemRecibido.cantidad_recibida,
                    fecha_recepcion: new Date().toISOString()
                })
                    .eq('id', itemRecibido.detalle_id);
            }
            const { data: detallesActualizados } = await this.supabase.getClient()
                .from('orden_compra_detalles')
                .select('cantidad, cantidad_recibida')
                .eq('orden_id', ordenId);
            const totalPedido = detallesActualizados?.reduce((sum, d) => sum + d.cantidad, 0) || 0;
            const totalRecibido = detallesActualizados?.reduce((sum, d) => sum + (d.cantidad_recibida || 0), 0) || 0;
            let nuevoEstado = 'PENDIENTE';
            if (totalRecibido >= totalPedido) {
                nuevoEstado = 'ENTREGADO';
            }
            else if (totalRecibido > 0) {
                nuevoEstado = 'PARCIAL';
            }
            await this.supabase.getClient()
                .from('ordenes_compra')
                .update({
                estado: nuevoEstado,
                fecha_entrega: nuevoEstado === 'ENTREGADO' ? new Date().toISOString() : null
            })
                .eq('id', ordenId);
            if (nuevoEstado === 'ENTREGADO') {
                this.eventBus.emitCompraEntregada({
                    ordenId: orden.id,
                    numeroOrden: orden.numero_orden,
                    proveedorId: orden.proveedor_id,
                    proveedorNombre: orden.proveedor?.nombre || 'Proveedor',
                    total: orden.total,
                    fechaEntrega: new Date().toISOString(),
                    items: orden.orden_compra_detalles.map(item => ({
                        productoId: item.producto_id,
                        descripcion: item.descripcion,
                        cantidad: item.cantidad,
                        precioUnitario: item.precio_unitario,
                        subtotal: item.subtotal
                    }))
                });
            }
            console.log(`✅ Recepción procesada. Nuevo estado: ${nuevoEstado}`);
            return {
                success: true,
                message: 'Recepción de mercancía procesada exitosamente',
                data: {
                    ordenId: orden.id,
                    estado: nuevoEstado,
                    totalRecibido,
                    totalPedido
                }
            };
        }
        catch (error) {
            console.error('❌ Error procesando recepción:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async cancelarOrden(ordenId, motivoData) {
        try {
            const { error } = await this.supabase.getClient()
                .from('ordenes_compra')
                .update({
                estado: 'CANCELADO',
                observaciones: `${motivoData.motivo || 'Cancelado'} - Fecha: ${new Date().toLocaleDateString()}`
            })
                .eq('id', ordenId);
            if (error)
                throw error;
            return {
                success: true,
                message: 'Orden de compra cancelada exitosamente'
            };
        }
        catch (error) {
            console.error('❌ Error cancelando orden:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async getProveedores() {
        try {
            console.log('🚀 [GET /api/compras/proveedores] INICIANDO...');
            const supabase = this.supabase.getClient();
            const { data, error } = await supabase
                .from('proveedores')
                .select('*')
                .eq('activo', true)
                .order('razon_social', { ascending: true });
            if (error) {
                console.error('❌ [Proveedores API] ERROR SUPABASE:', error);
                throw error;
            }
            console.log(`✅ [Proveedores API] DATOS OBTENIDOS: ${data?.length || 0} proveedores`);
            if (data && data.length > 0) {
                console.log('🔍 [Proveedores API] PRIMER PROVEEDOR:', JSON.stringify(data[0], null, 2));
            }
            const mappedData = (data || []).map(proveedor => {
                const mapped = {
                    id: proveedor.id,
                    nombre: proveedor.razon_social || proveedor.nombre_comercial || 'Sin nombre',
                    ruc: proveedor.ruc || 'Sin RUC',
                    contacto: proveedor.contacto || proveedor.email || proveedor.telefono || 'Sin contacto',
                    telefono: proveedor.telefono,
                    email: proveedor.email,
                    direccion: proveedor.direccion,
                    condiciones_pago: proveedor.condiciones_pago || 'CONTADO',
                    estado: proveedor.estado || 'ACTIVO',
                    activo: proveedor.activo
                };
                console.log(`🔄 [Proveedores API] MAPEADO: ${mapped.ruc} - ${mapped.nombre}`);
                return mapped;
            });
            const response = {
                success: true,
                data: mappedData
            };
            console.log(`📤 [Proveedores API] RESPUESTA FINAL:`, JSON.stringify(response, null, 2));
            return response;
        }
        catch (error) {
            console.error('❌ [Proveedores API] ERROR TOTAL:', error);
            const errorResponse = {
                success: false,
                error: error.message,
                data: []
            };
            console.log(`📤 [Proveedores API] ERROR RESPONSE:`, errorResponse);
            return errorResponse;
        }
    }
    async crearProveedor(proveedorData) {
        try {
            console.log('📝 [Proveedores] Creando nuevo proveedor:', proveedorData);
            if (!proveedorData.ruc || !proveedorData.razon_social) {
                return {
                    success: false,
                    error: 'RUC y Razón Social son obligatorios'
                };
            }
            const { data: existente, error: checkError } = await this.supabase.getClient()
                .from('proveedores')
                .select('id, ruc')
                .eq('ruc', proveedorData.ruc)
                .single();
            if (checkError && checkError.code !== 'PGRST116') {
                throw checkError;
            }
            if (existente) {
                return {
                    success: false,
                    error: `Ya existe un proveedor con RUC ${proveedorData.ruc}`
                };
            }
            let tenant_id = proveedorData.tenant_id;
            if (!tenant_id) {
                const { data: tenant, error: tenantError } = await this.supabase.getClient()
                    .from('tenants')
                    .select('id')
                    .limit(1)
                    .single();
                if (tenantError || !tenant) {
                    return {
                        success: false,
                        error: 'No se pudo obtener tenant_id. Verifique la configuración.'
                    };
                }
                tenant_id = tenant.id;
            }
            const { data: proveedor, error } = await this.supabase.getClient()
                .from('proveedores')
                .insert({
                tenant_id: tenant_id,
                ruc: proveedorData.ruc.trim(),
                razon_social: proveedorData.razon_social.trim(),
                nombre_comercial: proveedorData.nombre_comercial?.trim() || proveedorData.razon_social.trim(),
                direccion: proveedorData.direccion?.trim() || null,
                telefono: proveedorData.telefono?.trim() || null,
                email: proveedorData.email?.trim() || null,
                contacto: proveedorData.contacto?.trim() || null,
                estado: 'ACTIVO',
                condiciones_pago: proveedorData.condiciones_pago || 'CONTADO',
                activo: true
            })
                .select()
                .single();
            if (error)
                throw error;
            console.log('✅ [Proveedores] Proveedor creado exitosamente:', proveedor.id);
            return {
                success: true,
                message: 'Proveedor creado exitosamente',
                data: proveedor
            };
        }
        catch (error) {
            console.error('❌ [Proveedores] Error creando proveedor:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async actualizarProveedor(proveedorId, proveedorData) {
        try {
            console.log('✏️ [Proveedores] Actualizando proveedor:', proveedorId, proveedorData);
            if (!proveedorData.ruc || !proveedorData.razon_social) {
                return {
                    success: false,
                    error: 'RUC y Razón Social son obligatorios'
                };
            }
            const { data: existente, error: checkError } = await this.supabase.getClient()
                .from('proveedores')
                .select('id, ruc')
                .eq('ruc', proveedorData.ruc)
                .neq('id', proveedorId)
                .single();
            if (checkError && checkError.code !== 'PGRST116') {
                throw checkError;
            }
            if (existente) {
                return {
                    success: false,
                    error: `Ya existe otro proveedor con RUC ${proveedorData.ruc}`
                };
            }
            const { data: proveedor, error } = await this.supabase.getClient()
                .from('proveedores')
                .update({
                ruc: proveedorData.ruc.trim(),
                razon_social: proveedorData.razon_social.trim(),
                nombre_comercial: proveedorData.nombre_comercial?.trim() || proveedorData.razon_social.trim(),
                direccion: proveedorData.direccion?.trim() || null,
                telefono: proveedorData.telefono?.trim() || null,
                email: proveedorData.email?.trim() || null,
                contacto: proveedorData.contacto?.trim() || null,
                condiciones_pago: proveedorData.condiciones_pago || 'CONTADO'
            })
                .eq('id', proveedorId)
                .select()
                .single();
            if (error)
                throw error;
            console.log('✅ [Proveedores] Proveedor actualizado exitosamente:', proveedor.id);
            return {
                success: true,
                message: 'Proveedor actualizado exitosamente',
                data: proveedor
            };
        }
        catch (error) {
            console.error('❌ [Proveedores] Error actualizando proveedor:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async desactivarProveedor(proveedorId) {
        try {
            console.log('🗑️ [Proveedores] Desactivando proveedor:', proveedorId);
            const { data: proveedor, error } = await this.supabase.getClient()
                .from('proveedores')
                .update({
                activo: false,
                estado: 'INACTIVO',
                updated_at: new Date().toISOString()
            })
                .eq('id', proveedorId)
                .select()
                .single();
            if (error)
                throw error;
            console.log('✅ [Proveedores] Proveedor desactivado exitosamente:', proveedor.id);
            return {
                success: true,
                message: 'Proveedor desactivado exitosamente',
                data: proveedor
            };
        }
        catch (error) {
            console.error('❌ [Proveedores] Error desactivando proveedor:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async getReporteCompras(filtros) {
        try {
            let query = this.supabase.getClient()
                .from('ordenes_compra')
                .select(`
          *,
          proveedor:proveedores(*),
          orden_compra_detalles(*)
        `)
                .order('fecha_orden', { ascending: false });
            if (filtros.fechaDesde) {
                query = query.gte('fecha_orden', filtros.fechaDesde);
            }
            if (filtros.fechaHasta) {
                query = query.lte('fecha_orden', filtros.fechaHasta);
            }
            const { data: ordenes, error } = await query;
            if (error)
                throw error;
            const resumen = {
                totalOrdenes: ordenes?.length || 0,
                totalMonto: ordenes?.reduce((sum, o) => sum + (o.total || 0), 0) || 0,
                porEstado: {},
                topProveedores: []
            };
            ordenes?.forEach(orden => {
                const estado = orden.estado;
                if (!resumen.porEstado[estado]) {
                    resumen.porEstado[estado] = { cantidad: 0, monto: 0 };
                }
                resumen.porEstado[estado].cantidad++;
                resumen.porEstado[estado].monto += orden.total || 0;
            });
            const proveedoresMap = {};
            ordenes?.forEach(orden => {
                const proveedorNombre = orden.proveedor?.nombre || 'Sin nombre';
                if (!proveedoresMap[proveedorNombre]) {
                    proveedoresMap[proveedorNombre] = { cantidad: 0, monto: 0 };
                }
                proveedoresMap[proveedorNombre].cantidad++;
                proveedoresMap[proveedorNombre].monto += orden.total || 0;
            });
            resumen.topProveedores = Object.entries(proveedoresMap)
                .map(([nombre, data]) => ({ nombre, ...data }))
                .sort((a, b) => b.monto - a.monto)
                .slice(0, 5);
            return {
                success: true,
                data: {
                    ordenes: ordenes || [],
                    resumen
                }
            };
        }
        catch (error) {
            console.error('❌ Error generando reporte de compras:', error);
            return {
                success: false,
                error: error.message,
                data: { ordenes: [], resumen: {} }
            };
        }
    }
    async getProductos() {
        try {
            const supabase = this.supabase.getClient();
            console.log('🔍 OBTENIENDO PRODUCTOS...');
            const { data, error } = await supabase
                .from('productos')
                .select('id, codigo, nombre, precio, stock, categoria, activo')
                .eq('activo', true)
                .order('nombre', { ascending: true });
            if (error) {
                console.error('❌ Error getting productos:', error);
                throw error;
            }
            console.log('✅ PRODUCTOS OBTENIDOS:', JSON.stringify(data, null, 2));
            return {
                success: true,
                data: data || []
            };
        }
        catch (error) {
            console.error('❌ Error getting productos:', error);
            return {
                success: false,
                message: 'Error al obtener productos',
                error: error.message
            };
        }
    }
    async getOrden(ordenId) {
        try {
            const { data: orden, error } = await this.supabase.getClient()
                .from('ordenes_compra')
                .select(`
          *,
          proveedor:proveedores(*),
          orden_compra_detalles(*)
        `)
                .eq('id', ordenId)
                .single();
            if (error)
                throw error;
            return {
                success: true,
                data: orden
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo orden:', error);
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }
};
exports.ComprasController = ComprasController;
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener estadísticas de compras' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estadísticas obtenidas exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "getOrdenes", null);
__decorate([
    (0, common_1.Get)('next-number'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener siguiente número de orden' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Número generado exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "getNextNumber", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "crearOrden", null);
__decorate([
    (0, common_1.Put)(':id/recibir'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "recibirMercancia", null);
__decorate([
    (0, common_1.Put)(':id/cancelar'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "cancelarOrden", null);
__decorate([
    (0, common_1.Get)('proveedores'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener lista de proveedores' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Proveedores obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "getProveedores", null);
__decorate([
    (0, common_1.Post)('proveedores'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear nuevo proveedor' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Proveedor creado exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "crearProveedor", null);
__decorate([
    (0, common_1.Put)('proveedores/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar proveedor existente' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Proveedor actualizado exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "actualizarProveedor", null);
__decorate([
    (0, common_1.Delete)('proveedores/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Desactivar proveedor (soft delete)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Proveedor desactivado exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "desactivarProveedor", null);
__decorate([
    (0, common_1.Get)('reporte-compras'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "getReporteCompras", null);
__decorate([
    (0, common_1.Get)('productos'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener lista de productos para compras' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Productos obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "getProductos", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener orden específica por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Orden obtenida exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "getOrden", null);
exports.ComprasController = ComprasController = __decorate([
    (0, swagger_1.ApiTags)('compras'),
    (0, common_1.Controller)('compras'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService,
        inventory_integration_service_1.InventoryIntegrationService])
], ComprasController);
//# sourceMappingURL=compras.controller.js.map