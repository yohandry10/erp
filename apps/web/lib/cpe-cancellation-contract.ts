import type { EstadoAnulacion } from './cpe-read-contract'

export type CancellationAction = 'solicitar' | 'cobro' | 'ajuste' | 'finalizar'
export type CancellationIntent = {
  cpeId: string
  targetId: string
  action: CancellationAction
  key: string
  payload?: { motivo: string; tipo_nota?: '01'; sesion_caja_id?: string }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const actions: CancellationAction[] = ['solicitar','cobro','ajuste','finalizar']
const states = ['BORRADOR','FIRMADO','ENVIADO','ACEPTADO','ERROR','RECHAZADO','ANULADO']
const amount = (value: unknown) => (typeof value === 'number' || typeof value === 'string' && value.trim().length > 0) && Number.isFinite(Number(value)) && Number(value) >= 0
const folio = (value: any) => uuid.test(value?.id || '') && typeof value.serie === 'string' && value.serie.trim().length > 0
  && /^\d+$/.test(String(value.numero)) && Number.isSafeInteger(Number(value.numero)) && Number(value.numero) > 0 && states.includes(value.estado)

export function readCancellationIntent(raw: string | null, cpeId: string): CancellationIntent | null {
  if (!raw) return null
  const value = JSON.parse(raw)
  if (!value || value.cpeId !== cpeId || !uuid.test(cpeId) || !uuid.test(value.targetId || '') || !actions.includes(value.action)
    || typeof value.key !== 'string' || !new RegExp(`^cpe-ui:${value.action}:[0-9a-f-]{36}$`, 'i').test(value.key)
    || (value.action === 'solicitar' && value.targetId !== cpeId)
    || (value.action === 'finalizar' ? value.payload !== undefined
      : typeof value.payload?.motivo !== 'string' || value.payload.motivo.trim().length < 3 || value.payload.motivo.length > 500
        || Object.keys(value.payload).some(key => !['motivo','tipo_nota','sesion_caja_id'].includes(key))
        || (value.action === 'solicitar' ? value.payload.tipo_nota !== '01' || value.payload.sesion_caja_id !== undefined
          : value.payload.tipo_nota !== undefined || value.payload.sesion_caja_id !== undefined && (value.action !== 'cobro' || !uuid.test(value.payload.sesion_caja_id))))) {
    throw new Error('No se pudo recuperar el intento de anulación. Consulte el comprobante antes de continuar.')
  }
  return value
}

export function cancellationEndpoint(intent: CancellationIntent): string {
  if (intent.action === 'solicitar') return `/api/cpe/${intent.cpeId}/anular`
  if (intent.action === 'finalizar') return `/api/cpe/${intent.targetId}/anulacion/finalizar`
  return `/api/cpe/${intent.cpeId}/${intent.action === 'cobro' ? 'cobros' : 'ajustes'}/${intent.targetId}/revertir`
}

export function cancellationConfirmation(response: any, intent: CancellationIntent, state: EstadoAnulacion): any {
  const value = response && 'data' in response ? response.data : response
  if (!response || response.success !== true || response.offline || response.pending || response.queued || !value || value.success !== true
    || value.offline || value.pending || value.queued || typeof value.idempotent !== 'boolean' || state.cpe.id !== intent.cpeId) {
    throw new Error('La operación de anulación no devolvió una confirmación completa en vivo.')
  }
  if (intent.action === 'solicitar') {
    if (!folio(value.cpe_anulado) || value.cpe_anulado.id !== intent.cpeId || !folio(value.nota_credito) || value.nota_credito.id === intent.cpeId
      || !['PENDIENTE_CDR','ANULADO'].includes(value.cpe_anulado.anulacion_estado)
      || typeof value.request_fingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(value.request_fingerprint)
      || state.nota_credito && value.nota_credito.id !== state.nota_credito.id) throw new Error('La solicitud no confirmó la nota vinculada al comprobante.')
    return value
  }
  if (value.cpe_id !== intent.cpeId || value.nota_credito_id !== state.nota_credito?.id) throw new Error('La confirmación corresponde a otro comprobante o nota.')
  if (intent.action === 'finalizar') {
    if (value.nota_credito_id !== intent.targetId || value.participa !== true || value.estado !== 'ANULADO' || !uuid.test(value.outbox_event_id || '')) throw new Error('La anulación final no fue confirmada.')
    return value
  }
  if (value.cxc_id !== state.cxc?.id || value.anulacion?.success !== true || value.anulacion.participa !== true
    || value.anulacion.nota_credito_id !== state.nota_credito?.id
    || !['ANULADO','PENDIENTE_REEMBOLSOS','BLOQUEADO_AJUSTE_REQUIERE_REVERSA'].includes(value.anulacion.estado)) throw new Error('La reversa no confirmó su efecto financiero.')
  if (intent.action === 'cobro') {
    if (value.pago_id !== intent.targetId || !uuid.test(value.reversa_id || '') || !uuid.test(value.event_id || '')
      || !['CAJA','BANCO'].includes(value.medio) || !amount(value.monto_reembolsado) || Number(value.monto_reembolsado) <= 0
      || !amount(value.saldo_cxc_restaurado)
      || !uuid.test((value.medio === 'CAJA' ? value.movimiento_caja_id : value.movimiento_bancario_id) || '')) throw new Error('La devolución no fue confirmada.')
  } else if (value.operacion_id !== intent.targetId || value.ajuste?.success !== true || value.ajuste.operacion_id !== intent.targetId
    || value.ajuste.cxc_id !== state.cxc?.id || value.ajuste.estado_operacion !== 'ANULADO'
    || !uuid.test(value.ajuste.reversa_id || '') || !uuid.test(value.ajuste.event_id || '')) {
    throw new Error('La reversa del ajuste no fue confirmada.')
  }
  return value
}
