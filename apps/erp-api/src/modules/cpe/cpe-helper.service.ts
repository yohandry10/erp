import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { perfilPaisDelTenant } from './pais-del-tenant';

/**
 * CPE Helper Service
 * Utility functions for CPE module to keep main service clean
 */
@Injectable()
export class CpeHelperService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Nombre de la autoridad fiscal del contribuyente: SUNAT, ARCA o DIAN.
   *
   * Tenía su propia tabla de autoridades, y esa tabla se había quedado sin
   * Argentina mientras listaba Chile, México y Ecuador, que no son países
   * soportados: un contribuyente argentino leía «autoridad fiscal».
   */
  async getFiscalAuthorityName(tenantId: string): Promise<string> {
    const perfil = await perfilPaisDelTenant(this.supabaseService.getClient(), tenantId);
    return perfil.autoridadFiscal;
  }

  /**
   * Código ISO del país del contribuyente.
   */
  async getCountryCode(tenantId: string): Promise<string> {
    const perfil = await perfilPaisDelTenant(this.supabaseService.getClient(), tenantId);
    return perfil.codigo;
  }

  /**
   * Check if tenant is from specific country
   */
  async isCountry(tenantId: string, countryCode: string): Promise<boolean> {
    const code = await this.getCountryCode(tenantId);
    return code === countryCode;
  }
}
