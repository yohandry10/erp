import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';

export type RrhhCountryCode = 'PE' | 'AR' | 'CO';

export interface RrhhCountryContext {
  codigo: RrhhCountryCode;
  moneda: 'PEN' | 'ARS' | 'COP';
  locale: 'es-PE' | 'es-AR' | 'es-CO';
  simbolo: 'S/' | '$';
  documentoLaboral: 'DNI' | 'CUIL' | 'CC';
}

const COUNTRY_CONTEXTS: Record<RrhhCountryCode, RrhhCountryContext> = {
  PE: {
    codigo: 'PE',
    moneda: 'PEN',
    locale: 'es-PE',
    simbolo: 'S/',
    documentoLaboral: 'DNI',
  },
  AR: {
    codigo: 'AR',
    moneda: 'ARS',
    locale: 'es-AR',
    simbolo: '$',
    documentoLaboral: 'CUIL',
  },
  CO: {
    codigo: 'CO',
    moneda: 'COP',
    locale: 'es-CO',
    simbolo: '$',
    documentoLaboral: 'CC',
  },
};

@Injectable()
export class RrhhCountryService {
  private readonly logger = new Logger(RrhhCountryService.name);
  private readonly cache = new Map<string, RrhhCountryContext>();

  constructor(private readonly supabaseService: SupabaseService) {}

  async obtenerContexto(tenantId: string): Promise<RrhhCountryContext> {
    if (!tenantId) {
      throw new BadRequestException('Tenant requerido para resolver normativa de RRHH');
    }

    const cached = this.cache.get(tenantId);
    if (cached) return cached;

    const client = this.supabaseService.getClient();
    const { data: empresa, error: empresaError } = await client
      .from('empresa_config')
      .select('pais, moneda_defecto')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (empresaError && empresaError.code !== 'PGRST116') {
      this.logger.warn(
        `No se pudo resolver país desde empresa_config para tenant ${tenantId}: ${empresaError.message}`,
      );
    }

    let codigo = String(empresa?.pais || '').trim().toUpperCase();
    let moneda = String(empresa?.moneda_defecto || '').trim().toUpperCase();

    if (!codigo) {
      const { data: tenant, error: tenantError } = await client
        .from('tenants')
        .select('pais')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantError && tenantError.code !== 'PGRST116') {
        throw new BadRequestException(
          `No se pudo resolver el país laboral del tenant: ${tenantError.message}`,
        );
      }
      codigo = String(tenant?.pais || '').trim().toUpperCase();
    }

    if (codigo !== 'PE' && codigo !== 'AR' && codigo !== 'CO') {
      throw new BadRequestException(
        'El tenant debe tener país PE, AR o CO configurado antes de utilizar RRHH',
      );
    }

    const base = COUNTRY_CONTEXTS[codigo];
    const expectedCurrency = base.moneda;
    if (moneda && moneda !== expectedCurrency) {
      throw new BadRequestException(
        `La moneda ${moneda} no corresponde al país ${codigo}; se esperaba ${expectedCurrency}`,
      );
    }

    const context = { ...base };
    this.cache.set(tenantId, context);
    return context;
  }

  invalidar(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
