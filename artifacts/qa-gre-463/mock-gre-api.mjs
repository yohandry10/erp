import http from 'node:http'

const port = Number(process.env.PORT || 14622)
const tenantId = '46310000-0000-4000-8000-000000000001'
const actorId = '46310000-0000-4000-8000-000000000002'
const now = () => new Date().toISOString()
const evidence = []
const keys = new Map()

const guides = [{
  id: '46310000-0000-4000-8000-000000000101',
  numero: 'T001-00000001',
  estado: 'ACEPTADO',
  destinatario: 'Cliente Logístico Existente SAC',
  direccionDestino: 'Av. Destino 100, Lima',
  ubigeoDestino: '150101',
  fechaTraslado: '2026-08-11',
  fechaCreacion: now(),
  modalidad: 'TRANSPORTE_PUBLICO',
  motivo: 'VENTA',
  pesoTotal: 12.5,
  transportista: 'Transportes QA SAC',
  transportistaDocumento: '20555555555',
  observaciones: 'GRE aceptada de control',
  sunatStatus: 'ACCEPTED',
  numeroSunat: 'T001-00000001',
  items: [{ descripcion: 'Producto control', cantidad: 2, unidadMedida: 'NIU' }],
}]

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, idempotency-key, x-country-id',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  })
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : String(body))
}

async function body(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function actionKey(req, payload = {}) {
  return String(req.headers['idempotency-key'] || payload.idempotencyKey || '').trim()
}

function requireKey(req, res, payload = {}) {
  const key = actionKey(req, payload)
  if (key.length < 8) {
    send(res, 400, { success: false, message: 'Idempotency-Key requerida' })
    return null
  }
  return key
}

function replayOrStore(key, fingerprint, response, res) {
  const prior = keys.get(key)
  if (prior && prior.fingerprint !== fingerprint) {
    send(res, 409, { success: false, message: 'GRE_IDEMPOTENCY_COLLISION' })
    return true
  }
  if (prior) {
    send(res, 200, prior.response)
    return true
  }
  keys.set(key, { fingerprint, response })
  return false
}

function stats() {
  return {
    greEmitidas: guides.filter((guide) => guide.fechaCreacion.slice(0, 10) === now().slice(0, 10)).length,
    totalGre: guides.length,
    enTransito: guides.filter((guide) => ['FIRMADO', 'ENVIADO'].includes(guide.estado)).length,
    completados: guides.filter((guide) => guide.estado === 'ACEPTADO').length,
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/api/auth/profile' && req.method === 'GET') {
    return send(res, 200, { id: actorId, email: 'gre.qa@local.invalid', nombre: 'Auditor', apellido: 'GRE', tenant_id: tenantId, roles: ['ADMIN'], is_super_admin: true })
  }
  if (path === '/api/configuration/context/country' && req.method === 'GET') {
    return send(res, 200, { data: { pais_id: 1, paisCodigo: 'PE', paisNombre: 'Perú', monedaDefecto: 'PEN' } })
  }
  if (path === '/api/tenants/me' && req.method === 'GET') {
    return send(res, 200, { id: tenantId, codigo: 'QA-GRE-463', nombre: 'QA aislada GRE 463', pais: 'PE', activo: true })
  }
  if (path === '/api/usuarios-sistema/me/permissions' && req.method === 'GET') {
    return send(res, 200, ['gre.guias.ver', 'gre.guias.emitir', 'gre.guias.enviar', 'gre.guias.consultar', 'gre.guias.reenviar', 'gre.guias.descargar_xml', 'gre.reportes.ver'])
  }
  if (path === '/api/gre/stats' && req.method === 'GET') return send(res, 200, { success: true, data: stats() })
  if (path === '/api/gre/guias' && req.method === 'GET') {
    const modalidad = url.searchParams.get('modalidad')
    const estado = url.searchParams.get('estado')
    const desde = url.searchParams.get('desde')
    const hasta = url.searchParams.get('hasta')
    const filtered = guides.filter((guide) => (!modalidad || guide.modalidad === modalidad)
      && (!estado || guide.estado === estado)
      && (!desde || guide.fechaTraslado >= desde)
      && (!hasta || guide.fechaTraslado <= hasta))
    evidence.push({ action: 'LIST', query: Object.fromEntries(url.searchParams) })
    return send(res, 200, { success: true, data: filtered })
  }
  if (path === '/api/gre/guias' && req.method === 'POST') {
    const payload = await body(req)
    const key = requireKey(req, res, payload)
    if (!key) return
    if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.some((item) => !item.descripcion || Number(item.cantidad) <= 0)) {
      return send(res, 400, { success: false, message: 'GRE_ITEMS_REQUIRED' })
    }
    const fingerprint = JSON.stringify(payload)
    const id = '46310000-0000-4000-8000-000000000202'
    const guide = guides.find((item) => item.id === id) || {
      id,
      numero: 'T001-00000002',
      estado: 'FIRMADO',
      destinatario: payload.destinatario,
      direccionDestino: payload.direccionDestino,
      ubigeoDestino: payload.ubigeoDestino,
      fechaTraslado: payload.fechaTraslado,
      fechaCreacion: now(),
      modalidad: payload.modalidad,
      motivo: payload.motivo,
      pesoTotal: Number(payload.pesoTotal),
      observaciones: payload.observaciones,
      transportista: payload.transportista,
      transportistaDocumento: payload.transportistaDocumento,
      placaVehiculo: payload.placaVehiculo,
      licenciaConducir: payload.licenciaConducir,
      conductorDocumentoTipo: payload.conductorDocumentoTipo,
      conductorDocumentoNumero: payload.conductorDocumentoNumero,
      conductorNombres: payload.conductorNombres,
      conductorApellidos: payload.conductorApellidos,
      sunatStatus: 'READY',
      items: payload.items,
    }
    const response = { success: true, data: guide, message: `GRE ${guide.numero} creada y firmada` }
    if (replayOrStore(key, fingerprint, response, res)) return
    guides.unshift(guide)
    evidence.push({ action: 'CREATE', key, payload })
    return send(res, 201, response)
  }

  const detail = path.match(/^\/api\/gre\/guias\/([0-9a-f-]+)$/i)
  if (detail && req.method === 'GET') {
    const guide = guides.find((item) => item.id === detail[1])
    return guide ? send(res, 200, { success: true, data: guide }) : send(res, 404, { success: false, message: 'GRE no encontrada' })
  }
  const lifecycle = path.match(/^\/api\/gre\/guias\/([0-9a-f-]+)\/(firmar|enviar-sunat|reenviar|consultar-sunat|anular)$/i)
  if (lifecycle && req.method === 'POST') {
    const payload = await body(req)
    const key = requireKey(req, res, payload)
    if (!key) return
    const guide = guides.find((item) => item.id === lifecycle[1])
    if (!guide) return send(res, 404, { success: false, message: 'GRE no encontrada' })
    const action = lifecycle[2]
    const fingerprint = JSON.stringify({ id: guide.id, action, payload })
    const nextState = action === 'firmar' ? 'FIRMADO'
      : action === 'enviar-sunat' || action === 'reenviar' ? 'ENVIADO'
        : action === 'consultar-sunat' ? 'ACEPTADO'
          : 'ANULADO'
    const response = { success: true, data: { ...guide, estado: nextState } }
    if (replayOrStore(key, fingerprint, response, res)) return
    guide.estado = nextState
    guide.sunatStatus = nextState === 'ACEPTADO' ? 'ACCEPTED' : nextState === 'ENVIADO' ? 'SENT' : guide.sunatStatus
    evidence.push({ action: action.toUpperCase(), key, guideId: guide.id, payload })
    return send(res, 200, { success: true, data: guide })
  }

  if (path === '/api/gre/reporte' && req.method === 'GET') {
    return send(res, 200, 'serie,numero,estado\nT001,00000001,ACEPTADO', 'text/csv; charset=utf-8')
  }
  if (path === '/__qa__/state' && req.method === 'GET') return send(res, 200, { guides, evidence, keys: [...keys.keys()] })
  if (req.method === 'GET') return send(res, 200, { success: true, data: [] })
  return send(res, 404, { success: false, message: `Ruta mock no implementada: ${req.method} ${path}` })
})

server.listen(port, '127.0.0.1', () => console.log(`GRE 463 mock API listening on http://127.0.0.1:${port}`))
