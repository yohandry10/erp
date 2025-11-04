import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseService } from '../../shared/supabase/supabase.service';

/**
 * Controlador para obtener la configuración fiscal del tenant
 * Expone la tasa de IGV/IVA y otras configuraciones fiscales
 */
@Controller('configuracion-fiscal')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConfiguracionFiscalController {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Obtiene la configuración fiscal del tenant actual
   * Incluye tasa de IGV/IVA, moneda principal, país, etc.
   */
  @Get()
  async obtenerConfiguracionFiscal(@CurrentUser() user: any) {
    const client = this.supabase.getClient();

    // Obtener configuración fiscal del tenant
    const { data: config, error } = await client
      .from('configuracion_fiscal')
      .select(`
        id,
        pais_id,
        tasa_igv,
        moneda_principal,
        impuesto_principal_nombre,
        impuesto_principal_porcentaje,
        retencion_renta_porcentaje,
        percepcion_porcentaje,
        detraccion_porcentaje,
        created_at,
        updated_at
      `)
      .eq('tenant_id', user.tenant_id)
      .maybeSingle();

    if (error) {
      console.error('Error obteniendo configuración fiscal:', error);
      
      // Retornar configuración por defecto si no existe
      return {
        success: true,
        data: {
          pais_id: 1, // Perú por defecto
          tasa_igv: 0.18,
          moneda_principal: 'PEN',
          impuesto_principal_nombre: 'IGV',
          impuesto_principal_porcentaje: 0.18,
          retencion_renta_porcentaje: 0.08,
          percepcion_porcentaje: 0.01,
          detraccion_porcentaje: 0.10,
        },
      };
    }

    // Si no hay configuración, retornar valores por defecto
    if (!config) {
      return {
        success: true,
        data: {
          pais_id: 1, // Perú por defecto
          tasa_igv: 0.18,
          moneda_principal: 'PEN',
          impuesto_principal_nombre: 'IGV',
          impuesto_principal_porcentaje: 0.18,
          retencion_renta_porcentaje: 0.08,
          percepcion_porcentaje: 0.01,
          detraccion_porcentaje: 0.10,
        },
      };
    }

    return {
      success: true,
      data: config,
    };
  }
}
