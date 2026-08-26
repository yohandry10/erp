import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export const DEMO_EXTERNAL_TRANSPORT_BLOCKED = 'DEMO_EXTERNAL_TRANSPORT_BLOCKED';

/**
 * Preflight de sólo lectura para impedir que una demo reserve o cambie estado
 * antes de llegar a cualquier adaptador fiscal externo.
 */
export async function assertExternalFiscalTransportAllowed(
  supabaseService: Pick<SupabaseService, 'getPublicClient'>,
  tenantId: string,
): Promise<void> {
  const normalizedTenantId = String(tenantId ?? '').trim();
  if (!normalizedTenantId) {
    throw new ServiceUnavailableException({
      message: 'No se pudo verificar el tenant antes del transporte fiscal',
      code: 'FISCAL_TRANSPORT_TENANT_REQUIRED',
    });
  }

  const { data, error } = await supabaseService
    .getPublicClient()
    .from('empresa_config')
    .select('is_demo')
    .eq('tenant_id', normalizedTenantId)
    .maybeSingle();

  if (error || !data || typeof (data as any).is_demo !== 'boolean') {
    throw new ServiceUnavailableException({
      message: 'No se pudo verificar de forma segura si el tenant puede usar transporte fiscal',
      code: 'FISCAL_TRANSPORT_PREFLIGHT_UNAVAILABLE',
    });
  }

  if ((data as any).is_demo === true) {
    throw new BadRequestException({
      message: 'La demo puede generar y firmar documentos, pero no transmite ni consulta servicios fiscales externos.',
      code: DEMO_EXTERNAL_TRANSPORT_BLOCKED,
      is_demo_restriction: true,
    });
  }
}
