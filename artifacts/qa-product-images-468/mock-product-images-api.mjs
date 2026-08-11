import http from 'node:http'

const port = Number(process.argv[2] || process.env.QA_PRODUCT_IMAGES_468_PORT || 14626)
const webOrigin = process.env.QA_PRODUCT_IMAGES_468_WEB_ORIGIN || 'http://127.0.0.1:14625'

const ids = {
  tenant: '46800000-0000-4000-8000-000000000001',
  actor: '46800000-0000-4000-8000-000000000002',
  product: '46800000-0000-4000-8000-000000000003',
  category: '46800000-0000-4000-8000-000000000004',
  warehouse: '46800000-0000-4000-8000-000000000005',
}

const user = {
  id: ids.actor,
  tenant_id: ids.tenant,
  email: 'qa-product-images-468@local.test',
  nombre: 'QA Imágenes 468',
  roles: ['ADMIN'],
  is_super_admin: false,
}

let product
let requests
let imageOperations

function reset() {
  product = {
    id: ids.product,
    tenant_id: ids.tenant,
    codigo: 'SKU-IMG-468',
    nombre: 'Café visual 468',
    descripcion: 'Producto para probar carga, reemplazo y eliminación de imagen',
    categoria: 'Bebidas',
    precio_venta: 25,
    precio_compra: 12,
    stock_actual: 8,
    stock: 8,
    stock_minimo: 2,
    stock_reservado: 0,
    codigo_barras: '775468000001',
    impuesto: 18,
    afectacion_igv: '10',
    activo: true,
    imagen_url: '',
    created_at: '2026-08-10T10:00:00.000Z',
    updated_at: '2026-08-10T10:00:00.000Z',
  }
  requests = []
  imageOperations = new Map()
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

async function rawBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function jsonBody(request) {
  const body = await rawBody(request)
  return body.length ? JSON.parse(body.toString('utf8')) : {}
}

function idempotency(request, action, fingerprint) {
  const key = String(request.headers['idempotency-key'] || '')
  if (key.length < 8) return { error: 'Idempotency-Key requerido', key }
  const prior = imageOperations.get(`${action}:${key}`)
  if (prior && prior !== fingerprint) return { error: 'Clave reutilizada con otra intención', key }
  const replay = Boolean(prior)
  imageOperations.set(`${action}:${key}`, fingerprint)
  return { key, replay }
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
    return json(response, 200, { success: true })
  }
  if (method === 'GET' && path === '/__qa__/state') {
    return json(response, 200, {
      success: true,
      product,
      requests,
      imageOperations: [...imageOperations.entries()],
    })
  }

  if (method === 'GET' && path === '/api/auth/profile') return json(response, 200, user)
  if (method === 'GET' && path === '/api/tenants/me') return json(response, 200, { ...user, nombre: 'Empresa QA 468', pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' })
  if (method === 'GET' && path === '/api/paises') return json(response, 200, { success: true, data: [{ id: 1, codigo_iso: 'PE', nombre: 'Perú', nombre_fiscal: 'SUNAT', moneda_codigo: 'PEN', moneda_simbolo: 'S/', activo: true }] })
  if (method === 'GET' && path === '/api/configuration/context/country') return json(response, 200, { success: true, data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', moneda: 'PEN', monedaDefecto: 'PEN', locale: 'es-PE', impuestoRate: 0.18, servicioFiscal: 'SUNAT' } })
  if (method === 'GET' && (path === '/api/configuration/status' || path === '/api/configuration/context/status' || path === '/api/configuracion/status')) return json(response, 200, { success: true, data: { isComplete: true, completionPercentage: 100, missingItems: [] } })
  if (method === 'GET' && path === '/api/demo/status') return json(response, 200, { success: true, data: { is_demo: true } })
  if (method === 'GET' && path.includes('/usuarios-sistema/me/permissions')) return json(response, 200, { success: true, data: [
    { id: 'perm-468-1', tenant_id: ids.tenant, modulo: 'inventario', accion: 'productos.read', recurso: '*' },
    { id: 'perm-468-2', tenant_id: ids.tenant, modulo: 'inventario', accion: 'productos.create', recurso: '*' },
    { id: 'perm-468-3', tenant_id: ids.tenant, modulo: 'inventario', accion: 'productos.update', recurso: '*' },
    { id: 'perm-468-4', tenant_id: ids.tenant, modulo: 'inventario', accion: 'productos.delete', recurso: '*' },
  ] })
  if (method === 'GET' && path === '/api/notifications') return json(response, 200, { success: true, data: [] })

  if (method === 'GET' && path === '/api/inventario/almacenes') return json(response, 200, { success: true, data: [{ id: ids.warehouse, codigo: 'PRI', nombre: 'Principal' }] })
  if (method === 'GET' && path === '/api/inventario/categorias') return json(response, 200, { success: true, data: [{ id: ids.category, codigo: 'BEB', nombre: 'Bebidas', campos_extra: [] }] })
  if (method === 'GET' && path === '/api/inventario/productos') return json(response, 200, { success: true, data: [product] })
  if (method === 'GET' && path === `/api/inventario/productos/${ids.product}`) return json(response, 200, { success: true, data: product })

  if (method === 'POST' && path === '/api/inventario/productos') {
    const body = await jsonBody(request)
    requests.push({ method, path, key: body.idempotency_key || '', body })
    product = {
      ...product,
      ...body,
      id: ids.product,
      stock_actual: Number(body.stock_inicial || 0),
      stock: Number(body.stock_inicial || 0),
      activo: true,
      imagen_url: product.imagen_url,
      updated_at: new Date().toISOString(),
    }
    return json(response, 201, { success: true, data: product, message: 'Producto creado' })
  }
  if (method === 'PUT' && path === `/api/inventario/productos/${ids.product}`) {
    const body = await jsonBody(request)
    requests.push({ method, path, key: body.idempotency_key || '', body })
    product = { ...product, ...body, id: ids.product, updated_at: new Date().toISOString() }
    return json(response, 200, { success: true, data: product })
  }

  if (method === 'POST' && path === `/api/inventario/productos/${ids.product}/imagen`) {
    const contentType = String(request.headers['content-type'] || '')
    const body = await rawBody(request)
    const intent = idempotency(request, 'SUBIR', `${ids.product}:${body.length}`)
    requests.push({ method, path, key: intent.key, contentType, bytes: body.length, replay: intent.replay })
    if (intent.error) return json(response, 409, { success: false, message: intent.error })
    if (!contentType.startsWith('multipart/form-data; boundary=') || body.length < 20) {
      return json(response, 400, { success: false, message: 'Archivo multipart inválido' })
    }
    product = { ...product, imagen_url: `${webOrigin}/logo.png`, updated_at: new Date().toISOString() }
    return json(response, 200, {
      success: true,
      data: {
        operation_id: '46800000-0000-4000-8000-000000000101',
        imagen_id: '46800000-0000-4000-8000-000000000102',
        imagen_url: product.imagen_url,
        estado: 'ACTIVA',
        idempotent: intent.replay,
      },
    })
  }

  if (method === 'DELETE' && path === `/api/inventario/productos/${ids.product}/imagen`) {
    const intent = idempotency(request, 'ELIMINAR', ids.product)
    requests.push({ method, path, key: intent.key, replay: intent.replay })
    if (intent.error) return json(response, 409, { success: false, message: intent.error })
    product = { ...product, imagen_url: '', updated_at: new Date().toISOString() }
    return json(response, 200, {
      success: true,
      data: { operation_id: '46800000-0000-4000-8000-000000000103', estado: 'BORRADA', idempotent: intent.replay },
    })
  }

  if (method === 'DELETE' && path === `/api/inventario/productos/${ids.product}`) {
    product = { ...product, activo: false }
    return json(response, 200, { success: true, data: product })
  }

  if (method === 'GET') return json(response, 200, { success: true, data: [] })
  return json(response, 404, { success: false, message: `QA 468 sin ruta ${method} ${path}` })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`QA product images 468 API listening on http://127.0.0.1:${port}`)
})
