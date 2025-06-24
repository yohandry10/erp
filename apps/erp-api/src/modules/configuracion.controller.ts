import { Controller, Get, Put, Body, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { SupabaseService } from '../shared/supabase/supabase.service';

@Controller('configuracion')
// @UseGuards(JwtAuthGuard) // Temporalmente deshabilitado para testing
export class ConfiguracionController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get('empresa')
  async getEmpresaConfig(@Req() req: any) {
    try {
      console.log('🏢 Obteniendo configuración de empresa...');
      
      // Verificar autenticación - DESHABILITADO TEMPORALMENTE
      // if (!req.user) {
      //   console.error('❌ Usuario no autenticado');
      //   throw new HttpException('Usuario no autenticado', HttpStatus.UNAUTHORIZED);
      // }
      
      const client = this.supabaseService.getClient();
      
      // Obtener configuración de empresa
      const { data, error } = await client
        .from('empresa_config')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('❌ Error obteniendo configuración:', error);
        throw new HttpException('Error accediendo a la base de datos', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Si no existe configuración, crear una por defecto
      if (!data) {
        console.log('📝 Creando configuración de empresa por defecto...');
        
        const defaultConfig = {
          razon_social: 'Mi Empresa SAC',
          ruc: '20123456789',
          direccion_fiscal: 'Dirección fiscal pendiente',
          telefono: '+51 1 234-5678',
          email: 'contacto@miempresa.com',
          sitio_web: 'www.miempresa.com',
          representante_legal: 'Representante Legal',
          tipo_contribuyente: 'PERSONA_JURIDICA',
          regimen_tributario: 'GENERAL',
          igv_porcentaje: 18.00,
          retencion_renta_porcentaje: 3.00,
          serie_factura: 'F001',
          serie_boleta: 'B001',
          serie_nota_credito: 'NC01',
          serie_nota_debito: 'ND01',
          serie_guia_remision: 'T001',
          ultimo_numero_factura: 0,
          ultimo_numero_boleta: 0,
          ultimo_numero_nota_credito: 0,
          ultimo_numero_nota_debito: 0,
          ultimo_numero_guia_remision: 0,
          ose_activo: false,
          ose_url: '',
          ose_username: '',
          ose_password: '',
          certificado_vigencia: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: newConfig, error: createError } = await client
          .from('empresa_config')
          .insert(defaultConfig)
          .select()
          .single();

        if (createError) {
          console.error('❌ Error creando configuración por defecto:', createError);
          throw new HttpException('Error creando configuración por defecto', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        console.log('✅ Configuración por defecto creada');
        return { success: true, data: newConfig };
      }

      console.log('✅ Configuración obtenida exitosamente');
      return { success: true, data };

    } catch (error) {
      console.error('❌ Error en getEmpresaConfig:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        error.message || 'Error interno del servidor',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Put('empresa')
  async updateEmpresaConfig(@Body() updateData: any, @Req() req: any) {
    try {
      console.log('🔄 Actualizando configuración de empresa...', updateData);
      
      // Verificar autenticación - DESHABILITADO TEMPORALMENTE
      // if (!req.user) {
      //   console.error('❌ Usuario no autenticado');
      //   throw new HttpException('Usuario no autenticado', HttpStatus.UNAUTHORIZED);
      // }
      
      const client = this.supabaseService.getClient();

      // Preparar datos para actualizar
      const dataToUpdate = {
        ...updateData,
        updated_at: new Date().toISOString()
      };

      // Remover campos que no deben actualizarse directamente
      delete dataToUpdate.id;
      delete dataToUpdate.created_at;

      // Buscar configuración existente
      const { data: existingConfig } = await client
        .from('empresa_config')
        .select('id')
        .limit(1)
        .single();

      let result;

      if (existingConfig) {
        // Actualizar configuración existente
        const { data, error } = await client
          .from('empresa_config')
          .update(dataToUpdate)
          .eq('id', existingConfig.id)
          .select()
          .single();

        if (error) {
          console.error('❌ Error actualizando configuración:', error);
          throw new HttpException('Error actualizando configuración', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        result = data;
        console.log('✅ Configuración actualizada exitosamente');
      } else {
        // Crear nueva configuración si no existe
        const { data, error } = await client
          .from('empresa_config')
          .insert({
            ...dataToUpdate,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          console.error('❌ Error creando configuración:', error);
          throw new HttpException('Error creando configuración', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        result = data;
        console.log('✅ Nueva configuración creada exitosamente');
      }

      return { 
        success: true, 
        data: result,
        message: 'Configuración guardada exitosamente'
      };

    } catch (error) {
      console.error('❌ Error en updateEmpresaConfig:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        error.message || 'Error interno del servidor',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('series')
  async getSeries(@Req() req: any) {
    try {
      console.log('📋 Obteniendo series de comprobantes...');
      
      const client = this.supabaseService.getClient();
      
      const { data, error } = await client
        .from('empresa_config')
        .select('serie_factura, serie_boleta, serie_nota_credito, serie_nota_debito, serie_guia_remision, ultimo_numero_factura, ultimo_numero_boleta, ultimo_numero_nota_credito, ultimo_numero_nota_debito, ultimo_numero_guia_remision')
        .limit(1)
        .single();

      if (error) {
        console.error('❌ Error obteniendo series:', error);
        throw error;
      }

      console.log('✅ Series obtenidas exitosamente');
      return { success: true, data };

    } catch (error) {
      console.error('❌ Error en getSeries:', error);
      return { 
        success: false, 
        message: error.message || 'Error obteniendo series',
        error: error.code || 'UNKNOWN_ERROR'
      };
    }
  }

  @Put('series')
  async updateSeries(@Body() seriesData: any, @Req() req: any) {
    try {
      console.log('🔄 Actualizando series de comprobantes...', seriesData);
      
      const client = this.supabaseService.getClient();

      // Buscar configuración existente
      const { data: existingConfig } = await client
        .from('empresa_config')
        .select('id')
        .limit(1)
        .single();

      if (!existingConfig) {
        throw new Error('No se encontró configuración de empresa');
      }

      // Actualizar solo las series
      const { data, error } = await client
        .from('empresa_config')
        .update({
          ...seriesData,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConfig.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error actualizando series:', error);
        throw error;
      }

      console.log('✅ Series actualizadas exitosamente');
      return { 
        success: true, 
        data,
        message: 'Series actualizadas exitosamente'
      };

    } catch (error) {
      console.error('❌ Error en updateSeries:', error);
      return { 
        success: false, 
        message: error.message || 'Error actualizando series',
        error: error.code || 'UNKNOWN_ERROR'
      };
    }
  }
} 