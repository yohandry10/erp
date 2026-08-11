import http from 'node:http'

const port = Number(process.argv[2] || process.env.QA_CASH_474_PORT || 43114)

const ids = {
  tenant: '47400000-0000-4000-8000-000000000474',
  actor: '47400000-0000-4000-8000-000000000001',
  incoming: '47400000-0000-4000-8000-000000000002',
  session: '47400000-0000-4000-8000-000000000101',
  cashRegister: '47400000-0000-4000-8000-000000000102',
  bank: '47400000-0000-4000-8000-000000000201',
  cashAccount: '47400000-0000-4000-8000-000000000301',
  vaultAccount: '47400000-0000-4000-8000-000000000302',
  expenseAccount: '47400000-0000-4000-8000-000000000303',
  incomeAccount: '47400000-0000-4000-8000-000000000304',
  shift: '47400000-0000-4000-8000-000000000401',
}

const user = {
  id: ids.actor,
  email: 'qa-cash-474@local.test',
  nombre: 'Elena',
  apellido: 'Caja QA 474',
  nombres: 'Elena',
  apellidos: 'Caja QA 474',
  roles: ['ADMIN'],
  tenant_id: ids.tenant,
  is_super_admin: false,
}

let state
let requests
let idempotency

function reset() {
  state = {
    balance: 100,
    frozen: false,
    shiftId: null,
    movementCount: 0,
    withdrawalCount: 0,
    shiftStarts: 0,
    shiftCancels: 0,
    shiftCompletes: 0,
  }
  requests = []
  idempotency = new Map()
}

reset()

function json(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
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
  if (key.length < 8) return { error: 'QA_474_IDEMPOTENCY_KEY_REQUIRED' }
  const fingerprint = JSON.stringify({ path, body })
  const previous = idempotency.get(key)
  if (previous && previous !== fingerprint) return { error: 'QA_474_IDEMPOTENCY_CONFLICT' }
  if (previous) return { idempotent: true }
  idempotency.set(key, fingerprint)
  return { idempotent: false }
}

const accounts = [
  { id: ids.cashAccount, codigo: '10111', nombre: 'Caja principal', aplicable_a: { caja: true } },
  { id: ids.vaultAccount, codigo: '10112', nombre: 'Bóveda y valores', aplicable_a: { boveda: true } },
  { id: ids.expenseAccount, codigo: '65999', nombre: 'Gastos operativos explícitos', aplicable_a: { gasto: true } },
  { id: ids.incomeAccount, codigo: '75999', nombre: 'Otros ingresos de gestión', aplicable_a: { ingreso: true } },
]

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
  if (method === 'GET' && path === '/__qa__/state') {
    return json(response, 200, { success: true, state, requests })
  }

  if (method === 'POST' && path === '/api/auth/login') {
    const body = await bodyOf(request)
    if (body.email !== user.email || body.password !== 'CashVisual474!') {
      return json(response, 401, { message: 'Credenciales QA 474 inválidas' })
    }
    return json(response, 200, {
      access_token: 'qa-cash-token-474',
      session_token: 'qa-cash-session-474',
      user,
    }, {
      'set-cookie': 'access_token=qa-cash-token-474; Path=/; HttpOnly; SameSite=Lax',
    })
  }
  if (method === 'GET' && path === '/api/auth/profile') return json(response, 200, user)
  if (method === 'GET' && path === '/api/paises') return json(response, 200, { success: true, data: [{ id: 1, codigo_iso: 'PE', nombre: 'Perú', nombre_fiscal: 'SUNAT', moneda_codigo: 'PEN', moneda_simbolo: 'S/', activo: true }] })
  if (method === 'GET' && path === '/api/configuration/context/country') return json(response, 200, { success: true, data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', paisNombre: 'Perú', moneda: 'PEN', monedaDefecto: 'PEN', simboloMoneda: 'S/', locale: 'es-PE', servicioFiscal: 'SUNAT' } })
  if (method === 'GET' && (path === '/api/configuration/status' || path === '/api/configuration/context/status' || path === '/api/configuracion/status')) return json(response, 200, { success: true, data: { isComplete: true, completionPercentage: 100, missingItems: [] } })
  if (method === 'GET' && path === '/api/tenants/me') return json(response, 200, { id: ids.tenant, nombre: 'Empresa Caja QA 474', pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' })
  if (method === 'GET' && path === '/api/demo/status') return json(response, 200, { success: true, data: { is_demo: true } })
  if (method === 'GET' && path.includes('/usuarios-sistema/me/permissions')) return json(response, 200, { success: true, data: [{ id: 'perm-474', tenant_id: ids.tenant, modulo: 'cajas', accion: 'gestionar', recurso: '*' }] })
  if (method === 'GET' && path === '/api/notifications') return json(response, 200, { success: true, data: [] })

  if (method === 'GET' && path === '/api/cajas/sesiones') return json(response, 200, { success: true, data: [{ id: ids.session, estado: state.frozen ? 'CONGELADA' : 'ABIERTA', hora_apertura: '2026-08-11T08:00:00.000Z', monto_inicio: 100, usuario: { nombres: user.nombres, apellidos: user.apellidos }, caja: { id: ids.cashRegister, codigo: 'CJ-474', nombre: 'Caja Principal QA 474' } }] })
  if (method === 'GET' && path === '/api/cajas/cortes') return json(response, 200, { success: true, data: [] })
  if (method === 'GET' && path === `/api/cajas/movimientos/${ids.session}`) return json(response, 200, { success: true, data: [{ id: '47400000-0000-4000-8000-000000000501', secuencia: 1, tipo_movimiento: 'APERTURA', monto: 100, saldo_anterior: 0, saldo_nuevo: 100, timestamp: '2026-08-11T08:00:00.000Z', motivo: 'Apertura verificada', usuario: { nombres: user.nombres, apellidos: user.apellidos } }] })
  if (method === 'GET' && path === '/api/cajas/opciones-contables') return json(response, 200, { success: true, data: { cuentas: accounts, cuentas_bancarias: [{ id: ids.bank, banco: 'BCP', nombre: 'BCP Operaciones', numero_cuenta: '•••• 4740', moneda: 'PEN' }] } })
  if (method === 'GET' && path === '/api/usuarios') return json(response, 200, { success: true, data: [{ id: ids.incoming, nombres: 'María', apellidos: 'Turno Entrante' }] })

  const manualMatch = path.match(/^\/api\/cajas\/movimientos\/manual\/([^/]+)$/)
  if (method === 'POST' && manualMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    const expected = body.tipo === 'INGRESO' ? ids.incomeAccount : ids.expenseAccount
    if (body.cuenta_contrapartida_id !== expected) return json(response, 400, { message: 'QA_474_EXPLICIT_MANUAL_COUNTERPARTY_REQUIRED' })
    if (!mutation.idempotent) {
      state.movementCount += 1
      state.balance += body.tipo === 'INGRESO' ? Number(body.monto) : -Number(body.monto)
    }
    return json(response, 201, { success: true, data: { id: `manual-${state.movementCount}`, saldo_nuevo: state.balance, idempotent: mutation.idempotent } })
  }

  const withdrawalMatch = path.match(/^\/api\/cajas\/retiros\/([^/]+)$/)
  if (method === 'POST' && withdrawalMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    if (body.motivo === 'DEPOSITO_BANCARIO') {
      if (body.cuenta_bancaria_id !== ids.bank || !body.foto_comprobante) return json(response, 400, { message: 'QA_474_REAL_BANK_AND_EVIDENCE_REQUIRED' })
    } else {
      const expected = body.motivo === 'BOVEDA' ? ids.vaultAccount : ids.expenseAccount
      if (body.cuenta_contrapartida_id !== expected) return json(response, 400, { message: 'QA_474_EXPLICIT_WITHDRAWAL_COUNTERPARTY_REQUIRED' })
    }
    if (!mutation.idempotent) {
      state.withdrawalCount += 1
      state.balance -= Number(body.monto)
    }
    return json(response, 201, { success: true, data: { id: `withdrawal-${state.withdrawalCount}`, saldo_nuevo: state.balance, idempotent: mutation.idempotent } })
  }

  const shiftStartMatch = path.match(/^\/api\/cajas\/cambio-turno\/iniciar\/([^/]+)$/)
  if (method === 'POST' && shiftStartMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    if (body.usuario_entrante_id !== ids.incoming) return json(response, 400, { message: 'QA_474_INCOMING_USER_REQUIRED' })
    if (!mutation.idempotent) {
      state.frozen = true
      state.shiftId = ids.shift
      state.shiftStarts += 1
    }
    return json(response, 201, { success: true, data: { id: ids.shift, saldo_sistema: state.balance, idempotent: mutation.idempotent } })
  }

  const shiftCancelMatch = path.match(/^\/api\/cajas\/cambio-turno\/cancelar\/([^/]+)$/)
  if (method === 'POST' && shiftCancelMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    if (!mutation.idempotent) {
      state.frozen = false
      state.shiftId = null
      state.shiftCancels += 1
    }
    return json(response, 200, { success: true, data: { id: ids.shift, estado: 'CANCELADO', idempotent: mutation.idempotent } })
  }

  const shiftCompleteMatch = path.match(/^\/api\/cajas\/cambio-turno\/completar\/([^/]+)$/)
  if (method === 'POST' && shiftCompleteMatch) {
    const body = await bodyOf(request)
    const mutation = recordMutation(request, path, body)
    if (mutation.error) return json(response, 409, { message: mutation.error })
    const difference = Number(body.monto_contado) - state.balance
    if (!body.confirmacion_saliente || !body.confirmacion_entrante || !body.foto_arqueo) return json(response, 400, { message: 'QA_474_SHIFT_EVIDENCE_REQUIRED' })
    if (Math.abs(difference) >= 0.01 && body.cuenta_diferencia_id !== (difference > 0 ? ids.incomeAccount : ids.expenseAccount)) return json(response, 400, { message: 'QA_474_SHIFT_DIFFERENCE_ACCOUNT_REQUIRED' })
    if (!mutation.idempotent) {
      state.balance = Number(body.monto_contado)
      state.frozen = false
      state.shiftId = null
      state.shiftCompletes += 1
    }
    return json(response, 200, { success: true, data: { id: ids.shift, estado: 'COMPLETADO', diferencia: difference, idempotent: mutation.idempotent } })
  }

  if (method === 'GET') return json(response, 200, { success: true, data: [] })
  return json(response, 404, { message: `QA_474_UNHANDLED_${method}_${path}` })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`QA_CASH_474_MOCK_READY http://127.0.0.1:${port}`)
  console.log('QA user: qa-cash-474@local.test / CashVisual474!')
})
