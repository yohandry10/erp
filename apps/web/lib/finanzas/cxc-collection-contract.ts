const object = (v: any) => v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const live = (v: any) => object(v) && ['offline', 'cached', 'queued', 'pending', 'from_cache'].every(k => v[k] === undefined || v[k] === false)
const money = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < .000001
const civil = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
const fail = (): never => { throw new Error('No se pudo verificar el recibo del cobro. Se conservan los datos para reintentar la misma operación.') }

export type CxcCollectionExpectation = {
  tenantId: string; actorId: string
  cuenta: { id: string; cliente_id: string; moneda: string; total: number }
  payload: { monto: number; fecha_pago: string; metodo_pago: string; idempotency_key: string; cuenta_bancaria_id?: string; referencia?: string; notas?: string }
}

export function confirmCxcCollection(response: any, expected: CxcCollectionExpectation): void {
  const { tenantId, actorId, cuenta, payload: sent } = expected
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(cuenta.id) || !uuid(cuenta.cliente_id) || !/^[A-Z]{3}$/.test(cuenta.moneda)
    || !money(cuenta.total) || !money(sent.monto) || sent.monto <= 0 || sent.monto > cuenta.total || !civil(sent.fecha_pago)
    || !['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'].includes(sent.metodo_pago)
    || typeof sent.idempotency_key !== 'string' || sent.idempotency_key.trim() !== sent.idempotency_key || sent.idempotency_key.length < 8 || sent.idempotency_key.length > 200
    || ['referencia', 'notas'].some(k => sent[k as 'referencia' | 'notas'] !== undefined && (typeof sent[k as 'referencia' | 'notas'] !== 'string' || !sent[k as 'referencia' | 'notas']?.trim() || sent[k as 'referencia' | 'notas'] !== sent[k as 'referencia' | 'notas']?.trim()))
    || (sent.metodo_pago === 'EFECTIVO' ? sent.cuenta_bancaria_id !== undefined : !uuid(sent.cuenta_bancaria_id) || !sent.referencia)) fail()
  const d = response?.data, p = d?.pago, fingerprint = p?.metadata?.request_fingerprint
  if (!live(response) || response.success !== true || !live(d) || typeof d.idempotent_replay !== 'boolean'
    || d.id !== cuenta.id || d.tenant_id !== tenantId || d.cliente_id !== cuenta.cliente_id || d.moneda !== cuenta.moneda
    || d.total !== cuenta.total || !money(d.saldo) || d.saldo > d.total || !['PARCIAL', 'CANCELADO'].includes(d.estado)
    || (d.estado === 'CANCELADO' ? d.saldo !== 0 : d.saldo <= 0 || d.saldo >= d.total)
    || ['monto_total', 'monto_original'].some(k => d[k] !== undefined && d[k] !== d.total)
    || ['monto_pendiente', 'saldo_pendiente'].some(k => d[k] !== undefined && d[k] !== d.saldo)
    || !live(p) || !uuid(p.id) || p.tenant_id !== tenantId || p.cuenta_id !== cuenta.id || p.usuario_id !== actorId
    || p.tipo !== 'PAGO' || p.source !== 'finanzas.cxc.atomic' || p.moneda !== cuenta.moneda || !uuid(p.event_id)
    || p.monto !== sent.monto || p.fecha_pago !== sent.fecha_pago || p.metodo_pago !== sent.metodo_pago || p.idempotency_key !== sent.idempotency_key
    || p.cuenta_bancaria_id !== (sent.cuenta_bancaria_id || null) || p.referencia !== (sent.referencia || null) || p.notas !== (sent.notas || null)
    || !live(p.metadata) || !/^[0-9a-f]{64}$/i.test(fingerprint || '')) fail()
  if (sent.metodo_pago === 'EFECTIVO') {
    const m = d.movimiento_caja
    if (d.movimiento_bancario !== null || !live(m) || !uuid(m.id) || m.tenant_id !== tenantId || m.usuario_id !== actorId
      || !uuid(m.sesion_caja_id) || p.metadata.sesion_caja_id !== m.sesion_caja_id || m.tipo_movimiento !== 'INGRESO'
      || m.monto !== sent.monto || m.referencia_tipo !== 'cxc_pago' || m.referencia_documento !== p.id || !live(m.metadata)
      || m.metadata.request_fingerprint !== fingerprint || m.metadata.cxc_id !== cuenta.id || m.metadata.pago_id !== p.id || m.metadata.idempotency_key !== sent.idempotency_key) fail()
  } else {
    const m = d.movimiento_bancario
    if (d.movimiento_caja !== null || !live(m) || !uuid(m.id) || m.tenant_id !== tenantId || m.created_by !== actorId
      || m.cxc_id !== cuenta.id || m.cliente_id !== cuenta.cliente_id || m.cuenta_bancaria_id !== sent.cuenta_bancaria_id || m.tipo !== 'ABONO'
      || m.monto !== sent.monto || m.fecha !== sent.fecha_pago || m.metodo_pago !== sent.metodo_pago || m.referencia !== sent.referencia
      || m.idempotency_key !== sent.idempotency_key + ':bank' || !live(m.metadata) || m.metadata.request_fingerprint !== fingerprint
      || m.metadata.pago_id !== p.id || m.metadata.event_id !== p.event_id) fail()
  }
}
