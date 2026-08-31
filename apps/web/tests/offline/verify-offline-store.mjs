import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const webRoot = process.cwd()
const repoRoot = path.resolve(webRoot, '../..')
const tempRoot = path.join(webRoot, '.offline-test-tmp')
fs.rmSync(tempRoot, { recursive: true, force: true })
fs.mkdirSync(tempRoot, { recursive: true })
const tempDir = fs.mkdtempSync(path.join(tempRoot, 'run-'))

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  })
}

try {
  const tscBin = path.join(webRoot, 'node_modules', 'typescript', 'bin', 'tsc')
  run(process.execPath, [
    tscBin,
    'apps/web/lib/offline-store.ts',
    '--outDir',
    tempDir,
    '--module',
    'commonjs',
    '--target',
    'es2022',
    '--moduleResolution',
    'node',
    '--esModuleInterop',
    '--skipLibCheck',
    '--noEmit',
    'false',
    '--strict',
    '--lib',
    'dom,dom.iterable,es2022',
  ])

const testScript = `
const Module = require('module')
const originalLoad = Module._load
let invokeCalls = []
let invokeHandler = async () => {
  throw new Error('invoke handler no configurado')
}
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@tauri-apps/api/core') {
    return {
      invoke: (command, args) => {
        invokeCalls.push({ command, args })
        return invokeHandler(command, args)
      },
    }
  }
  return originalLoad.apply(this, arguments)
}

const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
  __TAURI__: undefined,
}
let online = true
Object.defineProperty(globalThis, 'navigator', {
  value: {
    get onLine() {
      return online
    },
  },
  configurable: true,
})
const mod = require('./offline-store.js')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

;(async () => {
  let fetchCalls = 0
  globalThis.fetch = async (url) => {
    fetchCalls += 1
    if (url.includes('/api/cacheable') && fetchCalls === 1) {
      return new Response(JSON.stringify({ success: true, data: [{ id: 1 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw new Error('network down')
  }

  const onlineGet = await mod.fetchWithOfflineSupport(
    'http://api.test/api/cacheable',
    { method: 'GET' },
    { endpoint: '/api/cacheable' },
  )
  assert(onlineGet.ok, 'GET online debe responder OK')
  assert((await onlineGet.clone().json()).data[0].id === 1, 'GET online debe devolver payload')

  const cachedGet = await mod.fetchWithOfflineSupport(
    'http://api.test/api/cacheable',
    { method: 'GET' },
    { endpoint: '/api/cacheable' },
  )
  assert(cachedGet.headers.get('x-erp-offline-cache') === 'true', 'GET sin red debe devolver cache offline')
  assert((await cachedGet.json()).data[0].id === 1, 'cache debe preservar payload')

  online = false
  // Modela el evento 'offline' que en la app invalida el cache de offline_mode.
  // (Antes se esperaba el TTL de 1s; ahora la deteccion es por evento + TTL ampliado a 5s.)
  mod.invalidateOfflineModeCache()
  const queuedPost = await mod.fetchWithOfflineSupport(
    'http://api.test/api/orders',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify({ total: 10 }),
    },
    { endpoint: '/api/orders', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert(queuedPost.status === 202, 'POST sin red debe responder 202 queued')
  const queuedPayload = await queuedPost.json()
  assert(queuedPayload.offline === true && queuedPayload.queued === true, 'POST queued debe marcar offline queued')
  assert(fetchCalls === 2, 'modo offline no debe intentar red para escrituras')

  let queue = await mod.listOfflineRequests()
  assert(queue.length === 1, 'debe existir un item en cola')
  assert(queue[0].body === JSON.stringify({ total: 10 }), 'la cola debe guardar body JSON')
  assert(queue[0].tenant_id === 'tenant-1' && queue[0].user_id === 'user-1', 'la cola debe guardar tenant/user')
  assert(
    !queue[0].headers.some((header) => header.name.toLowerCase() === 'authorization'),
    'la cola no debe persistir Authorization',
  )

  let syncCall = 0
  let synchronizedAuthorization = null
  globalThis.fetch = async (_url, init) => {
    syncCall += 1
    synchronizedAuthorization = new Headers(init?.headers).get('Authorization')
    return new Response(JSON.stringify({ success: true, id: 'remote-1' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const syncResult = await mod.syncOfflineQueue('fresh-token')
  assert(syncResult.length === 1 && syncResult[0].ok === true, 'sync exitosa debe marcar ok')
  assert(synchronizedAuthorization === 'Bearer fresh-token', 'sync debe inyectar el token vigente solo al enviar')
  queue = await mod.listOfflineRequests()
  assert(queue[0].status === 'synced' && queue[0].response_status === 201, 'item debe quedar synced')

  await mod.enqueueOfflineRequest({
    endpoint: '/api/fail',
    method: 'POST',
    url: 'http://api.test/api/fail',
    headers: [],
    body: '{}',
    tenant_id: null,
    user_id: null,
  })
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'conflict' }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  })
  const failedResult = await mod.syncOfflineQueue()
  assert(failedResult.some((item) => item.ok === false && item.status === 409), 'HTTP 409 debe reportar fallo')
  queue = await mod.listOfflineRequests()
  const failed = queue.find((item) => item.endpoint === '/api/fail')
  assert(failed.status === 'failed' && failed.attempts === 1, 'fallo debe persistir attempts')
  assert(failed.response_status === 409, 'fallo HTTP debe persistir response_status')
  assert(failed.last_error.includes('conflict'), 'fallo debe persistir error del backend')

  await mod.enqueueOfflineRequest({
    endpoint: '/api/logical-fail',
    method: 'POST',
    url: 'http://api.test/api/logical-fail',
    headers: [],
    body: '{}',
    tenant_id: null,
    user_id: null,
  })
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'fallo logico' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
  const logicalFailedResult = await mod.syncOfflineQueue()
  assert(
    logicalFailedResult.some((item) => item.ok === false && item.status === 200 && item.error.includes('fallo logico')),
    'HTTP 200 con success=false debe reportar fallo logico',
  )
  queue = await mod.listOfflineRequests()
  const logicalFailed = queue.find((item) => item.endpoint === '/api/logical-fail')
  assert(logicalFailed.status === 'failed' && logicalFailed.response_status === 200, 'fallo logico debe persistirse como failed')

  online = false
  mod.invalidateOfflineModeCache()
  const formData = new FormData()
  formData.append('descripcion', 'archivo offline')
  formData.append('archivo', new File([Buffer.from('contenido')], 'doc.txt', { type: 'text/plain' }))
  const queuedUpload = await mod.fetchWithOfflineSupport(
    'http://api.test/api/documentos/upload',
    {
      method: 'POST',
      body: formData,
    },
    { endpoint: '/api/documentos/upload', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert(queuedUpload.status === 202, 'FormData offline debe quedar en cola')
  queue = await mod.listOfflineRequests()
  const upload = queue.find((item) => item.endpoint === '/api/documentos/upload')
  assert(upload.body.includes('__erp_offline_formdata'), 'FormData debe serializarse para sync')

  let binaryRejected = false
  try {
    await mod.fetchWithOfflineSupport(
      'http://api.test/api/binario',
      {
        method: 'POST',
        body: new ArrayBuffer(8),
      },
      { endpoint: '/api/binario' },
    )
  } catch {
    binaryRejected = true
  }
  assert(binaryRejected, 'body binario no serializable no debe entrar en cola offline')

  const deferredValidation = await mod.fetchWithOfflineSupport(
    'http://api.test/api/documentos/validar-documento',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: 10 }),
    },
    { endpoint: '/api/documentos/validar-documento' },
  )
  assert(deferredValidation.headers.get('x-erp-validation-deferred') === 'true', 'validacion externa offline debe diferirse')
  const deferredPayload = await deferredValidation.json()
  assert(deferredPayload.data.valido === true, 'validacion de documento offline debe permitir continuar provisionalmente')
  assert(deferredPayload.data.offline_validation_queue_id, 'validacion diferida debe guardar id de cola')
  queue = await mod.listOfflineRequests()
  const validationQueueItem = queue.find((item) => item.id === deferredPayload.data.offline_validation_queue_id)
  assert(validationQueueItem?.endpoint === '/api/documentos/validar-documento', 'validacion diferida debe quedar en outbox')
  assert(
    validationQueueItem.headers.some((header) => header.name === 'x-erp-local-entity-type' && header.value === 'external_validation'),
    'validacion diferida debe marcar tipo de entidad local',
  )

  const sensitiveBody = JSON.stringify({
    certificateBase64: 'PFX-SECRETO-NO-PERSISTIR',
    certificatePassword: 'clave-super-secreta',
    dian_software_pin: 'pin-dian-secreto',
  })
  const queueBeforeSensitiveAttempts = (await mod.listOfflineRequests()).length
  let sensitiveOfflineRejected = false
  try {
    await mod.fetchWithOfflineSupport(
      'http://api.test/api/configuration/wizard/validate-certificate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: sensitiveBody,
      },
      { endpoint: '/api/configuration/wizard/validate-certificate', tenantId: 'tenant-1' },
    )
  } catch (error) {
    sensitiveOfflineRejected = String(error?.message || error).includes('nunca se guarda en la cola offline')
  }
  assert(sensitiveOfflineRejected, 'certificado/PIN offline debe fallar cerrado con mensaje explicito')
  assert((await mod.listOfflineRequests()).length === queueBeforeSensitiveAttempts, 'certificado/PIN no debe entrar al outbox')

  let fiscalOfflineRejected = false
  try {
    await mod.fetchWithOfflineSupport(
      'http://api.test/api/cpe/comprobantes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo_documento: '01', total_venta: 119 }),
      },
      { endpoint: '/api/cpe/comprobantes', tenantId: 'tenant-co-real', userId: 'user-1' },
    )
  } catch (error) {
    fiscalOfflineRejected = String(error?.message || error).includes('emision fiscal requiere conexion en vivo')
  }
  assert(fiscalOfflineRejected, 'emision CPE offline debe fallar antes de la outbox')

  let fiscalPosOfflineRejected = false
  try {
    await mod.fetchWithOfflineSupport(
      'http://api.test/api/pos/venta',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emitir_cpe: true, tipo_comprobante: '01', total: 119 }),
      },
      { endpoint: '/api/pos/venta', tenantId: 'tenant-co-real', userId: 'user-1' },
    )
  } catch (error) {
    fiscalPosOfflineRejected = String(error?.message || error).includes('emision fiscal requiere conexion en vivo')
  }
  assert(fiscalPosOfflineRejected, 'POS fiscal offline no debe prometer una emision posterior')
  let malformedPosOfflineRejected = false
  try {
    await mod.fetchWithOfflineSupport(
      'http://api.test/api/pos/venta',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{payload-invalido' },
      { endpoint: '/api/pos/venta', tenantId: 'tenant-co-real', userId: 'user-1' },
    )
  } catch (error) {
    malformedPosOfflineRejected = String(error?.message || error).includes('emision fiscal requiere conexion en vivo')
  }
  assert(malformedPosOfflineRejected, 'payload POS ilegible no debe entrar a la cola offline')
  assert((await mod.listOfflineRequests()).length === queueBeforeSensitiveAttempts, 'CPE/POS fiscal no deben persistir intenciones offline')

  let directSensitiveEnqueueRejected = false
  try {
    await mod.enqueueOfflineRequest({
      endpoint: '/api/configuration/wizard/step',
      method: 'POST',
      url: 'http://api.test/api/configuration/wizard/step',
      headers: [],
      body: sensitiveBody,
      tenant_id: 'tenant-1',
      user_id: 'user-1',
    })
  } catch {
    directSensitiveEnqueueRejected = true
  }
  assert(directSensitiveEnqueueRejected, 'la API publica de enqueue tambien debe rechazar configuracion sensible')

  const outboxKey = 'erp.desktop.offline.outbox'
  const legacyQueue = JSON.parse(store.get(outboxKey))
  legacyQueue.push({
    id: 'legacy-sensitive-1',
    endpoint: '/api/configuration/complete',
    method: 'POST',
    url: 'http://api.test/api/configuration/complete',
    headers: [],
    body: sensitiveBody,
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    status: 'pending',
    attempts: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    last_error: null,
    response_status: null,
    response_body: null,
  })
  store.set(outboxKey, JSON.stringify(legacyQueue))
  queue = await mod.listOfflineRequests()
  assert(!queue.some((item) => item.id === 'legacy-sensitive-1'), 'listado debe excluir configuracion sensible legacy')
  assert(!store.get(outboxKey).includes('PFX-SECRETO-NO-PERSISTIR'), 'purga web debe borrar el secreto historico del storage')

  online = true
  mod.invalidateOfflineModeCache()
  globalThis.fetch = async () => {
    throw new Error('network down')
  }
  let sensitiveNetworkFailureRejected = false
  try {
    await mod.fetchWithOfflineSupport(
      'http://api.test/api/configuration/complete',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sensitiveBody },
      { endpoint: '/api/configuration/complete', tenantId: 'tenant-1' },
    )
  } catch (error) {
    sensitiveNetworkFailureRejected = String(error?.message || error).includes('nunca se guarda en la cola offline')
  }
  assert(sensitiveNetworkFailureRejected, 'fallo de red en configuracion sensible tampoco debe convertirse en cola')
  assert((await mod.listOfflineRequests()).length === queueBeforeSensitiveAttempts, 'fallo de red sensible no debe persistir body')
  online = false
  mod.invalidateOfflineModeCache()

  const status = await mod.getOfflineStatus()
  assert(status.total === 5 && status.synced === 1 && status.failed === 2 && status.pending === 2, 'status debe contar synced/failed/pending')

  window.__TAURI__ = {}
  let purgedDesktopSensitiveId = null
  invokeHandler = async (command, args) => {
    if (command === 'list_offline_requests') {
      return [{
        id: 'desktop-sensitive-legacy',
        endpoint: '/api/configuration/wizard/step',
        method: 'POST',
        url: 'http://api.test/api/configuration/wizard/step',
        headers: [],
        body: sensitiveBody,
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        attempts: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
        last_error: null,
        response_status: null,
        response_body: null,
      }]
    }
    if (command === 'delete_offline_request') {
      purgedDesktopSensitiveId = args.id
      return null
    }
    throw new Error('invoke inesperado durante purga desktop: ' + command)
  }
  const desktopQueueAfterPurge = await mod.listOfflineRequests()
  assert(desktopQueueAfterPurge.length === 0, 'listado Tauri no debe devolver configuracion sensible legacy')
  assert(purgedDesktopSensitiveId === 'desktop-sensitive-legacy', 'purga Tauri debe borrar el registro SQLite sensible')

  let rewrittenSyncUrl = null
  let rewrittenSyncBody = null
  invokeCalls = []
  invokeHandler = async (command, args) => {
    if (command === 'list_offline_requests') {
      return [{
        id: 'queued-dependent-1',
        endpoint: '/api/ventas/pedidos/local-order-1',
        method: 'PUT',
        url: 'http://api.test/api/ventas/pedidos/local-order-1',
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        body: JSON.stringify({ cliente_id: 'local-client-1', items: [{ producto_id: 'local-product-1' }] }),
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        attempts: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
        last_error: null,
        response_status: null,
        response_body: null,
      }]
    }
    if (command === 'list_local_id_mappings') {
      return [
        { local_id: 'local-client-1', remote_id: 'remote-client-1', entity_type: 'customer', endpoint: '/api/ventas/clientes', synced_at: Date.now(), response_json: null },
        { local_id: 'local-product-1', remote_id: 'remote-product-1', entity_type: 'product', endpoint: '/api/inventario/productos', synced_at: Date.now(), response_json: null },
        { local_id: 'local-order-1', remote_id: 'remote-order-1', entity_type: 'order', endpoint: '/api/ventas/pedidos', synced_at: Date.now(), response_json: null },
      ]
    }
    if (command === 'mark_offline_request_synced') return null
    throw new Error('invoke inesperado en sync con mappings: ' + command)
  }
  globalThis.fetch = async (url, init) => {
    rewrittenSyncUrl = String(url)
    rewrittenSyncBody = String(init.body)
    return new Response(JSON.stringify({ success: true, data: { id: 'remote-order-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const mappedSync = await mod.syncOfflineQueue()
  assert(mappedSync.length === 1 && mappedSync[0].ok === true, 'sync Tauri con mappings debe completar')
  assert(rewrittenSyncUrl.includes('/api/ventas/pedidos/remote-order-1'), 'sync debe reescribir IDs locales en endpoint')
  assert(rewrittenSyncBody.includes('remote-client-1') && rewrittenSyncBody.includes('remote-product-1'), 'sync debe reescribir IDs locales en body')

  online = false
  mod.invalidateOfflineModeCache()
  invokeCalls = []
  invokeHandler = async (command, args) => {
    if (command === 'get_offline_status') {
      return { offline_mode: true, total: 0, pending: 0, failed: 0, synced: 0 }
    }
    if (command === 'get_local_first_response') {
      if (args.endpoint === '/api/pos/productos') {
        assert(args.tenantId === 'tenant-1', 'GET local-first debe pasar tenantId a Tauri')
      }
      assert(
        [
          '/api/pos/productos',
          '/api/cpe/comprobantes',
          '/api/inventario/productos',
          '/api/ventas/clientes',
          '/api/ventas/cotizaciones',
          '/api/ventas/pedidos',
          '/api/rrhh/empleados',
          '/api/cajas/movimientos/active-session',
          '/api/cajas/saldo-esperado/active-session',
          '/api/pos/detalles-venta/local-sale-1',
          '/api/paises/usuario/configuracion',
        ].includes(args.endpoint),
        'GET local-first debe pedir endpoint soportado',
      )
      return {
        status: 200,
        body: JSON.stringify({ success: true, data: [{ id: args.endpoint.includes('clientes') ? 'c1' : 'p1', stock_actual: 4 }] }),
        headers: [{ name: 'Content-Type', value: 'application/json' }],
      }
    }
    if (command === 'process_local_first_write') {
      if (args.request.endpoint === '/api/pos/venta') {
        assert(args.request.tenant_id === 'tenant-1', 'write local-first debe persistir tenant_id')
      }
      assert(
        [
          '/api/pos/venta',
          '/api/inventario/productos',
          '/api/ventas/clientes',
          '/api/ventas/cotizaciones',
          '/api/ventas/pedidos',
          '/api/rrhh/empleados',
          '/api/finanzas/tesoreria/lote',
          '/api/cajas/movimientos/manual/active-session',
          '/api/cajas/retiros/active-session',
          '/api/cajas/cambio-turno/iniciar/active-session',
          '/api/cajas/cambio-turno/completar/local-shift-change-1',
          '/api/notifications/mark-all-read',
          '/api/paises/usuario/configuracion',
        ].includes(args.request.endpoint),
        'escritura debe procesarse local-first',
      )
      return {
        status: 200,
        body: JSON.stringify({
          success: true,
          data: args.request.endpoint === '/api/pos/venta'
            ? { venta_id: 'local-sale-1', estado: 'PENDIENTE_SYNC' }
            : { id: 'local-entity-1', sync_status: 'pending' },
        }),
        headers: [{ name: 'Content-Type', value: 'application/json' }],
      }
    }
    if (command === 'get_binary_response') {
      assert(args.endpoint === '/api/reportes/pdf', 'binario offline debe pedir endpoint normalizado')
      assert(args.tenantId === 'tenant-1', 'binario offline debe pasar tenantId a Tauri')
      return {
        status: 200,
        body_base64: Buffer.from('%PDF-local').toString('base64'),
        cached_at: Date.now(),
        headers: [{ name: 'Content-Type', value: 'application/pdf' }],
      }
    }
    if (command === 'list_local_id_mappings') {
      return [{
        local_id: 'local-entity-1',
        remote_id: 'remote-entity-1',
        entity_type: 'generic_record',
        endpoint: '/api/rrhh/empleados',
        synced_at: Date.now(),
        response_json: null,
      }]
    }
    throw new Error('invoke inesperado: ' + command)
  }

  const localProducts = await mod.fetchWithOfflineSupport(
    'http://api.test/api/pos/productos',
    { method: 'GET' },
    { endpoint: '/api/pos/productos', tenantId: 'tenant-1' },
  )
  assert(localProducts.headers.get('x-erp-local-first') === 'true', 'GET POS offline debe salir de SQLite local-first')
  assert((await localProducts.json()).data[0].id === 'p1', 'GET POS local-first debe preservar data')

  const localCpeList = await mod.fetchWithOfflineSupport(
    'http://api.test/api/cpe/comprobantes',
    { method: 'GET' },
    { endpoint: '/api/cpe/comprobantes', tenantId: 'tenant-1' },
  )
  assert(localCpeList.headers.get('x-erp-local-first') === 'true', 'lectura CPE offline debe conservar vista/cache local')

  const localSale = await mod.fetchWithOfflineSupport(
    'http://api.test/api/pos/venta',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: 20, items: [{ producto_id: 'p1', cantidad: 1 }] }),
    },
    { endpoint: '/api/pos/venta', tenantId: 'tenant-1', userId: 'user-1' },
  )
  const localSalePayload = await localSale.json()
  assert(localSale.status === 200, 'venta POS local-first debe responder 200 al POS')
  assert(localSalePayload.data.venta_id === 'local-sale-1', 'venta POS local-first debe devolver venta local')
  assert(invokeCalls.some((call) => call.command === 'process_local_first_write'), 'venta local-first debe invocar Tauri')

  const localInventory = await mod.fetchWithOfflineSupport(
    'http://api.test/api/inventario/productos?search=abc',
    { method: 'GET' },
    { endpoint: '/api/inventario/productos?search=abc' },
  )
  assert(localInventory.headers.get('x-erp-local-first') === 'true', 'inventario offline debe leer SQLite')

  const localProductCreate = await mod.fetchWithOfflineSupport(
    'http://api.test/api/inventario/productos',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: 'P1', nombre: 'Producto 1' }),
    },
    { endpoint: '/api/inventario/productos' },
  )
  assert((await localProductCreate.json()).data.sync_status === 'pending', 'producto offline debe quedar pending')

  const localCustomerCreate = await mod.fetchWithOfflineSupport(
    'http://api.test/api/ventas/clientes',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razon_social: 'Cliente 1', ruc: '20123456789' }),
    },
    { endpoint: '/api/ventas/clientes' },
  )
  assert((await localCustomerCreate.json()).data.sync_status === 'pending', 'cliente offline debe quedar pending')

  const localQuoteList = await mod.fetchWithOfflineSupport(
    'http://api.test/api/ventas/cotizaciones?page=1',
    { method: 'GET' },
    { endpoint: '/api/ventas/cotizaciones?page=1' },
  )
  assert(localQuoteList.headers.get('x-erp-local-first') === 'true', 'cotizaciones offline deben leer SQLite')

  const localQuoteCreate = await mod.fetchWithOfflineSupport(
    'http://api.test/api/ventas/cotizaciones',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: 'c1', detalle: [{ producto_id: 'p1', cantidad: 1, precio_unitario: 10 }] }),
    },
    { endpoint: '/api/ventas/cotizaciones' },
  )
  assert((await localQuoteCreate.json()).data.sync_status === 'pending', 'cotizacion offline debe quedar pending')

  const localOrderCreate = await mod.fetchWithOfflineSupport(
    'http://api.test/api/ventas/pedidos',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: 'c1', detalle: [{ producto_id: 'p1', cantidad: 1, precio_unitario: 10 }] }),
    },
    { endpoint: '/api/ventas/pedidos' },
  )
  assert((await localOrderCreate.json()).data.sync_status === 'pending', 'pedido offline debe quedar pending')

  const localGenericList = await mod.fetchWithOfflineSupport(
    'http://api.test/api/rrhh/empleados',
    { method: 'GET' },
    { endpoint: '/api/rrhh/empleados' },
  )
  assert(localGenericList.headers.get('x-erp-local-first') === 'true', 'modulo generico offline debe leer SQLite')

  const localGenericCreate = await mod.fetchWithOfflineSupport(
    'http://api.test/api/rrhh/empleados',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombres: 'Empleado', apellidos: 'Offline' }),
    },
    { endpoint: '/api/rrhh/empleados' },
  )
  assert((await localGenericCreate.json()).data.sync_status === 'pending', 'modulo generico offline debe quedar pending')

  const localCashMovement = await mod.fetchWithOfflineSupport(
    'http://api.test/api/cajas/movimientos/manual/active-session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'INGRESO', monto: 15, motivo: 'Ajuste local' }),
    },
    { endpoint: '/api/cajas/movimientos/manual/active-session' },
  )
  assert((await localCashMovement.json()).data.sync_status === 'pending', 'movimiento de caja offline debe quedar pending')

  const localCashBalance = await mod.fetchWithOfflineSupport(
    'http://api.test/api/cajas/saldo-esperado/active-session',
    { method: 'GET' },
    { endpoint: '/api/cajas/saldo-esperado/active-session' },
  )
  assert(localCashBalance.headers.get('x-erp-local-first') === 'true', 'saldo esperado offline debe leer SQLite')

  const localTreasuryBatch = await mod.fetchWithOfflineSupport(
    'http://api.test/api/finanzas/tesoreria/lote',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagos: [{ cxp_id: 'cxp-1', monto: 10 }], cuenta_bancaria_id: 'bank-1' }),
    },
    { endpoint: '/api/finanzas/tesoreria/lote' },
  )
  assert((await localTreasuryBatch.json()).data.sync_status === 'pending', 'lote de tesoreria offline debe quedar pending')

  const localNotificationsRead = await mod.fetchWithOfflineSupport(
    'http://api.test/api/notifications/mark-all-read',
    { method: 'PUT' },
    { endpoint: '/api/notifications/mark-all-read' },
  )
  assert((await localNotificationsRead.json()).data.sync_status === 'pending', 'notificaciones offline deben quedar pending')

  const localCountryConfig = await mod.fetchWithOfflineSupport(
    'http://api.test/api/paises/usuario/configuracion',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pais_preferido_id: 1 }),
    },
    { endpoint: '/api/paises/usuario/configuracion' },
  )
  assert((await localCountryConfig.json()).data.sync_status === 'pending', 'preferencia de pais offline debe quedar pending')

  const localPdf = await mod.fetchWithOfflineSupport(
    'http://api.test/api/reportes/pdf',
    { method: 'GET' },
    { endpoint: '/api/reportes/pdf', tenantId: 'tenant-1' },
  )
  assert(localPdf.headers.get('x-erp-offline-cache') === 'true', 'binario offline debe salir del cache SQLite')
  assert((await localPdf.text()).includes('%PDF-local'), 'binario offline debe preservar bytes')

  const mappings = await mod.listLocalIdMappings()
  assert(mappings[0].local_id === 'local-entity-1', 'mapeos local-remoto deben exponerse al UI')

  console.log(JSON.stringify({ ok: true, fetchCalls, syncCall, status }, null, 2))
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
`

  fs.writeFileSync(path.join(tempDir, 'run-offline-store-test.cjs'), testScript)
  execFileSync(process.execPath, [path.join(tempDir, 'run-offline-store-test.cjs')], {
    cwd: tempDir,
    stdio: 'inherit',
  })
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
