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
exports.RetencionesService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../../shared/supabase/supabase.service");
const event_bus_service_1 = require("../../shared/events/event-bus.service");
let RetencionesService = class RetencionesService {
    constructor(supabase, eventBus) {
        this.supabase = supabase;
        this.eventBus = eventBus;
    }
    async calcularRetencion(data) {
        const client = this.supabase.getClient();
        try {
            const { data: proveedorCuarta } = await client
                .from('proveedores_cuarta_categoria')
                .select('*')
                .eq('proveedor_id', data.proveedor_id)
                .eq('activo', true)
                .single();
            const { data: config } = await client
                .from('configuracion_retenciones')
                .select('*')
                .eq('categoria', data.categoria_retencion)
                .eq('activo', true)
                .single();
            if (!config) {
                throw new Error(`No se encontró configuración para retención ${data.categoria_retencion}`);
            }
            if (data.categoria_retencion === 'CUARTA' && !proveedorCuarta) {
                return {
                    monto_pago: data.monto_pago,
                    tasa_retencion: 0,
                    monto_retencion: 0,
                    monto_neto: data.monto_pago,
                    categoria: data.categoria_retencion,
                    exonerado: true,
                    motivo_exoneracion: 'Proveedor no está registrado en cuarta categoría',
                    base_calculo: data.monto_pago,
                    fecha_calculo: new Date().toISOString()
                };
            }
            if (data.monto_pago < config.monto_minimo) {
                return {
                    monto_pago: data.monto_pago,
                    tasa_retencion: 0,
                    monto_retencion: 0,
                    monto_neto: data.monto_pago,
                    categoria: data.categoria_retencion,
                    exonerado: true,
                    motivo_exoneracion: `Monto menor al mínimo requerido (S/ ${config.monto_minimo})`,
                    base_calculo: data.monto_pago,
                    fecha_calculo: new Date().toISOString()
                };
            }
            const montoRetencion = Math.round((data.monto_pago * (config.tasa_porcentaje / 100)) * 100) / 100;
            const montoNeto = Math.round((data.monto_pago - montoRetencion) * 100) / 100;
            return {
                monto_pago: data.monto_pago,
                tasa_retencion: config.tasa_porcentaje,
                monto_retencion: montoRetencion,
                monto_neto: montoNeto,
                categoria: data.categoria_retencion,
                exonerado: false,
                base_calculo: data.monto_pago,
                fecha_calculo: new Date().toISOString()
            };
        }
        catch (error) {
            throw new Error(`Error calculando retención: ${error.message}`);
        }
    }
    async crearRetencion(data) {
        const client = this.supabase.getClient();
        try {
            const calculoValidacion = await this.calcularRetencion({
                monto_pago: data.monto_pago,
                categoria_retencion: data.categoria_retencion,
                proveedor_id: data.proveedor_id
            });
            if (Math.abs(calculoValidacion.monto_retencion - data.monto_retencion) > 0.01) {
                throw new Error('El monto de retención no coincide con el cálculo esperado');
            }
            const numeroCorrelativo = await this.generarNumeroCorrelativo(data.categoria_retencion);
            const { data: retencion, error } = await client
                .from('libro_retenciones')
                .insert({
                numero_correlativo: numeroCorrelativo,
                proveedor_id: data.proveedor_id,
                numero_comprobante: data.numero_comprobante,
                fecha_emision: data.fecha_emision,
                fecha_pago: data.fecha_pago,
                monto_pago: data.monto_pago,
                categoria_retencion: data.categoria_retencion,
                tasa_retencion: data.tasa_retencion,
                monto_retencion: data.monto_retencion,
                observaciones: data.observaciones,
                estado: 'ACTIVO',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .select(`
          *,
          proveedor:proveedores(
            id,
            razon_social,
            numero_documento,
            tipo_documento
          )
        `)
                .single();
            if (error) {
                throw new Error(`Error creando retención: ${error.message}`);
            }
            this.eventBus.emit('retencion.creada', {
                type: 'retencion.creada',
                data: retencion,
                timestamp: new Date()
            });
            return retencion;
        }
        catch (error) {
            throw new Error(`Error en crearRetencion: ${error.message}`);
        }
    }
    async getRetenciones(fechaDesde, fechaHasta, categoria, proveedorId, estado, page = 1, limit = 50) {
        const client = this.supabase.getClient();
        try {
            let query = client
                .from('libro_retenciones')
                .select(`
          *,
          proveedor:proveedores(
            id,
            razon_social,
            numero_documento,
            tipo_documento
          )
        `, { count: 'exact' })
                .order('fecha_pago', { ascending: false });
            if (fechaDesde) {
                query = query.gte('fecha_pago', fechaDesde);
            }
            if (fechaHasta) {
                query = query.lte('fecha_pago', fechaHasta);
            }
            if (categoria) {
                query = query.eq('categoria_retencion', categoria);
            }
            if (proveedorId) {
                query = query.eq('proveedor_id', proveedorId);
            }
            if (estado) {
                query = query.eq('estado', estado);
            }
            else {
                query = query.eq('estado', 'ACTIVO');
            }
            const offset = (page - 1) * limit;
            query = query.range(offset, offset + limit - 1);
            const { data, error, count } = await query;
            if (error) {
                throw new Error(`Error obteniendo retenciones: ${error.message}`);
            }
            const totalPages = Math.ceil((count || 0) / limit);
            return {
                data: data || [],
                total: count || 0,
                page,
                totalPages
            };
        }
        catch (error) {
            throw new Error(`Error en getRetenciones: ${error.message}`);
        }
    }
    async getRetencionById(id) {
        const client = this.supabase.getClient();
        try {
            const { data, error } = await client
                .from('libro_retenciones')
                .select(`
          *,
          proveedor:proveedores(
            id,
            razon_social,
            numero_documento,
            tipo_documento,
            direccion,
            telefono,
            email
          )
        `)
                .eq('id', id)
                .single();
            if (error) {
                throw new Error(`Error obteniendo retención: ${error.message}`);
            }
            if (!data) {
                throw new Error('Retención no encontrada');
            }
            return data;
        }
        catch (error) {
            throw new Error(`Error en getRetencionById: ${error.message}`);
        }
    }
    async anularRetencion(id, motivo) {
        const client = this.supabase.getClient();
        try {
            const { data: retencionExistente } = await client
                .from('libro_retenciones')
                .select('id, estado')
                .eq('id', id)
                .single();
            if (!retencionExistente) {
                throw new Error('Retención no encontrada');
            }
            if (retencionExistente.estado !== 'ACTIVO') {
                throw new Error('Solo se pueden anular retenciones activas');
            }
            const { error } = await client
                .from('libro_retenciones')
                .update({
                estado: 'ANULADO',
                observaciones: motivo,
                updated_at: new Date().toISOString()
            })
                .eq('id', id);
            if (error) {
                throw new Error(`Error anulando retención: ${error.message}`);
            }
            this.eventBus.emit('retencion.anulada', {
                type: 'retencion.anulada',
                data: { id, motivo },
                timestamp: new Date()
            });
        }
        catch (error) {
            throw new Error(`Error en anularRetencion: ${error.message}`);
        }
    }
    async getResumenRetenciones(fechaDesde, fechaHasta) {
        const client = this.supabase.getClient();
        try {
            const { data: resumenCategoria, error: errorCategoria } = await client
                .from('libro_retenciones')
                .select('categoria_retencion, monto_pago, monto_retencion')
                .eq('estado', 'ACTIVO')
                .gte('fecha_pago', fechaDesde)
                .lte('fecha_pago', fechaHasta);
            if (errorCategoria) {
                throw new Error(`Error obteniendo resumen por categoría: ${errorCategoria.message}`);
            }
            const resumen = {
                total_retenciones: resumenCategoria?.length || 0,
                monto_total_retenido: 0,
                monto_total_pagado: 0,
                monto_total_neto: 0,
                retenciones_por_categoria: {
                    CUARTA: {
                        cantidad: 0,
                        monto_total_retenido: 0,
                        monto_total_pagado: 0,
                        tasa_promedio: 0
                    },
                    QUINTA: {
                        cantidad: 0,
                        monto_total_retenido: 0,
                        monto_total_pagado: 0,
                        tasa_promedio: 0
                    }
                },
                retenciones_por_estado: {
                    PENDIENTE: 0,
                    PROCESADA: resumenCategoria?.length || 0,
                    ANULADA: 0
                },
                periodo: {
                    fecha_inicio: fechaDesde,
                    fecha_fin: fechaHasta
                },
                top_proveedores: []
            };
            resumenCategoria?.forEach(item => {
                resumen.monto_total_pagado += item.monto_pago;
                resumen.monto_total_retenido += item.monto_retencion;
                resumen.monto_total_neto += (item.monto_pago - item.monto_retencion);
                if (item.categoria_retencion === 'CUARTA') {
                    resumen.retenciones_por_categoria.CUARTA.cantidad++;
                    resumen.retenciones_por_categoria.CUARTA.monto_total_pagado += item.monto_pago;
                    resumen.retenciones_por_categoria.CUARTA.monto_total_retenido += item.monto_retencion;
                }
                else if (item.categoria_retencion === 'QUINTA') {
                    resumen.retenciones_por_categoria.QUINTA.cantidad++;
                    resumen.retenciones_por_categoria.QUINTA.monto_total_pagado += item.monto_pago;
                    resumen.retenciones_por_categoria.QUINTA.monto_total_retenido += item.monto_retencion;
                }
            });
            if (resumen.retenciones_por_categoria.CUARTA.monto_total_pagado > 0) {
                resumen.retenciones_por_categoria.CUARTA.tasa_promedio =
                    (resumen.retenciones_por_categoria.CUARTA.monto_total_retenido /
                        resumen.retenciones_por_categoria.CUARTA.monto_total_pagado) * 100;
            }
            if (resumen.retenciones_por_categoria.QUINTA.monto_total_pagado > 0) {
                resumen.retenciones_por_categoria.QUINTA.tasa_promedio =
                    (resumen.retenciones_por_categoria.QUINTA.monto_total_retenido /
                        resumen.retenciones_por_categoria.QUINTA.monto_total_pagado) * 100;
            }
            resumen.monto_total_pagado = Math.round(resumen.monto_total_pagado * 100) / 100;
            resumen.monto_total_retenido = Math.round(resumen.monto_total_retenido * 100) / 100;
            resumen.monto_total_neto = Math.round(resumen.monto_total_neto * 100) / 100;
            resumen.retenciones_por_categoria.CUARTA.monto_total_pagado = Math.round(resumen.retenciones_por_categoria.CUARTA.monto_total_pagado * 100) / 100;
            resumen.retenciones_por_categoria.CUARTA.monto_total_retenido = Math.round(resumen.retenciones_por_categoria.CUARTA.monto_total_retenido * 100) / 100;
            resumen.retenciones_por_categoria.CUARTA.tasa_promedio = Math.round(resumen.retenciones_por_categoria.CUARTA.tasa_promedio * 100) / 100;
            resumen.retenciones_por_categoria.QUINTA.monto_total_pagado = Math.round(resumen.retenciones_por_categoria.QUINTA.monto_total_pagado * 100) / 100;
            resumen.retenciones_por_categoria.QUINTA.monto_total_retenido = Math.round(resumen.retenciones_por_categoria.QUINTA.monto_total_retenido * 100) / 100;
            resumen.retenciones_por_categoria.QUINTA.tasa_promedio = Math.round(resumen.retenciones_por_categoria.QUINTA.tasa_promedio * 100) / 100;
            return resumen;
        }
        catch (error) {
            throw new Error(`Error en getResumenRetenciones: ${error.message}`);
        }
    }
    async generarNumeroCorrelativo(categoria) {
        const client = this.supabase.getClient();
        try {
            const año = new Date().getFullYear();
            const prefijo = categoria === 'CUARTA' ? 'R4' : 'R5';
            const { data, error } = await client
                .from('libro_retenciones')
                .select('numero_correlativo')
                .like('numero_correlativo', `${prefijo}-${año}-%`)
                .order('numero_correlativo', { ascending: false })
                .limit(1);
            if (error) {
                throw new Error(`Error obteniendo último correlativo: ${error.message}`);
            }
            let siguienteNumero = 1;
            if (data && data.length > 0) {
                const ultimoNumero = data[0].numero_correlativo;
                const partes = ultimoNumero.split('-');
                if (partes.length === 3) {
                    siguienteNumero = parseInt(partes[2]) + 1;
                }
            }
            return `${prefijo}-${año}-${siguienteNumero.toString().padStart(6, '0')}`;
        }
        catch (error) {
            throw new Error(`Error generando número correlativo: ${error.message}`);
        }
    }
    async exportarParaSunat(fechaDesde, fechaHasta, categoria) {
        const client = this.supabase.getClient();
        try {
            let query = client
                .from('libro_retenciones')
                .select(`
          numero_correlativo,
          fecha_pago,
          numero_comprobante,
          monto_pago,
          tasa_retencion,
          monto_retencion,
          categoria_retencion,
          proveedor:proveedores(
            numero_documento,
            tipo_documento,
            razon_social
          )
        `)
                .eq('estado', 'ACTIVO')
                .gte('fecha_pago', fechaDesde)
                .lte('fecha_pago', fechaHasta)
                .order('fecha_pago', { ascending: true });
            if (categoria) {
                query = query.eq('categoria_retencion', categoria);
            }
            const { data, error } = await query;
            if (error) {
                throw new Error(`Error exportando para SUNAT: ${error.message}`);
            }
            return data || [];
        }
        catch (error) {
            throw new Error(`Error en exportarParaSunat: ${error.message}`);
        }
    }
    async validarConfiguracion() {
        const client = this.supabase.getClient();
        const errores = [];
        try {
            const { data: configCuarta } = await client
                .from('configuracion_retenciones')
                .select('*')
                .eq('categoria', 'CUARTA')
                .eq('activo', true)
                .single();
            if (!configCuarta) {
                errores.push('No existe configuración activa para retenciones de cuarta categoría');
            }
            const { data: configQuinta } = await client
                .from('configuracion_retenciones')
                .select('*')
                .eq('categoria', 'QUINTA')
                .eq('activo', true)
                .single();
            if (!configQuinta) {
                errores.push('No existe configuración activa para retenciones de quinta categoría');
            }
            return {
                valida: errores.length === 0,
                errores
            };
        }
        catch (error) {
            return {
                valida: false,
                errores: [`Error validando configuración: ${error.message}`]
            };
        }
    }
};
exports.RetencionesService = RetencionesService;
exports.RetencionesService = RetencionesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], RetencionesService);
//# sourceMappingURL=retenciones.service.js.map