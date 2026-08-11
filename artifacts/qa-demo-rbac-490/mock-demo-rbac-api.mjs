import http from 'node:http'

const host = '127.0.0.1'
const port = Number(process.env.QA_API_PORT || 14691)
const webOrigin = process.env.QA_WEB_ORIGIN || 'http://127.0.0.1:14690'
const tenantId = '49000000-0000-4000-8000-000000000001'
const user = {
  id: '49000000-0000-4000-8000-000000000002', tenant_id: tenantId,
  email: 'admin.demo490@erp.local', nombre: 'Admin', apellido: 'Demo',
  roles: ['ADMIN_DEMO'], is_demo_user: true, is_super_admin: false,
}
const allPermissions = [
  { id: '49000000-0000-4000-8000-000000000011', codigo: 'users.manage', modulo: 'users', recurso: null, accion: 'manage', descripcion: 'Administrar usuarios y roles' },
  { id: '49000000-0000-4000-8000-000000000012', codigo: 'ventas.pedidos.ver', modulo: 'ventas', recurso: 'pedidos', accion: 'ver', descripcion: 'Consultar pedidos' },
  { id: '49000000-0000-4000-8000-000000000013', codigo: 'ventas.pedidos.crear', modulo: 'ventas', recurso: 'pedidos', accion: 'crear', descripcion: 'Crear pedidos' },
  { id: '49000000-0000-4000-8000-000000000014', codigo: 'configuracion.usuarios.ver', modulo: 'configuracion', recurso: 'usuarios', accion: 'ver', descripcion: 'Consultar usuarios' },
  { id: '49000000-0000-4000-8000-000000000015', codigo: 'configuracion.usuarios.crear', modulo: 'configuracion', recurso: 'usuarios', accion: 'crear', descripcion: 'Crear usuarios' },
  { id: '49000000-0000-4000-8000-000000000016', codigo: 'tenants.manage', modulo: 'tenants', recurso: null, accion: 'manage', descripcion: 'Administración global bloqueada' },
].map((permission) => ({ ...permission, tenant_id: tenantId, activo: true }))

let roles = [{
  id: '49000000-0000-4000-8000-000000000021', nombre: 'ADMIN_DEMO',
  descripcion: 'Administrador operativo de la empresa demo', usuariosCount: 1,
  permisos: ['users.manage', 'ventas.pedidos.ver', 'ventas.pedidos.crear'], activo: true,
}]
const requests = []
const plans = [
  {
    id: 'basico', nombre: 'Básico', usuarios: 5, facturas_mes: 500,
    ofertas: [
      { id: 'trimestral', nombre: '3 meses', meses_pagados: 3, meses_bonificados: 0, meses_servicio: 3, monto: 297, moneda: 'PEN' },
      { id: 'semestral', nombre: '6 + 3 meses', meses_pagados: 6, meses_bonificados: 3, meses_servicio: 9, monto: 594, moneda: 'PEN' },
      { id: 'anual', nombre: '12 + 6 meses', meses_pagados: 12, meses_bonificados: 6, meses_servicio: 18, monto: 990, moneda: 'PEN' },
    ],
  },
  {
    id: 'profesional', nombre: 'Profesional', usuarios: 20, facturas_mes: 5000,
    ofertas: [
      { id: 'trimestral', nombre: '3 meses', meses_pagados: 3, meses_bonificados: 0, meses_servicio: 3, monto: 597, moneda: 'PEN' },
      { id: 'semestral', nombre: '6 + 3 meses', meses_pagados: 6, meses_bonificados: 3, meses_servicio: 9, monto: 1194, moneda: 'PEN' },
      { id: 'anual', nombre: '12 + 6 meses', meses_pagados: 12, meses_bonificados: 6, meses_servicio: 18, monto: 1990, moneda: 'PEN' },
    ],
  },
]

function send(response, status, payload, headers = {}) {
  const body = status === 204 ? '' : JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': webOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-country-id, cache-control',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...headers,
  })
  response.end(body)
}

async function bodyOf(request) {
  let raw = ''
  for await (const chunk of request) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || host}`)
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname
  if (request.method === 'OPTIONS') return send(response, 204, {})
  if (path === '/__qa__/state') return send(response, 200, { roles, requests })
  if (path === '/api/auth/login' && request.method === 'POST') return send(response, 200, { access_token: 'qa-demo-490', user }, { 'set-cookie': 'access_token=qa-demo-490; Path=/; HttpOnly; SameSite=Lax' })
  if (path === '/api/auth/profile') return send(response, 200, user)
  if (path === '/api/auth/logout') return send(response, 200, { success: true }, { 'set-cookie': 'access_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' })
  if (path === '/api/tenants/me') return send(response, 200, { success: true, data: { id: tenantId, nombre: 'Empresa Demo RBAC', email: user.email, pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' } })
  if (path === '/api/configuration/context/country') return send(response, 200, { success: true, data: { pais_id: 1, paisCodigo: 'PE', monedaDefecto: 'PEN' } })
  if (path === '/api/configuration/context/status') return send(response, 200, { success: true, data: { isComplete: true, isDemo: true, completionPercentage: 100, missingItems: [], fiscal: { isEnabled: false, isReady: false, missingItems: [] } } })
  if (path === '/api/demo/status') return send(response, 200, { is_demo: true, is_expired: false, dias_restantes: 13, can_extend: true, pais: 'PE', planes_disponibles: plans })
  if (path === '/api/demo/create' && request.method === 'POST') {
    const body = await bodyOf(request)
    requests.push({ method: request.method, path, body, idempotency_key: request.headers['idempotency-key'] })
    return send(response, 201, { email: user.email, password: 'DemoTemporal490', tenant_id: tenantId, rubro: body.rubro })
  }
  if (path === '/api/demo/convert-to-real' && request.method === 'POST') {
    const body = await bodyOf(request)
    requests.push({ method: request.method, path, body })
    const plan = plans.find((item) => item.id === body.plan_id) || plans[0]
    const offer = plan.ofertas.find((item) => item.id === body.periodo) || plan.ofertas[0]
    return send(response, 200, {
      payment_pending: true, solicitud_id: '49000000-0000-4000-8000-000000000099',
      monto: offer.monto, plan: plan.nombre, oferta: offer,
      datos_pago: { titular: 'ERP QA', banco: 'Banco local de pruebas', cuenta: '000-490', cci: '00000000000000000490', moneda: 'PEN', whatsapp: '+51 900 000 490', whatsappUrl: 'https://example.invalid/qa', email: 'operaciones@example.invalid' },
    })
  }
  if (path === '/api/usuarios-sistema/me/permissions') return send(response, 200, { success: true, data: allPermissions.filter((p) => !p.codigo.startsWith('tenants.')) })
  if (path === '/api/notifications/unread') return send(response, 200, { success: true, data: { count: 0 } })
  if (path === '/api/notifications') return send(response, 200, { success: true, data: [] })
  if (path === '/api/usuarios-sistema' && request.method === 'GET') return send(response, 200, { success: true, data: [] })
  if (path === '/api/usuarios-sistema/roles') return send(response, 200, { success: true, data: roles })
  if (path === '/api/usuarios-sistema/stats') return send(response, 200, { success: true, data: { totalUsuarios: 1, usuariosActivos: 1, usuariosInactivos: 0, totalRoles: roles.length } })
  if (path === '/api/permissions' && request.method === 'GET') return send(response, 200, { success: true, data: allPermissions })
  if (path === '/api/roles' && request.method === 'POST') {
    const body = await bodyOf(request)
    requests.push({ method: request.method, path, body })
    const selected = allPermissions.filter((permission) => body.permission_ids?.includes(permission.id))
    if (!body.idempotency_key || selected.some((permission) => permission.codigo === 'tenants.manage')) {
      return send(response, 403, { success: false, message: 'Permiso restringido o intención inválida' })
    }
    const existing = roles.find((role) => role.idempotency_key === body.idempotency_key)
    if (existing) return send(response, 200, { success: true, data: existing })
    const role = { id: `49000000-0000-4000-8000-${String(roles.length + 30).padStart(12, '0')}`, ...body, permisos: selected.map((permission) => permission.codigo), usuariosCount: 0, activo: true }
    roles = [...roles, role]
    return send(response, 201, { success: true, data: role, message: 'Rol creado exitosamente' })
  }
  return send(response, 404, { success: false, message: `QA route missing: ${request.method} ${path}` })
})

server.listen(port, host, () => console.log(`QA demo RBAC 490: http://${host}:${port}`))
