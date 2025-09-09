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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CotizacionesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const express_1 = require("express");
let CotizacionesController = class CotizacionesController {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
    }
    async getStats(req) {
        try {
            console.log('📊 Calculando estadísticas de cotizaciones');
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const ahora = new Date();
            const { count: cotizacionesDelMes } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select('*', { count: 'exact', head: true });
            const { count: totalCotizaciones } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select('*', { count: 'exact', head: true });
            const hoy = new Date().toISOString().split('T')[0];
            const proximosTresDias = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const { count: porVencer } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select('*', { count: 'exact', head: true })
                .in('estado', ['PENDIENTE', 'ENVIADA'])
                .gte('fecha_vencimiento', hoy)
                .lte('fecha_vencimiento', proximosTresDias);
            const { data: cotizacionesTodas } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select('total');
            const valorCotizado = cotizacionesTodas?.reduce((sum, cot) => sum + (Number(cot.total) || 0), 0) || 0;
            const { count: aceptadas } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select('*', { count: 'exact', head: true })
                .eq('estado', 'ACEPTADA');
            const tasaConversion = totalCotizaciones > 0 ? Math.round((aceptadas / totalCotizaciones) * 100) : 0;
            const stats = {
                cotizacionesDelMes: cotizacionesDelMes || 0,
                valorCotizado: valorCotizado,
                tasaConversion: tasaConversion,
                porVencer: porVencer || 0
            };
            console.log('✅ Estadísticas calculadas:', stats);
            return {
                success: true,
                data: stats
            };
        }
        catch (error) {
            console.error('❌ Error calculando estadísticas:', error);
            return {
                success: false,
                data: {
                    cotizacionesDelMes: 0,
                    valorCotizado: 0,
                    tasaConversion: 0,
                    porVencer: 0
                },
                error: error.message
            };
        }
    }
    async getCotizaciones(filters, req) {
        try {
            console.log('📄 Consultando cotizaciones con filtros:', filters);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            let query = this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select('*')
                .order('created_at', { ascending: false });
            if (filters.estado) {
                query = query.eq('estado', filters.estado);
            }
            if (filters.vendedor) {
                query = query.eq('vendedor', filters.vendedor);
            }
            if (filters.fecha_desde) {
                query = query.gte('fecha_cotizacion', filters.fecha_desde);
            }
            if (filters.fecha_hasta) {
                query = query.lte('fecha_cotizacion', filters.fecha_hasta);
            }
            const { data, error } = await query;
            if (error) {
                throw new common_1.BadRequestException('Error consultando cotizaciones: ' + error.message);
            }
            console.log(`📊 Se encontraron ${data?.length || 0} cotizaciones`);
            return {
                success: true,
                data: data || []
            };
        }
        catch (error) {
            console.error('❌ Error consultando cotizaciones:', error);
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    }
    async getClientesTop(req) {
        return {
            success: true,
            data: []
        };
    }
    async createCotizacion(cotizacionData, req) {
        try {
            console.log('📝 Creando nueva cotización');
            console.log('📋 Datos recibidos:', JSON.stringify(cotizacionData, null, 2));
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const userId = user?.id;
            if (!cotizacionData.cliente_id || !cotizacionData.items || !cotizacionData.total) {
                throw new common_1.BadRequestException('Datos requeridos: cliente_id, items, total');
            }
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(cotizacionData.cliente_id)) {
                console.error('❌ cliente_id no es un UUID válido:', cotizacionData.cliente_id);
                throw new common_1.BadRequestException(`cliente_id debe ser un UUID válido. Recibido: ${cotizacionData.cliente_id}`);
            }
            console.log('✅ cliente_id es un UUID válido:', cotizacionData.cliente_id);
            const ahora = new Date();
            const año = ahora.getFullYear();
            const mes = String(ahora.getMonth() + 1).padStart(2, '0');
            const { count } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .like('numero', `COT-${año}-${mes}-%`);
            const siguienteNumero = String((count || 0) + 1).padStart(3, '0');
            const numero = `COT-${año}-${mes}-${siguienteNumero}`;
            const { data, error } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .insert({
                tenant_id: tenantId,
                numero,
                cliente_id: cotizacionData.cliente_id,
                fecha_cotizacion: cotizacionData.fecha_cotizacion || ahora.toISOString().split('T')[0],
                fecha_vencimiento: cotizacionData.fecha_vencimiento,
                vendedor: cotizacionData.vendedor,
                moneda: cotizacionData.moneda || 'PEN',
                subtotal: cotizacionData.subtotal,
                igv: cotizacionData.igv,
                total: cotizacionData.total,
                estado: 'BORRADOR',
                probabilidad: cotizacionData.probabilidad || 50,
                items: cotizacionData.items,
                observaciones: cotizacionData.observaciones,
                created_at: ahora.toISOString(),
                updated_at: ahora.toISOString()
            })
                .select()
                .single();
            if (error) {
                throw new common_1.BadRequestException('Error creando cotización: ' + error.message);
            }
            console.log('✅ Cotización creada exitosamente:', numero);
            return {
                success: true,
                data: data,
                message: 'Cotización creada exitosamente'
            };
        }
        catch (error) {
            console.error('❌ Error creando cotización:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async actualizarCotizacion(id, cotizacionData, req) {
        try {
            console.log('📝 Actualizando cotización:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const { data, error } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .update({
                ...cotizacionData,
                updated_at: new Date().toISOString()
            })
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .select()
                .single();
            if (error) {
                throw new common_1.BadRequestException('Error actualizando cotización: ' + error.message);
            }
            return {
                success: true,
                data: data,
                message: 'Cotización actualizada exitosamente'
            };
        }
        catch (error) {
            console.error('❌ Error actualizando cotización:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async getCotizacion(id, req) {
        try {
            console.log('📄 Obteniendo cotización:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const { data, error } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select(`
          *,
          clientes:cliente_id (
            nombres,
            apellidos,
            razon_social,
            numero_documento,
            email,
            telefono,
            direccion
          )
        `)
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .single();
            if (error) {
                throw new common_1.BadRequestException('Error obteniendo cotización: ' + error.message);
            }
            return {
                success: true,
                data: data
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo cotización:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async aprobarCotizacion(id, data, req) {
        try {
            console.log('✅ Aprobando cotización:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const { data: cotizacion, error } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .update({
                estado: 'APROBADA',
                probabilidad: data.probabilidad || 100,
                fecha_aprobacion: new Date().toISOString(),
                aprobado_por: user?.id,
                observaciones_aprobacion: data.observaciones,
                updated_at: new Date().toISOString()
            })
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .select()
                .single();
            if (error) {
                throw new common_1.BadRequestException('Error aprobando cotización: ' + error.message);
            }
            console.log('✅ Cotización aprobada exitosamente');
            return {
                success: true,
                data: cotizacion,
                message: 'Cotización aprobada exitosamente'
            };
        }
        catch (error) {
            console.error('❌ Error aprobando cotización:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async convertirEnVenta(id, opcionesConversion, req) {
        try {
            console.log('🔄 Iniciando conversión de cotización a venta:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const { data: cotizacion, error: errorCotizacion } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select(`
          *,
          clientes:cliente_id (
            nombres,
            apellidos,
            razon_social,
            numero_documento,
            email,
            telefono,
            direccion,
            tipo_documento
          )
        `)
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .single();
            if (errorCotizacion || !cotizacion) {
                throw new common_1.BadRequestException('Cotización no encontrada: ' + errorCotizacion?.message);
            }
            if (cotizacion.estado !== 'APROBADA') {
                throw new common_1.BadRequestException('Solo se pueden convertir cotizaciones APROBADAS');
            }
            if (cotizacion.estado === 'CONVERTIDA') {
                throw new common_1.BadRequestException('Esta cotización ya ha sido convertida');
            }
            const cliente = Array.isArray(cotizacion.clientes)
                ? cotizacion.clientes[0]
                : cotizacion.clientes;
            if (!cliente) {
                throw new common_1.BadRequestException('No se pudo obtener información del cliente');
            }
            const ahora = new Date();
            const fechaEmision = opcionesConversion.fecha_emision || ahora.toISOString().split('T')[0];
            const fechaVencimiento = opcionesConversion.fecha_vencimiento ||
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            let documentoCreado = null;
            if (opcionesConversion.generar_factura !== false) {
                const tipoDocumento = opcionesConversion.tipo_documento ||
                    (cliente.numero_documento?.length === 11 ? 'FACTURA' : 'BOLETA');
                const serie = tipoDocumento === 'FACTURA' ? 'F001' : 'B001';
                const { count } = await this.supabaseService
                    .getClient()
                    .from('documentos')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', tenantId)
                    .eq('serie', serie);
                const numero = (count || 0) + 1;
                const documentoData = {
                    tenant_id: tenantId,
                    tipo_documento: tipoDocumento,
                    serie: serie,
                    numero: numero,
                    receptor_tipo_doc: cliente.tipo_documento || (cliente.numero_documento?.length === 11 ? 'RUC' : 'DNI'),
                    receptor_numero_doc: cliente.numero_documento,
                    receptor_razon_social: cliente.razon_social || `${cliente.nombres || ''} ${cliente.apellidos || ''}`.trim(),
                    receptor_direccion: cliente.direccion || '',
                    receptor_email: cliente.email || '',
                    fecha_emision: fechaEmision,
                    fecha_vencimiento: fechaVencimiento,
                    moneda: cotizacion.moneda || 'PEN',
                    subtotal: cotizacion.subtotal,
                    descuentos: 0,
                    impuesto_igv: cotizacion.igv,
                    total: cotizacion.total,
                    metodo_pago: opcionesConversion.metodo_pago || 'CONTADO',
                    estado: 'EMITIDO',
                    observaciones: opcionesConversion.observaciones || `Generado desde cotización ${cotizacion.numero}`,
                    cotizacion_origen_id: cotizacion.id,
                    created_at: ahora.toISOString(),
                    updated_at: ahora.toISOString(),
                    created_by: user?.id
                };
                const { data: documento, error: errorDocumento } = await this.supabaseService
                    .getClient()
                    .from('documentos')
                    .insert(documentoData)
                    .select()
                    .single();
                if (errorDocumento) {
                    throw new common_1.BadRequestException('Error creando documento: ' + errorDocumento.message);
                }
                documentoCreado = documento;
                if (cotizacion.items && Array.isArray(cotizacion.items)) {
                    const detalles = cotizacion.items.map((item, index) => ({
                        documento_id: documento.id,
                        tenant_id: tenantId,
                        orden: index + 1,
                        codigo_producto: item.codigo || item.codigo_producto || 'N/A',
                        descripcion: item.descripcion,
                        unidad_medida: item.unidad || item.unidad_medida || 'NIU',
                        cantidad: item.cantidad,
                        precio_unitario: item.precio_unitario,
                        descuento_unitario: item.descuento || 0,
                        valor_venta: item.valor_venta || (item.cantidad * item.precio_unitario),
                        impuesto_igv: item.igv || (item.valor_venta * 0.18),
                        impuesto_isc: 0,
                        total_item: item.total || item.valor_venta + (item.igv || 0)
                    }));
                    const { error: errorDetalles } = await this.supabaseService
                        .getClient()
                        .from('documento_detalles')
                        .insert(detalles);
                    if (errorDetalles) {
                        console.error('❌ Error creando detalles:', errorDetalles);
                    }
                }
                console.log('📄 Documento creado exitosamente:', `${serie}-${numero.toString().padStart(8, '0')}`);
            }
            const { data: cotizacionActualizada, error: errorActualizacion } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .update({
                estado: 'CONVERTIDA',
                fecha_conversion: ahora.toISOString(),
                convertido_por: user?.id,
                documento_generado_id: documentoCreado?.id,
                updated_at: ahora.toISOString()
            })
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .select()
                .single();
            if (errorActualizacion) {
                throw new common_1.BadRequestException('Error actualizando cotización: ' + errorActualizacion.message);
            }
            console.log('🎉 Cotización convertida exitosamente');
            return {
                success: true,
                data: {
                    cotizacion: cotizacionActualizada,
                    documento: documentoCreado
                },
                message: `Cotización convertida exitosamente${documentoCreado ? ` - ${documentoCreado.tipo_documento} ${documentoCreado.serie}-${documentoCreado.numero.toString().padStart(8, '0')} generada` : ''}`
            };
        }
        catch (error) {
            console.error('❌ Error convirtiendo cotización:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async rechazarCotizacion(id, data, req) {
        try {
            console.log('❌ Rechazando cotización:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const { data: cotizacion, error } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .update({
                estado: 'RECHAZADA',
                fecha_rechazo: new Date().toISOString(),
                rechazado_por: user?.id,
                motivo_rechazo: data.motivo,
                updated_at: new Date().toISOString()
            })
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .select()
                .single();
            if (error) {
                throw new common_1.BadRequestException('Error rechazando cotización: ' + error.message);
            }
            return {
                success: true,
                data: cotizacion,
                message: 'Cotización rechazada exitosamente'
            };
        }
        catch (error) {
            console.error('❌ Error rechazando cotización:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async puedeConvertir(id, req) {
        try {
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const { data: cotizacion, error } = await this.supabaseService
                .getClient()
                .from('cotizaciones')
                .select('id, estado, fecha_vencimiento, total, cliente_id')
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .single();
            if (error || !cotizacion) {
                return {
                    success: false,
                    puede_convertir: false,
                    motivo: 'Cotización no encontrada'
                };
            }
            const ahora = new Date();
            const fechaVencimiento = new Date(cotizacion.fecha_vencimiento);
            const estaVencida = fechaVencimiento < ahora;
            let puede_convertir = true;
            let motivo = '';
            if (cotizacion.estado === 'CONVERTIDA') {
                puede_convertir = false;
                motivo = 'Esta cotización ya ha sido convertida';
            }
            else if (cotizacion.estado === 'RECHAZADA') {
                puede_convertir = false;
                motivo = 'No se puede convertir una cotización rechazada';
            }
            else if (estaVencida && cotizacion.estado !== 'APROBADA') {
                puede_convertir = false;
                motivo = 'La cotización está vencida';
            }
            else if (!cotizacion.cliente_id) {
                puede_convertir = false;
                motivo = 'La cotización no tiene cliente asignado';
            }
            else if (cotizacion.total <= 0) {
                puede_convertir = false;
                motivo = 'La cotización no tiene monto válido';
            }
            return {
                success: true,
                puede_convertir,
                motivo,
                requiere_aprobacion: cotizacion.estado !== 'APROBADA',
                estado_actual: cotizacion.estado
            };
        }
        catch (error) {
            console.error('❌ Error verificando conversión:', error);
            return {
                success: false,
                puede_convertir: false,
                motivo: 'Error interno del servidor'
            };
        }
    }
};
exports.CotizacionesController = CotizacionesController;
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener estadísticas de cotizaciones' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estadísticas obtenidas exitosamente' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('lista'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar cotizaciones' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cotizaciones listadas exitosamente' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "getCotizaciones", null);
__decorate([
    (0, common_1.Get)('clientes-top'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener clientes principales por cotizaciones' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Clientes principales obtenidos exitosamente' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "getClientesTop", null);
__decorate([
    (0, common_1.Post)('crear'),
    (0, swagger_1.ApiOperation)({ summary: 'Crear nueva cotización' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Cotización creada exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "createCotizacion", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar cotización' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cotización actualizada exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "actualizarCotizacion", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener cotización por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cotización obtenida exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "getCotizacion", null);
__decorate([
    (0, common_1.Put)(':id/aprobar'),
    (0, swagger_1.ApiOperation)({ summary: 'Aprobar cotización' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cotización aprobada exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_g = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "aprobarCotizacion", null);
__decorate([
    (0, common_1.Post)(':id/convertir-en-venta'),
    (0, swagger_1.ApiOperation)({ summary: 'Convertir cotización aprobada en venta/factura' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Cotización convertida en venta exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_h = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _h : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "convertirEnVenta", null);
__decorate([
    (0, common_1.Put)(':id/rechazar'),
    (0, swagger_1.ApiOperation)({ summary: 'Rechazar cotización' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cotización rechazada exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_j = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _j : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "rechazarCotizacion", null);
__decorate([
    (0, common_1.Get)(':id/puede-convertir'),
    (0, swagger_1.ApiOperation)({ summary: 'Verificar si una cotización puede ser convertida' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Estado de conversión verificado' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_k = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _k : Object]),
    __metadata("design:returntype", Promise)
], CotizacionesController.prototype, "puedeConvertir", null);
exports.CotizacionesController = CotizacionesController = __decorate([
    (0, swagger_1.ApiTags)('cotizaciones'),
    (0, common_1.Controller)('cotizaciones'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], CotizacionesController);
//# sourceMappingURL=cotizaciones.controller.js.map