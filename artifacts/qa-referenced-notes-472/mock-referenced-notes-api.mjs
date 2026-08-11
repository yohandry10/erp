import http from 'node:http'

const port = Number(process.argv[2] || 14632)
const tenantId = '47200000-0000-4000-8000-000000000001'
const actorId = '47200000-0000-4000-8000-000000000002'
const originId = '47200000-0000-4000-8000-000000000101'
const originCpeId = '47200000-0000-4000-8000-000000000102'
const user = {
  id: actorId,
  email: 'qa-notes-472@local.test',
  nombre: 'QA', apellido: 'Notas 472',
  roles: ['ADMIN'], tenant_id: tenantId, is_super_admin: false,
}

let notes = []
let requests = []
const keys = new Map()

function json(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    ...headers,
  })
  res.end(JSON.stringify(payload))
}

async function bodyOf(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function mutation(req, path, body) {
  const key = String(req.headers['idempotency-key'] || '')
  requests.push({ method: req.method, path, key, body, at: new Date().toISOString() })
  if (key.length < 8) return { error: 'QA_472_IDEMPOTENCY_KEY_REQUIRED' }
  const fingerprint = JSON.stringify({ path, body })
  const prior = keys.get(key)
  if (prior && prior !== fingerprint) return { error: 'QA_472_IDEMPOTENCY_CONFLICT' }
  if (!prior) keys.set(key, fingerprint)
  return { idempotent: Boolean(prior) }
}

function documents() {
  return [
    {
      id: originCpeId, tipoDocumento: '01', tipoComprobante: 'Factura',
      serie: 'F472', numero: 1, fechaEmision: '2026-08-10',
      cliente: 'Cliente Visual 472', clienteRuc: '20472000001',
      total: 118, moneda: 'PEN', estado: 'ACEPTADO', estadoSunat: 'ACEPTADO',
      fechaCreacion: '2026-08-10T09:00:00.000Z',
    },
    ...notes.map((note) => ({
      id: note.cpeId,
      tipoDocumento: note.type,
      tipoComprobante: note.type === '07' ? 'Nota Crédito' : 'Nota Débito',
      serie: note.serie,
      numero: Number(note.numero),
      fechaEmision: '2026-08-10',
      cliente: 'Cliente Visual 472', clienteRuc: '20472000001',
      total: note.amount, moneda: 'PEN', estado: note.state,
      estadoSunat: note.state === 'ACEPTADO' ? 'ACEPTADO' : 'PENDIENTE',
      fechaCreacion: note.createdAt,
    })),
  ]
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = req.method || 'GET'

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type,idempotency-key,x-country-id',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    })
    return res.end()
  }
  if (method === 'GET' && path === '/__qa__/state') {
    return json(res, 200, { success: true, notes, requests })
  }
  if (method === 'POST' && path === '/__qa__/reset') {
    notes = []; requests = []; keys.clear()
    return json(res, 200, { success: true })
  }
  if (method === 'POST' && path === '/api/auth/login') {
    const body = await bodyOf(req)
    if (body.email !== user.email || body.password !== 'NotesVisual472!') {
      return json(res, 401, { message: 'Credenciales QA 472 inválidas' })
    }
    return json(res, 200, {
      access_token: 'qa-notes-token-472', user, session_token: 'qa-notes-session-472',
    }, { 'set-cookie': 'access_token=qa-notes-token-472; Path=/; HttpOnly; SameSite=Lax' })
  }
  if (method === 'GET' && path === '/api/auth/profile') return json(res, 200, user)
  if (method === 'GET' && path === '/api/paises') return json(res, 200, { success: true, data: [{ id: 1, codigo_iso: 'PE', nombre: 'Perú', nombre_fiscal: 'SUNAT', moneda_codigo: 'PEN', moneda_simbolo: 'S/', activo: true }] })
  if (method === 'GET' && path === '/api/configuration/context/country') return json(res, 200, { success: true, data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', moneda: 'PEN', monedaDefecto: 'PEN', locale: 'es-PE', servicioFiscal: 'SUNAT', tipo_empresa: 'GENERAL' } })
  if (method === 'GET' && (path === '/api/configuration/status' || path === '/api/configuration/context/status' || path === '/api/configuracion/status')) return json(res, 200, { success: true, data: { isComplete: true, completionPercentage: 100, missingItems: [] } })
  if (method === 'GET' && path === '/api/tenants/me') return json(res, 200, { id: tenantId, nombre: 'QA Notas 472', pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' })
  if (method === 'GET' && path === '/api/demo/status') return json(res, 200, { success: true, data: { is_demo: true } })
  if (method === 'GET' && path.includes('/usuarios-sistema/me/permissions')) return json(res, 200, { success: true, data: [
    { id: 'perm-472-1', tenant_id: tenantId, modulo: 'cpe', accion: 'gestionar', recurso: '*' },
    { id: 'perm-472-2', tenant_id: tenantId, modulo: 'ventas', accion: 'gestionar', recurso: '*' },
  ] })
  if (method === 'GET' && path === '/api/notifications') return json(res, 200, { success: true, data: [] })

  if (method === 'GET' && path === '/api/cpe/comprobantes') return json(res, 200, { success: true, data: documents() })
  if (method === 'GET' && path === '/api/cpe/stats') return json(res, 200, { success: true, data: { cpeEmitidosHoy: documents().length, cpeDelMes: documents().length, montoFacturado: 118, rechazados: 0 } })
  if (method === 'GET' && path === '/api/cpe/notas-referenciadas/origenes') return json(res, 200, { success: true, data: [{
    id: originId, tipo_documento: 'FACTURA', serie: 'F472', numero: '00000001',
    receptor_razon_social: 'Cliente Visual 472', moneda: 'PEN', total: 118,
    cpe: { id: originCpeId, estado: 'ACEPTADO' },
  }] })

  if (method === 'POST' && path === '/api/cpe/notas-referenciadas') {
    const body = await bodyOf(req)
    const op = mutation(req, path, body)
    if (op.error) return json(res, 409, { success: false, message: op.error })
    const existing = notes.find((note) => note.key === String(req.headers['idempotency-key']))
    if (existing) return json(res, 200, { success: true, data: { cpe_id: existing.cpeId, serie: existing.serie, numero: existing.numero, estado: existing.state, idempotent: true } })
    if (body.documento_origen_id !== originId || !['07', '08'].includes(body.tipo_documento)) {
      return json(res, 400, { success: false, message: 'QA_472_REFERENCED_SOURCE_REQUIRED' })
    }
    if (body.tipo_documento === '07' && Number(body.monto_total) > 118) {
      return json(res, 400, { success: false, message: 'QA_472_CREDIT_EXCEEDS_SOURCE' })
    }
    const index = notes.length + 1
    const note = {
      key: String(req.headers['idempotency-key']),
      cpeId: `47200000-0000-4000-8000-${String(200 + index).padStart(12, '0')}`,
      documentId: `47200000-0000-4000-8000-${String(300 + index).padStart(12, '0')}`,
      type: body.tipo_documento,
      reason: body.codigo_motivo,
      amount: Number(body.monto_total),
      serie: body.tipo_documento === '07' ? 'FC72' : 'FD72',
      numero: String(index).padStart(8, '0'),
      state: 'BORRADOR', createdAt: new Date().toISOString(),
    }
    notes.push(note)
    return json(res, 201, { success: true, data: { cpe_id: note.cpeId, documento_id: note.documentId, serie: note.serie, numero: note.numero, estado: note.state, requiere_firma: true, idempotent: false } })
  }

  const sign = path.match(/^\/api\/cpe\/notas-referenciadas\/([^/]+)\/firmar$/)
  if (method === 'POST' && sign) {
    const body = await bodyOf(req)
    const op = mutation(req, path, body)
    if (op.error) return json(res, 409, { success: false, message: op.error })
    const note = notes.find((item) => item.cpeId === sign[1])
    if (!note) return json(res, 404, { success: false, message: 'QA_472_NOTE_NOT_FOUND' })
    note.state = 'FIRMADO'
    return json(res, 200, { success: true, data: { cpe_id: note.cpeId, estado: 'FIRMADO', sunat_status: 'READY', idempotent: op.idempotent } })
  }

  const send = path.match(/^\/api\/cpe\/comprobantes\/([^/]+)\/enviar-sunat$/)
  if (method === 'POST' && send) {
    const note = notes.find((item) => item.cpeId === send[1])
    if (!note || note.state !== 'FIRMADO') return json(res, 409, { success: false, message: 'QA_472_SIGNATURE_REQUIRED' })
    note.state = 'ACEPTADO'
    requests.push({ method, path, key: '', body: {}, at: new Date().toISOString() })
    return json(res, 200, { success: true, data: { estado: 'ACEPTADO' } })
  }

  if (method === 'GET') return json(res, 200, { success: true, data: [] })
  return json(res, 404, { success: false, message: `QA_472_UNHANDLED_${method}_${path}` })
})
server.listen(port, '127.0.0.1', () => {
  console.log(`QA_REFERENCED_NOTES_472_READY http://127.0.0.1:${port}`)
  console.log('QA user: qa-notes-472@local.test / NotesVisual472!')
})
