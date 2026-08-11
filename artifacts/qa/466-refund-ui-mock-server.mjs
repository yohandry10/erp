import http from 'node:http'

const port = Number(process.argv[2] || process.env.QA_REFUND_466_PORT || 43106)

const ids = {
  tenant: '46600000-0000-4000-8000-000000000046',
  actor: '46600000-0000-4000-8000-000000000001',
  cpe: '46600000-0000-4000-8000-000000000101',
  cpeReady: '46600000-0000-4000-8000-000000000102',
  note: '46600000-0000-4000-8000-000000000201',
  noteReady: '46600000-0000-4000-8000-000000000202',
  cxc: '46600000-0000-4000-8000-000000000211',
  cxcReady: '46600000-0000-4000-8000-000000000212',
  payment: '46600000-0000-4000-8000-000000000301',
  adjustmentMovement: '46600000-0000-4000-8000-000000000401',
  adjustmentOperation: '46600000-0000-4000-8000-000000000501',
  cashSession: '46600000-0000-4000-8000-000000000601',
  saldo: '46600000-0000-4000-8000-000000000701',
  rma: '46600000-0000-4000-8000-000000000702',
  bank: '46600000-0000-4000-8000-000000000801',
  refundBank: '46600000-0000-4000-8000-000000000901',
  refundCash: '46600000-0000-4000-8000-000000000902',
}

const user = {
  id: ids.actor,
  email: 'qa-refunds-466@local.test',
  nombre: 'QA',
  apellido: 'Reversas 466',
  roles: ['ADMIN'],
  tenant_id: ids.tenant,
  is_super_admin: false,
}

let state
let requests
let idempotency

function reset() {
  state = {
    noteCreated: false,
    paymentReversed: false,
    adjustmentReversed: false,
    cpeCancelled: false,
    readyCpeCancelled: false,
    saldoAvailable: 100,
    bankRefundReversed: false,
    cashRefundReversed: false,
  }
  requests = []
  idempotency = new Map()
}

reset()

function json(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  response.end(JSON.stringify(payload))
}

async function bodyOf(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function recordMutation(request, path, body) {
  const key = String(request.headers['idempotency-key'] || '')
  const entry = { method: request.method, path, key, body, at: new Date().toISOString() }
  requests.push(entry)
  if (key.length < 8) return { error: 'QA_466_IDEMPOTENCY_KEY_REQUIRED' }
  const fingerprint = JSON.stringify({ path, body })
  const prior = idempotency.get(key)
  if (prior && prior !== fingerprint) return { error: 'QA_466_IDEMPOTENCY_CONFLICT' }
  if (prior) return { idempotent: true }
  idempotency.set(key, fingerprint)
  return { idempotent: false }
}

function documents() {
  return [
    {
      id: ids.cpe,
      tipoDocumento: '01',
      tipoComprobante: 'Factura',
      serie: 'F466',
      numero: 1,
      fechaEmision: '2026-08-10',
      cliente: 'Cliente Flujo Completo',
      clienteRuc: '20466000001',
      total: 118,
      moneda: 'PEN',
      estado: state.cpeCancelled ? 'ANULADO' : 'ACEPTADO',
      estadoSunat: state.cpeCancelled ? 'ANULADO' : 'ACEPTADO',
      fechaCreacion: '2026-08-10T09:00:00.000Z',
    },
    {
      id: ids.cpeReady,
      tipoDocumento: '01',
      tipoComprobante: 'Factura',
      serie: 'F466',
      numero: 2,
      fechaEmision: '2026-08-10',
      cliente: 'Cliente Sin Cobros',
      clienteRuc: '20466000002',
      total: 59,
      moneda: 'PEN',
      estado: state.readyCpeCancelled ? 'ANULADO' : 'ACEPTADO',
      estadoSunat: state.readyCpeCancelled ? 'ANULADO' : 'ACEPTADO',
      fechaCreacion: '2026-08-10T09:10:00.000Z',
    },
  ]
}

function fullCancellationState() {
  const paymentActive = !state.paymentReversed
  const adjustmentActive = !state.adjustmentReversed
  const note = state.noteCreated
    ? { id: ids.note, serie: 'FC01', numero: 466, estado: 'ACEPTADO', estado_sunat: 'ACEPTADO', cdr_sunat: 'CDR-QA-466' }
    : null
  const estadoFlujo = state.cpeCancelled
    ? 'ANULADO'
    : !note
      ? 'REQUIERE_NOTA_CREDITO'
      : adjustmentActive
        ? 'BLOQUEADO_AJUSTE_REQUIERE_REVERSA'
        : paymentActive
          ? 'REQUIERE_REEMBOLSOS'
          : 'LISTO_PARA_FINALIZAR'

  const adjustment = {
    id: ids.adjustmentMovement,
    tipo: 'RETENCION',
    monto: 18,
    moneda: 'PEN',
    referencia: 'RET-QA-466',
    estado: adjustmentActive ? 'ACTIVO' : 'INACTIVO',
    activo: adjustmentActive,
    operacion_fiscal: {
      id: ids.adjustmentOperation,
      tipo: 'RETENCION',
      estado: adjustmentActive ? 'APLICADO' : 'ANULADO',
    },
  }

  return {
    cpe: { id: ids.cpe, serie: 'F466', numero: 1, moneda: 'PEN', estado: state.cpeCancelled ? 'ANULADO' : 'ACEPTADO', tipo_documento: '01' },
    nota_credito: note,
    cxc: { id: ids.cxc, numero_documento: 'F466-1', estado: state.cpeCancelled ? 'ANULADA' : 'PENDIENTE', monto_pendiente: state.paymentReversed ? 118 : 18 },
    cobros: [{
      id: ids.payment,
      monto: 100,
      moneda: 'PEN',
      fecha_pago: '2026-08-10',
      metodo_pago: 'EFECTIVO',
      referencia: 'COBRO-QA-466',
      estado: paymentActive ? 'ACTIVO' : 'INACTIVO',
      activo: paymentActive,
      reversa: state.paymentReversed
        ? { id: '46600000-0000-4000-8000-000000000311', medio: 'CAJA', motivo: 'Anulación solicitada por el cliente' }
        : null,
    }],
    ajustes_financieros: [adjustment],
    ajustes_activos: adjustmentActive ? [adjustment] : [],
    sesiones_caja: [{ id: ids.cashSession, moneda: 'PEN', cajas: { codigo: 'CJ-466', nombre: 'Caja QA 466' } }],
    nota_aceptada: Boolean(note),
    cobros_activos: paymentActive ? 1 : 0,
    estado_flujo: estadoFlujo,
  }
}

function readyCancellationState() {
  return {
    cpe: { id: ids.cpeReady, serie: 'F466', numero: 2, moneda: 'PEN', estado: state.readyCpeCancelled ? 'ANULADO' : 'ACEPTADO', tipo_documento: '01' },
    nota_credito: { id: ids.noteReady, serie: 'FC01', numero: 467, estado: 'ACEPTADO', estado_sunat: 'ACEPTADO', cdr_sunat: 'CDR-QA-466-READY' },
    cxc: { id: ids.cxcReady, numero_documento: 'F466-2', estado: state.readyCpeCancelled ? 'ANULADA' : 'PENDIENTE', monto_pendiente: 59 },
    cobros: [],
    ajustes_financieros: [],
    ajustes_activos: [],
    sesiones_caja: [{ id: ids.cashSession, moneda: 'PEN', cajas: { codigo: 'CJ-466', nombre: 'Caja QA 466' } }],
    nota_aceptada: true,
    cobros_activos: 0,
    estado_flujo: state.readyCpeCancelled ? 'ANULADO' : 'LISTO_PARA_FINALIZAR',
  }
}

function saldoSummary() {
  return {
    id: ids.saldo,
    cliente_id: '46600000-0000-4000-8000-000000000711',
    rma_id: ids.rma,
    moneda: 'PEN',
    monto_original: 300,
    monto_disponible: state.saldoAvailable,
    estado: state.saldoAvailable > 0 ? 'DISPONIBLE' : 'AGOTADO',
    created_at: '2026-08-10T10:00:00.000Z',
    clientes: { razon_social: 'Cliente RMA QA 466', ruc: '20466000701' },
    rma: { numero: 'RMA-466-0001', estado: 'CERRADA' },
  }
}

function saldoDetail() {
  const movements = [
    { id: '46600000-0000-4000-8000-000000000911', tipo: 'ORIGEN_NC', monto: 300, created_at: '2026-08-10T10:00:00.000Z' },
    { id: ids.refundBank, tipo: 'REEMBOLSO_BANCO', monto: 120, movimiento_bancario_id: '46600000-0000-4000-8000-000000000921', created_at: '2026-08-10T10:05:00.000Z', metadata: { motivo: 'Reembolso bancario QA' } },
    { id: ids.refundCash, tipo: 'REEMBOLSO_CAJA', monto: 80, movimiento_caja_id: '46600000-0000-4000-8000-000000000922', created_at: '2026-08-10T10:06:00.000Z', metadata: { motivo: 'Reembolso efectivo QA' } },
  ]
  if (state.bankRefundReversed) movements.push({ id: '46600000-0000-4000-8000-000000000931', tipo: 'REVERSA', monto: 120, reversa_de_movimiento_id: ids.refundBank, movimiento_bancario_id: '46600000-0000-4000-8000-000000000941', created_at: '2026-08-10T10:10:00.000Z' })
  if (state.cashRefundReversed) movements.push({ id: '46600000-0000-4000-8000-000000000932', tipo: 'REVERSA', monto: 80, reversa_de_movimiento_id: ids.refundCash, movimiento_caja_id: '46600000-0000-4000-8000-000000000942', created_at: '2026-08-10T10:11:00.000Z' })
  return { ...saldoSummary(), movimientos: movements }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = request.method || 'GET'

  if (method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type,idempotency-key,x-country-id',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    })
    response.end()
    return
  }

  if (method === 'POST' && path === '/__qa__/reset') {
    reset()
    return json(response, 200, { success: true, state })
  }
  if (method === 'GET' && path === '/__qa__/state') return json(response, 200, { success: true, state, requests })

  if (method === 'POST' && path === '/api/auth/login') {
    const body = await bodyOf(request)
    if (body.email !== user.email || body.password !== 'RefundsVisual466!') return json(response, 401, { message: 'Credenciales QA 466 inválidas' })
    return json(response, 200, { access_token: 'qa-refunds-token-466', user, session_token: 'qa-refunds-session-466' }, {
      'set-cookie': 'access_token=qa-refunds-token-466; Path=/; HttpOnly; SameSite=Lax',
    })
  }
  if (method === 'GET' && path === '/api/auth/profile') return json(response, 200, user)
  if (method === 'GET' && path === '/api/paises') return json(response, 200, { success: true, data: [{ id: 1, codigo_iso: 'PE', nombre: 'Perú', nombre_fiscal: 'SUNAT', moneda_codigo: 'PEN', moneda_simbolo: 'S/', activo: true }] })
  if (method === 'GET' && path === '/api/configuration/context/country') return json(response, 200, { success: true, data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', moneda: 'PEN', monedaDefecto: 'PEN', locale: 'es-PE', servicioFiscal: 'SUNAT', tipo_empresa: 'GENERAL' } })
  if (method === 'GET' && (path === '/api/configuration/status' || path === '/api/configuration/context/status' || path === '/api/configuracion/status')) return json(response, 200, { success: true, data: { isComplete: true, completionPercentage: 100, missingItems: [] } })
  if (method === 'GET' && path === '/api/tenants/me') return json(response, 200, { id: ids.tenant, nombre: 'QA Reversas 466', pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' })
  if (method === 'GET' && path === '/api/demo/status') return json(response, 200, { success: true, data: { is_demo: true } })
  if (method === 'GET' && path.includes('/usuarios-sistema/me/permissions')) return json(response, 200, { success: true, data: [
    { id: 'perm-466-1', tenant_id: ids.tenant, modulo: 'cpe', accion: 'gestionar', recurso: '*' },
    { id: 'perm-466-2', tenant_id: ids.tenant, modulo: 'ventas', accion: 'gestionar', recurso: '*' },
    { id: 'perm-466-3', tenant_id: ids.tenant, modulo: 'finanzas', accion: 'gestionar', recurso: '*' },
  ] })
  if (method === 'GET' && path === '/api/notifications') return json(response, 200, { success: true, data: [] })

  if (method === 'GET' && path === '/api/cpe/comprobantes') return json(response, 200, { success: true, data: documents() })
  if (method === 'GET' && path === '/api/cpe/stats') return json(response, 200, { success: true, data: { cpeEmitidosHoy: 2, cpeDelMes: 2, montoFacturado: 177, rechazados: 0 } })

  const financialMatch = path.match(/^\/api\/cpe\/([^/]+)\/anulacion-financiera$/)
  if (method === 'GET' && financialMatch) {
    if (financialMatch[1] === ids.cpe) return json(response, 200, { success: true, data: fullCancellationState() })
    if (financialMatch[1] === ids.cpeReady) return json(response, 200, { success: true, data: readyCancellationState() })
  }

  const requestCancellationMatch = path.match(/^\/api\/cpe\/([^/]+)\/anular$/)
  if (method === 'POST' && requestCancellationMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    state.noteCreated = true
    return json(response, 201, { success: true, data: { nota_credito_id: ids.note, idempotent: mutation.idempotent } })
  }

  const paymentReversalMatch = path.match(/^\/api\/cpe\/([^/]+)\/cobros\/([^/]+)\/revertir$/)
  if (method === 'POST' && paymentReversalMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    if (body.sesion_caja_id !== ids.cashSession) return json(response, 400, { message: 'QA_466_EXPLICIT_CASH_SESSION_REQUIRED' })
    state.paymentReversed = true
    state.cpeCancelled = state.adjustmentReversed
    return json(response, 200, { success: true, data: { medio: 'CAJA', monto_reembolsado: 100, saldo_cxc_restaurado: 118, idempotent: mutation.idempotent, anulacion: { estado: state.cpeCancelled ? 'ANULADO' : 'BLOQUEADO_AJUSTE_REQUIERE_REVERSA' } } })
  }

  const adjustmentReversalMatch = path.match(/^\/api\/cpe\/([^/]+)\/ajustes\/([^/]+)\/revertir$/)
  if (method === 'POST' && adjustmentReversalMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    state.adjustmentReversed = true
    state.cpeCancelled = state.paymentReversed
    return json(response, 200, { success: true, data: { operacion_id: ids.adjustmentOperation, saldo_restaurado: 118, idempotent: mutation.idempotent, anulacion: { estado: state.cpeCancelled ? 'ANULADO' : 'PENDIENTE_REEMBOLSOS' } } })
  }

  const finalizationMatch = path.match(/^\/api\/cpe\/([^/]+)\/anulacion\/finalizar$/)
  if (method === 'POST' && finalizationMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    if (finalizationMatch[1] === ids.noteReady) state.readyCpeCancelled = true
    else if (!state.paymentReversed || !state.adjustmentReversed) return json(response, 409, { message: 'QA_466_ACTIVE_FINANCIAL_ITEMS_BLOCK_FINALIZATION' })
    else state.cpeCancelled = true
    return json(response, 200, { success: true, data: { estado: 'ANULADO', idempotent: mutation.idempotent } })
  }

  if (method === 'GET' && path === '/api/ventas/rma') return json(response, 200, { success: true, data: [{ id: ids.rma, numero: 'RMA-466-0001', estado: 'CERRADA', motivo_general: 'Devolución con reembolsos reversables', created_at: '2026-08-10T10:00:00.000Z', clientes: { razon_social: 'Cliente RMA QA 466', ruc: '20466000701' } }] })
  if (method === 'GET' && path === '/api/ventas/rma/saldos-favor') return json(response, 200, { success: true, data: [saldoSummary()] })
  if (method === 'GET' && path === `/api/ventas/rma/saldos-favor/${ids.saldo}`) return json(response, 200, { success: true, data: saldoDetail() })
  if (method === 'GET' && path === '/api/ventas/rma/medios-reembolso') return json(response, 200, { success: true, data: {
    bancos: [{ id: ids.bank, nombre: 'BCP QA 466', banco: 'BCP', moneda: 'PEN', saldo: 5000 }],
    sesiones_caja: [{ id: ids.cashSession, moneda: 'PEN', cajas: { codigo: 'CJ-466', nombre: 'Caja QA 466' } }],
  } })

  const rmaReversalMatch = path.match(/^\/api\/ventas\/rma\/saldos-favor\/([^/]+)\/reembolsos\/([^/]+)\/revertir$/)
  if (method === 'POST' && rmaReversalMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    const movementId = rmaReversalMatch[2]
    if (movementId === ids.refundBank && !state.bankRefundReversed) {
      state.bankRefundReversed = true
      state.saldoAvailable += 120
    } else if (movementId === ids.refundCash && !state.cashRefundReversed) {
      if (body.sesion_caja_id !== ids.cashSession) return json(response, 400, { message: 'QA_466_EXPLICIT_CASH_SESSION_REQUIRED' })
      state.cashRefundReversed = true
      state.saldoAvailable += 80
    }
    return json(response, 200, { success: true, data: { movimiento_original_id: movementId, monto_repuesto: movementId === ids.refundBank ? 120 : 80, saldo_disponible: state.saldoAvailable, idempotent: mutation.idempotent } })
  }

  if (method === 'GET') return json(response, 200, { success: true, data: [] })
  return json(response, 404, { message: `QA_466_UNHANDLED_${method}_${path}` })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`QA_REFUND_466_MOCK_READY http://127.0.0.1:${port}`)
  console.log('QA user: qa-refunds-466@local.test / RefundsVisual466!')
})
