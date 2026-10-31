const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fingerprint = /^[0-9a-f]{64}$/i
const methods = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA']
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100))
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
const live = (v: any) => v && !v.offline && !v.cached && !v.pending && !v.queued
const fail = (): never => { throw new Error('El pago no está confirmado. Se conservan los datos para reintentar la misma operación.') }

export type CxpPaymentIntent = {
  tenantId: string; actorId: string; cxpId: string; number: string; currency: string
  providerId: string; total: number
  payload: { monto: number; fecha_pago: string; metodo_pago: string; idempotency_key: string
    cuenta_bancaria_id?: string; referencia?: string; observaciones?: string }
}

export function readCxpPaymentIntent(serialized: string | null, tenantId: string, actorId: string, cxpId: string): CxpPaymentIntent | null {
  if (serialized === null) return null
  let v: CxpPaymentIntent
  try { v = JSON.parse(serialized) } catch { return fail() }
  const p = v?.payload
  const keys = ['monto', 'fecha_pago', 'metodo_pago', 'idempotency_key', 'cuenta_bancaria_id', 'referencia', 'observaciones']
  if (!uuid.test(tenantId) || !uuid.test(actorId) || !uuid.test(cxpId)
    || v?.tenantId !== tenantId || v.actorId !== actorId || v.cxpId !== cxpId
    || !v.number?.trim() || !/^[A-Z]{3}$/.test(v.currency || '') || !uuid.test(v.providerId || '') || !money(v.total)
    || !p || Array.isArray(p) || Object.keys(p).some(key => !keys.includes(key))
    || !money(p.monto) || p.monto <= 0 || p.monto > v.total || Math.abs(p.monto * 100 - Math.round(p.monto * 100)) > 0.000001
    || !date(p.fecha_pago) || !methods.includes(p.metodo_pago)
    || !new RegExp(`^cxp-pago:${cxpId}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, 'i').test(p.idempotency_key || '')
    || (p.metodo_pago === 'EFECTIVO' ? p.cuenta_bancaria_id !== undefined : !uuid.test(p.cuenta_bancaria_id || '') || !p.referencia?.trim())
    || ['referencia', 'observaciones'].some(key => Object.hasOwn(p, key) && (typeof p[key as 'referencia' | 'observaciones'] !== 'string' || !p[key as 'referencia' | 'observaciones']?.trim() || p[key as 'referencia' | 'observaciones'] !== p[key as 'referencia' | 'observaciones']?.trim()))) return fail()
  return v
}

export function confirmCxpPayment(response: any, intent: CxpPaymentIntent): void {
  const d = response?.data, p = d?.pago, c = d?.cxp, sent = intent.payload
  if (!live(response) || response.success !== true || !live(d) || typeof d.idempotent !== 'boolean'
    || !fingerprint.test(d.request_fingerprint || '') || !live(c) || c.id !== intent.cxpId || c.tenant_id !== intent.tenantId
    || c.proveedor_id !== intent.providerId || c.numero_documento !== intent.number || c.moneda !== intent.currency
    || c.total !== intent.total || !money(c.saldo) || c.saldo > c.total || !['PARCIAL', 'PAGADA', 'VENCIDA'].includes(c.estado)
    || (c.estado === 'PAGADA' ? c.saldo !== 0 : c.saldo <= 0 || c.saldo >= c.total)
    || !live(p) || !uuid.test(p.id || '') || p.pago_id !== p.id || p.tenant_id !== intent.tenantId
    || p.idempotency_key !== sent.idempotency_key || p.monto !== sent.monto || p.fecha_pago !== sent.fecha_pago
    || p.metodo_pago !== sent.metodo_pago || p.referencia !== (sent.referencia || null)
    || p.proveedor_id !== intent.providerId || p.metadata?.request_fingerprint !== d.request_fingerprint
    || p.idempotent_replay !== d.idempotent || p.cuenta_bancaria_id !== (sent.cuenta_bancaria_id || null)) return fail()
  if (sent.metodo_pago === 'EFECTIVO') {
    const m = d.movimiento_caja
    if (d.movimiento_bancario !== null || p.cuenta_por_pagar_id !== intent.cxpId || p.usuario_id !== intent.actorId
      || p.moneda !== intent.currency || p.estado !== 'APLICADO' || p.activo !== true || !uuid.test(p.event_id || '')
      || p.notas !== (sent.observaciones || null) || !live(m) || !uuid.test(m.id || '') || m.tenant_id !== intent.tenantId
      || m.usuario_id !== intent.actorId || !uuid.test(m.sesion_caja_id || '') || p.metadata?.sesion_caja_id !== m.sesion_caja_id
      || m.tipo_movimiento !== 'RETIRO' || m.monto !== -sent.monto || m.referencia_tipo !== 'cxp_pago' || m.referencia_documento !== p.id
      || m.metadata?.request_fingerprint !== d.request_fingerprint || m.metadata?.idempotency_key !== sent.idempotency_key
      || m.metadata?.cxp_id !== intent.cxpId || m.metadata?.pago_id !== p.id) return fail()
  } else {
    const m = d.movimiento_bancario
    if (d.movimiento_caja !== null || p.cxp_id !== intent.cxpId || p.created_by !== intent.actorId
      || p.tipo !== 'CARGO' || !uuid.test(p.metadata?.event_id || '') || !live(m) || m.id !== p.id
      || m.tenant_id !== intent.tenantId || m.cxp_id !== intent.cxpId || m.created_by !== intent.actorId || m.tipo !== 'CARGO'
      || m.cuenta_bancaria_id !== sent.cuenta_bancaria_id || m.monto !== sent.monto || m.fecha !== sent.fecha_pago
      || m.metodo_pago !== sent.metodo_pago || m.referencia !== sent.referencia || m.idempotency_key !== sent.idempotency_key
      || m.metadata?.request_fingerprint !== d.request_fingerprint || m.proveedor_id !== intent.providerId) return fail()
  }
}
