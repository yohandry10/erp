/** Respuesta del endpoint POS worker: no confundir un cuerpo vacío con cero pendientes. */
export function parseWorkerBatchResult(value: unknown): { procesadas: number; errores: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Respuesta inválida del lote POS');
  }
  const data = value as Record<string, unknown>;
  if (data.success === false || !Number.isSafeInteger(data.procesadas) || !Number.isSafeInteger(data.errores)
    || Number(data.procesadas) < 0 || Number(data.errores) < 0) {
    throw new Error('Respuesta inválida del lote POS');
  }
  return { procesadas: data.procesadas as number, errores: data.errores as number };
}

/** success sólo confirma la RPC; el resultado fiscal puede seguir siendo un error. */
export function parseCpeDeliveryResult(value: unknown): 'ACCEPTED' | 'PENDING' | 'REJECTED' {
  const data = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
  if (!data || data.success !== true || typeof data.operationId !== 'string' || !data.operationId
    || ['IN_FLIGHT', 'RETRY_LATER'].includes(String(data.reason))) {
    throw new Error('Operación fiscal incompleta o pendiente de reintento');
  }
  if (data.resultKind === 'ACCEPTED' || data.resultKind === 'PENDING' || data.resultKind === 'REJECTED') {
    return data.resultKind;
  }
  throw new Error('Operación fiscal sin resultado válido');
}

export function cpeWorkerIdentity(value: { tenant_id?: unknown; created_by?: unknown }): { tenantId: string; actorId: string } {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof value.tenant_id !== 'string' || !uuid.test(value.tenant_id)
    || typeof value.created_by !== 'string' || !uuid.test(value.created_by)) {
    throw new Error('El CPE requiere tenant y actor de origen válidos para el worker');
  }
  return { tenantId: value.tenant_id, actorId: value.created_by };
}

export function parseGreDeliveryResult(value: unknown): 'ACEPTADO' | 'ENVIADO' {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as any : null;
  if (data?.reason === 'ALREADY_ACCEPTED' && data.gre?.estado === 'ACEPTADO') return 'ACEPTADO';
  if (data?.operation?.estado === 'TERMINADO' && ['ACEPTADO', 'ENVIADO'].includes(data.gre?.estado)) {
    return data.gre.estado;
  }
  throw new Error('La operación GRE no confirma un envío o aceptación');
}
