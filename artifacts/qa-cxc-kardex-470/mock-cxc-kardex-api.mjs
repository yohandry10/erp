import http from 'node:http'

const host = '127.0.0.1'
const port = Number(process.env.QA_API_PORT || 14641)

const user = {
  id: '00000000-0000-4000-8000-000000000470',
  email: 'qa.reportes470@erp.local',
  nombre: 'QA Reportes 470',
  apellido: 'Visual',
  roles: ['ADMIN'],
  tenant_id: '10000000-0000-4000-8000-000000000470',
  is_super_admin: false,
}

const warehouses = [
  { id: 'almacen-principal', codigo: 'ALM-01', nombre: 'Almacén principal' },
  { id: 'almacen-secundario', codigo: 'ALM-02', nombre: 'Almacén secundario' },
]

const products = [
  { id: 'producto-cafe', codigo: 'CAF-001', sku: 'CAF-001', nombre: 'Café de origen 1 kg' },
  { id: 'producto-filtro', codigo: 'FIL-010', sku: 'FIL-010', nombre: 'Filtro reutilizable' },
]

const movement = ({
  id,
  tipo,
  sentido,
  fecha,
  documento,
  cantidad,
  costoUnitario,
  moneda = 'PEN',
  tipoCambio = 1,
  valorTotalBase,
  valuacionEstado = 'CONFIRMADA',
  producto = products[0],
  almacen = warehouses[0],
}) => {
  const signedQuantity = sentido === 'ENTRADA' ? cantidad : sentido === 'SALIDA' ? -cantidad : null
  const value = costoUnitario === null ? null : Number((cantidad * costoUnitario).toFixed(2))
  const signedValue = value === null || sentido === 'PENDIENTE'
    ? null
    : sentido === 'ENTRADA' ? value : -value
  const baseValue = valorTotalBase === undefined
    ? moneda === 'PEN' && value !== null ? value : null
    : valorTotalBase
  const signedBase = baseValue === null || sentido === 'PENDIENTE'
    ? null
    : sentido === 'ENTRADA' ? baseValue : -baseValue

  return {
    id,
    tipo,
    sentido,
    fecha,
    documento,
    estado: 'CONFIRMADO',
    cantidad,
    cantidadFirmada: signedQuantity,
    costoUnitario,
    valorTotal: value,
    valorFirmado: signedValue,
    moneda,
    monedaBase: 'PEN',
    tipoCambio,
    valorTotalBase: baseValue,
    valorFirmadoBase: signedBase,
    valuacionEstado,
    producto,
    almacen,
    ubicacion: { id: `${almacen.id}-rack-a`, codigo: 'RACK-A' },
    lote: `LOTE-${id.slice(-2).toUpperCase()}`,
    serie: null,
    referenciaTipo: tipo === 'DEVOLUCION' ? 'DEVOLUCION' : 'MOVIMIENTO',
  }
}

const movements = [
  movement({ id: 'mov-entrada', tipo: 'ENTRADA', sentido: 'ENTRADA', fecha: '2026-08-01T10:15:00-05:00', documento: 'OC-000124', cantidad: 10, costoUnitario: 10 }),
  movement({ id: 'mov-salida', tipo: 'SALIDA', sentido: 'SALIDA', fecha: '2026-08-02T15:20:00-05:00', documento: 'FV01-000482', cantidad: 2, costoUnitario: 10 }),
  movement({ id: 'mov-ajuste-mas', tipo: 'AJUSTE', sentido: 'ENTRADA', fecha: '2026-08-03T09:00:00-05:00', documento: 'AJ-000031', cantidad: 3, costoUnitario: 10 }),
  movement({ id: 'mov-ajuste-menos', tipo: 'AJUSTE', sentido: 'SALIDA', fecha: '2026-08-04T09:30:00-05:00', documento: 'AJ-000032', cantidad: 1, costoUnitario: 10 }),
  movement({ id: 'mov-devol-proveedor', tipo: 'DEVOLUCION', sentido: 'SALIDA', fecha: '2026-08-05T11:30:00-05:00', documento: 'DVP-000018', cantidad: 2, costoUnitario: 10 }),
  movement({ id: 'mov-devol-cliente', tipo: 'DEVOLUCION', sentido: 'ENTRADA', fecha: '2026-08-06T12:10:00-05:00', documento: 'RMA-000027', cantidad: 1, costoUnitario: 10, almacen: warehouses[1] }),
  movement({ id: 'mov-usd-pendiente', tipo: 'ENTRADA', sentido: 'ENTRADA', fecha: '2026-08-07T16:40:00-05:00', documento: 'OC-USD-0009', cantidad: 4, costoUnitario: 5, moneda: 'USD', tipoCambio: null, valorTotalBase: null, valuacionEstado: 'PENDIENTE_TIPO_CAMBIO', producto: products[1] }),
  movement({ id: 'mov-sin-moneda', tipo: 'ENTRADA', sentido: 'ENTRADA', fecha: '2026-08-07T17:10:00-05:00', documento: 'LEGACY-SIN-MONEDA', cantidad: 1, costoUnitario: 8, moneda: null, tipoCambio: null, valorTotalBase: null, valuacionEstado: 'PENDIENTE_MONEDA', producto: products[1] }),
  movement({ id: 'mov-devol-ambigua', tipo: 'DEVOLUCION', sentido: 'PENDIENTE', fecha: '2026-08-08T08:45:00-05:00', documento: 'DEV-LEGACY-01', cantidad: 1, costoUnitario: 10, valuacionEstado: 'CONFIRMADA' }),
]

const round = (value) => Number(value.toFixed(2))

function summarizeKardex(rows) {
  const pendingDirection = rows.filter((row) => row.sentido === 'PENDIENTE').length
  const pendingValuation = rows.filter((row) => row.valuacionEstado !== 'CONFIRMADA').length
  const knownRows = rows.filter((row) => row.sentido !== 'PENDIENTE')
  const totalEntradas = round(knownRows.filter((row) => row.cantidadFirmada > 0).reduce((sum, row) => sum + row.cantidadFirmada, 0))
  const totalSalidas = round(Math.abs(knownRows.filter((row) => row.cantidadFirmada < 0).reduce((sum, row) => sum + row.cantidadFirmada, 0)))
  const totalAjustes = round(knownRows.filter((row) => row.tipo === 'AJUSTE').reduce((sum, row) => sum + row.cantidadFirmada, 0))
  const totalDevoluciones = round(knownRows.filter((row) => row.tipo === 'DEVOLUCION').reduce((sum, row) => sum + row.cantidadFirmada, 0))
  const valorPorMoneda = {}
  const valorBasePorMoneda = {}
  for (const row of knownRows) {
    if (row.valorFirmado !== null && row.moneda) valorPorMoneda[row.moneda] = round((valorPorMoneda[row.moneda] || 0) + row.valorFirmado)
    if (row.valorFirmadoBase !== null) valorBasePorMoneda[row.monedaBase] = round((valorBasePorMoneda[row.monedaBase] || 0) + row.valorFirmadoBase)
  }
  const unresolvedInput = rows.some((row) => row.sentido === 'ENTRADA' && row.valorFirmadoBase === null)
  const unresolvedOutput = rows.some((row) => row.sentido === 'SALIDA' && row.valorFirmadoBase === null)
  const inputBase = round(knownRows.filter((row) => row.valorFirmadoBase > 0).reduce((sum, row) => sum + row.valorFirmadoBase, 0))
  const outputBase = round(Math.abs(knownRows.filter((row) => row.valorFirmadoBase < 0).reduce((sum, row) => sum + row.valorFirmadoBase, 0)))
  const reliable = pendingDirection === 0 && pendingValuation === 0

  return {
    totalMovimientos: rows.length,
    totalEntradas,
    totalSalidas,
    totalAjustes,
    totalDevoluciones,
    valorEntradasBase: unresolvedInput || pendingDirection > 0 ? null : inputBase,
    valorSalidasBase: unresolvedOutput || pendingDirection > 0 ? null : outputBase,
    saldoCantidad: pendingDirection > 0 ? null : round(totalEntradas - totalSalidas),
    saldoValorizadoBase: reliable ? round(inputBase - outputBase) : null,
    monedaBase: 'PEN',
    pendientesValorizacion: pendingValuation,
    pendientesSentido: pendingDirection,
    multiplesMonedasBase: false,
    resumenConfiable: reliable,
    valorPorMoneda,
    valorBasePorMoneda,
  }
}

function kardexPayload(url) {
  let rows = movements
  const warehouseId = url.searchParams.get('almacenId')
  const productId = url.searchParams.get('productoId')
  if (warehouseId) rows = rows.filter((row) => row.almacen.id === warehouseId)
  if (productId) rows = rows.filter((row) => row.producto.id === productId)
  return { success: true, data: rows, resumen: summarizeKardex(rows) }
}

const agingDetail = [
  {
    id: 'cxc-antigua-pen', cliente: 'Distribuidora Histórica SAC', clienteDocumento: '20123456789',
    documento: 'F001-000118', fechaEmision: '2024-01-15', fechaVencimiento: '2024-02-14',
    montoOrigen: 100, moneda: 'PEN', montoBase: 100, monedaBase: 'PEN', tipoCambio: 1,
    valuacionEstado: 'CONFIRMADA', diasMora: 908, estado: 'VENCIDA',
  },
  {
    id: 'cxc-usd', cliente: 'Exportaciones Andinas SAC', clienteDocumento: '20444555666',
    documento: 'F001-000725', fechaEmision: '2026-05-01', fechaVencimiento: '2026-05-31',
    montoOrigen: 50, moneda: 'USD', montoBase: 175, monedaBase: 'PEN', tipoCambio: 3.5,
    valuacionEstado: 'CONFIRMADA', diasMora: 71, estado: 'PARCIAL',
  },
  {
    id: 'cxc-eur-sin-tc', cliente: 'Importadora Europa SRL', clienteDocumento: '20666777888',
    documento: 'F001-000811', fechaEmision: '2026-07-01', fechaVencimiento: '2026-07-31',
    montoOrigen: 25, moneda: 'EUR', montoBase: null, monedaBase: 'PEN', tipoCambio: null,
    valuacionEstado: 'PENDIENTE_TIPO_CAMBIO', diasMora: 10, estado: 'VENCIDA',
  },
]

const agingPayload = {
  fechaCorte: '2026-08-10',
  monedaBase: 'PEN',
  resumen: {
    totalPendienteBase: 275,
    totalVencidoBase: 275,
    porcentajeVencidoBase: 100,
    cuentasAnalizadas: 3,
    cuentasSinValuacion: 1,
    cuentasSinReconstruir: 0,
    totalPendientePorMoneda: { PEN: 100, USD: 50, EUR: 25 },
  },
  buckets: [
    { id: '1-30', nombre: '1 a 30 días', rango: '1–30', cuentas: 1, montoBase: 0, sinValuacion: 1, porMoneda: { EUR: 25 }, porcentajeBase: 0 },
    { id: '61-90', nombre: '61 a 90 días', rango: '61–90', cuentas: 1, montoBase: 175, sinValuacion: 0, porMoneda: { USD: 50 }, porcentajeBase: 63.64 },
    { id: '90+', nombre: 'Más de 90 días', rango: '> 90', cuentas: 1, montoBase: 100, sinValuacion: 0, porMoneda: { PEN: 100 }, porcentajeBase: 36.36 },
  ],
  saldoPorCliente: [
    { clienteId: 'cliente-historico', cliente: 'Distribuidora Histórica SAC', clienteDocumento: '20123456789', montoBase: 100, sinValuacion: 0, porMoneda: { PEN: 100 } },
    { clienteId: 'cliente-andino', cliente: 'Exportaciones Andinas SAC', clienteDocumento: '20444555666', montoBase: 175, sinValuacion: 0, porMoneda: { USD: 50 } },
    { clienteId: 'cliente-europa', cliente: 'Importadora Europa SRL', clienteDocumento: '20666777888', montoBase: 0, sinValuacion: 1, porMoneda: { EUR: 25 } },
  ],
  cuentasCriticas: agingDetail,
  detalle: agingDetail,
}

const requests = []

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': 'http://127.0.0.1:14640',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...extraHeaders,
  })
  response.end(body)
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname
  requests.push({ method: request.method, path, query: Object.fromEntries(url.searchParams), at: new Date().toISOString() })

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  if (path === '/__qa__/state') {
    sendJson(response, 200, { requests })
    return
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    sendJson(response, 200, { access_token: 'qa-token-470', user }, {
      'set-cookie': 'access_token=qa-token-470; Path=/; HttpOnly; SameSite=Lax',
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
      data: { id: user.tenant_id, nombre: 'ERP QA Reportes', email: user.email, pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' },
    })
    return
  }

  if (path === '/api/configuration/context/country') {
    sendJson(response, 200, { success: true, data: { pais_id: 1, paisCodigo: 'PE', monedaDefecto: 'PEN' } })
    return
  }

  if (path === '/api/configuration/context/status') {
    sendJson(response, 200, {
      success: true,
      data: {
        isComplete: true, isDemo: false, completionPercentage: 100, missingItems: [],
        certificate: { exists: false, isValid: false },
        ruc: { isConfigured: true, missingFields: [] },
        fiscal: { isEnabled: false, isReady: false, missingItems: [] },
      },
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
      data: [{ id: 'permiso-kardex', tenant_id: user.tenant_id, modulo: 'inventario', accion: 'read', recurso: 'kardex' }],
    })
    return
  }

  if (path === '/api/inventario/almacenes') {
    sendJson(response, 200, { success: true, data: warehouses })
    return
  }

  if (path === '/api/inventario/productos') {
    sendJson(response, 200, { success: true, data: products })
    return
  }

  if (path === '/api/inventario/kardex') {
    sendJson(response, 200, kardexPayload(url))
    return
  }

  if (path === '/api/ventas/reportes/cxc-aging') {
    sendJson(response, 200, { success: true, data: agingPayload })
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
  process.stdout.write(`qa-cxc-kardex-470 listening on http://${host}:${port}\n`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
