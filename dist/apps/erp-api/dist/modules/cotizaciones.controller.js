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
var _a, _b, _c, _d, _e, _f;
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
exports.CotizacionesController = CotizacionesController = __decorate([
    (0, swagger_1.ApiTags)('cotizaciones'),
    (0, common_1.Controller)('cotizaciones'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], CotizacionesController);
