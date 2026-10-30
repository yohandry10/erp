export type CpeCreationIntent = { key: string; payload: Record<string, any> }
export type CpeCreationDraft = { version: 1; form: Record<string, any>; client: any; intent: CpeCreationIntent | null }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const finite = (value: unknown) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value))
const sameMoney = (actual: unknown, expected: unknown) => finite(actual) && finite(expected) && Math.abs(Number(actual) - Number(expected)) < 0.000001
const validForm = (value: any) => value && ['tipoComprobante','serie','clienteId','clienteTipoDocumento','clienteRuc','clienteRazonSocial','clienteDireccion','fechaEmision','fechaVencimiento','moneda','condicionPago','medioPago','tipoOperacion','observaciones'].every(key => typeof value[key] === 'string')
  && Array.isArray(value.items) && value.items.length > 0 && value.items.length <= 200 && value.items.every((item: any) => item && typeof item.descripcion === 'string' && typeof item.codigo === 'string' && ['cantidad','valorUnitario','precioUnitario','descuento','igv','total'].every(key => finite(item[key])))
  && Array.isArray(value.arcaTributos) && finite(value.plazoPagoDias) && finite(value.arcaConcepto)

/** Sólo el rechazo explícito y en vivo anterior al escritor libera los datos. */
export function cpeCreationInputNotApplied(error: unknown): boolean {
  const value = error as { status?: unknown; data?: any } | null
  return value?.status === 400 && value.data?.statusCode === 400
    && value.data.error === 'CPE_CREATION_INPUT_NOT_APPLIED'
    && !value.data.offline && !value.data.pending && !value.data.queued
}

export function readCpeCreationDraft(raw: string | null): CpeCreationDraft | null {
  if (!raw) return null
  const value = JSON.parse(raw)
  if (!value || value.version !== 1 || !validForm(value.form) || value.client !== null && (!value.client || !uuid.test(value.client.id || '') || value.client.id !== value.form.clienteId)
    || value.intent !== null && (!value.intent || typeof value.intent.key !== 'string' || !value.intent.key.startsWith('cpe-ui-') || !uuid.test(value.intent.key.slice(7))
      || !value.intent.payload || value.intent.payload.idempotency_key !== value.intent.key || !Array.isArray(value.intent.payload.items)
      || value.intent.payload.items.length !== value.form.items.length || !finite(value.intent.payload.total) || !finite(value.intent.payload.subtotal) || !finite(value.intent.payload.totalIgv)
      || ['tipoComprobante','fechaEmision','fechaVencimiento','moneda','condicionPago','observaciones'].some(key => value.intent.payload[key] !== value.form[key])
      || (value.intent.payload.cliente_id || '') !== value.form.clienteId
      || value.intent.payload.items.some((item: any, index: number) => !item || item.codigo !== value.form.items[index].codigo || item.descripcion !== value.form.items[index].descripcion
        || !sameMoney(item.cantidad,value.form.items[index].cantidad) || !sameMoney(item.valorUnitario,value.form.items[index].valorUnitario)))) {
    throw new Error('No se pudo recuperar el borrador de emisión. Verifique los comprobantes antes de continuar.')
  }
  return value
}

/** El endpoint devuelve el CPE completo sin un sobre success; vacío no confirma. */
export function cpeCreationReceipt(response: any, intent: CpeCreationIntent): any {
  const value = response?.data ?? response
  const request = intent.payload
  if (!response || response.success === false || response.offline || response.pending || response.queued || !value || value.success === false || value.offline || value.pending || value.queued
    || !uuid.test(value.id || '') || !uuid.test(value.documento_id || value.documentoId || '') || value.documento_id && value.documentoId && value.documento_id !== value.documentoId
    || typeof value.serie !== 'string' || !value.serie.trim() || !/^\d+$/.test(String(value.numero)) || !Number.isSafeInteger(Number(value.numero)) || Number(value.numero) <= 0
    || !['BORRADOR','FIRMADO','ENVIADO','ACEPTADO','ERROR','RECHAZADO'].includes(value.estado)
    || value.moneda !== request.moneda || String(value.fecha_emision).slice(0,10) !== request.fechaEmision
    || String(value.tipo_documento) !== String(request.tipoComprobante) || request.serie && value.serie !== request.serie
    || request.clienteRuc && String(value.documento_receptor).trim() !== String(request.clienteRuc).trim()
    || !sameMoney(value.total, request.total) || !sameMoney(value.total_igv, request.totalIgv)
    || !Array.isArray(value.items) || value.items.length !== request.items.length
    || value.items.some((item: any, index: number) => !item || String(item.codigo ?? '').trim() !== String(request.items[index].codigo ?? '').trim()
      || String(item.descripcion ?? '').trim() !== String(request.items[index].descripcion ?? '').trim() || !sameMoney(item.cantidad,request.items[index].cantidad))) {
    throw new Error('La emisión no devolvió la confirmación completa del comprobante y sus importes.')
  }
  return value
}
