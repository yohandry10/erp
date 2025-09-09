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
exports.PosController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const event_bus_service_1 = require("../shared/events/event-bus.service");
const inventory_integration_service_1 = require("../shared/integration/inventory-integration.service");
let PosController = class PosController {
    constructor(supabase, eventBus, inventoryService) {
        this.supabase = supabase;
        this.eventBus = eventBus;
        this.inventoryService = inventoryService;
        this.estadoCaja = {
            estado: 'CERRADA',
            montoInicial: 0,
            ventasEfectivo: 0,
            ventasTarjeta: 0,
            montoFinal: 0,
            fechaApertura: null,
            fechaCierre: null
        };
    }
    getStats() {
        return {
            success: true,
            data: {
                ventasHoy: 0,
                montoVentasHoy: 0,
                productosVendidos: 0,
                estadoCaja: 'CERRADA',
                ultimaVenta: null
            }
        };
    }
    getEstadoCaja() {
        return {
            success: true,
            data: this.estadoCaja
        };
    }
    abrirCaja(data) {
        console.log('💰 Abriendo caja con monto:', data.montoInicial);
        this.estadoCaja = {
            estado: 'ABIERTA',
            montoInicial: data.montoInicial || 0,
            ventasEfectivo: 0,
            ventasTarjeta: 0,
            montoFinal: data.montoInicial || 0,
            fechaApertura: new Date().toISOString(),
            fechaCierre: null
        };
        console.log('✅ Caja abierta. Nuevo estado:', this.estadoCaja);
        return {
            success: true,
            data: this.estadoCaja,
            message: 'Caja abierta exitosamente'
        };
    }
    async cerrarCaja(data) {
        try {
            console.log('🔒 Cerrando caja con análisis financiero...');
            const { data: sesionActiva, error: sesionError } = await this.supabase.getClient()
                .from('sesiones_caja')
                .select('*')
                .eq('estado', 'ABIERTA')
                .single();
            if (sesionError || !sesionActiva) {
                throw new Error('No hay sesión de caja activa');
            }
            const { data: ventasDelDia, error: ventasError } = await this.supabase.getClient()
                .from('ventas')
                .select(`
          *,
          venta_detalles (
            cantidad,
            precio_unitario,
            subtotal,
            producto_id,
            productos (nombre, categoria)
          ),
          venta_pagos (
            monto,
            metodos_pago (codigo, nombre, tipo)
          )
        `)
                .eq('sesion_caja_id', sesionActiva.id)
                .eq('estado', 'PAGADA');
            if (ventasError)
                throw ventasError;
            const analisisFinanciero = this.generarAnalisisFinanciero(ventasDelDia || []);
            const productosMasVendidos = this.calcularProductosMasVendidos(ventasDelDia || []);
            const analisisPagos = this.analizarMetodosPago(ventasDelDia || []);
            const { error: updateError } = await this.supabase.getClient()
                .from('sesiones_caja')
                .update({
                fecha_cierre: new Date().toISOString(),
                monto_contado: data.monto_contado || sesionActiva.monto_inicial,
                diferencia: (data.monto_contado || sesionActiva.monto_inicial) - analisisFinanciero.montoEsperado,
                total_ventas: analisisFinanciero.totalVentas,
                total_efectivo: analisisPagos.efectivo,
                total_tarjeta: analisisPagos.tarjeta,
                total_digital: analisisPagos.digital,
                cantidad_ventas: analisisFinanciero.cantidadVentas,
                estado: 'CERRADA',
                notas: data.notas || ''
            })
                .eq('id', sesionActiva.id);
            if (updateError)
                throw updateError;
            this.estadoCaja = {
                ...this.estadoCaja,
                estado: 'CERRADA',
                fechaCierre: new Date().toISOString()
            };
            const reporteCierre = {
                sesion: {
                    id: sesionActiva.id,
                    fechaApertura: sesionActiva.fecha_apertura,
                    fechaCierre: new Date().toISOString(),
                    montoInicial: sesionActiva.monto_inicial,
                    montoContado: data.monto_contado || sesionActiva.monto_inicial,
                    diferencia: (data.monto_contado || sesionActiva.monto_inicial) - analisisFinanciero.montoEsperado
                },
                analisisFinanciero,
                productosMasVendidos,
                analisisPagos,
                ventasDetalladas: ventasDelDia?.map(venta => ({
                    numero: venta.numero_ticket,
                    fecha: venta.fecha_venta,
                    total: venta.total,
                    items: venta.venta_detalles?.length || 0,
                    metodoPago: venta.venta_pagos?.[0]?.metodos_pago?.nombre || 'N/A'
                })) || []
            };
            console.log('✅ Caja cerrada con análisis completo');
            return {
                success: true,
                data: reporteCierre,
                message: 'Caja cerrada exitosamente con análisis financiero completo'
            };
        }
        catch (error) {
            console.error('❌ Error cerrando caja:', error);
            return {
                success: false,
                message: 'Error al cerrar la caja',
                error: error.message
            };
        }
    }
    generarAnalisisFinanciero(ventas) {
        const totalVentas = ventas.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0);
        const totalSubtotal = ventas.reduce((sum, venta) => sum + parseFloat(venta.subtotal || 0), 0);
        const totalImpuestos = ventas.reduce((sum, venta) => sum + parseFloat(venta.impuestos || 0), 0);
        const montoInicial = this.estadoCaja?.montoInicial || 0;
        return {
            cantidadVentas: ventas.length,
            totalVentas: totalVentas,
            totalSubtotal: totalSubtotal,
            totalImpuestos: totalImpuestos,
            montoEsperado: totalVentas + montoInicial,
            ventaPromedio: ventas.length > 0 ? totalVentas / ventas.length : 0,
            articulosVendidos: ventas.reduce((sum, venta) => sum + (venta.venta_detalles?.reduce((itemSum, item) => itemSum + parseFloat(item.cantidad || 0), 0) || 0), 0)
        };
    }
    calcularProductosMasVendidos(ventas) {
        const productosVendidos = {};
        ventas.forEach(venta => {
            venta.venta_detalles?.forEach((detalle) => {
                const productoId = detalle.producto_id;
                if (!productosVendidos[productoId]) {
                    productosVendidos[productoId] = {
                        nombre: detalle.productos?.nombre || 'Producto desconocido',
                        categoria: detalle.productos?.categoria || 'Sin categoría',
                        cantidadVendida: 0,
                        totalVentas: 0
                    };
                }
                productosVendidos[productoId].cantidadVendida += parseFloat(detalle.cantidad || 0);
                productosVendidos[productoId].totalVentas += parseFloat(detalle.subtotal || 0);
            });
        });
        return Object.values(productosVendidos)
            .sort((a, b) => b.cantidadVendida - a.cantidadVendida)
            .slice(0, 10);
    }
    analizarMetodosPago(ventas) {
        const analisis = {
            efectivo: 0,
            tarjeta: 0,
            digital: 0,
            transferencia: 0,
            detallePorMetodo: {}
        };
        ventas.forEach(venta => {
            venta.venta_pagos?.forEach((pago) => {
                const tipoMetodo = pago.metodos_pago?.tipo || 'EFECTIVO';
                const nombreMetodo = pago.metodos_pago?.nombre || 'Efectivo';
                const monto = parseFloat(pago.monto || 0);
                switch (tipoMetodo) {
                    case 'EFECTIVO':
                        analisis.efectivo += monto;
                        break;
                    case 'TARJETA':
                        analisis.tarjeta += monto;
                        break;
                    case 'DIGITAL':
                        analisis.digital += monto;
                        break;
                    case 'TRANSFERENCIA':
                        analisis.transferencia += monto;
                        break;
                }
                analisis.detallePorMetodo[nombreMetodo] =
                    (analisis.detallePorMetodo[nombreMetodo] || 0) + monto;
            });
        });
        return analisis;
    }
    async procesarVenta(ventaData) {
        try {
            console.log('💰 Procesando venta:', ventaData);
            const validacionStock = await this.inventoryService.verificarDisponibilidadStock(ventaData.items.map((item) => ({
                productoId: item.producto_id || (item.producto && item.producto.id) || item.producto?.codigo,
                cantidad: item.cantidad
            })));
            if (!validacionStock.disponible) {
                console.error('❌ Stock insuficiente:', validacionStock.faltantes);
                return {
                    success: false,
                    message: 'Stock insuficiente para algunos productos',
                    data: {
                        faltantes: validacionStock.faltantes,
                        error: 'STOCK_INSUFICIENTE'
                    }
                };
            }
            console.log('✅ Stock validado, procediendo con la venta...');
            const numeroTicket = `T001-${String(Date.now()).slice(-8)}`;
            const correlativo = parseInt(String(Date.now()).slice(-8));
            const subtotal = ventaData.subtotal || ventaData.items.reduce((sum, item) => {
                const precio = item.precio_unitario || (item.producto && item.producto.precio_venta) || 0;
                return sum + (item.cantidad * precio);
            }, 0);
            const impuestos = ventaData.impuestos || (subtotal * 0.18);
            const total = ventaData.total || (subtotal + impuestos);
            console.log('Totales calculados:', { subtotal, impuestos, total });
            const ventaDataInsert = {
                numero_venta: numeroTicket,
                fecha: new Date().toISOString(),
                cliente_nombre: ventaData.cliente_nombre || 'Cliente General',
                cliente_documento: ventaData.cliente_id || 'SIN_DOC',
                subtotal: subtotal,
                impuestos: impuestos,
                total: total,
                metodo_pago: ventaData.metodo_pago_id || 'EFECTIVO',
                estado: 'PROCESANDO',
                caja_id: null,
                usuario_id: ventaData.vendedor_id || 'user-demo',
                observaciones: ventaData.comprobante ? JSON.stringify(ventaData.comprobante) : null
            };
            console.log('📝 Datos de venta a insertar:', ventaDataInsert);
            let venta, ventaError;
            if (this.supabase.isMockMode()) {
                const result = await this.supabase.insert('ventas_pos', ventaDataInsert);
                venta = result.data;
                ventaError = result.error;
            }
            else {
                const result = await this.supabase.getClient()
                    .from('ventas_pos')
                    .insert({
                    numero_venta: ventaDataInsert.numero_venta,
                    fecha: ventaDataInsert.fecha,
                    cliente_nombre: ventaDataInsert.cliente_nombre,
                    cliente_documento: ventaDataInsert.cliente_documento,
                    subtotal: ventaDataInsert.subtotal,
                    impuestos: ventaDataInsert.impuestos,
                    total: ventaDataInsert.total,
                    metodo_pago: ventaDataInsert.metodo_pago,
                    estado: ventaDataInsert.estado,
                    caja_id: ventaDataInsert.caja_id,
                    usuario_id: ventaDataInsert.usuario_id,
                    observaciones: ventaDataInsert.observaciones
                })
                    .select()
                    .single();
                venta = result.data;
                ventaError = result.error;
            }
            if (ventaError) {
                console.error('❌ Error guardando venta en DB:', ventaError);
                throw new Error('No se pudo guardar la venta en la base de datos');
            }
            console.log('✅ Venta guardada en DB:', venta);
            try {
                console.log('📦 Iniciando descuento automático de stock...');
                const stockDescontado = [];
                for (const item of ventaData.items) {
                    const productoId = item.producto_id || (item.producto && item.producto.id) || item.producto?.codigo;
                    const cantidad = item.cantidad;
                    const precio = item.precio_unitario || (item.producto && item.producto.precio_venta) || 0;
                    const movimientoId = await this.inventoryService.realizarMovimientoStock({
                        productoId: productoId,
                        tipoMovimiento: 'SALIDA',
                        cantidad: cantidad,
                        stockAnterior: 0,
                        stockNuevo: 0,
                        motivo: `Venta POS ${numeroTicket}`,
                        precioUnitario: precio,
                        valorTotal: cantidad * precio,
                        usuarioId: ventaData.vendedor_id || 'system',
                        referencia: numeroTicket,
                        ventaId: venta.id
                    });
                    if (movimientoId) {
                        stockDescontado.push({ productoId, cantidad, movimientoId });
                        console.log(`✅ Stock descontado: ${productoId} - ${cantidad} unidades`);
                    }
                    else {
                        throw new Error(`No se pudo descontar stock del producto ${productoId}`);
                    }
                }
                console.log('✅ Stock descontado exitosamente para todos los productos');
                const detalles = ventaData.items.map((item) => {
                    const productoId = item.producto_id || (item.producto && item.producto.id) || item.producto?.codigo || `prod-${Date.now()}`;
                    const precio = item.precio_unitario || (item.producto && item.producto.precio_venta) || 0;
                    const nombreProducto = item.producto?.nombre || item.nombre_producto || 'Producto';
                    return {
                        venta_id: venta.id,
                        codigo_producto: productoId,
                        nombre_producto: nombreProducto,
                        cantidad: item.cantidad,
                        precio_unitario: precio,
                        descuento: item.descuento_monto || 0,
                        total_parcial: item.subtotal || (item.cantidad * precio)
                    };
                });
                console.log('📝 Detalles de venta a insertar:', detalles);
                let detallesError;
                if (this.supabase.isMockMode()) {
                    for (const detalle of detalles) {
                        const result = await this.supabase.insert('detalle_ventas_pos', detalle);
                        if (result.error) {
                            detallesError = result.error;
                            break;
                        }
                    }
                }
                else {
                    const result = await this.supabase.getClient()
                        .from('detalle_ventas_pos')
                        .insert(detalles);
                    detallesError = result.error;
                }
                if (detallesError) {
                    console.error('❌ Error guardando detalles:', detallesError);
                    throw new Error('No se pudo guardar los detalles de la venta');
                }
                console.log('✅ Detalles de venta guardados correctamente');
                if (!this.supabase.isMockMode()) {
                    await this.supabase.getClient()
                        .from('ventas_pos')
                        .update({ estado: 'PAGADA' })
                        .eq('id', venta.id);
                }
                this.eventBus.emitVentaProcessed({
                    ventaId: venta.id,
                    numeroTicket: numeroTicket,
                    clienteId: ventaData.cliente_id || 'general',
                    clienteNombre: ventaData.cliente_nombre || 'Cliente General',
                    metodoPago: ventaData.metodo_pago_id || 'EFECTIVO',
                    subtotal: subtotal,
                    impuestos: impuestos,
                    total: total,
                    items: ventaData.items.map((item) => ({
                        productoId: item.producto_id || (item.producto && item.producto.id) || item.producto?.codigo || `prod-${Date.now()}`,
                        cantidad: item.cantidad,
                        precio: item.precio_unitario || (item.producto && item.producto.precio_venta) || 0,
                        total: item.subtotal || (item.cantidad * (item.precio_unitario || (item.producto && item.producto.precio_venta) || 0))
                    }))
                });
                try {
                    const mapearTipoDocumento = (clienteDoc) => {
                        if (clienteDoc && clienteDoc.length === 11)
                            return '6';
                        if (clienteDoc && clienteDoc.length === 8)
                            return '1';
                        return '0';
                    };
                    const facturaData = {
                        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
                        tipo_documento: '03',
                        serie: 'T001',
                        numero: correlativo,
                        ruc_emisor: '12345678901',
                        razon_social_emisor: 'ERP KAME',
                        tipo_documento_receptor: mapearTipoDocumento(ventaData.cliente_documento),
                        documento_receptor: ventaData.cliente_documento || '00000000',
                        razon_social_receptor: ventaData.cliente_nombre || 'Cliente General',
                        direccion_receptor: 'Lima, Perú',
                        moneda: 'PEN',
                        total_gravadas: subtotal,
                        total_igv: impuestos,
                        total_venta: total,
                        estado: 'EMITIDO',
                        hash: `HASH-${numeroTicket}`,
                        xml_firmado: null,
                        cdr_sunat: null,
                        error_message: null,
                        items: detalles,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    console.log('📄 Datos CPE a insertar:', facturaData);
                    let factura, facturaError;
                    if (this.supabase.isMockMode()) {
                        const result = await this.supabase.insert('cpe', facturaData);
                        factura = result.data;
                        facturaError = result.error;
                    }
                    else {
                        console.log('🔄 Insertando CPE en Supabase...');
                        const result = await this.supabase.getClient()
                            .from('cpe')
                            .insert([facturaData])
                            .select()
                            .single();
                        factura = result.data;
                        facturaError = result.error;
                        console.log('📋 Resultado inserción CPE:', { factura, facturaError });
                    }
                    if (facturaError) {
                        console.error('❌ ERROR CRÍTICO generando factura electrónica:', facturaError);
                        console.error('📊 Detalles completos del error CPE:', {
                            message: facturaError.message,
                            details: facturaError.details,
                            hint: facturaError.hint,
                            code: facturaError.code
                        });
                        console.error('📄 Datos que causaron el error:', JSON.stringify(facturaData, null, 2));
                    }
                    else {
                        console.log('✅ FACTURA ELECTRÓNICA GENERADA EXITOSAMENTE:', factura);
                        try {
                            console.log('📊 [POS → SIRE] Emitiendo evento de comprobante creado para SIRE...');
                            this.eventBus.emitComprobanteCreadoEvent({
                                cpeId: factura.id,
                                tipoDocumento: facturaData.tipo_documento,
                                serie: facturaData.serie,
                                numero: facturaData.numero,
                                clienteId: facturaData.documento_receptor,
                                total: facturaData.total_venta,
                                esCredito: false,
                                ventaId: venta.id
                            });
                            console.log('✅ [POS → SIRE] Evento emitido exitosamente para registro electrónico');
                        }
                        catch (eventoError) {
                            console.error('❌ [POS → SIRE] Error emitiendo evento para SIRE:', eventoError);
                        }
                    }
                }
                catch (facturaError) {
                    console.warn('⚠️ Error en proceso de facturación:', facturaError);
                }
                return {
                    success: true,
                    data: {
                        venta: venta,
                        numeroTicket: numeroTicket,
                        total: total,
                        stockDescontado: stockDescontado,
                        mensaje: '✅ Venta procesada exitosamente con descuento automático de stock'
                    }
                };
            }
            catch (stockError) {
                console.error('❌ Error en descuento de stock, revirtiendo venta...', stockError);
                if (!this.supabase.isMockMode()) {
                    await this.supabase.getClient()
                        .from('ventas_pos')
                        .delete()
                        .eq('id', venta.id);
                }
                return {
                    success: false,
                    message: `Error procesando stock: ${stockError.message}`,
                    data: {
                        error: 'STOCK_PROCESSING_ERROR',
                        details: stockError.message
                    }
                };
            }
        }
        catch (error) {
            console.error('❌ Error general procesando venta:', error);
            return {
                success: false,
                message: `Error procesando venta: ${error.message}`,
                data: {
                    error: 'VENTA_PROCESSING_ERROR'
                }
            };
        }
    }
    async getVentas(filtros) {
        try {
            console.log('📋 Obteniendo ventas del POS...');
            let ventas, ventasError;
            if (this.supabase.isMockMode()) {
                console.log('🔄 Modo MOCK: Retornando ventas simuladas');
                const result = await this.supabase.select('ventas_pos');
                ventas = result.data;
                ventasError = result.error;
                if (ventas && ventas.length > 0) {
                    ventas = ventas.map(venta => ({
                        ...venta,
                        venta_pos_detalles: [
                            {
                                id: 1,
                                producto_id: 'prod-001',
                                cantidad: 2,
                                precio_unitario: 3.50,
                                precio_original: 3.50,
                                descuento_porcentaje: 0,
                                descuento_monto: 0,
                                subtotal: 7.00
                            }
                        ]
                    }));
                }
                else {
                    ventas = [];
                }
            }
            else {
                console.log('📡 Conectando a Supabase para obtener ventas...');
                try {
                    const result = await this.supabase.getClient()
                        .from('ventas_pos')
                        .select(`
              id,
              numero_venta,
              fecha,
              cliente_nombre,
              cliente_documento,
              subtotal,
              impuestos,
              total,
              metodo_pago,
              estado,
              caja_id,
              usuario_id,
              observaciones,
              created_at,
              updated_at
            `)
                        .order('created_at', { ascending: false })
                        .limit(50);
                    ventas = result.data;
                    ventasError = result.error;
                }
                catch (supabaseError) {
                    console.error('❌ Error conectando a Supabase:', supabaseError);
                    ventas = [];
                    ventasError = null;
                }
            }
            if (ventasError) {
                console.error('❌ Error obteniendo ventas de BD:', ventasError);
                ventas = [];
            }
            console.log(`✅ Se obtuvieron ${ventas?.length || 0} ventas`);
            return {
                success: true,
                data: ventas || [],
                total: ventas?.length || 0,
                message: `Ventas obtenidas exitosamente (${ventas?.length || 0} registros)`
            };
        }
        catch (error) {
            console.error('❌ Error general en getVentas:', error);
            return {
                success: true,
                data: [],
                total: 0,
                message: 'Historial de ventas vacío (error de conexión)',
                error: error.message
            };
        }
    }
    async getProductos(filtros) {
        try {
            console.log('🛍️ Obteniendo productos para POS desde tabla productos...');
            const client = this.supabase.getClient();
            if (!client) {
                throw new Error('Cliente de Supabase no configurado correctamente');
            }
            let query = client
                .from('productos')
                .select('*');
            if (filtros.categoria) {
                query = query.eq('categoria', filtros.categoria);
            }
            if (filtros.activo !== undefined) {
                query = query.eq('activo', filtros.activo);
            }
            query = query.eq('activo', true);
            console.log('🔍 Ejecutando consulta a tabla productos...');
            const { data: productosDB, error } = await query.order('nombre', { ascending: true });
            if (error) {
                console.error('❌ Error consultando tabla productos:', error);
                console.error('📊 Detalles del error:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                });
                throw new Error(`Error en base de datos: ${error.message}`);
            }
            console.log(`📊 Productos encontrados en tabla productos: ${productosDB?.length || 0}`);
            if (productosDB && productosDB.length > 0) {
                console.log('📊 Muestra de datos obtenidos:', productosDB[0]);
            }
            const productosFormateados = (productosDB || []).map(producto => {
                console.log(`🔍 Procesando producto:`, {
                    codigo: producto.codigo,
                    nombre: producto.nombre,
                    precio: producto.precio,
                    activo: producto.activo
                });
                return {
                    id: producto.id || producto.codigo,
                    codigo: producto.codigo,
                    codigo_barras: producto.codigo_barras || '',
                    nombre: producto.nombre,
                    descripcion: '',
                    categoria: producto.categoria,
                    subcategoria: '',
                    marca: '',
                    precio_venta: parseFloat(producto.precio || 0),
                    precio_mayorista: parseFloat(producto.precio_mayorista || 0),
                    precio_especial: parseFloat(producto.precio_especial || 0),
                    stock_actual: parseInt(producto.stock || 0),
                    stock_minimo: parseInt(producto.stock_minimo || 0),
                    impuesto: parseFloat(producto.impuesto || 18),
                    imagen_url: null
                };
            });
            console.log(`✅ ${productosFormateados.length} productos procesados correctamente`);
            return {
                success: true,
                data: productosFormateados,
                message: `${productosFormateados.length} productos cargados desde tabla productos`
            };
        }
        catch (error) {
            console.error('❌ Error crítico obteniendo productos:', error);
            return {
                success: false,
                message: `Error al obtener productos: ${error.message}`,
                data: [],
                error: {
                    tipo: 'DATABASE_ERROR',
                    mensaje: error.message,
                    codigo: 'POS_PRODUCTOS_FAIL',
                    detalles: error.details || 'Error al consultar tabla productos',
                    sugerencia: 'Verificar conexión a base de datos y existencia de tabla productos'
                }
            };
        }
    }
    retiroEfectivo(retiroData) {
        return {
            success: true,
            data: {
                id: Date.now().toString(),
                monto: retiroData.monto || 0,
                concepto: retiroData.concepto || '',
                fecha: new Date().toISOString()
            },
            message: 'Retiro registrado exitosamente'
        };
    }
    async getMetodosPago() {
        try {
            console.log('💳 Obteniendo métodos de pago...');
            const metodosPagoDemo = [
                {
                    id: 'pago-001',
                    codigo: 'EFECTIVO',
                    nombre: 'Efectivo',
                    tipo: 'EFECTIVO',
                    requiere_referencia: false,
                    comision_porcentaje: 0,
                    activo: true
                },
                {
                    id: 'pago-002',
                    codigo: 'VISA',
                    nombre: 'Tarjeta Visa',
                    tipo: 'TARJETA',
                    requiere_referencia: true,
                    comision_porcentaje: 2.5,
                    activo: true
                },
                {
                    id: 'pago-003',
                    codigo: 'MASTERCARD',
                    nombre: 'Tarjeta Mastercard',
                    tipo: 'TARJETA',
                    requiere_referencia: true,
                    comision_porcentaje: 2.5,
                    activo: true
                },
                {
                    id: 'pago-004',
                    codigo: 'YAPE',
                    nombre: 'Yape',
                    tipo: 'DIGITAL',
                    requiere_referencia: true,
                    comision_porcentaje: 0,
                    activo: true
                },
                {
                    id: 'pago-005',
                    codigo: 'PLIN',
                    nombre: 'Plin',
                    tipo: 'DIGITAL',
                    requiere_referencia: true,
                    comision_porcentaje: 0,
                    activo: true
                },
                {
                    id: 'pago-006',
                    codigo: 'TRANSFERENCIA',
                    nombre: 'Transferencia Bancaria',
                    tipo: 'TRANSFERENCIA',
                    requiere_referencia: true,
                    comision_porcentaje: 0,
                    activo: true
                }
            ];
            console.log(`✅ Devolviendo ${metodosPagoDemo.length} métodos de pago`);
            return {
                success: true,
                data: metodosPagoDemo
            };
        }
        catch (error) {
            console.error('Error obteniendo métodos de pago:', error);
            return {
                success: false,
                message: 'Error al obtener métodos de pago',
                data: []
            };
        }
    }
    async getClientes(filtros) {
        try {
            console.log('👥 Obteniendo clientes para POS...');
            let clientesReales = [];
            try {
                const { data: clientesDB, error } = await this.supabase.getClient()
                    .from('clientes')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (!error && clientesDB && clientesDB.length > 0) {
                    clientesReales = clientesDB;
                    console.log(`✅ ${clientesReales.length} clientes obtenidos desde la base de datos`);
                }
                else {
                    console.log('⚠️ No se encontraron clientes en la BD o hubo error:', error?.message);
                    await this.crearClientesEjemplo();
                    const { data: clientesDB2, error: error2 } = await this.supabase.getClient()
                        .from('clientes')
                        .select('*')
                        .order('created_at', { ascending: false })
                        .limit(20);
                    if (!error2 && clientesDB2 && clientesDB2.length > 0) {
                        clientesReales = clientesDB2;
                        console.log(`✅ ${clientesReales.length} clientes creados y obtenidos`);
                    }
                }
            }
            catch (dbError) {
                console.log('⚠️ Error consultando clientes desde BD:', dbError.message);
            }
            const clientesDemo = clientesReales.length > 0 ? clientesReales : [
                {
                    id: '550e8400-e29b-41d4-a716-446655440010',
                    tipo_documento: 'DNI',
                    numero_documento: '12345678',
                    razon_social: 'Juan Carlos García López',
                    nombre_comercial: 'Juan García',
                    email: 'juan.garcia@email.com',
                    telefono: '987654321'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440011',
                    tipo_documento: 'DNI',
                    numero_documento: '87654321',
                    razon_social: 'María Elena Rodríguez Silva',
                    nombre_comercial: 'María Rodríguez',
                    email: 'maria.rodriguez@email.com',
                    telefono: '976543210'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440012',
                    tipo_documento: 'RUC',
                    numero_documento: '20123456789',
                    razon_social: 'Empresa Demo S.A.C.',
                    nombre_comercial: 'Empresa Demo',
                    email: 'ventas@empresademo.com',
                    telefono: '014567890'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440013',
                    tipo_documento: 'DNI',
                    numero_documento: '45678901',
                    razon_social: 'Carlos Antonio Mendoza Pérez',
                    nombre_comercial: 'Carlos Mendoza',
                    email: 'carlos.mendoza@email.com',
                    telefono: '965432109'
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440014',
                    tipo_documento: 'RUC',
                    numero_documento: '20987654321',
                    razon_social: 'Comercial San Martín E.I.R.L.',
                    nombre_comercial: 'San Martín',
                    email: 'contacto@sanmartin.com',
                    telefono: '012345678'
                }
            ];
            console.log(`✅ Devolviendo ${clientesDemo.length} clientes`);
            return {
                success: true,
                data: clientesDemo,
                message: clientesReales.length > 0 ? 'Clientes obtenidos desde base de datos' : 'Usando clientes de ejemplo con UUIDs válidos'
            };
        }
        catch (error) {
            console.error('Error obteniendo clientes:', error);
            return {
                success: false,
                message: 'Error al obtener clientes',
                data: []
            };
        }
    }
    async crearClientesEjemplo() {
        try {
            console.log('🔧 Creando clientes de ejemplo en la base de datos...');
            const clientesEjemplo = [
                {
                    id: '550e8400-e29b-41d4-a716-446655440010',
                    tenant_id: '550e8400-e29b-41d4-a716-446655440000',
                    tipo_documento: 'DNI',
                    numero_documento: '12345678',
                    razon_social: 'Juan Carlos García López',
                    nombre_comercial: 'Juan García',
                    email: 'juan.garcia@email.com',
                    telefono: '987654321',
                    direccion: 'Lima, Perú',
                    contacto: 'Juan García',
                    estado: 'ACTIVO',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440011',
                    tenant_id: '550e8400-e29b-41d4-a716-446655440000',
                    tipo_documento: 'DNI',
                    numero_documento: '87654321',
                    razon_social: 'María Elena Rodríguez Silva',
                    nombre_comercial: 'María Rodríguez',
                    email: 'maria.rodriguez@email.com',
                    telefono: '976543210',
                    direccion: 'Lima, Perú',
                    contacto: 'María Rodríguez',
                    estado: 'ACTIVO',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440012',
                    tenant_id: '550e8400-e29b-41d4-a716-446655440000',
                    tipo_documento: 'RUC',
                    numero_documento: '20123456789',
                    razon_social: 'Empresa Demo S.A.C.',
                    nombre_comercial: 'Empresa Demo',
                    email: 'ventas@empresademo.com',
                    telefono: '014567890',
                    direccion: 'Lima, Perú',
                    contacto: 'Gerente General',
                    estado: 'ACTIVO',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            ];
            const { data, error } = await this.supabase.getClient()
                .from('clientes')
                .upsert(clientesEjemplo, { onConflict: 'id' });
            if (error) {
                console.error('❌ Error creando clientes de ejemplo:', error);
            }
            else {
                console.log('✅ Clientes de ejemplo creados exitosamente');
            }
        }
        catch (error) {
            console.error('❌ Error en crearClientesEjemplo:', error);
        }
    }
    async crearClientesEjemploManual() {
        try {
            await this.crearClientesEjemplo();
            return {
                success: true,
                message: 'Clientes de ejemplo creados exitosamente'
            };
        }
        catch (error) {
            return {
                success: false,
                message: 'Error creando clientes de ejemplo: ' + error.message
            };
        }
    }
    getReporteCaja(fechaInicio, fechaFin) {
        return {
            success: true,
            data: {
                periodo: { fechaInicio, fechaFin },
                totalVentas: 0,
                totalEfectivo: 0,
                totalTarjeta: 0,
                totalTransferencia: 0,
                retiros: 0,
                diferencia: 0
            }
        };
    }
};
exports.PosController = PosController;
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Estadísticas del punto de venta' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estadísticas del POS obtenidas exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PosController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('caja'),
    (0, swagger_1.ApiOperation)({ summary: 'Estado actual de la caja' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estado de caja obtenido exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PosController.prototype, "getEstadoCaja", null);
__decorate([
    (0, common_1.Post)('caja/abrir'),
    (0, swagger_1.ApiOperation)({ summary: 'Abrir caja registradora' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Caja abierta exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "abrirCaja", null);
__decorate([
    (0, common_1.Post)('caja/cerrar'),
    (0, swagger_1.ApiOperation)({ summary: 'Cerrar caja registradora con análisis financiero' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Caja cerrada exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PosController.prototype, "cerrarCaja", null);
__decorate([
    (0, common_1.Post)('venta'),
    (0, swagger_1.ApiOperation)({ summary: 'Procesar nueva venta' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Venta procesada exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PosController.prototype, "procesarVenta", null);
__decorate([
    (0, common_1.Get)('ventas'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener listado de ventas' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Listado de ventas obtenido exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PosController.prototype, "getVentas", null);
__decorate([
    (0, common_1.Get)('productos'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener productos para POS' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Productos obtenidos exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PosController.prototype, "getProductos", null);
__decorate([
    (0, common_1.Post)('retiro-efectivo'),
    (0, swagger_1.ApiOperation)({ summary: 'Registrar retiro de efectivo' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Retiro registrado exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "retiroEfectivo", null);
__decorate([
    (0, common_1.Get)('metodos-pago'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener métodos de pago disponibles' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Métodos de pago obtenidos exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PosController.prototype, "getMetodosPago", null);
__decorate([
    (0, common_1.Get)('clientes'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener clientes para POS' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Clientes obtenidos exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PosController.prototype, "getClientes", null);
__decorate([
    (0, common_1.Post)('clientes/crear-ejemplos'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear clientes de ejemplo en la base de datos' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Clientes de ejemplo creados exitosamente' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PosController.prototype, "crearClientesEjemploManual", null);
__decorate([
    (0, common_1.Get)('reporte-caja/:fechaInicio/:fechaFin'),
    (0, swagger_1.ApiOperation)({ summary: 'Generar reporte de caja por período' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Reporte generado exitosamente' }),
    __param(0, (0, common_1.Param)('fechaInicio')),
    __param(1, (0, common_1.Param)('fechaFin')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PosController.prototype, "getReporteCaja", null);
exports.PosController = PosController = __decorate([
    (0, swagger_1.ApiTags)('pos'),
    (0, common_1.Controller)('pos'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService,
        inventory_integration_service_1.InventoryIntegrationService])
], PosController);
