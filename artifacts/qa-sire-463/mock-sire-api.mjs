import http from 'node:http'

const port = Number(process.argv[2] || process.env.PORT || 14612)
const tenantId = '46300000-0000-4000-8000-000000000001'
const actorId = '46300000-0000-4000-8000-000000000002'
const generatedId = '46300000-0000-4000-8000-000000000100'
const pendingId = '46300000-0000-4000-8000-000000000101'

const now = () => new Date().toISOString()
const reports = [
  {
    id: generatedId,
    tenant_id: tenantId,
    periodo: '2026-08',
    tipo: 'REG_VEN',
    tipo_display: 'Registro de Ventas',
    estado: 'GENERADO',
    status: 'COMPLETED',
    filename: 'SIRE_REG_VEN_2026-08.txt',
    total_registros: 3,
    created_at: now(),
    contenido_local: 'PERIODO|TIPO|SERIE|NUMERO|TOTAL\n2026-08|01|F463|00000001|118.00',
  },
  {
    id: pendingId,
    tenant_id: tenantId,
    periodo: '2026-08',
    tipo: 'REG_COM',
    tipo_display: 'Registro de Compras',
    estado: 'PENDIENTE',
    status: 'PENDING',
    filename: 'SIRE_REG_COM_2026-08.txt',
    total_registros: 2,
    sunat_ticket: '20260846300001',
    sunat_estado: 'Procesando',
    sunat_codigo_estado: '02',
    created_at: now(),
    contenido_local: 'PERIODO|TIPO|NUMERO|TOTAL\n2026-08|FACTURA|FC01-1|236.00',
  },
]

const operations = new Map([
  [pendingId, [{
    id: '46300000-0000-4000-8000-000000000201',
    accion: 'ACEPTAR_PROPUESTA',
    estado: 'PROCESANDO',
    ticket: '20260846300001',
    solicitado_at: now(),
  }]],
])
const generationKeys = new Map()
const sendKeys = new Map()
const queryKeys = new Map()
const requestEvidence = []

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, idempotency-key, x-country-id',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    ...extraHeaders,
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function keyFor(req) {
  return String(req.headers['idempotency-key'] || '').trim()
}

function requireKey(req, res) {
  const key = keyFor(req)
  if (key.length < 8) {
    send(res, 400, { success: false, message: 'Idempotency-Key requerida' })
    return null
  }
  return key
}

function filterReports(url) {
  return reports.filter((report) => {
    const periodo = url.searchParams.get('periodo')
    const type = url.searchParams.get('tipoReporte')
    const estado = url.searchParams.get('estado')
    const mappedType = type === 'REGISTRO_VENTAS' ? 'REG_VEN'
      : type === 'REGISTRO_COMPRAS' ? 'REG_COM' : type
    return (!periodo || report.periodo === periodo)
      && (!mappedType || report.tipo === mappedType)
      && (!estado || report.estado === estado)
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/api/auth/profile' && req.method === 'GET') {
    return send(res, 200, {
      id: actorId,
      email: 'auditor.sire@local.invalid',
      nombre: 'Auditor',
      apellido: 'SIRE',
      tenant_id: tenantId,
      roles: ['ADMIN'],
      is_super_admin: true,
    })
  }
  if (path === '/api/auth/login' && req.method === 'POST') {
    await readBody(req)
    return send(res, 200, {
      user: { id: actorId, email: 'auditor.sire@local.invalid', tenant_id: tenantId, roles: ['ADMIN'] },
      access_token: 'local-sire-visual-token',
    }, { 'set-cookie': 'access_token=local-sire-visual-token; Path=/; HttpOnly; SameSite=Lax' })
  }
  if (path === '/api/configuration/context/country' && req.method === 'GET') {
    return send(res, 200, { data: { pais_id: 1, paisCodigo: 'PE', paisNombre: 'Perú', monedaDefecto: 'PEN' } })
  }
  if (path === '/api/tenants/me' && req.method === 'GET') {
    return send(res, 200, { id: tenantId, codigo: 'QA-SIRE-463', nombre: 'QA aislada SIRE 463', pais: 'PE', activo: true })
  }
  if (path === '/api/usuarios-sistema/me/permissions' && req.method === 'GET') {
    return send(res, 200, ['sire.read', 'sire.emitir'])
  }

  if (path === '/api/sire/stats' && req.method === 'GET') {
    return send(res, 200, {
      success: true,
      data: {
        reportesDelMes: reports.length,
        registrosTotales: reports.reduce((sum, report) => sum + report.total_registros, 0),
        totalDetalles: 5,
        enviadosASunat: reports.filter((report) => report.estado === 'ENVIADO').length,
        pendientes: reports.filter((report) => ['GENERADO', 'GENERANDO', 'PENDIENTE'].includes(report.estado)).length,
      },
    })
  }
  if (path === '/api/sire/reportes' && req.method === 'GET') {
    return send(res, 200, { success: true, data: filterReports(url) })
  }
  if (path === '/api/sire/generar-reporte' && req.method === 'POST') {
    const key = requireKey(req, res)
    if (!key) return
    const body = await readBody(req)
    const fingerprint = JSON.stringify(body)
    const prior = generationKeys.get(key)
    if (prior && prior.fingerprint !== fingerprint) {
      return send(res, 409, { success: false, message: 'SIRE_GENERATION_IDEMPOTENCY_COLLISION' })
    }
    if (prior) return send(res, 200, { success: true, data: prior.report, message: 'Replay idempotente' })
    const existing = reports.find((report) => report.periodo === body.periodo
      && report.tipo === (body.tipoReporte.includes('COMPRAS') ? 'REG_COM' : 'REG_VEN'))
    const report = existing || {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      periodo: body.periodo,
      tipo: body.tipoReporte.includes('COMPRAS') ? 'REG_COM' : 'REG_VEN',
      tipo_display: body.tipoReporte.includes('COMPRAS') ? 'Registro de Compras' : 'Registro de Ventas',
      estado: 'GENERADO',
      status: 'COMPLETED',
      filename: `SIRE_${body.tipoReporte}_${body.periodo}.txt`,
      total_registros: 4,
      created_at: now(),
      contenido_local: `PERIODO|ORIGEN|TOTAL\n${body.periodo}|SNAPSHOT_DB|354.00`,
    }
    if (!existing) reports.unshift(report)
    generationKeys.set(key, { fingerprint, report })
    requestEvidence.push({ action: 'GENERAR', key, reportId: report.id })
    return send(res, 201, { success: true, data: report, message: 'Reporte SIRE generado' })
  }

  const downloadMatch = path.match(/^\/api\/sire\/reportes\/([0-9a-f-]+)\/download$/i)
  if (downloadMatch && req.method === 'GET') {
    const report = reports.find((item) => item.id === downloadMatch[1])
    return report
      ? send(res, 200, { success: true, data: report.contenido_local, filename: report.filename })
      : send(res, 404, { success: false, message: 'Reporte no encontrado' })
  }

  const sendMatch = path.match(/^\/api\/sire\/reportes\/([0-9a-f-]+)\/enviar-sunat$/i)
  if (sendMatch && req.method === 'POST') {
    const key = requireKey(req, res)
    if (!key) return
    await readBody(req)
    const report = reports.find((item) => item.id === sendMatch[1])
    if (!report) return send(res, 404, { success: false, message: 'Reporte no encontrado' })
    if (sendKeys.has(key)) return send(res, 200, sendKeys.get(key))
    report.estado = 'PENDIENTE'
    report.status = 'PENDING'
    report.sunat_ticket = `202608463${String(sendKeys.size + 10).padStart(5, '0')}`
    report.sunat_estado = 'Solicitado'
    report.sunat_codigo_estado = '01'
    const operation = {
      id: crypto.randomUUID(), accion: 'ACEPTAR_PROPUESTA', estado: 'PROCESANDO',
      ticket: report.sunat_ticket, solicitado_at: now(),
    }
    operations.set(report.id, [operation, ...(operations.get(report.id) || [])])
    const response = { success: true, data: { reporteId: report.id, ticket: report.sunat_ticket, estado: 'PENDIENTE' } }
    sendKeys.set(key, response)
    requestEvidence.push({ action: 'ACEPTAR', key, reportId: report.id })
    return send(res, 200, response)
  }

  const queryMatch = path.match(/^\/api\/sire\/reportes\/([0-9a-f-]+)\/consultar-ticket$/i)
  if (queryMatch && req.method === 'POST') {
    const key = requireKey(req, res)
    if (!key) return
    await readBody(req)
    const report = reports.find((item) => item.id === queryMatch[1])
    if (!report) return send(res, 404, { success: false, message: 'Reporte no encontrado' })
    if (queryKeys.has(key)) return send(res, 200, queryKeys.get(key))
    const priorQueries = requestEvidence.filter((entry) => entry.action === 'CONSULTAR' && entry.reportId === report.id).length
    const code = priorQueries === 0 ? '02' : '06'
    report.sunat_codigo_estado = code
    report.sunat_estado = code === '06' ? 'Terminado' : 'Procesando'
    report.estado = code === '06' ? 'ENVIADO' : 'PENDIENTE'
    report.status = code === '06' ? 'SENT' : 'PENDING'
    const operation = {
      id: crypto.randomUUID(), accion: 'CONSULTAR_TICKET', estado: 'TERMINADO',
      ticket: report.sunat_ticket, codigo_estado_sunat: code,
      descripcion_estado_sunat: report.sunat_estado, solicitado_at: now(), completado_at: now(),
    }
    operations.set(report.id, [operation, ...(operations.get(report.id) || [])])
    const response = { success: true, data: { reporteId: report.id, estado: report.estado, codigoEstadoSunat: code, terminado: code === '06' } }
    queryKeys.set(key, response)
    requestEvidence.push({ action: 'CONSULTAR', key, reportId: report.id, code })
    return send(res, 200, response)
  }

  const operationsMatch = path.match(/^\/api\/sire\/reportes\/([0-9a-f-]+)\/operaciones$/i)
  if (operationsMatch && req.method === 'GET') {
    return send(res, 200, { success: true, data: operations.get(operationsMatch[1]) || [] })
  }
  if (path === '/api/qa/state' && req.method === 'GET') {
    return send(res, 200, { reports, requestEvidence })
  }

  if (req.method === 'GET') return send(res, 200, { success: true, data: [] })
  return send(res, 404, { success: false, message: `Ruta mock no implementada: ${req.method} ${path}` })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`SIRE 463 mock API listening on http://127.0.0.1:${port}`)
})
