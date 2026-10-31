export interface InvoiceScope { tenantId: string; actorId: string; orderId: string }
export interface InvoiceLine { id: string; productId: string; description: string; quantity: number; price: number; subtotal: number }
export interface InvoiceSnapshot {
  id: string; tenantId: string; number: string; clientId: string; clientDocument: string | null
  currency: string; subtotal: number; igv: number; total: number; lines: InvoiceLine[]
}
export interface InvoiceIntent {
  version: 1; tenantId: string; actorId: string; orderId: string; createdAt: string
  stage: 'GENERATE' | 'VERIFY'; fiscalKey: string; body: '{}'
  documentType: '01' | '03'; logistics: boolean; snapshot: InvoiceSnapshot
}
export interface InvoiceOrder { snapshot: InvoiceSnapshot; state: string; invoiceId: string | null; billed: number[]; dispatched: number[] }
export interface InvoiceGenerationReceipt { success: true; factura_id: string; sugerir_gre?: boolean; is_demo_representation?: boolean; warnings?: string[] }
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const amount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Math.abs(v * 100 - Math.round(v * 100)) < 0.00001
const sameMoney = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100)
const live = (v: Record<string, any>) => ['cached', 'queued', 'offline', 'pending'].every(k => v[k] === undefined || v[k] === false)
const civilDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === v.slice(0, 10)
const invoiceNumber = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0 || typeof v === 'string' && /^\d{1,8}$/.test(v) && Number(v) > 0
const exactKeys = (v: Record<string, any>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k))
function validScope(s: InvoiceScope) { return uuid(s.tenantId) && uuid(s.actorId) && uuid(s.orderId) }
function fail(): never { throw new Error('Se necesita una respuesta completa en vivo del pedido y su comprobante vinculado.') }
export function invoiceIntentKey(s: InvoiceScope): string {
  if (!validScope(s)) throw new Error('No se pudo identificar la empresa y el usuario del pedido.')
  return `erp.sales.invoice-generation.pending.v1.${s.tenantId}:${s.actorId}:${s.orderId}`
}
export function invoiceFiscalKey(s: InvoiceScope): string { return `ventas.cpe.factura:${s.tenantId}:${s.orderId}` }
function validSnapshot(v: unknown, s: InvoiceScope): v is InvoiceSnapshot {
  if (!object(v) || !exactKeys(v, ['id','tenantId','number','clientId','clientDocument','currency','subtotal','igv','total','lines']) ||
      v.id !== s.orderId || v.tenantId !== s.tenantId || !text(v.number) || !uuid(v.clientId) ||
      !(v.clientDocument === null || text(v.clientDocument)) || !/^[A-Z]{3}$/.test(v.currency) ||
      !amount(v.subtotal) || !amount(v.igv) || !amount(v.total) || !sameMoney(v.total, v.subtotal + v.igv) ||
      !Array.isArray(v.lines) || v.lines.length < 1 || v.lines.length > 999) return false
  const seen = new Set<string>()
  for (const l of v.lines) {
    if (!object(l) || !exactKeys(l, ['id','productId','description','quantity','price','subtotal']) || !uuid(l.id) || seen.has(l.id) ||
        !uuid(l.productId) || !text(l.description) || !amount(l.quantity) || l.quantity <= 0 || !amount(l.price) || !amount(l.subtotal) ||
        !sameMoney(l.subtotal, l.quantity * l.price)) return false
    seen.add(l.id)
  }
  return sameMoney(v.subtotal, v.lines.reduce((sum: number, l: InvoiceLine) => sum + l.subtotal, 0))
}
export function readInvoiceOrder(value: unknown, s: InvoiceScope): InvoiceOrder {
  if (!validScope(s) || !object(value) || value.success !== true || !live(value) || !object(value.data) || !live(value.data)) fail()
  const d = value.data
  if (d.id !== s.orderId || d.tenant_id !== s.tenantId || !text(d.estado) || !Array.isArray(d.detalle) ||
      !(d.factura_id === null || d.factura_id === undefined || uuid(d.factura_id))) fail()
  const document = d.clientes?.documento_numero ?? d.clientes?.numero_documento ?? d.clientes?.ruc ?? null
  const snapshot: InvoiceSnapshot = { id: d.id, tenantId: d.tenant_id, number: d.numero, clientId: d.cliente_id,
    clientDocument: document === null ? null : String(document).trim(), currency: d.moneda, subtotal: d.subtotal, igv: d.igv, total: d.total,
    lines: d.detalle.map((l: any) => {
      if (!object(l) || !live(l) || l.pedido_id !== s.orderId || l.tenant_id !== s.tenantId) fail()
      return { id: l.id, productId: l.producto_id, description: l.descripcion, quantity: l.cantidad, price: l.precio_unitario, subtotal: l.subtotal }
    }) }
  if (!validSnapshot(snapshot, s)) fail()
  const billed = d.detalle.map((l: any) => l.cantidad_facturada)
  const dispatched = d.detalle.map((l: any) => l.cantidad_despachada)
  if (billed.some((q: unknown, n: number) => !amount(q) || q > snapshot.lines[n].quantity) ||
      dispatched.some((q: unknown, n: number) => !amount(q) || q > snapshot.lines[n].quantity)) fail()
  return { snapshot, state: d.estado, invoiceId: d.factura_id || null, billed, dispatched }
}
export function invoiceOrderCanGenerate(o: InvoiceOrder, logistics: boolean): boolean {
  return !o.invoiceId && (o.state === 'LISTO_FACTURAR' || !logistics && o.state === 'CONFIRMADO') &&
    o.billed.every(q => q === 0) && (!logistics || o.dispatched.every((q, n) => q === o.snapshot.lines[n].quantity))
}
export function sameInvoiceSnapshot(a: InvoiceSnapshot, b: InvoiceSnapshot): boolean { return JSON.stringify(a) === JSON.stringify(b) }
export function newInvoiceIntent(o: InvoiceOrder, s: InvoiceScope, documentType: '01' | '03', logistics: boolean): InvoiceIntent {
  if (!validScope(s) || !validSnapshot(o.snapshot, s) || !invoiceOrderCanGenerate(o, logistics)) throw new Error('El pedido ya no está listo para generar este comprobante. Actualice la consulta.')
  return { version: 1, ...s, createdAt: new Date().toISOString(), stage: 'GENERATE', fiscalKey: invoiceFiscalKey(s), body: '{}', documentType, logistics, snapshot: o.snapshot }
}
export function readInvoiceIntent(raw: string, s: InvoiceScope): InvoiceIntent {
  try {
    if (!validScope(s) || raw.length > 131072) throw new Error()
    const v = JSON.parse(raw)
    if (!object(v) || !exactKeys(v, ['version','tenantId','actorId','orderId','createdAt','stage','fiscalKey','body','documentType','logistics','snapshot']) ||
        v.version !== 1 || v.tenantId !== s.tenantId || v.actorId !== s.actorId || v.orderId !== s.orderId ||
        !text(v.createdAt) || !/^\d{4}-\d{2}-\d{2}T/.test(v.createdAt) || !Number.isFinite(Date.parse(v.createdAt)) ||
        !['GENERATE','VERIFY'].includes(v.stage) || v.fiscalKey !== invoiceFiscalKey(s) || v.body !== '{}' ||
        !['01','03'].includes(v.documentType) || typeof v.logistics !== 'boolean' || !validSnapshot(v.snapshot, s)) throw new Error()
    return v as unknown as InvoiceIntent
  } catch { throw new Error('La generación pendiente no se puede recuperar con seguridad. Se conserva sin reemplazarla.') }
}
export function readInvoiceGenerationReceipt(v: unknown): InvoiceGenerationReceipt {
  if (!object(v) || v.success !== true || !live(v) || !uuid(v.factura_id) ||
      (v.sugerir_gre !== undefined && typeof v.sugerir_gre !== 'boolean') ||
      (v.is_demo_representation !== undefined && typeof v.is_demo_representation !== 'boolean') ||
      (v.warnings !== undefined && (!Array.isArray(v.warnings) || v.warnings.some((w: unknown) => !text(w))))) fail()
  return v as InvoiceGenerationReceipt
}
export function confirmInvoiceFromOrder(i: InvoiceIntent, o: InvoiceOrder, value: unknown, receipt?: InvoiceGenerationReceipt): InvoiceGenerationReceipt {
  if (!sameInvoiceSnapshot(i.snapshot, o.snapshot) || !['FACTURADO','COMPLETADO','COMPLETADO_CON_GRE'].includes(o.state) ||
      !uuid(o.invoiceId) || o.billed.some((q, n) => q !== i.snapshot.lines[n].quantity) ||
      !object(value) || value.success !== true || !live(value) || !object(value.data) || !live(value.data)) fail()
  const c = value.data
  if (c.id !== o.invoiceId || receipt && receipt.factura_id !== c.id || !uuid(c.documento_id) ||
      c.tipo_documento !== i.documentType || !text(c.serie) || !invoiceNumber(c.numero) || !civilDate(c.fecha_emision) ||
      !['BORRADOR','FIRMADO','ENVIADO','ACEPTADO','ACEPTADO_CON_OBSERVACIONES','PENDIENTE','VALIDADO'].includes(c.estado) ||
      c.tenant_id !== undefined && c.tenant_id !== i.tenantId || c.pedido_id !== undefined && c.pedido_id !== i.orderId ||
      c.moneda !== i.snapshot.currency || !amount(c.total_venta) || !sameMoney(c.total_venta, i.snapshot.total) ||
      !amount(c.total_igv) || !sameMoney(c.total_igv, i.snapshot.igv) ||
      !['total_gravadas','total_exoneradas','total_inafectas','total_exportacion'].every(k => amount(c[k])) ||
      !sameMoney(c.total_gravadas + c.total_exoneradas + c.total_inafectas + c.total_exportacion, i.snapshot.subtotal) ||
      i.snapshot.clientDocument !== null && String(c.documento_receptor ?? '').trim() !== i.snapshot.clientDocument ||
      !Array.isArray(c.items) || c.items.length !== i.snapshot.lines.length || typeof c.simulated_origin !== 'boolean') fail()
  for (let n = 0; n < c.items.length; n += 1) {
    const l = c.items[n]; const expected = i.snapshot.lines[n]
    if (!object(l) || !live(l) || !text(l.codigo) || !text(l.unidad) || !amount(l.igv) || l.descripcion !== expected.description || !amount(l.cantidad) || l.cantidad !== expected.quantity ||
        !amount(l.precio_unitario) || !sameMoney(l.precio_unitario, expected.price) || !amount(l.valor_venta) || !sameMoney(l.valor_venta, expected.subtotal)) fail()
  }
  if (!sameMoney(c.items.reduce((sum: number, l: any) => sum + l.igv, 0), i.snapshot.igv)) fail()
  return receipt || { success: true, factura_id: c.id, sugerir_gre: false,
    is_demo_representation: c.pais_codigo === 'CO' && c.simulated_origin === true,
    warnings: c.pais_codigo === 'CO' && c.simulated_origin === true ? ['Muestra demo local, sin transmisión ni validez DIAN.'] : [] }
}
