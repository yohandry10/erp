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
var PaisesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaisesService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../../shared/supabase/supabase.service");
let PaisesService = PaisesService_1 = class PaisesService {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
        this.logger = new common_1.Logger(PaisesService_1.name);
    }
    async obtenerPaises() {
        try {
            this.logger.log('🌍 Obteniendo lista de países...');
            const { data, error } = await this.supabaseService
                .getClient()
                .from('paises')
                .select('*')
                .eq('activo', true)
                .order('nombre');
            if (error) {
                this.logger.error('❌ Error obteniendo países:', error);
                throw error;
            }
            this.logger.log(`✅ ${data.length} países obtenidos exitosamente`);
            return data;
        }
        catch (error) {
            this.logger.error('❌ Error en obtenerPaises:', error);
            throw error;
        }
    }
    async obtenerPaisPorCodigo(codigoIso) {
        try {
            this.logger.log(`🌍 Obteniendo país por código: ${codigoIso}`);
            const { data, error } = await this.supabaseService
                .getClient()
                .from('paises')
                .select('*')
                .eq('codigo_iso', codigoIso.toUpperCase())
                .eq('activo', true)
                .single();
            if (error) {
                this.logger.error('❌ Error obteniendo país:', error);
                throw new common_1.NotFoundException(`País con código ${codigoIso} no encontrado`);
            }
            this.logger.log(`✅ País ${data.nombre} obtenido exitosamente`);
            return data;
        }
        catch (error) {
            this.logger.error('❌ Error en obtenerPaisPorCodigo:', error);
            throw error;
        }
    }
    async obtenerConfiguracionFiscal(paisId) {
        try {
            this.logger.log(`⚖️ Obteniendo configuración fiscal para país: ${paisId}`);
            const { data, error } = await this.supabaseService
                .getClient()
                .from('configuracion_fiscal')
                .select(`
          *,
          paises (
            codigo_iso,
            nombre,
            nombre_fiscal
          )
        `)
                .eq('pais_id', paisId)
                .eq('activo', true)
                .single();
            if (error) {
                this.logger.error('❌ Error obteniendo configuración fiscal:', error);
                throw new common_1.NotFoundException(`Configuración fiscal para país ${paisId} no encontrada`);
            }
            this.logger.log(`✅ Configuración fiscal obtenida para ${data.paises.nombre}`);
            return data;
        }
        catch (error) {
            this.logger.error('❌ Error en obtenerConfiguracionFiscal:', error);
            throw error;
        }
    }
    async obtenerConfiguracionPorCodigo(codigoIso) {
        try {
            this.logger.log(`⚖️ Obteniendo configuración fiscal por código: ${codigoIso}`);
            const { data, error } = await this.supabaseService
                .getClient()
                .from('configuracion_fiscal')
                .select(`
          *,
          paises!inner (
            id,
            codigo_iso,
            nombre,
            nombre_fiscal
          )
        `)
                .eq('paises.codigo_iso', codigoIso.toUpperCase())
                .eq('activo', true)
                .single();
            if (error) {
                this.logger.error('❌ Error obteniendo configuración fiscal:', error);
                throw new common_1.NotFoundException(`Configuración fiscal para ${codigoIso} no encontrada`);
            }
            this.logger.log(`✅ Configuración fiscal obtenida para ${data.paises.nombre}`);
            return data;
        }
        catch (error) {
            this.logger.error('❌ Error en obtenerConfiguracionPorCodigo:', error);
            throw error;
        }
    }
    async obtenerConfiguracionUsuario(usuarioId) {
        try {
            this.logger.log(`👤 Obteniendo configuración de usuario: ${usuarioId}`);
            const { data, error } = await this.supabaseService
                .getClient()
                .from('usuario_configuracion')
                .select(`
          *,
          paises (
            id,
            codigo_iso,
            nombre,
            nombre_fiscal,
            moneda_codigo,
            moneda_simbolo
          )
        `)
                .eq('usuario_id', usuarioId)
                .single();
            if (error && error.code !== 'PGRST116') {
                this.logger.error('❌ Error obteniendo configuración de usuario:', error);
                throw error;
            }
            if (!data) {
                this.logger.log('ℹ️ Usuario sin configuración personalizada');
                return null;
            }
            this.logger.log(`✅ Configuración de usuario obtenida`);
            return data;
        }
        catch (error) {
            this.logger.error('❌ Error en obtenerConfiguracionUsuario:', error);
            throw error;
        }
    }
    async actualizarConfiguracionUsuario(usuarioId, configuracion) {
        try {
            this.logger.log(`👤 Actualizando configuración de usuario: ${usuarioId}`);
            const existeConfiguracion = await this.obtenerConfiguracionUsuario(usuarioId);
            let data, error;
            if (existeConfiguracion) {
                const resultado = await this.supabaseService
                    .getClient()
                    .from('usuario_configuracion')
                    .update({
                    ...configuracion,
                    updated_at: new Date().toISOString()
                })
                    .eq('usuario_id', usuarioId)
                    .select(`
            *,
            paises (
              id,
              codigo_iso,
              nombre,
              nombre_fiscal,
              moneda_codigo,
              moneda_simbolo
            )
          `)
                    .single();
                data = resultado.data;
                error = resultado.error;
            }
            else {
                const resultado = await this.supabaseService
                    .getClient()
                    .from('usuario_configuracion')
                    .insert({
                    usuario_id: usuarioId,
                    ...configuracion,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                    .select(`
            *,
            paises (
              id,
              codigo_iso,
              nombre,
              nombre_fiscal,
              moneda_codigo,
              moneda_simbolo
            )
          `)
                    .single();
                data = resultado.data;
                error = resultado.error;
            }
            if (error) {
                this.logger.error('❌ Error actualizando configuración de usuario:', error);
                throw error;
            }
            this.logger.log(`✅ Configuración de usuario actualizada exitosamente`);
            return data;
        }
        catch (error) {
            this.logger.error('❌ Error en actualizarConfiguracionUsuario:', error);
            throw error;
        }
    }
    async validarDocumentoEmpresa(documento, paisId) {
        try {
            const configuracion = await this.obtenerConfiguracionFiscal(paisId);
            if (documento.length !== configuracion.longitud_documento_empresa) {
                return false;
            }
            if (!/^\d+$/.test(documento)) {
                return false;
            }
            return true;
        }
        catch (error) {
            this.logger.error('❌ Error validando documento:', error);
            return false;
        }
    }
    async obtenerLibrosRequeridos(paisId) {
        try {
            const configuracion = await this.obtenerConfiguracionFiscal(paisId);
            const libros = [];
            if (configuracion.requiere_libro_diario)
                libros.push('Libro Diario');
            if (configuracion.requiere_libro_mayor)
                libros.push('Libro Mayor');
            if (configuracion.requiere_libro_inventarios)
                libros.push('Inventarios y Balances');
            if (configuracion.requiere_libro_compras)
                libros.push('Registro de Compras');
            if (configuracion.requiere_libro_ventas)
                libros.push('Registro de Ventas');
            if (configuracion.requiere_kardex_valorizado)
                libros.push('Kardex Valorizado');
            if (configuracion.requiere_libro_mayor_balances)
                libros.push('Libro Mayor y Balances');
            if (configuracion.requiere_libros_societarios)
                libros.push('Libros Societarios');
            return libros;
        }
        catch (error) {
            this.logger.error('❌ Error obteniendo libros requeridos:', error);
            throw error;
        }
    }
    async getConfiguracionPais(paisId) {
        try {
            this.logger.log(`🌍 Obteniendo configuración completa del país ID: ${paisId}`);
            const { data: paisData, error: paisError } = await this.supabaseService
                .getClient()
                .from('paises')
                .select('*')
                .eq('id', paisId)
                .eq('activo', true)
                .single();
            if (paisError) {
                this.logger.error('❌ Error obteniendo país:', paisError);
                throw new common_1.NotFoundException(`País con ID ${paisId} no encontrado`);
            }
            const configuracionFiscal = await this.obtenerConfiguracionFiscal(paisId);
            const { data: tiposDocumentos, error: docError } = await this.supabaseService
                .getClient()
                .from('tipos_documentos_fiscales')
                .select('*')
                .eq('pais_id', paisId)
                .eq('activo', true)
                .order('codigo');
            if (docError) {
                this.logger.error('❌ Error obteniendo tipos de documentos:', docError);
                throw docError;
            }
            const { data: tiposImpuestos, error: impError } = await this.supabaseService
                .getClient()
                .from('tipos_impuestos')
                .select('*')
                .eq('pais_id', paisId)
                .eq('activo', true)
                .order('codigo');
            if (impError) {
                this.logger.error('❌ Error obteniendo tipos de impuestos:', impError);
                throw impError;
            }
            const formatos = {
                fecha: configuracionFiscal.formato_fecha || 'DD/MM/YYYY',
                moneda: '#,##0.00',
                separador_decimal: configuracionFiscal.separador_decimal || '.',
                separador_miles: configuracionFiscal.separador_miles || ','
            };
            const etiquetas = {
                documento_identidad: configuracionFiscal.documento_identidad_empresa,
                impuesto_principal: configuracionFiscal.impuesto_principal_nombre,
                moneda: paisData.moneda_codigo,
                entidad_fiscal: paisData.nombre_fiscal
            };
            const validaciones = {
                documento_min_length: configuracionFiscal.longitud_documento_empresa,
                documento_max_length: configuracionFiscal.longitud_documento_empresa,
                documento_pattern: '^[0-9]+$',
                documento_error_message: `El ${configuracionFiscal.documento_identidad_empresa} debe tener ${configuracionFiscal.longitud_documento_empresa} dígitos`
            };
            const configuracionCompleta = {
                pais: paisData,
                configuracion_fiscal: configuracionFiscal,
                tipos_documentos: tiposDocumentos || [],
                tipos_impuestos: tiposImpuestos || [],
                formatos,
                etiquetas,
                validaciones
            };
            this.logger.log(`✅ Configuración del país ${paisData.nombre} obtenida exitosamente`);
            return configuracionCompleta;
        }
        catch (error) {
            this.logger.error('❌ Error en getConfiguracionPais:', error);
            throw error;
        }
    }
    async obtenerOCrearConfiguracionUsuario(usuarioId) {
        let configuracion = await this.obtenerConfiguracionUsuario(usuarioId);
        if (!configuracion) {
            const paisPeru = await this.obtenerPaisPorCodigo('PE');
            const nuevaConfiguracion = {
                pais_preferido_id: paisPeru.id,
                idioma: 'es',
                zona_horaria: 'America/Lima'
            };
            configuracion = await this.actualizarConfiguracionUsuario(usuarioId, nuevaConfiguracion);
        }
        return configuracion;
    }
    async obtenerLibrosRequeridosPorCodigo(codigo) {
        try {
            const pais = await this.obtenerPaisPorCodigo(codigo);
            const configuracion = await this.obtenerConfiguracionFiscal(pais.id);
            const libros = [];
            if (configuracion.requiere_libro_diario) {
                libros.push({
                    id: 1,
                    codigo: '5.1',
                    nombre: 'Libro Diario',
                    descripcion: 'Registro cronológico de operaciones',
                    obligatorio: true,
                    periodicidad: 'mensual'
                });
            }
            if (configuracion.requiere_libro_mayor) {
                libros.push({
                    id: 2,
                    codigo: '5.2',
                    nombre: 'Libro Mayor',
                    descripcion: 'Registro por cuentas contables',
                    obligatorio: true,
                    periodicidad: 'mensual'
                });
            }
            return {
                pais: pais.nombre,
                entidad_fiscal: pais.nombre_fiscal,
                libros_requeridos: libros,
                ultima_actualizacion: new Date().toISOString()
            };
        }
        catch (error) {
            this.logger.error('❌ Error en obtenerLibrosRequeridosPorCodigo:', error);
            throw error;
        }
    }
    async validarDocumentoPorCodigo(codigo, documento) {
        const pais = await this.obtenerPaisPorCodigo(codigo);
        const esValido = await this.validarDocumentoEmpresa(documento, pais.id);
        const configuracion = await this.obtenerConfiguracionFiscal(pais.id);
        return {
            documento,
            pais: pais.nombre,
            tipo_documento: configuracion.documento_identidad_empresa,
            longitud_requerida: configuracion.longitud_documento_empresa,
            es_valido: esValido,
            mensaje: esValido ? 'Documento válido' : `Documento inválido. Debe tener ${configuracion.longitud_documento_empresa} dígitos.`
        };
    }
};
exports.PaisesService = PaisesService;
exports.PaisesService = PaisesService = PaisesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], PaisesService);
//# sourceMappingURL=paises.service.js.map