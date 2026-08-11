import http from 'node:http'

const host = '127.0.0.1'
const port = Number(process.env.QA_API_PORT || 14651)
const webOrigin = process.env.QA_WEB_ORIGIN || 'http://127.0.0.1:14650'

const ids = {
  tenant: '10000000-0000-4000-8000-000000000471',
  user: '00000000-0000-4000-8000-000000000471',
  clienteRuc: '20000000-0000-4000-8000-000000000471',
  clienteDni: '20000000-0000-4000-8000-000000000472',
  producto: '30000000-0000-4000-8000-000000000471',
  efectivo: '40000000-0000-4000-8000-000000000471',
  caja: '50000000-0000-4000-8000-000000000471',
  sesion: '60000000-0000-4000-8000-000000000471',
  venta: '70000000-0000-4000-8000-000000000471',
  ticketDocumento: '80000000-0000-4000-8000-000000000471',
  canje: '90000000-0000-4000-8000-000000000471',
  documentoFiscal: 'a0000000-0000-4000-8000-000000000471',
}

const user = {
  id: ids.user,
  email: 'qa.pos471@erp.local',
  nombre: 'Cajero QA 471',
  apellido: 'Visual',
  roles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
  tenant_id: ids.tenant,
  is_super_admin: false,
}

const productoBase = {
  id: ids.producto,
  codigo: 'CAF-471',
  codigo_barras: '7750000000471',
  nombre: 'Café de origen 1 kg',
  descripcion: 'Producto físico para QA del ticket interno',
  categoria: 'Cafetería',
  marca: 'Andes QA',
  precio_venta: 100,
  precio_mayorista: 100,
  precio_especial: 100,
  stock_actual: 20,
  stock_disponible: 20,
  stock_minimo: 2,
  stock_reservado: 0,
  impuesto: 18,
  afectacion_igv: '10',
  es_servicio: false,
  controla_stock: true,
  favorito: true,
}

const clientes = [
  {
    id: ids.clienteRuc,
    codigo: 'CLI-RUC-471',
    tipo_documento: 'RUC',
    numero_documento: '20100070970',
    ruc: '20100070970',
    razon_social: 'Cliente Factura QA 471 S.A.C.',
    direccion: 'Av. QA 471, Lima',
    direccion_fiscal: 'Av. QA 471, Lima',
    estado: 'ACTIVO',
    activo: true,
  },
  {
    id: ids.clienteDni,
    codigo: 'CLI-DNI-471',
    tipo_documento: 'DNI',
    numero_documento: '12345678',
    nombres: 'Cliente',
    apellidos: 'Boleta QA',
    direccion: 'Lima',
    estado: 'ACTIVO',
    activo: true,
  },
]

const requests = []
let stockActual = 20
let saleRequest = null
let exchangeRequest = null
let saleCreated = false
let exchanged = false
let exchangeKey = null
let exchangeType = null

function resetState() {
  stockActual = 20
  saleRequest = null
  exchangeRequest = null
  saleCreated = false
  exchanged = false
  exchangeKey = null
  exchangeType = null
}

function currentSaleClient() {
  return clientes.find((cliente) => cliente.id === saleRequest?.cliente_id) || clientes[0]
}

function fiscalNumber() {
  return exchangeType === '03' ? 'B001-00000047' : 'F001-00000047'
}

function ticketHistory() {
  if (!saleCreated) return []
  const saleClient = currentSaleClient()
  return [{
    id: ids.venta,
    numero_venta: 'T001-00000071',
    numero_ticket: 'T001-00000071',
    numero_fiscal: exchanged ? fiscalNumber() : null,
    tipo_comprobante: exchanged ? exchangeType : 'TICKET',
    tipo_emision: exchanged ? 'TICKET_CANJEADO' : 'TICKET',
    canjeable: !exchanged,
    cpe_id: null,
    cpe_pendiente: exchanged,
    facturacion_pendiente: exchanged,
    cliente_id: saleClient.id,
    cliente_documento: saleClient.numero_documento,
    cliente_nombre: saleClient.razon_social || `${saleClient.nombres} ${saleClient.apellidos}`,
    total: 118,
    subtotal: 100,
    impuestos: 18,
    estado: 'PAGADA',
    cuenta_por_cobrar_id: null,
    fecha_venta: '2026-08-10T22:47:00-05:00',
    canje: exchanged ? {
      id: ids.canje,
      tipo_documento: exchangeType,
      serie: exchangeType === '03' ? 'B001' : 'F001',
      numero: '00000047',
      numero_fiscal: fiscalNumber(),
      estado: 'PENDIENTE_CPE',
      documento_id: ids.documentoFiscal,
    } : null,
  }]
}

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = status === 204 ? '' : JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': webOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization, cache-control, content-type, x-country-id',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    ...extraHeaders,
  })
  response.end(body)
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function economicFields(body) {
  const forbidden = [
    'items', 'pagos', 'total', 'subtotal', 'impuestos', 'descuentos',
    'metodo_pago_id', 'sesion_caja_id', 'stock', 'comision',
  ]
  return forbidden.filter((field) => Object.hasOwn(body, field))
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname
  const requestEntry = {
    method: request.method,
    path,
    query: Object.fromEntries(url.searchParams),
    at: new Date().toISOString(),
  }
  requests.push(requestEntry)

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  if (path === '/__qa__/state') {
    sendJson(response, 200, {
      saleCreated,
      exchanged,
      saleRequest,
      exchangeRequest,
      requestCount: requests.length,
      invariants: {
        stockBefore: 20,
        stockAfter: stockActual,
        stockMovements: saleCreated ? 1 : 0,
        cashMovements: saleCreated ? 1 : 0,
        payments: saleCreated ? 1 : 0,
        accountingEvents: saleCreated ? 1 : 0,
        fiscalDocuments: exchanged ? 1 : 0,
        exchanges: exchanged ? 1 : 0,
        economicImpactsReapplied: false,
      },
      history: ticketHistory(),
      requests,
    })
    return
  }

  if (path === '/__qa__/reset' && request.method === 'POST') {
    resetState()
    sendJson(response, 200, { success: true })
    return
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    requestEntry.body = await readJson(request)
    sendJson(response, 200, { access_token: 'qa-token-471', user }, {
      'set-cookie': 'access_token=qa-token-471; Path=/; HttpOnly; SameSite=Lax',
    })
    return
  }

  if (path === '/api/auth/profile') {
    sendJson(response, 200, user)
    return
  }

  if (path === '/api/auth/logout') {
    sendJson(response, 200, { success: true }, {
      'set-cookie': 'access_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    })
    return
  }

  if (path === '/api/tenants/me') {
    sendJson(response, 200, {
      success: true,
      data: {
        id: ids.tenant,
        nombre: 'ERP QA POS 471',
        email: user.email,
        pais: 'PE',
        moneda: 'PEN',
        estado: 'ACTIVO',
      },
    })
    return
  }

  if (path === '/api/configuration/context/country') {
    sendJson(response, 200, {
      success: true,
      data: { pais_id: 1, paisCodigo: 'PE', pais: 'PE', monedaDefecto: 'PEN' },
    })
    return
  }

  if (path === '/api/configuration/context/status' || path === '/api/pos/configuration-status') {
    sendJson(response, 200, {
      success: true,
      data: {
        isComplete: true,
        isDemo: false,
        completionPercentage: 100,
        missingItems: [],
        certificate: { exists: true, isValid: true },
        ruc: { isConfigured: true, missingFields: [] },
        fiscal: { isEnabled: true, isReady: true, missingItems: [] },
      },
    })
    return
  }

  if (path === '/api/configuration/gre-thresholds') {
    sendJson(response, 200, {
      success: true,
      data: { umbralGREAutomatico: 700, greAutomaticoHabilitado: false },
    })
    return
  }

  if (path === '/api/demo/status') {
    sendJson(response, 200, { is_demo: false, is_expired: false, dias_restantes: 0, can_extend: false })
    return
  }

  if (path === '/api/usuarios-sistema/me/permissions') {
    sendJson(response, 200, {
      success: true,
      data: [
        { id: 'perm-pos-use-471', tenant_id: ids.tenant, codigo: 'pos.use', modulo: 'pos', accion: 'use', recurso: 'pos' },
        { id: 'perm-pos-ticket-471', tenant_id: ids.tenant, codigo: 'pos.ticket.canjear', modulo: 'pos', accion: 'canjear', recurso: 'ticket' },
      ],
    })
    return
  }

  if (path === '/api/pos/productos') {
    sendJson(response, 200, {
      success: true,
      data: [{ ...productoBase, stock_actual: stockActual, stock_disponible: stockActual }],
    })
    return
  }

  if (path === '/api/pos/clientes') {
    sendJson(response, 200, { success: true, data: clientes })
    return
  }

  if (path === '/api/pos/metodos-pago') {
    sendJson(response, 200, {
      success: true,
      data: [{
        id: ids.efectivo,
        codigo: 'EFECTIVO',
        nombre: 'Efectivo',
        tipo: 'EFECTIVO',
        requiere_referencia: false,
        comision_porcentaje: 0,
      }],
    })
    return
  }

  if (path === '/api/pos/empresa-config') {
    sendJson(response, 200, {
      success: true,
      data: {
        ruc: '20600000471',
        razon_social: 'ERP QA POS 471 S.A.C.',
        direccion_fiscal: 'Lima',
        moneda_defecto: 'PEN',
        serie_factura: 'F001',
        serie_boleta: 'B001',
      },
    })
    return
  }

  if (path === '/api/pos/ventas-recientes') {
    sendJson(response, 200, { success: true, data: ticketHistory() })
    return
  }

  if (path === '/api/cajas') {
    sendJson(response, 200, {
      success: true,
      data: [{ id: ids.caja, codigo: 'CAJA-471', nombre: 'Caja QA POS 471', estado: 'ACTIVO' }],
    })
    return
  }

  if (path === '/api/pos/sesion-caja') {
    sendJson(response, 200, {
      success: true,
      data: {
        id: ids.sesion,
        caja_id: ids.caja,
        cajero_id: ids.user,
        estado: 'ABIERTA',
        monto_inicio: 100,
        hora_apertura: '2026-08-10T20:00:00-05:00',
        hora_cierre: null,
        fecha_cierre: null,
      },
    })
    return
  }

  if (path === '/api/pos/venta' && request.method === 'POST') {
    const body = await readJson(request)
    requestEntry.body = body
    saleRequest = body
    const isTicketOnly = body.emitir_cpe === false
      && body?.comprobante?.tipo === 'TICKET'
      && String(body?.comprobante?.serie || '') === 'T001'
      && !body.numero_comprobante
    if (!isTicketOnly) {
      sendJson(response, 422, {
        success: false,
        message: 'QA_471_EXPECTED_INTERNAL_TICKET_WITHOUT_FISCAL_NUMBER',
      })
      return
    }
    if (!saleCreated) {
      saleCreated = true
      stockActual = 19
    }
    sendJson(response, 200, {
      success: true,
      data: {
        venta_id: ids.venta,
        ticket_documento_id: ids.ticketDocumento,
        numero_ticket: 'T001-00000071',
        total: 118,
        subtotal: 100,
        impuestos: 18,
        tipo_emision: 'TICKET',
        canjeable: true,
        estado: 'PAGADA',
        factura_electronica: false,
        facturacion_pendiente: false,
        cpe_pendiente: false,
        cpe_id: null,
        items_actualizados: [{ producto_id: ids.producto, stock_actual: stockActual, stock_disponible: stockActual }],
      },
    })
    return
  }

  const exchangeMatch = path.match(/^\/api\/pos\/ventas\/([^/]+)\/canjear-ticket$/)
  if (exchangeMatch && request.method === 'POST') {
    const body = await readJson(request)
    requestEntry.body = body
    exchangeRequest = body
    const forbidden = economicFields(body)
    if (exchangeMatch[1] !== ids.venta || !saleCreated) {
      sendJson(response, 404, { success: false, message: 'Ticket no encontrado' })
      return
    }
    if (forbidden.length > 0) {
      sendJson(response, 422, {
        success: false,
        message: `QA_471_EXCHANGE_MUST_NOT_SEND_ECONOMIC_FIELDS:${forbidden.join(',')}`,
      })
      return
    }
    const validInvoice = body.tipo_documento === '01'
      && body.cliente_id === ids.clienteRuc
      && body.cliente_tipo_documento === '6'
      && body.cliente_documento === '20100070970'
    const validBoleta = body.tipo_documento === '03'
      && body.cliente_id === ids.clienteDni
      && body.cliente_tipo_documento === '1'
      && body.cliente_documento === '12345678'
    if (!validInvoice && !validBoleta) {
      sendJson(response, 422, {
        success: false,
        message: 'QA_471_DESTINATION_REQUIRES_VALID_RECEIVER',
      })
      return
    }
    const idempotent = exchanged && exchangeKey === body.idempotency_key
    if (exchanged && !idempotent) {
      sendJson(response, 409, { success: false, message: 'El ticket ya fue canjeado' })
      return
    }
    exchanged = true
    exchangeKey = body.idempotency_key
    exchangeType = body.tipo_documento
    const fiscalSerie = exchangeType === '03' ? 'B001' : 'F001'
    const fiscal = fiscalNumber()
    sendJson(response, 200, {
      success: true,
      data: {
        canje_id: ids.canje,
        venta_id: ids.venta,
        ticket_documento_id: ids.ticketDocumento,
        documento_id: ids.documentoFiscal,
        tipo_documento: exchangeType,
        serie: fiscalSerie,
        numero_fiscal: fiscal,
        tipo_emision: 'TICKET_CANJEADO',
        cpe_pendiente: true,
        canjeable: false,
        idempotent,
        impactos_economicos_reaplicados: false,
      },
    })
    return
  }

  if (path === `/api/pos/detalles-venta/${ids.venta}`) {
    sendJson(response, 200, {
      success: true,
      data: [{
        id: 'detalle-471',
        producto_id: ids.producto,
        producto_nombre: productoBase.nombre,
        cantidad: 1,
        precio_unitario: 100,
        subtotal: 100,
        igv: 18,
        total: 118,
      }],
    })
    return
  }

  if (path === '/api/notifications/unread') {
    sendJson(response, 200, { success: true, data: { count: 0 } })
    return
  }

  if (path === '/api/notifications') {
    sendJson(response, 200, { success: true, data: [] })
    return
  }

  sendJson(response, 200, { success: true, data: [] })
})

server.listen(port, host, () => {
  process.stdout.write(`qa-pos-ticket-471 listening on http://${host}:${port}\n`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
