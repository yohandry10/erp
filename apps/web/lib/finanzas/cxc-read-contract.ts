export type CxcReadScope = { tenantId: string; actorId: string }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const flags = ['offline', 'cached', 'pending', 'queued', 'from_cache']
const invalid = (): never => { throw new Error('La respuesta de la cuenta por cobrar está incompleta.') }
const object = (value: any): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || flags.some(flag => value[flag])) return invalid()
  return value
}
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const money = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  && value >= 0 && Number.isSafeInteger(Math.round(value * 100))
const date = (value: unknown): value is string => text(value) && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10)
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0

function checkScope(scope: CxcReadScope) {
  if (!uuid.test(scope.tenantId) || !uuid.test(scope.actorId)) return invalid()
}

export function readCxcRow(value: any, scope: CxcReadScope): Record<string, any> {
  checkScope(scope)
  const row = object(value), customer = object(row.clientes)
  const estado = row.estado === 'VENCIDA' ? 'VENCIDO' : row.estado
  const customerDocument = customer.documento_numero
  const validCustomerDocument = customerDocument === null || text(customerDocument)
    || (typeof customerDocument === 'number' && Number.isSafeInteger(customerDocument) && customerDocument >= 0)
  const validNumber = /^\d+$/.test(String(row.numero ?? '')) && Number(row.numero) > 0
    || text(row.numero) && row.numero === row.numero.trim() && row.numero.length <= 4096
      && row.event_source === 'migracion.apertura' && text(row.external_id)
      && object(row.metadata).origen === 'migracion_apertura'
  if (!uuid.test(row.id || '') || row.tenant_id !== scope.tenantId || !uuid.test(row.cliente_id || '')
    || customer.id !== row.cliente_id || !text(customer.razon_social)
    || !Object.prototype.hasOwnProperty.call(customer, 'documento_numero')
    || !validCustomerDocument
    || (customer.tenant_id != null && customer.tenant_id !== scope.tenantId)
    || !text(row.serie) || !validNumber
    || !text(row.tipo_documento) || !['PENDIENTE', 'PARCIAL', 'CANCELADO', 'VENCIDO'].includes(estado)
    || !/^[A-Z]{3}$/.test(row.moneda || '') || !date(row.fecha_emision) || !date(row.fecha_vencimiento)
    || !money(row.total) || !money(row.saldo) || row.saldo > row.total
    || (estado === 'CANCELADO' && row.saldo !== 0)) return invalid()
  for (const key of ['monto_total', 'monto_original']) if (row[key] != null && row[key] !== row.total) return invalid()
  for (const key of ['monto_pendiente', 'saldo_pendiente']) if (row[key] != null && row[key] !== row.saldo) return invalid()
  return { ...row, estado, clientes: { ...customer, documento_numero: customerDocument === null ? null : String(customerDocument) } }
}

export async function loadCxcList(get: (endpoint: string) => Promise<any>, endpoint: string, scope: CxcReadScope) {
  checkScope(scope)
  let rows: any[] = [], total: number | null = null, pages = 1
  const url = new URL(endpoint, 'http://localhost')
  for (let page = 1; page <= pages; page += 1) {
    url.searchParams.set('page', String(page)); url.searchParams.set('limit', '50')
    const response = object(await get(url.pathname + url.search)), pagination = object(response.pagination)
    if (response.success !== true || !Array.isArray(response.data)
      || pagination.page !== page || pagination.limit !== 50 || !count(pagination.total) || !count(pagination.totalPages)
      || pagination.totalPages !== Math.ceil(pagination.total / 50) || (total !== null && total !== pagination.total)) return invalid()
    total = pagination.total; pages = pagination.totalPages
    const next = response.data.map(row => readCxcRow(row, scope))
    for (const row of next) {
      if ((url.searchParams.get('estado') && row.estado !== url.searchParams.get('estado'))
        || (url.searchParams.get('cliente_id') && row.cliente_id !== url.searchParams.get('cliente_id'))
        || (url.searchParams.get('desde') && row.fecha_vencimiento.slice(0, 10) < url.searchParams.get('desde')!)
        || (url.searchParams.get('hasta') && row.fecha_vencimiento.slice(0, 10) > url.searchParams.get('hasta')!)) return invalid()
    }
    const expected = Math.min(50, Math.max(0, total - (page - 1) * 50))
    if (next.length !== expected) return invalid()
    rows = [...rows, ...next]
  }
  if (rows.length !== total || new Set(rows.map(row => row.id)).size !== rows.length) return invalid()
  cxcPendingBalances(rows)
  return rows
}

export function cxcPendingBalances(rows: any[]) {
  const cents: Record<string, number> = {}
  for (const row of rows) {
    if (row.estado === 'CANCELADO') continue
    const value = (cents[row.moneda] || 0) + Math.round(row.saldo * 100)
    if (!Number.isSafeInteger(value)) return invalid()
    cents[row.moneda] = value
  }
  return Object.fromEntries(Object.entries(cents).map(([currency, value]) => [currency, value / 100]))
}

export async function loadCxcCustomers(get: (endpoint: string) => Promise<any>, endpoint: string, scope: CxcReadScope) {
  checkScope(scope)
  const response = object(await get(endpoint))
  if (response.success !== true || !Array.isArray(response.data)) return invalid()
  for (const value of response.data) {
    const row = object(value)
    if (!uuid.test(row.id || '') || row.tenant_id !== scope.tenantId || !text(row.razon_social)) return invalid()
  }
  if (new Set(response.data.map((row: any) => row.id)).size !== response.data.length) return invalid()
  return response.data as any[]
}

export function readCxcHistory(response: any, id: string, scope: CxcReadScope) {
  const envelope = object(response)
  if ('success' in envelope && envelope.success !== true) return invalid()
  const row = readCxcRow('success' in envelope ? envelope.data : envelope, scope)
  if (!uuid.test(id) || row.id !== id || !Array.isArray(row.pagos)) return invalid()
  for (const entry of row.pagos) {
    const payment = object(entry)
    if (!uuid.test(payment.id || '') || payment.tenant_id !== scope.tenantId || payment.cuenta_id !== id
      || !date(payment.fecha_pago) || !money(payment.monto) || payment.monto <= 0
      || payment.moneda !== row.moneda || !text(payment.metodo_pago)) return invalid()
  }
  if (new Set(row.pagos.map((payment: any) => payment.id)).size !== row.pagos.length) return invalid()
  return { ...row, monto_total: row.total, monto_pendiente: row.saldo }
}
