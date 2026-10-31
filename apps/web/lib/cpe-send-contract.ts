const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const unavailable = (value: any) => !value || value.success === false || value.offline || value.pending || value.queued
export type CpeSendIntent = { version: 1; cpeId: string; key: string; payload: Record<string, never> }
export const cpeSendKey = (tenantId: string, cpeId: string) => `cpe.send:${tenantId}:${cpeId}`
export function readCpeSendIntent(raw: string | null, tenantId: string, cpeId: string): CpeSendIntent | null {
  if (!raw) return null
  const value = JSON.parse(raw)
  if (!value || value.version !== 1 || !uuid.test(tenantId) || !uuid.test(cpeId) || value.cpeId !== cpeId
    || value.key !== cpeSendKey(tenantId, cpeId) || !value.payload || Array.isArray(value.payload) || Object.keys(value.payload).length !== 0) {
    throw new Error('No se pudo recuperar el intento de envío. Verifique el comprobante antes de continuar.')
  }
  return value
}
export function cpeSendReceipt(response: any, cpeId: string): { resultKind: 'ACCEPTED' | 'PENDING'; operationId: string } {
  const value = response?.data
  const cpe = value?.cpe
  if (unavailable(response) || unavailable(value) || response.success !== true || value.success !== true
    || !uuid.test(value.operationId || '') || typeof value.claimed !== 'boolean' || typeof value.idempotent !== 'boolean'
    || value.reason !== null && value.reason !== 'TERMINAL' || !['ACCEPTED', 'PENDING'].includes(value.resultKind)
    || !cpe || cpe.id !== cpeId || !uuid.test(cpe.id || '') || cpe.simulated_origin !== false
    || cpe.pais != null && cpe.pais !== 'PE' || !('documento_id' in cpe) || cpe.documento_id !== null && !uuid.test(cpe.documento_id || '')
    || typeof cpe.serie !== 'string' || !cpe.serie.trim() || !/^\d+$/.test(String(cpe.numero)) || Number(cpe.numero) <= 0
    || value.estado !== cpe.estado || value.resultKind === 'ACCEPTED' && (cpe.estado !== 'ACEPTADO' || cpe.sunat_status !== 'ACCEPTED')
    || value.resultKind === 'PENDING' && (cpe.estado !== 'ENVIADO' || cpe.sunat_status !== 'SENDING')) {
    throw new Error('El envío no devolvió la confirmación completa de esta operación y comprobante.')
  }
  return { resultKind: value.resultKind, operationId: value.operationId }
}
