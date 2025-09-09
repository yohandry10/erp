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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComprasController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const event_bus_service_1 = require("../shared/events/event-bus.service");
let ComprasController = class ComprasController {
    constructor(supabaseService, eventBus) {
        this.supabaseService = supabaseService;
        this.eventBus = eventBus;
    }
    async getStats() {
        try {
            const supabase = this.supabaseService.getClient();
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
    async getOrdenes(filters) {
        try {
            const supabase = this.supabaseService.getClient();
            let query = supabase
                .from('ordenes_compra')
                .select('*')
                .order('created_at', { ascending: false });
            if (filters.estado) {
                query = query.eq('estado', filters.estado);
            }
            if (filters.proveedor_id) {
                query = query.eq('proveedor_id', filters.proveedor_id);
            }
            if (filters.fecha_desde) {
                query = query.gte('fecha_orden', filters.fecha_desde);
            }
            if (filters.fecha_hasta) {
                query = query.lte('fecha_orden', filters.fecha_hasta);
            }
            const { data: ordenes, error } = await query;
            if (error)
                throw error;
            console.log('📋 OBTENER ÓRDENES - Datos de BD:', JSON.stringify(ordenes, null, 2));
            const ordenesSimplificadas = (ordenes || []).map(orden => ({
                ...orden,
                proveedores: {
                    id: orden.proveedor_id || 'unknown',
                    nombre: 'Proveedor',
                    ruc: 'N/A'
                }
            }));
            console.log('📤 OBTENER ÓRDENES - Datos a enviar:', JSON.stringify(ordenesSimplificadas, null, 2));
            return {
                success: true,
                data: ordenesSimplificadas
            };
        }
        catch (error) {
            console.error('Error getting purchase orders:', error);
            return {
                success: false,
                message: 'Error al obtener órdenes de compra',
                error: error.message
            };
        }
    }
    async getNextNumber() {
        try {
            const supabase = this.supabaseService.getClient();
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
    async createOrden(ordenData) {
        try {
            console.log('📥 CREAR ORDEN - Datos recibidos:', JSON.stringify(ordenData, null, 2));
            const supabase = this.supabaseService.getClient();
            if (!ordenData.proveedor_id || !ordenData.fecha_orden || !ordenData.fecha_entrega) {
                return {
                    success: false,
                    message: 'Faltan campos requeridos'
                };
            }
            if (!ordenData.items || ordenData.items.length === 0) {
                return {
                    success: false,
                    message: 'Debe incluir al menos un item'
                };
            }
            const itemsProcesados = [];
            for (const item of ordenData.items) {
                let productoId = item.producto_id;
                if (!productoId && item.producto_nombre) {
                    console.log(`🆕 CREANDO PRODUCTO NUEVO: ${item.producto_nombre}`);
                    const nuevoProducto = {
                        codigo: `PROD-${Date.now()}`,
                        nombre: item.producto_nombre,
                        precio: parseFloat(item.precio_unitario) || 0,
                        stock: 0,
                        categoria: 'General',
                        activo: true,
                        stock_minimo: 10,
                        created_at: new Date().toISOString()
                    };
                    const { data: productoCreado, error: errorProducto } = await supabase
                        .from('productos')
                        .insert([nuevoProducto])
                        .select()
                        .single();
                    if (errorProducto) {
                        console.error('❌ Error creando producto:', errorProducto);
                        throw new Error(`Error creando producto ${item.producto_nombre}: ${errorProducto.message}`);
                    }
                    console.log('✅ PRODUCTO CREADO:', JSON.stringify(productoCreado, null, 2));
                    productoId = productoCreado.id;
                }
                itemsProcesados.push({
                    ...item,
                    producto_id: productoId
                });
            }
            const ordenToInsert = {
                tenant_id: '550e8400-e29b-41d4-a716-446655440000',
                numero: ordenData.numero,
                proveedor_id: ordenData.proveedor_id,
                fecha_orden: ordenData.fecha_orden,
                fecha_entrega: ordenData.fecha_entrega,
                moneda: ordenData.moneda || 'PEN',
                subtotal: parseFloat(ordenData.subtotal) || 0,
                igv: parseFloat(ordenData.igv) || 0,
                total: parseFloat(ordenData.total) || 0,
                estado: ordenData.estado || 'PENDIENTE',
                items: itemsProcesados,
                observaciones: ordenData.observaciones || null
            };
            console.log('💾 CREAR ORDEN - Datos a insertar:', JSON.stringify(ordenToInsert, null, 2));
            const { data, error } = await supabase
                .from('ordenes_compra')
                .insert([ordenToInsert])
                .select()
                .single();
            if (error) {
                console.error('❌ Error insertando orden:', error);
                throw error;
            }
            console.log('✅ ORDEN CREADA EXITOSAMENTE:', JSON.stringify(data, null, 2));
            return {
                success: true,
                data,
                message: 'Orden de compra creada exitosamente'
            };
        }
        catch (error) {
            console.error('Error creating purchase order:', error);
            return {
                success: false,
                message: 'Error al crear orden de compra',
                error: error.message
            };
        }
    }
    async updateOrden(id, ordenData) {
        try {
            console.log(`📥 ACTUALIZAR ORDEN ${id} - Datos recibidos:`, JSON.stringify(ordenData, null, 2));
            const supabase = this.supabaseService.getClient();
            const { data: existingOrder, error: findError } = await supabase
                .from('ordenes_compra')
                .select('id')
                .eq('id', id)
                .single();
            if (findError || !existingOrder) {
                return {
                    success: false,
                    message: 'Orden de compra no encontrada'
                };
            }
            const itemsProcesados = [];
            for (const item of ordenData.items) {
                let productoId = item.producto_id;
                if (!productoId && item.producto_nombre) {
                    console.log(`🆕 ACTUALIZANDO - CREANDO PRODUCTO NUEVO: ${item.producto_nombre}`);
                    const nuevoProducto = {
                        codigo: `PROD-${Date.now()}`,
                        nombre: item.producto_nombre,
                        precio: parseFloat(item.precio_unitario) || 0,
                        stock: 0,
                        categoria: 'General',
                        activo: true,
                        stock_minimo: 10,
                        created_at: new Date().toISOString()
                    };
                    const { data: productoCreado, error: errorProducto } = await supabase
                        .from('productos')
                        .insert([nuevoProducto])
                        .select()
                        .single();
                    if (errorProducto) {
                        console.error('❌ Error creando producto en update:', errorProducto);
                        throw new Error(`Error creando producto ${item.producto_nombre}: ${errorProducto.message}`);
                    }
                    console.log('✅ PRODUCTO CREADO EN UPDATE:', JSON.stringify(productoCreado, null, 2));
                    productoId = productoCreado.id;
                }
                itemsProcesados.push({
                    ...item,
                    producto_id: productoId
                });
            }
            const updateData = {
                proveedor_id: ordenData.proveedor_id,
                fecha_orden: ordenData.fecha_orden,
                fecha_entrega: ordenData.fecha_entrega,
                moneda: ordenData.moneda,
                subtotal: parseFloat(ordenData.subtotal),
                igv: parseFloat(ordenData.igv),
                total: parseFloat(ordenData.total),
                estado: ordenData.estado,
                items: itemsProcesados,
                observaciones: ordenData.observaciones,
                updated_at: new Date().toISOString()
            };
            const { data, error } = await supabase
                .from('ordenes_compra')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();
            if (error) {
                console.error('❌ Error actualizando orden:', error);
                throw error;
            }
            console.log('✅ ORDEN ACTUALIZADA EXITOSAMENTE:', JSON.stringify(data, null, 2));
            return {
                success: true,
                data,
                message: 'Orden de compra actualizada exitosamente'
            };
        }
        catch (error) {
            console.error('Error updating purchase order:', error);
            return {
                success: false,
                message: 'Error al actualizar orden de compra',
                error: error.message
            };
        }
    }
    async updateEstadoOrden(id, body) {
        try {
            console.log(`🔄 Actualizando estado de orden ${id} a: ${body.estado}`);
            const supabase = this.supabaseService.getClient();
            const { data: ordenCompleta, error: ordenError } = await supabase
                .from('ordenes_compra')
                .select(`
          *,
          orden_compra_items (
            producto_id,
            cantidad,
            precio_unitario,
            total
          )
        `)
                .eq('id', id)
                .single();
            if (ordenError) {
                console.error('❌ Error obteniendo orden:', ordenError);
                throw ordenError;
            }
            if (!ordenCompleta) {
                throw new Error('Orden de compra no encontrada');
            }
            const { data, error } = await supabase
                .from('ordenes_compra')
                .update({
                estado: body.estado,
                fecha_entrega: body.estado === 'ENTREGADO' ? new Date().toISOString() : null
            })
                .eq('id', id)
                .select();
            if (error) {
                console.error('❌ Error actualizando estado:', error);
                throw error;
            }
            console.log(`✅ Estado actualizado exitosamente para orden ${id}`);
            if (body.estado === 'ENTREGADO') {
                console.log('🎯 [Compras] Emitiendo evento de compra entregada para inventario y contabilidad...');
                let proveedorNombre = 'Proveedor';
                try {
                    const { data: proveedor } = await supabase
                        .from('proveedores')
                        .select('nombre')
                        .eq('id', ordenCompleta.proveedor_id)
                        .single();
                    if (proveedor) {
                        proveedorNombre = proveedor.nombre;
                    }
                }
                catch (error) {
                    console.warn('⚠️ No se pudo obtener nombre del proveedor, usando valor por defecto');
                }
                const eventoCompra = {
                    ordenId: ordenCompleta.id,
                    numeroOrden: ordenCompleta.numero,
                    proveedorId: ordenCompleta.proveedor_id,
                    proveedorNombre: proveedorNombre,
                    fechaEntrega: new Date().toISOString(),
                    total: parseFloat(ordenCompleta.total) || 0,
                    items: (ordenCompleta.orden_compra_items || []).map(item => ({
                        productoId: item.producto_id,
                        cantidad: parseFloat(item.cantidad) || 0,
                        precioUnitario: parseFloat(item.precio_unitario) || 0,
                        total: parseFloat(item.total) || 0
                    }))
                };
                this.eventBus.emitCompraEntregada(eventoCompra);
                console.log('✅ [Compras] Evento de compra entregada emitido exitosamente');
            }
            return {
                success: true,
                data: data[0],
                message: `Estado actualizado a ${body.estado} exitosamente`
            };
        }
        catch (error) {
            console.error('❌ Error updating order status:', error);
            return {
                success: false,
                message: 'Error al actualizar estado de la orden',
                error: error.message
            };
        }
    }
    async deleteOrden(id) {
        try {
            const supabase = this.supabaseService.getClient();
            const { error } = await supabase
                .from('ordenes_compra')
                .delete()
                .eq('id', id);
            if (error)
                throw error;
            return {
                success: true,
                message: 'Orden de compra eliminada exitosamente'
            };
        }
        catch (error) {
            console.error('Error deleting purchase order:', error);
            return {
                success: false,
                message: 'Error al eliminar orden de compra',
                error: error.message
            };
        }
    }
    async getProveedores() {
        try {
            const supabase = this.supabaseService.getClient();
            const { data, error } = await supabase
                .from('proveedores')
                .select('*')
                .limit(10);
            if (error) {
                console.error('Error getting proveedores:', error);
                return {
                    success: true,
                    data: [
                        { id: '1', nombre: 'Proveedor Demo 1', ruc: '12345678901', contacto: 'demo@ejemplo.com', activo: true },
                        { id: '2', nombre: 'Proveedor Demo 2', ruc: '10987654321', contacto: 'demo2@ejemplo.com', activo: true }
                    ]
                };
            }
            const mappedData = (data || []).map((proveedor, index) => {
                const campos = Object.keys(proveedor);
                return {
                    id: proveedor.id || proveedor.identificacion || `temp-${index}`,
                    nombre: proveedor.nombre || proveedor.razon_social || proveedor.name ||
                        proveedor.company_name || `Proveedor ${index + 1}`,
                    ruc: proveedor.ruc || proveedor.numero_documento || proveedor.tax_id || 'Sin RUC',
                    contacto: proveedor.contacto || proveedor.email || proveedor.telefono ||
                        proveedor.phone || 'Sin contacto',
                    activo: proveedor.activo ?? true
                };
            });
            return {
                success: true,
                data: mappedData.length > 0 ? mappedData : [
                    { id: '1', nombre: 'Proveedor Demo 1', ruc: '12345678901', contacto: 'demo@ejemplo.com', activo: true },
                    { id: '2', nombre: 'Proveedor Demo 2', ruc: '10987654321', contacto: 'demo2@ejemplo.com', activo: true }
                ]
            };
        }
        catch (error) {
            console.error('Error getting proveedores:', error);
            return {
                success: true,
                data: [
                    { id: '1', nombre: 'Proveedor Demo 1', ruc: '12345678901', contacto: 'demo@ejemplo.com', activo: true },
                    { id: '2', nombre: 'Proveedor Demo 2', ruc: '10987654321', contacto: 'demo2@ejemplo.com', activo: true }
                ]
            };
        }
    }
    async getProductos() {
        try {
            const supabase = this.supabaseService.getClient();
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
    (0, common_1.Get)('ordenes'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar órdenes de compra' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Órdenes listadas exitosamente' }),
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
    (0, common_1.Post)('ordenes'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear nueva orden de compra' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Orden creada exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "createOrden", null);
__decorate([
    (0, common_1.Put)('ordenes/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar orden de compra' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Orden actualizada exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "updateOrden", null);
__decorate([
    (0, common_1.Patch)('ordenes/:id/estado'),
    (0, swagger_1.ApiOperation)({ summary: 'Cambiar estado de orden de compra' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estado cambiado exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "updateEstadoOrden", null);
__decorate([
    (0, common_1.Delete)('ordenes/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar orden de compra' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Orden eliminada exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "deleteOrden", null);
__decorate([
    (0, common_1.Get)('proveedores'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener lista de proveedores' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Proveedores obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "getProveedores", null);
__decorate([
    (0, common_1.Get)('productos'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener lista de productos para compras' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Productos obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ComprasController.prototype, "getProductos", null);
exports.ComprasController = ComprasController = __decorate([
    (0, swagger_1.ApiTags)('compras'),
    (0, common_1.Controller)('compras'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], ComprasController);
