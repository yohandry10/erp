import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { 
  PaisDto, 
  ConfiguracionFiscalDto, 
  UsuarioConfiguracionDto, 
  UpdateUsuarioConfiguracionDto,
  ConfiguracionPaisDto,
  TipoDocumentoDto,
  TipoImpuestoDto,
  FormatoConfigDto,
  EtiquetasConfigDto,
  ReglasValidacionDto,
  ValidacionDocumentoDto,
  LibrosRequeridosDto,
  LibroContableDto
} from './paises.dto';
import {
  INITIAL_ACTIVE_COUNTRY_CODE,
  INITIAL_ACTIVE_COUNTRY_ID,
  INITIAL_ACTIVE_COUNTRY_MESSAGE,
  isInitialActiveCountryCode,
  isInitialActiveCountryId,
  normalizeCountryCode,
} from './initial-country';

@Injectable()
export class PaisesService {
  private readonly logger = new Logger(PaisesService.name);
  private readonly paisesCacheTtlMs = 60 * 60 * 1000;
  private paisesCache: { data: PaisDto[]; fetchedAt: number } | null = null;

  constructor(private readonly supabaseService: SupabaseService) {}

  private assertInitialActiveCountryCode(codigoIso: string): string {
    const normalizedCode = normalizeCountryCode(codigoIso);
    if (!isInitialActiveCountryCode(normalizedCode)) {
      throw new NotFoundException(INITIAL_ACTIVE_COUNTRY_MESSAGE);
    }
    return normalizedCode;
  }

  private assertInitialActiveCountryId(paisId: number): number {
    if (!isInitialActiveCountryId(paisId)) {
      throw new NotFoundException(INITIAL_ACTIVE_COUNTRY_MESSAGE);
    }
    return INITIAL_ACTIVE_COUNTRY_ID;
  }

  // ========== GESTIÓN DE PAÍSES ==========
  async obtenerPaises(): Promise<PaisDto[]> {
    try {
      this.logger.log('🌍 Obteniendo lista de países...');
      
      const { data, error } = await this.supabaseService
        .getPublicClient()
        .from('paises')
        .select('*')
        .eq('activo', true)
        .eq('codigo_iso', INITIAL_ACTIVE_COUNTRY_CODE)
        .order('nombre');

      if (error) {
        this.logger.error('❌ Error obteniendo países:', error);
        throw error;
      }

      this.logger.log(`✅ ${data.length} países obtenidos exitosamente`);
      this.paisesCache = { data, fetchedAt: Date.now() };
      return data;
    } catch (error) {
      this.logger.error('❌ Error en obtenerPaises:', error);
      const cached = this.getCachedPaises();
      if (cached) {
        this.logger.warn('⚠️ Usando cache local de paises por error en Supabase');
        return cached;
      }
      throw new ServiceUnavailableException('Servicio de paises no disponible');
    }
  }

  async obtenerPaisPorCodigo(codigoIso: string): Promise<PaisDto> {
    try {
      const codigo = this.assertInitialActiveCountryCode(codigoIso);
      this.logger.log(`🌍 Obteniendo país por código: ${codigo}`);

      const { data, error } = await this.supabaseService
        .getPublicClient()
        .from('paises')
        .select('*')
        .eq('codigo_iso', codigo)
        .eq('activo', true)
        .single();

      if (error) {
        this.logger.error('❌ Error obteniendo país:', error);
        throw new NotFoundException(`País con código ${codigo} no encontrado`);
      }

      this.logger.log(`✅ País ${data.nombre} obtenido exitosamente`);
      return data;
    } catch (error) {
      this.logger.error('❌ Error en obtenerPaisPorCodigo:', error);
      throw error;
    }
  }

  private getCachedPaises(): PaisDto[] | null {
    if (!this.paisesCache) {
      return null;
    }
    if (Date.now() - this.paisesCache.fetchedAt > this.paisesCacheTtlMs) {
      return null;
    }
    return this.paisesCache.data;
  }

  // ========== CONFIGURACIÓN FISCAL ==========
  async obtenerConfiguracionFiscal(paisId: number): Promise<ConfiguracionFiscalDto> {
    try {
      const activePaisId = this.assertInitialActiveCountryId(paisId);
      this.logger.log(`⚖️ Obteniendo configuración fiscal para país: ${activePaisId}`);

      const { data, error } = await this.supabaseService
        .getPublicClient()
        .from('configuracion_fiscal')
        .select(`
          *,
          paises (
            codigo_iso,
            nombre,
            nombre_fiscal
          )
        `)
        .eq('pais_id', activePaisId)
        .eq('activo', true)
        .single();

      if (error) {
        this.logger.error('❌ Error obteniendo configuración fiscal:', error);
        throw new NotFoundException(`Configuración fiscal para país ${activePaisId} no encontrada`);
      }

      this.logger.log(`✅ Configuración fiscal obtenida para ${data.paises.nombre}`);
      return data;
    } catch (error) {
      this.logger.error('❌ Error en obtenerConfiguracionFiscal:', error);
      throw error;
    }
  }

  async obtenerConfiguracionPorCodigo(codigoIso: string): Promise<ConfiguracionFiscalDto> {
    try {
      const codigo = this.assertInitialActiveCountryCode(codigoIso);
      this.logger.log(`⚖️ Obteniendo configuración fiscal por código: ${codigo}`);

      const { data, error } = await this.supabaseService
        .getPublicClient()
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
        .eq('paises.codigo_iso', codigo)
        .eq('activo', true)
        .single();

      if (error) {
        this.logger.error('❌ Error obteniendo configuración fiscal:', error);
        throw new NotFoundException(`Configuración fiscal para ${codigo} no encontrada`);
      }

      this.logger.log(`✅ Configuración fiscal obtenida para ${data.paises.nombre}`);
      return data;
    } catch (error) {
      this.logger.error('❌ Error en obtenerConfiguracionPorCodigo:', error);
      throw error;
    }
  }

  // ========== CONFIGURACIÓN DE USUARIO ==========
  async obtenerConfiguracionUsuario(usuarioId: string): Promise<UsuarioConfiguracionDto | null> {
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

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        this.logger.error('❌ Error obteniendo configuración de usuario:', error);
        throw error;
      }

      if (!data) {
        this.logger.log('ℹ️ Usuario sin configuración personalizada');
        return null;
      }

      this.logger.log(`✅ Configuración de usuario obtenida`);
      return data;
    } catch (error) {
      this.logger.error('❌ Error en obtenerConfiguracionUsuario:', error);
      throw error;
    }
  }

  async actualizarConfiguracionUsuario(
    usuarioId: string, 
    configuracion: UpdateUsuarioConfiguracionDto
  ): Promise<UsuarioConfiguracionDto> {
    try {
      this.logger.log(`👤 Actualizando configuración de usuario: ${usuarioId}`);
      if (
        configuracion.pais_preferido_id !== undefined &&
        !isInitialActiveCountryId(configuracion.pais_preferido_id)
      ) {
        throw new BadRequestException(INITIAL_ACTIVE_COUNTRY_MESSAGE);
      }
      
      // Verificar si ya existe configuración
      const existeConfiguracion = await this.obtenerConfiguracionUsuario(usuarioId);
      
      let data, error;
      
      if (existeConfiguracion) {
        // Actualizar configuración existente
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
      } else {
        // Crear nueva configuración
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
    } catch (error) {
      this.logger.error('❌ Error en actualizarConfiguracionUsuario:', error);
      throw error;
    }
  }

  // ========== UTILIDADES ==========
  async validarDocumentoEmpresa(documento: string, paisId: number): Promise<boolean> {
    try {
      const configuracion = await this.obtenerConfiguracionFiscal(this.assertInitialActiveCountryId(paisId));
      
      // Validar longitud
      if (documento.length !== configuracion.longitud_documento_empresa) {
        return false;
      }
      
      // Validar que solo contenga números
      if (!/^\d+$/.test(documento)) {
        return false;
      }
      
      return true;
    } catch (error) {
      this.logger.error('❌ Error validando documento:', error);
      return false;
    }
  }

  async obtenerLibrosRequeridos(paisId: number): Promise<string[]> {
    try {
      const configuracion = await this.obtenerConfiguracionFiscal(this.assertInitialActiveCountryId(paisId));
      const libros: string[] = [];
      
      if (configuracion.requiere_libro_diario) libros.push('Libro Diario');
      if (configuracion.requiere_libro_mayor) libros.push('Libro Mayor');
      if (configuracion.requiere_libro_inventarios) libros.push('Inventarios y Balances');
      if (configuracion.requiere_libro_compras) libros.push('Registro de Compras');
      if (configuracion.requiere_libro_ventas) libros.push('Registro de Ventas');
      if (configuracion.requiere_kardex_valorizado) libros.push('Kardex Valorizado');
      if (configuracion.requiere_libro_mayor_balances) libros.push('Libro Mayor y Balances');
      if (configuracion.requiere_libros_societarios) libros.push('Libros Societarios');
      
      return libros;
    } catch (error) {
      this.logger.error('❌ Error obteniendo libros requeridos:', error);
      throw error;
    }
  }

  async getConfiguracionPais(paisId: number): Promise<ConfiguracionPaisDto> {
    try {
      const activePaisId = this.assertInitialActiveCountryId(paisId);
      this.logger.log(`🌍 Obteniendo configuración completa del país ID: ${activePaisId}`);
      
      // Obtener información básica del país
      const { data: paisData, error: paisError } = await this.supabaseService
        .getPublicClient()
        .from('paises')
        .select('*')
        .eq('id', activePaisId)
        .eq('activo', true)
        .single();

      if (paisError) {
        this.logger.error('❌ Error obteniendo país:', paisError);
        throw new NotFoundException(`País con ID ${activePaisId} no encontrado`);
      }

      // Obtener configuración fiscal
      const configuracionFiscal = await this.obtenerConfiguracionFiscal(activePaisId);

      // Obtener tipos de documentos
      const { data: tiposDocumentos, error: docError } = await this.supabaseService
        .getPublicClient()
        .from('tipos_documentos_fiscales')
        .select('*')
        .eq('pais_id', activePaisId)
        .eq('activo', true)
        .order('codigo');

      if (docError) {
        this.logger.error('❌ Error obteniendo tipos de documentos:', docError);
        throw docError;
      }

      // Obtener tipos de impuestos
      const { data: tiposImpuestos, error: impError } = await this.supabaseService
        .getPublicClient()
        .from('tipos_impuestos')
        .select('*')
        .eq('pais_id', activePaisId)
        .eq('activo', true)
        .order('codigo');

      if (impError) {
        this.logger.error('❌ Error obteniendo tipos de impuestos:', impError);
        throw impError;
      }

      // Configurar formatos según el país
      const formatos: FormatoConfigDto = {
        fecha: configuracionFiscal.formato_fecha || 'DD/MM/YYYY',
        moneda: '#,##0.00',
        separador_decimal: configuracionFiscal.separador_decimal || '.',
        separador_miles: configuracionFiscal.separador_miles || ','
      };

      // Configurar etiquetas según el país
      const etiquetas: EtiquetasConfigDto = {
        documento_identidad: configuracionFiscal.documento_identidad_empresa,
        impuesto_principal: configuracionFiscal.impuesto_principal_nombre,
        moneda: paisData.moneda_codigo,
        entidad_fiscal: paisData.nombre_fiscal
      };

      // Configurar reglas de validación
      const validaciones: ReglasValidacionDto = {
        documento_min_length: configuracionFiscal.longitud_documento_empresa,
        documento_max_length: configuracionFiscal.longitud_documento_empresa,
        documento_pattern: '^[0-9]+$',
        documento_error_message: `El ${configuracionFiscal.documento_identidad_empresa} debe tener ${configuracionFiscal.longitud_documento_empresa} dígitos`
      };

      const configuracionCompleta: ConfiguracionPaisDto = {
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
    } catch (error) {
      this.logger.error('❌ Error en getConfiguracionPais:', error);
      throw error;
    }
  }

  /**
   * Obtiene o crea la configuración de usuario con valores por defecto
   */
  async obtenerOCrearConfiguracionUsuario(usuarioId: string): Promise<UsuarioConfiguracionDto> {
    let configuracion = await this.obtenerConfiguracionUsuario(usuarioId);
    
    if (!configuracion) {
      // Crear configuración por defecto (Perú)
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
  
  /**
   * Obtiene libros requeridos por código de país
   */
  async obtenerLibrosRequeridosPorCodigo(codigo: string): Promise<LibrosRequeridosDto> {
    try {
      const pais = await this.obtenerPaisPorCodigo(codigo);
      const configuracion = await this.obtenerConfiguracionFiscal(pais.id);
      
      const libros: LibroContableDto[] = [];
      
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
    } catch (error) {
      this.logger.error('❌ Error en obtenerLibrosRequeridosPorCodigo:', error);
      throw error;
    }
  }
  
  /**
   * Valida documento por código de país
   */
  async validarDocumentoPorCodigo(codigo: string, documento: string): Promise<ValidacionDocumentoDto> {
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
}
