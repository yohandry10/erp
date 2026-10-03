import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { SupabaseService } from '../../../shared/supabase/supabase.service';

export interface TributoIntent {
  tenantId: string;
  actorId: string;
  key?: string;
  operation: 'MONTHLY_SAVE' | 'ANNUAL_SAVE' | 'MONTHLY_RECEIPT' | 'ANNUAL_RECEIPT';
  recordId?: string;
  request: Record<string, unknown>;
}

/** NULL cálculo consulta una intención autorizada sin crear filas. */
export async function mutarTributo(supabase: SupabaseService, intent: TributoIntent, calculo: Record<string, unknown> | null = null) {
  const key = String(intent.key || '').trim();
  if (key.length < 8 || key.length > 255) throw new BadRequestException('Idempotency-Key debe contener entre 8 y 255 caracteres.');
  const { data, error } = await supabase.getClient().rpc('mutar_tributo_peru_tx', {
    p_tenant_id: intent.tenantId, p_actor_id: intent.actorId, p_idempotency_key: key,
    p_operation: intent.operation, p_record_id: intent.recordId || null,
    p_request: intent.request, p_calculo: calculo,
  });
  if (error) {
    if (error.code === '23505') throw new ConflictException('La intención tributaria ya fue utilizada con otra solicitud.');
    if (error.code === '42501' && /TRIBUTO_PERMISSION_REQUIRED|ACCOUNTING_ACTOR_NOT_ACTIVE_IN_TENANT/.test(error.message || '')) throw new ForbiddenException('No tiene permiso vigente para actualizar declaraciones tributarias.');
    if (error.code === 'P0002') throw new NotFoundException('Borrador tributario vigente no encontrado.');
    if (['22023', '23514', '22P02', '22007', '22008'].includes(error.code)) throw new BadRequestException('Solicitud tributaria inválida o bloqueada por observaciones.');
    if (['40001', '55P03'].includes(error.code)) throw new ServiceUnavailableException('No se pudo completar la intención tributaria. Reintente con la misma clave.');
    throw new ServiceUnavailableException('No se pudo recuperar o guardar la intención tributaria. Reintente con la misma clave.');
  }
  if (!data || typeof data !== 'object') throw new ServiceUnavailableException('La operación tributaria no devolvió un resultado válido.');
  return data;
}
