import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';

/**
 * CPE Helper Service
 * Utility functions for CPE module to keep main service clean
 */
@Injectable()
export class CpeHelperService {
  private readonly logger = new Logger(CpeHelperService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Get fiscal authority name based on tenant's country
   * Returns 'SUNAT' for Peru, 'DIAN' for Colombia, etc.
   */
  async getFiscalAuthorityName(tenantId: string): Promise<string> {
    try {
      const { data: empresa } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('pais_id')
        .eq('tenant_id', tenantId)
        .single();

      if (!empresa?.pais_id) {
        return 'SUNAT'; // Default to Peru
      }

      const { data: pais } = await this.supabaseService
        .getClient()
        .from('paises')
        .select('codigo_iso')
        .eq('id', empresa.pais_id)
        .single();

      const fiscalAuthorities: Record<string, string> = {
        PE: 'SUNAT',
        CO: 'DIAN',
        CL: 'SII',
        MX: 'SAT',
        EC: 'SRI',
      };

      return fiscalAuthorities[pais?.codigo_iso] || 'autoridad fiscal';
    } catch (error) {
      this.logger.error(`Error getting fiscal authority name for tenant ${tenantId}:`, error);
      return 'autoridad fiscal';
    }
  }

  /**
   * Get country code for tenant
   */
  async getCountryCode(tenantId: string): Promise<string> {
    try {
      const { data: empresa } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('pais_id')
        .eq('tenant_id', tenantId)
        .single();

      if (!empresa?.pais_id) {
        return 'PE'; // Default to Peru
      }

      const { data: pais } = await this.supabaseService
        .getClient()
        .from('paises')
        .select('codigo_iso')
        .eq('id', empresa.pais_id)
        .single();

      return pais?.codigo_iso || 'PE';
    } catch (error) {
      this.logger.error(`Error getting country code for tenant ${tenantId}:`, error);
      return 'PE';
    }
  }

  /**
   * Check if tenant is from specific country
   */
  async isCountry(tenantId: string, countryCode: string): Promise<boolean> {
    const code = await this.getCountryCode(tenantId);
    return code === countryCode;
  }
}
