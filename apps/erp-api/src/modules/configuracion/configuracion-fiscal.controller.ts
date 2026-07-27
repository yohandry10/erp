import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TaxCalculatorService } from '../../shared/utils/tax-calculator';

/**
 * Controlador para obtener la configuración fiscal del tenant
 * Expone la tasa de IGV/IVA y otras configuraciones fiscales
 */
@Controller('configuracion-fiscal')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('configuracion.read')
export class ConfiguracionFiscalController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly taxCalculator: TaxCalculatorService,
  ) {}

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
    }

    // ✅ FIX H09: Si no hay configuración, obtener defaults desde TaxCalculatorService
    // que a su vez los obtiene de la tabla configuracion_fiscal global
    if (!config) {
      try {
        const taxConfig = await this.taxCalculator.getTaxConfig(user.tenant_id);
        
        return {
          success: true,
          data: {
            pais_id: taxConfig.paisId || 1,
            tasa_igv: taxConfig.tasaIgv,
            moneda_principal: taxConfig.moneda,
            impuesto_principal_nombre: taxConfig.nombreImpuesto,
            impuesto_principal_porcentaje: taxConfig.tasaIgv,
            retencion_renta_porcentaje: taxConfig.retencionRenta || 0.08,
            percepcion_porcentaje: 0.01,
            detraccion_porcentaje: 0.10,
          },
        };
      } catch (err) {
        console.error('Error obteniendo configuración fiscal desde TaxCalculator:', err);
        
        // Último fallback: valores hardcodeados de Perú
        return {
          success: true,
          data: {
            pais_id: 1,
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
    }

    return {
      success: true,
      data: config,
    };
  }
}
