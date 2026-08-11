import http from 'node:http'

const port = Number(process.argv[2] || process.env.QA_CONFIG_MOCK_PORT || 43102)
const demoUser = {
  id: '46400000-0000-4000-8000-000000000064',
  email: 'demo-co-464@temp.local',
  nombre: 'Administrador Demo',
  apellido: 'Colombia',
  roles: ['ADMIN_DEMO'],
  tenant_id: '46400000-0000-4000-8000-000000000046',
  is_super_admin: false,
}
let lastDemoCreate = null

function json(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key,x-country-id',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    })
    res.end()
    return
  }

  if (req.method === 'GET' && path === '/__qa__/last-demo-create') {
    json(res, 200, lastDemoCreate || {})
    return
  }

  if (req.method === 'POST' && path === '/api/demo/create') {
    const body = await readJson(req)
    const idempotencyKey = String(req.headers['idempotency-key'] || '')
    lastDemoCreate = {
      country: body.pais,
      duration: body.dias_duracion,
      idempotencyKey,
      atomicEndpoint: true,
    }
    if (body.pais !== 'CO' || idempotencyKey.length < 8) {
      json(res, 400, { message: 'QA esperaba país CO e Idempotency-Key estable' })
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 700))
    json(res, 201, {
      success: true,
      ready: true,
      tenant_id: demoUser.tenant_id,
      user_id: demoUser.id,
      email: demoUser.email,
      password: 'DemoVisual464!',
      token: 'mock-access-token-464',
      expires_at: '2026-08-24T23:59:59.000Z',
      dias_restantes: 14,
      pais: 'CO',
      pais_id: 2,
      moneda: 'COP',
      autoridad_fiscal: 'DIAN',
      aprobador_user_id: '46400000-0000-4000-8000-000000000065',
      aprobador_email: 'aprobador-co-464@temp.local',
      idempotent: false,
      readiness: { ready: true, productos: 6, clientes: 3, proveedores: 2 },
    })
    return
  }

  if (req.method === 'POST' && path === '/api/auth/login') {
    const body = await readJson(req)
    if (body.email !== demoUser.email || body.password !== 'DemoVisual464!') {
      json(res, 401, { message: 'Credenciales QA inválidas' })
      return
    }
    json(res, 200, {
      access_token: 'mock-access-token-464',
      user: demoUser,
      session_token: 'mock-session-464',
    }, {
      'Set-Cookie': 'access_token=mock-access-token-464; Path=/; HttpOnly; SameSite=Lax',
    })
    return
  }

  if (req.method === 'GET' && path === '/api/auth/profile') {
    json(res, 200, demoUser)
    return
  }

  if (req.method === 'GET' && path === '/api/dashboard/stats') {
    json(res, 200, {
      success: true,
      data: {
        ventas_hoy: 125000,
        compras_mes: 480000,
        productos_stock_bajo: 0,
        cuentas_por_cobrar: 210000,
      },
    })
    return
  }

  if (req.method === 'GET' && (
    path === '/api/configuration/status'
    || path === '/api/configuration/context/status'
    || path === '/api/configuracion/status'
  )) {
    json(res, 200, {
      success: true,
      data: {
        isComplete: true,
        isDemo: true,
        completionPercentage: 100,
        missingItems: [],
        certificate: { exists: true, isValid: true },
        ruc: { isConfigured: true, missingFields: [] },
      },
    })
    return
  }

  if (req.method === 'GET' && path === '/api/configuration/context/country') {
    json(res, 200, {
      success: true,
      data: {
        pais_id: 3,
        paisCodigo: 'CO',
        paisNombre: 'Colombia',
        monedaDefecto: 'COP',
      },
    })
    return
  }

  if (req.method === 'GET') {
    json(res, 200, { success: true, data: [] })
    return
  }
  json(res, 200, { success: true, data: {} })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`QA_CONFIG_DEMO_MOCK_READY http://127.0.0.1:${port}`)
})
