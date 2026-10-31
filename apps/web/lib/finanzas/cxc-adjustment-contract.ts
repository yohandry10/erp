const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const live = (v: any) => object(v) && ['cached', 'offline', 'queued', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false)
const money = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < .000001
const civil = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const text = (v: any) => typeof v === 'string' && !!v.trim() && v === v.trim()
const normalized = (v?: string) => v?.replace(/^ +| +$/g, '') || null
const fail = (): never => { throw new Error('No se pudo verificar el recibo original. Se conserva la solicitud para reintentar la misma operación.') }
export type CxcAdjustmentAccount = { id: string; cliente_id: string; total: number; saldo: number; moneda: string; documento_id?: string | null; fecha_vencimiento?: string | null }
export type CxcAdjustmentScope = { tenantId: string; actorId: string }
export type CxcReschedulePayload = { nueva_fecha_vencimiento: string; motivo?: string; comentarios?: string }
export type CxcNotePayload = { monto: number; codigo_motivo: string; motivo: string; documento_id: string; idempotency_key: string }

function base(response: any, expected: CxcAdjustmentScope & { cuenta: CxcAdjustmentAccount; key: string }, kind: string) {
  const { tenantId, actorId, cuenta, key } = expected, d = response?.data, r = d?.receipt
  if (![tenantId, actorId, cuenta.id, cuenta.cliente_id].every(uuid) || !money(cuenta.total) || !money(cuenta.saldo) || cuenta.saldo > cuenta.total
    || !/^[A-Z]{3}$/.test(cuenta.moneda) || !text(key) || key.length < 8 || key.length > 200 || key !== key.toLowerCase()
    || !live(response) || response.success !== true || !live(d) || !live(r) || r.version !== 1 || r.kind !== kind || !uuid(r.operation_id)
    || r.tenant_id !== tenantId || r.actor_id !== actorId || r.cuenta_id !== cuenta.id || r.idempotency_key !== key
    || !/^[0-9a-f]{64}$/.test(r.request_fingerprint || '') || !live(r.request)) fail()
  return { d, r }
}

export function confirmCxcReschedule(response: any, expected: CxcAdjustmentScope & { cuenta: CxcAdjustmentAccount; key: string; payload: CxcReschedulePayload }) {
  const { d, r } = base(response, expected, 'CXC_REPROGRAM'), { cuenta, payload: sent } = expected
  if (!civil(sent.nueva_fecha_vencimiento) || d.id !== cuenta.id || d.tenant_id !== expected.tenantId || d.cliente_id !== cuenta.cliente_id
    || d.moneda !== cuenta.moneda || d.total !== cuenta.total || !money(d.saldo) || d.saldo > d.total
    || d.fecha_vencimiento !== sent.nueva_fecha_vencimiento || !['PENDIENTE', 'PARCIAL', 'VENCIDO'].includes(d.estado)
    || typeof r.idempotent !== 'boolean' || !(r.fecha_anterior === null || civil(r.fecha_anterior))
    || r.request.nueva_fecha_vencimiento !== sent.nueva_fecha_vencimiento || r.request.motivo !== normalized(sent.motivo)
    || r.request.comentarios !== normalized(sent.comentarios)
    || ['monto_total', 'monto_original'].some(k => d[k] != null && d[k] !== d.total)
    || ['monto_pendiente', 'saldo_pendiente'].some(k => d[k] != null && d[k] !== d.saldo)) fail()
}

export function confirmCxcCreditNote(response: any, expected: CxcAdjustmentScope & { cuenta: CxcAdjustmentAccount; key: string; payload: CxcNotePayload; country: string }) {
  const { d, r } = base(response, expected, 'CXC_CREDIT_NOTE_CREATE'), { cuenta, payload: sent, country } = expected
  const type = country === 'CO' ? '91' : country === 'PE' ? '07' : ''
  if (!type || !uuid(cuenta.documento_id) || sent.documento_id !== cuenta.documento_id || !money(sent.monto) || sent.monto <= 0 || sent.monto > cuenta.saldo
    || !text(sent.motivo) || sent.motivo.length < 3 || sent.motivo.length > 500 || sent.idempotency_key !== expected.key
    || !(country === 'CO' ? ['1', '2', '3', '4', '5'] : ['04', '05', '08', '09', '10', '11', '12', '13']).includes(sent.codigo_motivo)
    || d.success !== true || !uuid(d.documento_id) || !uuid(d.cpe_id) || !uuid(d.event_id) || d.documento_origen_id !== sent.documento_id
    || d.tipo_documento !== type || d.total !== sent.monto || typeof d.serie !== 'string' || !d.serie.trim()
    || !/^\d+$/.test(String(d.numero)) || Number(d.numero) <= 0 || d.estado !== 'BORRADOR' || d.requiere_firma !== true
    || d.financial_effect_status !== 'PENDING_FISCAL_ACCEPTANCE' || d.cxc_reduction !== 0 || d.saldo_favor !== 0 || d.cxc_id !== null || d.saldo_favor_id !== null
    || typeof d.idempotent !== 'boolean' || r.documento_origen_id !== sent.documento_id
    || r.request.monto !== sent.monto || r.request.codigo_motivo !== sent.codigo_motivo || r.request.motivo !== sent.motivo) fail()
}
