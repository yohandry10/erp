import http from 'node:http'

const host = '127.0.0.1'
const port = Number(process.env.QA_API_PORT || 14649)
const webOrigin = process.env.QA_WEB_ORIGIN || 'http://127.0.0.1:14611'

const user = {
  id: '00000000-0000-4000-8000-000000000469',
  email: 'qa.comercial469@erp.local',
  nombre: 'Ana',
  apellido: 'Vendedora',
  roles: ['ADMIN'],
  tenant_id: '10000000-0000-4000-8000-000000000469',
  is_super_admin: false,
}

const products = [
  { id: '20000000-0000-4000-8000-000000000461', codigo: 'CAF-001', nombre: 'Café de origen 1 kg', marca: 'Andina', precio_venta: 120, activo: true },
  { id: '20000000-0000-4000-8000-000000000462', codigo: 'FIL-010', nombre: 'Filtro reutilizable', marca: 'Acme', precio_venta: 45, activo: true },
  { id: '20000000-0000-4000-8000-000000000463', codigo: 'MOL-020', nombre: 'Molino profesional', marca: 'Acme', precio_venta: 850, activo: true },
]
const clients = [
  { id: '30000000-0000-4000-8000-000000000461', codigo: 'CLI-001', razon_social: 'Distribuidora Lima SAC', activo: true },
  { id: '30000000-0000-4000-8000-000000000462', codigo: 'CLI-002', razon_social: 'Mercados del Sur EIRL', activo: true },
]
const vendors = [
  user,
  { id: '00000000-0000-4000-8000-000000000468', nombre: 'Luis', apellido: 'Comercial', email: 'luis@erp.local' },
]

let priceLists = [{
  id: '40000000-0000-4000-8000-000000000461', codigo: 'MAYORISTA-LIMA', nombre: 'Mayoristas Lima',
  moneda: 'PEN', prioridad: 100, vendedor_id: user.id, cliente_id: clients[0].id,
  vigencia_desde: '2026-08-01', vigencia_hasta: null, activo: true,
  detalles: [{ id: '41000000-0000-4000-8000-000000000461', producto_id: products[0].id, cantidad_minima: 1, precio_unitario: 90 }],
}]
let commissionRules = [{
  id: '50000000-0000-4000-8000-000000000461', codigo: 'COM-ANDINA', nombre: 'Comisión marca Andina',
  vendedor_id: user.id, producto_id: null, marca: 'Andina', porcentaje: 5, prioridad: 50, activo: true,
}]
const commissionMovements = [
  { id: '51000000-0000-4000-8000-000000000461', tipo: 'DEVENGO', vendedor_id: user.id, moneda: 'PEN', base_comisionable: 500, porcentaje: 5, monto: 25, marca: 'Andina', created_at: '2026-08-10T09:10:00-05:00', producto: products[0], regla: commissionRules[0], snapshot: { marca_origen: 'SNAPSHOT_VENTA' } },
  { id: '51000000-0000-4000-8000-000000000462', tipo: 'REVERSA', vendedor_id: user.id, moneda: 'PEN', base_comisionable: 100, porcentaje: 5, monto: -5, marca: 'Andina', created_at: '2026-08-10T10:15:00-05:00', producto: products[0], regla: commissionRules[0], snapshot: { marca_origen: 'SNAPSHOT_VENTA' } },
  { id: '51000000-0000-4000-8000-000000000463', tipo: 'DEVENGO', vendedor_id: user.id, moneda: 'USD', base_comisionable: 40, porcentaje: 5, monto: 2, marca: 'Acme', created_at: '2026-08-10T11:30:00-05:00', producto: products[1], regla: commissionRules[0], snapshot: { marca_origen: 'SNAPSHOT_VENTA' } },
]

let candidates = Array.from({ length: 12 }, (_, index) => ({
  source_type: index % 3 === 0 ? 'DOCUMENTO' : 'POS',
  source_id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  fecha: `2026-08-10T${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}:00-05:00`,
  numero: index % 3 === 0 ? `F001-${String(800 + index).padStart(8, '0')}` : `T001-${String(700 + index).padStart(8, '0')}`,
  cliente_nombre: index % 2 ? 'Mercados del Sur EIRL' : 'Distribuidora Lima SAC',
  moneda: 'PEN', subtotal: 100 + index * 10, impuestos: 18 + index * 1.8, total: 118 + index * 11.8,
}))
candidates.push({
  source_type: 'POS', source_id: '60000000-0000-4000-8000-000000000099',
  fecha: '2026-08-10T15:00:00-05:00', numero: 'T002-00000099', cliente_nombre: 'Cliente exterior',
  moneda: 'USD', subtotal: 40, impuestos: 7.2, total: 47.2,
})

let batches = [{
  id: '70000000-0000-4000-8000-000000000461', numero: 'VC-2026-000001', fecha: '2026-08-09',
  moneda: 'PEN', cantidad_fuentes: 3, subtotal: 300, impuestos: 54, total: 354,
  created_at: '2026-08-09T18:00:00-05:00',
}]
const batchDetails = new Map([[batches[0].id, Array.from({ length: 3 }, (_, index) => ({
  id: `71000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  orden: index + 1, source_type: index === 0 ? 'DOCUMENTO' : 'POS',
  source_id: `72000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  fecha: `2026-08-09T1${index}:00:00-05:00`, documento_numero: `T001-00000${701 + index}`,
  cliente_nombre: 'Distribuidora Lima SAC', moneda: 'PEN', subtotal: 100, impuestos: 18, total: 118,
}))]])

const requests = []

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = status === 204 ? '' : JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': webOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-country-id, cache-control',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    ...extraHeaders,
  })
  response.end(body)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', (chunk) => { raw += chunk })
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (error) { reject(error) }
    })
    request.on('error', reject)
  })
}

function requireIdempotency(request, response) {
  if (String(request.headers['idempotency-key'] || '').length >= 8) return true
  sendJson(response, 400, { success: false, message: 'Idempotency-Key requerido' })
  return false
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname
  requests.push({ method: request.method, path, idempotencyKey: request.headers['idempotency-key'] || null, at: new Date().toISOString() })

  if (request.method === 'OPTIONS') return sendJson(response, 204, {})
  if (path === '/__qa__/state') return sendJson(response, 200, { requests, priceLists, commissionRules, candidates, batches })

  if (path === '/api/auth/login' && request.method === 'POST') {
    return sendJson(response, 200, { access_token: 'qa-token-commercial-469', user }, {
      'set-cookie': 'access_token=qa-token-commercial-469; Path=/; HttpOnly; SameSite=Lax',
    })
  }
  if (path === '/api/auth/profile') return sendJson(response, 200, user)
  if (path === '/api/auth/logout') return sendJson(response, 200, { success: true }, {
    'set-cookie': 'access_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  })
  if (path === '/api/tenants/me') return sendJson(response, 200, { success: true, data: { id: user.tenant_id, nombre: 'ERP QA Comercial', email: user.email, pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' } })
  if (path === '/api/configuration/context/country') return sendJson(response, 200, { success: true, data: { pais_id: 1, paisCodigo: 'PE', monedaDefecto: 'PEN' } })
  if (path === '/api/configuration/context/status') return sendJson(response, 200, { success: true, data: { isComplete: true, isDemo: false, completionPercentage: 100, missingItems: [], certificate: { exists: false, isValid: false }, ruc: { isConfigured: true, missingFields: [] }, fiscal: { isEnabled: false, isReady: false, missingItems: [] } } })
  if (path === '/api/demo/status') return sendJson(response, 200, { is_demo: false, is_expired: false, dias_restantes: 0, can_extend: false })
  if (path === '/api/usuarios-sistema/me/permissions') return sendJson(response, 200, { success: true, data: [
    'ventas.precios.ver', 'ventas.precios.gestionar', 'ventas.comisiones.ver', 'ventas.comisiones.gestionar',
    'ventas.consolidados.ver', 'ventas.consolidados.crear', 'inventario.productos.create', 'inventario.productos.update',
  ].map((codigo, index) => ({ id: `perm-${index}`, tenant_id: user.tenant_id, codigo })) })
  if (path === '/api/notifications/unread') return sendJson(response, 200, { success: true, data: { count: 0 } })
  if (path === '/api/notifications') return sendJson(response, 200, { success: true, data: [] })

  if (path === '/api/ventas/comercial/catalogos') return sendJson(response, 200, { success: true, data: { productos: products, clientes: clients, vendedores: vendors } })
  if (path === '/api/ventas/comercial/listas-precios' && request.method === 'GET') return sendJson(response, 200, { success: true, data: priceLists })
  if (path === '/api/ventas/comercial/listas-precios' && request.method === 'POST') {
    if (!requireIdempotency(request, response)) return
    const body = await readBody(request)
    const list = { id: `40000000-0000-4000-8000-${String(priceLists.length + 2).padStart(12, '0')}`, ...body, activo: true }
    priceLists = [list, ...priceLists]
    return sendJson(response, 201, { success: true, data: { lista: list, idempotent: false } })
  }
  const priceStatus = path.match(/^\/api\/ventas\/comercial\/listas-precios\/([0-9a-f-]+)\/estado$/i)
  if (priceStatus && request.method === 'PATCH') {
    if (!requireIdempotency(request, response)) return
    const body = await readBody(request)
    priceLists = priceLists.map((row) => row.id === priceStatus[1] ? { ...row, activo: Boolean(body.activo) } : row)
    return sendJson(response, 200, { success: true, data: { id: priceStatus[1], activo: Boolean(body.activo) } })
  }
  if (path === '/api/ventas/comercial/comisiones/reglas' && request.method === 'GET') return sendJson(response, 200, { success: true, data: commissionRules })
  if (path === '/api/ventas/comercial/comisiones/reglas' && request.method === 'POST') {
    if (!requireIdempotency(request, response)) return
    const body = await readBody(request)
    const rule = { id: `50000000-0000-4000-8000-${String(commissionRules.length + 2).padStart(12, '0')}`, ...body, activo: true }
    commissionRules = [rule, ...commissionRules]
    return sendJson(response, 201, { success: true, data: { regla: rule, idempotent: false } })
  }
  const commissionStatus = path.match(/^\/api\/ventas\/comercial\/comisiones\/reglas\/([0-9a-f-]+)\/estado$/i)
  if (commissionStatus && request.method === 'PATCH') {
    if (!requireIdempotency(request, response)) return
    const body = await readBody(request)
    commissionRules = commissionRules.map((row) => row.id === commissionStatus[1] ? { ...row, activo: Boolean(body.activo) } : row)
    return sendJson(response, 200, { success: true, data: { id: commissionStatus[1], activo: Boolean(body.activo) } })
  }
  if (path === '/api/ventas/comercial/comisiones/movimientos') return sendJson(response, 200, { success: true, data: commissionMovements })
  if (path === '/api/ventas/comercial/consolidados/candidatos') return sendJson(response, 200, { success: true, data: candidates })
  if (path === '/api/ventas/comercial/consolidados' && request.method === 'GET') return sendJson(response, 200, { success: true, data: batches })
  const batchDetail = path.match(/^\/api\/ventas\/comercial\/consolidados\/([0-9a-f-]+)$/i)
  if (batchDetail && request.method === 'GET') {
    const batch = batches.find((row) => row.id === batchDetail[1])
    return batch
      ? sendJson(response, 200, { success: true, data: { ...batch, detalles: batchDetails.get(batch.id) || [] } })
      : sendJson(response, 404, { success: false, message: 'Consolidado no encontrado' })
  }
  if (path === '/api/ventas/comercial/consolidados' && request.method === 'POST') {
    if (!requireIdempotency(request, response)) return
    const body = await readBody(request)
    const selected = body.fuentes.map((source) => candidates.find((row) => row.source_type === source.tipo && row.source_id === source.id)).filter(Boolean)
    const currency = selected[0]?.moneda || 'PEN'
    if (!selected.length || selected.some((row) => row.moneda !== currency)) return sendJson(response, 400, { success: false, message: 'Fuentes inválidas o monedas distintas' })
    const batch = {
      id: `70000000-0000-4000-8000-${String(batches.length + 2).padStart(12, '0')}`,
      numero: `VC-2026-${String(batches.length + 1).padStart(6, '0')}`, fecha: '2026-08-10', moneda: currency,
      cantidad_fuentes: selected.length,
      subtotal: selected.reduce((sum, row) => sum + row.subtotal, 0),
      impuestos: selected.reduce((sum, row) => sum + row.impuestos, 0),
      total: selected.reduce((sum, row) => sum + row.total, 0), created_at: new Date().toISOString(),
    }
    const details = selected.map((row, index) => ({
      id: `71000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`, orden: index + 1,
      source_type: row.source_type, source_id: row.source_id, fecha: row.fecha,
      documento_numero: row.numero, cliente_nombre: row.cliente_nombre, moneda: row.moneda,
      subtotal: row.subtotal, impuestos: row.impuestos, total: row.total,
    }))
    batches = [batch, ...batches]
    batchDetails.set(batch.id, details)
    const selectedKeys = new Set(body.fuentes.map((source) => `${source.tipo}:${source.id}`))
    candidates = candidates.filter((row) => !selectedKeys.has(`${row.source_type}:${row.source_id}`))
    return sendJson(response, 201, { success: true, data: { consolidado: batch, detalles: details, idempotent: false, accounting_events_created: 0 } })
  }

  if (path === '/api/inventario/almacenes') return sendJson(response, 200, { success: true, data: [{ id: '80000000-0000-4000-8000-000000000461', codigo: 'ALM-01', nombre: 'Almacén principal' }] })
  if (path === '/api/inventario/categorias') return sendJson(response, 200, { success: true, data: [{ id: '81000000-0000-4000-8000-000000000461', codigo: 'CAFE', nombre: 'Café y accesorios' }] })
  if (path === '/api/inventario/productos') return sendJson(response, 200, { success: true, data: products })

  return sendJson(response, 200, { success: true, data: [] })
})

server.listen(port, host, () => process.stdout.write(`qa-commercial-469 listening on http://${host}:${port}\n`))
const shutdown = () => server.close(() => process.exit(0))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
