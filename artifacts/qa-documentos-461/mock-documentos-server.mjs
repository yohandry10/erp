import http from 'node:http'

const port = 13061
const tenantId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
let nextNumber = 1
let sendAttempts = 0
const documents = []
const fiscalDate = new Date().toISOString().slice(0, 10)
const fiscalCandidates = [
  {
    id: '33333333-3333-4333-8333-333333333331',
    tipo: 'RA',
    tipoDocumento: '01',
    serie: 'F099',
    numero: '00000461',
    fechaEmision: fiscalDate,
    receptor: 'Cliente factura revertida 461',
    receptorDocumento: '20100066603',
    total: 212.4,
    moneda: 'PEN',
    reversaComercialConfirmada: true,
  },
  {
    id: '33333333-3333-4333-8333-333333333332',
    tipo: 'RC',
    tipoDocumento: '03',
    serie: 'B099',
    numero: '00000461',
    fechaEmision: fiscalDate,
    receptor: 'Cliente boleta revertida 461',
    receptorDocumento: '12345678',
    total: 59,
    moneda: 'PEN',
    reversaComercialConfirmada: true,
  },
]
const fiscalBatches = []
const reservedFiscalCpes = new Set()
const fiscalSendAttempts = new Map()
const fiscalStatusAttempts = new Map()

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': 'http://127.0.0.1:3101',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization,content-type,x-country-id',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

async function body(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

function calculate(payload) {
  const details = payload.detalles.map((line, index) => {
    const value = Math.round(Number(line.cantidad) * (Number(line.precio_unitario) - Number(line.descuento_unitario || 0)) * 100) / 100
    const tax = Math.round(value * 0.18 * 100) / 100
    return {
      ...line,
      orden: index + 1,
      valor_venta: value,
      impuesto_igv: tax,
      impuesto_isc: 0,
      total_item: Math.round((value + tax) * 100) / 100,
      metadata: { afectacion_igv: line.afectacion_igv || '10' },
    }
  })
  const subtotal = details.reduce((sum, line) => sum + line.valor_venta, 0)
  const tax = details.reduce((sum, line) => sum + line.impuesto_igv, 0)
  return {
    details,
    subtotal,
    discounts: details.reduce((sum, line) => sum + Number(line.cantidad) * Number(line.descuento_unitario || 0), 0),
    tax,
    total: subtotal + tax,
  }
}

function stats() {
  return {
    totalDocumentos: documents.length,
    facturas: documents.filter((d) => d.tipo_documento === 'FACTURA').length,
    boletas: documents.filter((d) => d.tipo_documento === 'BOLETA').length,
    notasCredito: 0,
    contratos: documents.filter((d) => d.tipo_documento === 'CONTRATO').length,
    pendientesEnvio: documents.filter((d) => ['BORRADOR', 'EMITIDO'].includes(d.estado)).length,
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/health') return json(res, 200, { ok: true })
  if (path === '/api/auth/login' && req.method === 'POST') {
    await body(req)
    return json(res, 200, {
      access_token: 'qa-461',
      user: {
        id: userId,
        tenant_id: tenantId,
        email: 'qa-documentos@local.invalid',
        nombre: 'QA Documentos',
        roles: ['ADMIN'],
        is_super_admin: false,
      },
    }, {
      'set-cookie': 'access_token=qa-461; Path=/; HttpOnly; SameSite=Lax',
    })
  }
  if (path === '/api/auth/profile') {
    return json(res, 200, {
      id: userId,
      tenant_id: tenantId,
      email: 'qa-documentos@local.invalid',
      nombre: 'QA Documentos',
      roles: ['ADMIN'],
      is_super_admin: false,
    })
  }
  if (path === '/api/configuration/context/country') {
    return json(res, 200, {
      success: true,
      data: {
        pais_id: 1,
        pais: 'PE',
        paisCodigo: 'PE',
        moneda: 'PEN',
        monedaDefecto: 'PEN',
      },
    })
  }
  if (path === '/api/tenants/me') {
    return json(res, 200, { success: true, data: { id: tenantId, nombre: 'Empresa QA 461', pais: 'PE', moneda: 'PEN' } })
  }
  if (path.includes('/permissions') || path.includes('/permisos')) {
    return json(res, 200, { success: true, data: ['*'] })
  }
  if (path === '/api/documentos/stats') return json(res, 200, { success: true, data: stats() })
  if (path === '/api/documentos/lista') return json(res, 200, { success: true, data: documents })

  if (path === '/api/cpe/baja/elegibles' && req.method === 'GET') {
    const tipo = String(url.searchParams.get('tipo') || '').toUpperCase()
    return json(res, 200, {
      success: true,
      data: fiscalCandidates.filter((candidate) =>
        candidate.tipo === tipo && !reservedFiscalCpes.has(candidate.id)),
    })
  }
  if (path === '/api/cpe/baja/lotes' && req.method === 'GET') {
    const tipo = String(url.searchParams.get('tipo') || '').toUpperCase()
    return json(res, 200, {
      success: true,
      data: fiscalBatches.filter((batch) => batch.tipo === tipo),
    })
  }
  if ((path === '/api/cpe/baja/comunicacion' || path === '/api/cpe/baja/resumen') && req.method === 'POST') {
    const payload = await body(req)
    const tipo = path.endsWith('/comunicacion') ? 'RA' : 'RC'
    const existing = fiscalBatches.find((batch) =>
      batch.tipo === tipo && batch.idempotency_key === payload.idempotencyKey)
    if (existing) return json(res, 200, { success: true, data: existing, idempotent: true })
    const ids = Array.isArray(payload.comprobantesIds) ? payload.comprobantesIds : []
    const candidates = fiscalCandidates.filter((candidate) =>
      candidate.tipo === tipo && ids.includes(candidate.id) && !reservedFiscalCpes.has(candidate.id))
    if (candidates.length !== ids.length || ids.length === 0) {
      return json(res, 409, {
        success: false,
        message: 'El CPE ya está reservado o no tiene reversa comercial 448 confirmada',
      })
    }
    const batch = {
      id: crypto.randomUUID(),
      tipo,
      numero_comunicacion: tipo === 'RA' ? `RA-${fiscalDate.replaceAll('-', '')}-${fiscalBatches.length + 1}` : undefined,
      numero_resumen: tipo === 'RC' ? `RC-${fiscalDate.replaceAll('-', '')}-${fiscalBatches.length + 1}` : undefined,
      comprobantes_ids: ids,
      cantidad_comprobantes: ids.length,
      motivo_baja: payload.motivoBaja,
      fecha_comunicacion: payload.fechaComunicacion || fiscalDate,
      fecha_referencia: payload.fechaReferencia || fiscalDate,
      idempotency_key: payload.idempotencyKey,
      estado: 'GENERADO',
      ticket_sunat: null,
      ultimo_error: null,
      xml_firmado: `<${tipo === 'RA' ? 'VoidedDocuments' : 'SummaryDocuments'}><Signature>QA-461</Signature></${tipo === 'RA' ? 'VoidedDocuments' : 'SummaryDocuments'}>`,
      created_at: new Date().toISOString(),
    }
    ids.forEach((id) => reservedFiscalCpes.add(id))
    fiscalBatches.unshift(batch)
    return json(res, 201, {
      success: true,
      data: batch,
      message: `${tipo} creado y firmado con credenciales mock del tenant`,
    })
  }

  const fiscalSendMatch = path.match(/^\/api\/cpe\/baja\/(comunicacion|resumen)\/([^/]+)\/enviar$/)
  if (fiscalSendMatch && req.method === 'POST') {
    await body(req)
    const tipo = fiscalSendMatch[1] === 'comunicacion' ? 'RA' : 'RC'
    const batch = fiscalBatches.find((candidate) => candidate.id === fiscalSendMatch[2] && candidate.tipo === tipo)
    if (!batch) return json(res, 404, { success: false, message: 'Lote fiscal no encontrado' })
    const attempts = (fiscalSendAttempts.get(batch.id) || 0) + 1
    fiscalSendAttempts.set(batch.id, attempts)
    if (attempts === 1) {
      batch.estado = 'GENERADO'
      batch.ultimo_error = 'Timeout de transporte mock; la misma intención puede reintentarse'
      batch.next_retry_at = new Date(Date.now() + 60_000).toISOString()
      return json(res, 503, { success: false, message: batch.ultimo_error })
    }
    batch.estado = 'ENVIADO'
    batch.ticket_sunat = `T-${tipo}-461-${String(attempts).padStart(2, '0')}`
    batch.codigo_respuesta = '98'
    batch.descripcion_respuesta = 'Ticket recibido; pendiente de consulta'
    batch.ultimo_error = null
    return json(res, 200, { success: true, data: batch, ticket: batch.ticket_sunat })
  }

  const fiscalStatusMatch = path.match(/^\/api\/cpe\/baja\/(comunicacion|resumen)\/([^/]+)\/estado$/)
  if (fiscalStatusMatch && req.method === 'GET') {
    const tipo = fiscalStatusMatch[1] === 'comunicacion' ? 'RA' : 'RC'
    const batch = fiscalBatches.find((candidate) => candidate.id === fiscalStatusMatch[2] && candidate.tipo === tipo)
    if (!batch) return json(res, 404, { success: false, message: 'Lote fiscal no encontrado' })
    if (!batch.ticket_sunat) return json(res, 409, { success: false, message: 'El lote todavía no tiene ticket fiscal' })
    const attempts = (fiscalStatusAttempts.get(batch.id) || 0) + 1
    fiscalStatusAttempts.set(batch.id, attempts)
    if (attempts === 1) {
      batch.descripcion_respuesta = 'Ticket en proceso; estado durable ENVIADO'
      return json(res, 409, { success: false, message: batch.descripcion_respuesta })
    }
    batch.estado = 'ACEPTADO'
    batch.terminal_result = 'ACEPTADO'
    batch.codigo_respuesta = '0'
    batch.descripcion_respuesta = 'Aceptado con CDR mock local'
    batch.cdr_sunat = `<CDR>${tipo}-461</CDR>`
    return json(res, 200, { success: true, data: batch, estado: 'ACEPTADO' })
  }

  if (path === '/api/documentos/validar-ruc' && req.method === 'POST') {
    const payload = await body(req)
    const valid = /^\d{11}$/.test(String(payload.ruc || ''))
    return json(res, 200, { success: valid, data: { valido: valid, numero: payload.ruc, pais: 'PE' } })
  }
  if (path === '/api/documentos/validar-documento' && req.method === 'POST') {
    const payload = await body(req)
    const errors = []
    if (!['FACTURA', 'BOLETA', 'CONTRATO'].includes(payload.tipo_documento)) errors.push('Tipo inválido')
    if (!payload.idempotency_key) errors.push('Falta idempotencia')
    if (!Array.isArray(payload.detalles) || payload.detalles.length === 0) errors.push('Falta detalle')
    return json(res, 200, { success: errors.length === 0, data: { valido: errors.length === 0, errores: errors } })
  }
  if (path === '/api/documentos/crear' && req.method === 'POST') {
    const payload = await body(req)
    const existing = documents.find((doc) => doc.idempotency_key === payload.idempotency_key)
    if (existing) return json(res, 200, { success: true, data: existing, idempotent: true })
    const totals = calculate(payload)
    const document = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      ...payload,
      serie: payload.serie || (payload.tipo_documento === 'FACTURA' ? 'F001' : payload.tipo_documento === 'BOLETA' ? 'B001' : 'C001'),
      numero: String(nextNumber++).padStart(8, '0'),
      subtotal: totals.subtotal,
      descuentos: totals.discounts,
      impuesto_igv: totals.tax,
      total: totals.total,
      estado: 'BORRADOR',
      estado_sunat: 'NO_ENVIADO',
      metodo_pago: payload.condicion_pago || 'CONTADO',
      documento_detalles: totals.details,
      created_at: new Date().toISOString(),
    }
    documents.unshift(document)
    return json(res, 201, { success: true, data: document, message: 'Borrador atómico creado' })
  }

  const match = path.match(/^\/api\/documentos\/([^/]+)(?:\/(generar-xml|enviar-sunat|descargar-xml|descargar-pdf|anular))?$/)
  if (match) {
    const document = documents.find((doc) => doc.id === match[1])
    if (!document) return json(res, 404, { success: false, message: 'Documento no encontrado' })
    const action = match[2]
    if (!action && req.method === 'PUT') {
      const payload = await body(req)
      const totals = calculate(payload)
      Object.assign(document, payload, {
        subtotal: totals.subtotal,
        descuentos: totals.discounts,
        impuesto_igv: totals.tax,
        total: totals.total,
        documento_detalles: totals.details,
      })
      return json(res, 200, { success: true, data: document, message: 'Borrador actualizado atómicamente' })
    }
    if (action === 'generar-xml' && req.method === 'POST') {
      if (document.tipo_documento === 'CONTRATO') {
        return json(res, 409, { success: false, message: 'Un contrato no genera CPE/XML fiscal' })
      }
      document.estado = 'EMITIDO'
      document.estado_sunat = 'PENDIENTE'
      document.cpe_id = `cpe-${document.id}`
      document.xml_content = `<Invoice><ds:Signature Id="SignatureSP">QA-461</ds:Signature></Invoice>`
      return json(res, 200, { success: true, data: { cpe_id: document.cpe_id, xml_content: document.xml_content }, message: 'CPE creado y XML firmado' })
    }
    if (action === 'enviar-sunat' && req.method === 'POST') {
      sendAttempts += 1
      if (sendAttempts === 1) {
        return json(res, 503, { success: false, message: 'Proveedor fiscal temporalmente no disponible; reintente con la misma intención' })
      }
      document.estado = 'ACEPTADO'
      document.estado_sunat = 'ACEPTADO'
      return json(res, 200, { success: true, data: { cpe_id: document.cpe_id, estado: 'ACEPTADO' }, message: 'CPE aceptado por mock local' })
    }
    if (action === 'descargar-xml' && req.method === 'GET') {
      return json(res, 200, { success: true, data: document.xml_content })
    }
    if (action === 'descargar-pdf' && req.method === 'GET') {
      return json(res, 200, { success: true, data: { cpe_id: document.cpe_id, pdf_endpoint: `/api/cpe/comprobantes/${document.cpe_id}/pdf` } })
    }
    if (action === 'anular' && req.method === 'POST') {
      document.estado = 'ANULADO'
      return json(res, 200, { success: true, data: { documento_id: document.id, estado: 'ANULADO' }, message: 'Documento anulado' })
    }
    if (!action && req.method === 'GET') return json(res, 200, { success: true, data: document })
  }

  return json(res, 200, { success: true, data: path.includes('config') ? {} : [] })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`mock-documentos-461 listening on http://127.0.0.1:${port}`)
})
