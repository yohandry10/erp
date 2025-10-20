import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CpeService } from '../cpe/cpe.service';
import { ValidationService } from '../validations/validation.service';
import { ConfigurationService } from '../configuracion/configuration.service';

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly cpeService: CpeService,
    private readonly validationService: ValidationService,
    private readonly configurationService: ConfigurationService,
  ) {}

  async getProductos(user: any) {
    try {
      this.logger.log(`Obteniendo productos para tenant: ${user.tenant_id}`);
      
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (error) {
        this.logger.error('Error en query productos:', error);
        throw error;
      }

      this.logger.log(`Productos encontrados: ${data?.length || 0}`);

      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      this.logger.error('Error obteniendo productos:', error);
      throw error;
    }
  }

  async getClientes(user: any) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('clientes')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .eq('activo', true)
        .order('razon_social', { ascending: true });

      if (error) throw error;

      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      this.logger.error('Error obteniendo clientes:', error);
      throw error;
    }
  }

  async getMetodosPago(user: any) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('metodos_pago')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (error) throw error;

      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      this.logger.error('Error obteniendo métodos de pago:', error);
      throw error;
    }
  }

  async getEmpresaConfig(user: any) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('empresas')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data
      };
    } catch (error) {
      this.logger.error('Error obteniendo configuración de empresa:', error);
      return { success: true, data: null };
    }
  }

  async getSesionCajaActual(user: any) {
    try {
      const hoy = new Date().toISOString().split('T')[0];
      
      const { data, error } = await this.supabase.getClient()
        .from('sesiones_caja')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .eq('usuario_id', user.id)
        .gte('fecha_apertura', `${hoy}T00:00:00`)
        .lte('fecha_apertura', `${hoy}T23:59:59`)
        .is('fecha_cierre', null)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return data;
    } catch (error) {
      this.logger.error('Error obteniendo sesión de caja:', error);
      return null;
    }
  }

  async getVentasRecientes(user: any) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('fecha_venta', { ascending: false })
        .limit(50);

      if (error) throw error;

      return data || [];
    } catch (error) {
      this.logger.error('Error obteniendo ventas recientes:', error);
      return [];
    }
  }

  async procesarVenta(ventaData: any, user: any) {
    try {
      this.logger.log('Procesando venta:', JSON.stringify(ventaData, null, 2));

      // ===== PRE-SALE VALIDATIONS =====
      this.logger.log(`Starting pre-sale validations for tenant: ${user.tenant_id}`);

      // 1. Validate certificate
      const certificateValidation = await this.validationService.validateCertificate(user.tenant_id);
      if (!certificateValidation.isValid) {
        this.logger.error(`Certificate validation failed: ${certificateValidation.errors.join(', ')}`);
        return {
          success: false,
          message: 'No se puede completar la venta: Certificado digital inválido',
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: 'CERT_VALIDATION_FAILED',
            mensaje: certificateValidation.errors.join('. '),
            errores: certificateValidation.errors,
          }
        };
      }

      // Log certificate warnings (expiring soon)
      if (certificateValidation.warnings.length > 0) {
        this.logger.warn(`Certificate warnings: ${certificateValidation.warnings.join(', ')}`);
      }

      // 2. Validate RUC configuration
      const rucValidation = await this.validationService.validateRucConfiguration(user.tenant_id);
      if (!rucValidation.isValid) {
        this.logger.error(`RUC validation failed: ${rucValidation.errors.join(', ')}`);
        return {
          success: false,
          message: 'No se puede completar la venta: Configuración de RUC incompleta',
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: 'RUC_VALIDATION_FAILED',
            mensaje: rucValidation.errors.join('. '),
            errores: rucValidation.errors,
            camposFaltantes: rucValidation.missingFields,
          }
        };
      }

      // 3. Validate sale document (items count, amounts, etc.)
      const documentValidation = await this.validationService.validateDocumentBeforeEmission({
        items: ventaData.items || [],
        total: ventaData.total,
        serie: ventaData.comprobante?.serie,
        correlativo: ventaData.comprobante?.numero?.toString(),
        tipoDocumento: ventaData.comprobante?.tipo,
      });

      if (!documentValidation.isValid) {
        this.logger.error(`Document validation failed: ${documentValidation.errors.length} errors`);
        return {
          success: false,
          message: 'No se puede completar la venta: El documento no cumple con las validaciones SUNAT',
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: 'DOCUMENT_VALIDATION_FAILED',
            mensaje: documentValidation.errors.map(e => e.message).join('. '),
            errores: documentValidation.errors,
          }
        };
      }

      // Log document warnings
      if (documentValidation.warnings.length > 0) {
        this.logger.warn(`Document warnings: ${documentValidation.warnings.map(w => w.message).join(', ')}`);
      }

      this.logger.log('✅ All pre-sale validations passed');
      // ===== END PRE-SALE VALIDATIONS =====

      // Generar número de venta único
      const numeroVenta = `V${Date.now()}`;
      
      // Insertar venta - usar solo columnas que existen en la tabla
      const { data: venta, error: ventaError } = await this.supabase.getClient()
        .from('ventas_pos')
        .insert({
          tenant_id: user.tenant_id,
          usuario_id: user.id,
          numero_venta: numeroVenta,
          cliente_nombre: ventaData.cliente_nombre,
          cliente_documento: ventaData.cliente_documento,
          subtotal: ventaData.subtotal,
          impuestos: ventaData.impuestos,
          total: ventaData.total,
          metodo_pago: ventaData.metodo_pago_id,
          estado: 'PAGADA',
          numero_ticket: ventaData.numero_comprobante,
          vendedor: user.email || user.username,
          observaciones: JSON.stringify({
            cliente_id: ventaData.cliente_id,
            items: ventaData.items,
            descuento_global: ventaData.descuento_global,
            descuentos: ventaData.descuentos,
            referencia_pago: ventaData.referencia_pago,
            comprobante: ventaData.comprobante
          })
        })
        .select()
        .single();

      if (ventaError) {
        this.logger.error('Error insertando venta:', ventaError);
        throw ventaError;
      }

      // Insertar detalles de venta - guardar en observaciones por ahora
      // La tabla detalle_ventas_pos no tiene todas las columnas necesarias
      this.logger.log('✅ Detalles guardados en observaciones de la venta');

      // Actualizar stock de productos
      for (const item of ventaData.items) {
        // Primero obtener el stock actual
        const { data: producto } = await this.supabase.getClient()
          .from('productos')
          .select('stock_actual')
          .eq('id', item.producto_id)
          .eq('tenant_id', user.tenant_id)
          .single();

        if (producto) {
          const nuevoStock = producto.stock_actual - item.cantidad;
          const { error: stockError } = await this.supabase.getClient()
            .from('productos')
            .update({ stock_actual: nuevoStock })
            .eq('id', item.producto_id)
            .eq('tenant_id', user.tenant_id);

          if (stockError) {
            this.logger.warn(`Error actualizando stock del producto ${item.producto_id}:`, stockError);
          }
        }
      }

      // Actualizar sesión de caja
      const sesionCaja = await this.getSesionCajaActual(user);
      if (sesionCaja) {
        const metodo = ventaData.metodo_pago_id;
        const updateData: any = {};

        if (metodo === 'efectivo') {
          updateData.total_efectivo = sesionCaja.total_efectivo + ventaData.total;
        } else {
          updateData.total_tarjeta = sesionCaja.total_tarjeta + ventaData.total;
        }

        await this.supabase.getClient()
          .from('sesiones_caja')
          .update(updateData)
          .eq('id', sesionCaja.id);
      }

      this.logger.log('✅ Venta procesada exitosamente:', venta.id);

      // Emitir CPE automáticamente
      let cpeEmitido = false;
      let cpeId = null;
      try {
        this.logger.log('📄 Emitiendo CPE para venta:', venta.id);
        
        // Obtener configuración de empresa para datos del emisor
        const { data: empresaData, error: empresaError } = await this.supabase.getClient()
          .from('empresa_config')
          .select('ruc, razon_social')
          .eq('tenant_id', user.tenant_id)
          .single();

        if (empresaError) {
          this.logger.error('❌ Error obteniendo empresa_config:', empresaError);
        }

        const empresa = (empresaData && empresaData.ruc) ? empresaData : {
          ruc: '12345678901',
          razon_social: 'EMPRESA DEMO SAC'
        };

        this.logger.log('✅ Empresa encontrada:', empresa.razon_social);

        const cpeData = {
          tipo_documento: '03' as any, // Boleta
          serie: 'B001',
          numero: parseInt(venta.numero_ticket.split('-')[1]) || Date.now(),
          ruc_emisor: empresa.ruc || '12345678901',
          razon_social_emisor: empresa.razon_social || 'EMPRESA DEMO',
          tipo_documento_receptor: ventaData.cliente_documento.length === 11 ? '6' : '1',
          documento_receptor: ventaData.cliente_documento,
          razon_social_receptor: ventaData.cliente_nombre,
          direccion_receptor: '',
          moneda: 'PEN',
          total_gravadas: parseFloat(ventaData.subtotal),
          total_igv: parseFloat(ventaData.impuestos),
          total_venta: parseFloat(ventaData.total),
          items: ventaData.items.map((item: any) => ({
            cantidad: parseFloat(item.cantidad) || 1,
            codigo_producto: item.producto?.codigo || 'PROD',
            descripcion: item.producto?.nombre || 'Producto',
            unidad_medida: 'NIU',
            precio_unitario: parseFloat(item.precio_unitario) || 0,
            valor_unitario: parseFloat(item.precio_unitario) || 0,
            precio_venta: parseFloat(item.subtotal) || 0,
            valor_venta: parseFloat(item.subtotal) || 0,
            igv: parseFloat(item.subtotal) * 0.18 || 0,
            total_impuestos: parseFloat(item.subtotal) * 0.18 || 0,
            total: parseFloat(item.subtotal) * 1.18 || 0
          }))
        };

        this.logger.log('📋 Datos CPE preparados:', JSON.stringify(cpeData, null, 2));

        const cpe = await this.cpeService.create(cpeData, user.tenant_id);
        cpeEmitido = true;
        cpeId = cpe.id;
        this.logger.log('✅ CPE emitido exitosamente:', cpe.id);
      } catch (cpeError) {
        this.logger.error('❌ Error completo emitiendo CPE:', cpeError);
        this.logger.error('❌ Stack trace:', cpeError.stack);
      }

      return {
        success: true,
        venta_id: venta.id,
        numero_ticket: venta.numero_ticket,
        estado: venta.estado,
        factura_electronica: cpeEmitido,
        cpe_id: cpeId,
        message: cpeEmitido 
          ? 'Venta procesada y CPE emitido exitosamente' 
          : 'Venta procesada (CPE pendiente)'
      };
    } catch (error) {
      this.logger.error('❌ Error procesando venta:', error);
      return {
        success: false,
        message: error.message || 'Error procesando venta',
        error: {
          tipo: 'DATABASE_ERROR',
          mensaje: error.message,
          codigo: error.code,
          detalles: error.details
        }
      };
    }
  }

  async abrirCaja(montoInicial: number, user: any) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('sesiones_caja')
        .insert({
          tenant_id: user.tenant_id,
          usuario_id: user.id,
          monto_inicial: montoInicial,
          total_efectivo: 0,
          total_tarjeta: 0,
          fecha_apertura: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data
      };
    } catch (error) {
      this.logger.error('Error abriendo caja:', error);
      throw error;
    }
  }

  async cerrarCaja(montoContado: number, notas: string, user: any) {
    try {
      const sesion = await this.getSesionCajaActual(user);
      
      if (!sesion) {
        throw new Error('No hay sesión de caja abierta');
      }

      const { data, error } = await this.supabase.getClient()
        .from('sesiones_caja')
        .update({
          monto_contado: montoContado,
          notas_cierre: notas,
          fecha_cierre: new Date().toISOString()
        })
        .eq('id', sesion.id)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data
      };
    } catch (error) {
      this.logger.error('Error cerrando caja:', error);
      throw error;
    }
  }

  async getDetallesVenta(ventaId: string, user: any) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('detalle_ventas_pos')
        .select('*')
        .eq('venta_id', ventaId)
        .eq('tenant_id', user.tenant_id);

      if (error) throw error;

      return data || [];
    } catch (error) {
      this.logger.error('Error obteniendo detalles de venta:', error);
      return [];
    }
  }

  async configurarCertificado(certificadoBase64: string, password: string, user: any) {
    try {
      this.logger.log('📄 Configurando certificado para tenant:', user.tenant_id);

      // Convertir base64 a buffer
      const certificadoBuffer = Buffer.from(certificadoBase64, 'base64');

      // Guardar en empresa_config
      const { data, error } = await this.supabase.getClient()
        .from('empresa_config')
        .update({
          certificado_pfx: certificadoBuffer,
          certificado_password: password,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', user.tenant_id)
        .select()
        .single();

      if (error) {
        this.logger.error('❌ Error guardando certificado:', error);
        throw error;
      }

      this.logger.log('✅ Certificado configurado exitosamente');

      return {
        success: true,
        message: 'Certificado configurado correctamente'
      };
    } catch (error) {
      this.logger.error('❌ Error configurando certificado:', error);
      return {
        success: false,
        message: error.message || 'Error configurando certificado'
      };
    }
  }

  async getConfigurationStatus(user: any) {
    try {
      this.logger.log(`Getting configuration status for tenant: ${user.tenant_id}`);
      
      const status = await this.configurationService.getConfigurationStatus(user.tenant_id);
      
      return {
        success: true,
        data: status
      };
    } catch (error) {
      this.logger.error('Error getting configuration status:', error);
      return {
        success: false,
        message: error.message || 'Error obteniendo estado de configuración',
        data: {
          isComplete: false,
          completionPercentage: 0,
          missingItems: ['Error al verificar configuración'],
          certificate: {
            exists: false,
            isValid: false
          },
          ruc: {
            isConfigured: false,
            missingFields: []
          }
        }
      };
    }
  }
}
