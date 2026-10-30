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
assert(!mod.isDesktopRuntime(), 'Un navegador sin IPC nativo no es Desktop')
window.__TAURI_INTERNALS__ = { invoke: () => {} }
assert(mod.isDesktopRuntime(), 'Tauri 2 sin withGlobalTauri debe activar el almacenamiento nativo')
delete window.__TAURI_INTERNALS__

;(async () => {
  let snapshotReads = 0
  globalThis.fetch = async () => {
    snapshotReads += 1
    return new Response(JSON.stringify({ company: snapshotReads }), { headers: { 'Content-Type': 'application/json' } })
  }
  const missingScope = await mod.refreshLocalFirstSnapshots(['/api/snapshot'], { 'x-tenant-id': 'spoofed' })
  assert(missingScope.every((x) => !x.ok) && snapshotReads === 0, 'snapshot sin empresa de sesión no debe leer ni guardar contenido')
  const missingActor = await mod.refreshLocalFirstSnapshots(['/api/snapshot'], undefined, 'tenant-a')
  assert(missingActor.every((x) => !x.ok) && snapshotReads === 0, 'snapshot sin usuario de sesión no debe leer ni guardar contenido')
  await mod.refreshLocalFirstSnapshots(['/api/snapshot'], undefined, 'tenant-a', 'admin')
  await mod.refreshLocalFirstSnapshots(['/api/snapshot'], undefined, 'tenant-b', 'admin')
  await mod.refreshLocalFirstSnapshots(['/api/snapshot'], undefined, 'tenant-a', 'reader')
  const a = await mod.readCachedApiResponse('/backend/api/snapshot', 'tenant-a', 'admin')
  const b = await mod.readCachedApiResponse('/backend/api/snapshot', 'tenant-b', 'admin')
  assert((await a.json()).company === 1 && (await b.json()).company === 2, 'snapshots del mismo endpoint deben permanecer separados por empresa')
  const reader = await mod.readCachedApiResponse('/backend/api/snapshot', 'tenant-a', 'reader')
  assert((await reader.json()).company === 3, 'un usuario no debe sustituir el snapshot de otro en la misma empresa')
  assert(await mod.readCachedApiResponse('/backend/api/snapshot', 'tenant-a', 'other-user') === null, 'otro usuario de la misma empresa no puede leer snapshots ajenos')
  assert(await mod.readCachedApiResponse('/backend/api/snapshot', 'tenant-c', 'admin') === null, 'otra empresa no puede leer snapshots ajenos')
  assert(await mod.readCachedApiResponse('/backend/api/snapshot') === null, 'snapshot autenticado nunca debe quedar anónimo')
  globalThis.fetch = async () => new Response('{"message":"Permission denied"}', { status: 403 })
  const forbidden = await mod.fetchWithOfflineSupport('/backend/api/snapshot', { method: 'GET' }, {
    endpoint: '/api/snapshot', tenantId: 'tenant-a', userId: 'admin',
  })
  assert(forbidden.status === 403, 'un rechazo de permisos debe entregarse al formulario')
  assert(await mod.readCachedApiResponse('/backend/api/snapshot', 'tenant-a', 'admin') === null, '403 revoca la caché del actor')
  assert(await mod.readCachedApiResponse('/backend/api/snapshot', 'tenant-a', 'reader') !== null, '403 no borra caché de otro actor')
  mod.clearCachedApiResponses('reader')
  assert(await mod.readCachedApiResponse('/backend/api/snapshot', 'tenant-a', 'reader') === null, 'nuevo login invalida lecturas antiguas del actor')
  let finishLateRead
  let markReadStarted
  const readStarted = new Promise(resolve => { markReadStarted = resolve })
  globalThis.fetch = async (url) => {
    if (url.includes('/late-authorized')) {
      markReadStarted()
      return new Promise(resolve => { finishLateRead = resolve })
    }
    return new Response('{"message":"Permission denied"}', { status: 403 })
  }
  const lateRead = mod.fetchWithOfflineSupport('/backend/api/late-authorized', { method: 'GET' }, {
    endpoint: '/api/late-authorized', tenantId: 'tenant-a', userId: 'admin',
  })
  await readStarted
  await mod.fetchWithOfflineSupport('/backend/api/revoked', { method: 'GET' }, {
    endpoint: '/api/revoked', tenantId: 'tenant-a', userId: 'admin',
  })
  finishLateRead(new Response('{"data":[{"id":"privileged"}]}', { headers: { 'Content-Type': 'application/json' } }))
  const obsolete = await lateRead
  assert(obsolete.status === 409 && obsolete.headers.get('x-erp-authorization-changed') === 'true', 'lectura iniciada antes de403 debe descartarse al llegar tarde')
  assert(await mod.readCachedApiResponse('/backend/api/late-authorized', 'tenant-a', 'admin') === null, 'lectura antigua no puede repoblar caché revocada')
  globalThis.fetch = async () => { throw new Error('network down') }
  let revokedFallbackBlocked = false
  try {
    await mod.fetchWithOfflineSupport('/backend/api/late-authorized', { method: 'GET' }, {
      endpoint: '/api/late-authorized', tenantId: 'tenant-a', userId: 'admin',
    })
  } catch { revokedFallbackBlocked = true }
  assert(revokedFallbackBlocked, 'sin red no puede resucitar lectura previa a revocación')
  store.clear()
  store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'user-1', tenant_id: 'tenant-1' } }))
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
    { endpoint: '/api/cacheable', tenantId: 'tenant-a', userId: 'admin' },
  )
  assert(onlineGet.ok, 'GET online debe responder OK')
  assert((await onlineGet.clone().json()).data[0].id === 1, 'GET online debe devolver payload')

  const cachedGet = await mod.fetchWithOfflineSupport(
    'http://api.test/api/cacheable',
    { method: 'GET' },
    { endpoint: '/api/cacheable', tenantId: 'tenant-a', userId: 'admin' },
  )
  assert(cachedGet.headers.get('x-erp-offline-cache') === 'true', 'GET sin red debe devolver cache offline')
  assert((await cachedGet.json()).data[0].id === 1, 'cache debe preservar payload')
  let otherActorBlocked = false
  try {
    await mod.fetchWithOfflineSupport('http://api.test/api/cacheable', { method: 'GET' }, {
      endpoint: '/api/cacheable', tenantId: 'tenant-a', userId: 'reader',
    })
  } catch { otherActorBlocked = true }
  assert(otherActorBlocked, 'el fallback de red no puede entregar datos del administrador a otro usuario')
  store.set('erp.desktop.offline.cache', JSON.stringify([{
    url: 'http://api.test/api/legacy', endpoint: '/api/legacy', tenant_id: 'tenant-a',
    status: 200, body: '{"data":[{"id":"privileged"}]}', headers: [], cached_at: Date.now(),
  }]))
  assert(await mod.readCachedApiResponse('http://api.test/api/legacy', 'tenant-a', 'reader') === null, 'cachélegacy sin usuario debe fallar cerrada')

  const fetchCallsBeforeOfflineWrite = fetchCalls
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
  assert(fetchCalls === fetchCallsBeforeOfflineWrite, 'modo offline no debe intentar red para escrituras')

  let queue = await mod.listOfflineRequests()
  assert(queue.length === 1, 'debe existir un item en cola')
  assert(queue[0].body === JSON.stringify({ total: 10 }), 'la cola debe guardar body JSON')
  assert(queue[0].tenant_id === 'tenant-1' && queue[0].user_id === 'user-1', 'la cola debe guardar tenant/user')
  mod.clearCachedApiResponses('user-1')
  assert((await mod.listOfflineRequests())[0].id === queue[0].id, 'invalidar caché nunca elimina operaciones pendientes')
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
    tenant_id: 'tenant-1',
    user_id: 'user-1',
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
    tenant_id: 'tenant-1',
    user_id: 'user-1',
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
    { endpoint: '/api/documentos/validar-documento', tenantId: 'tenant-1', userId: 'user-1' },
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
  for (const endpoint of [
    '/api/rrhh/planillas/payroll-1/pagar',
    '/api/rrhh/planillas/payroll-1/pagar-empleados',
    '/api/rrhh/liquidaciones/liquidation-1/pagar',
    '/api/rrhh/liquidaciones/liquidation-1/pago/revertir',
    '/api/rrhh/cts/depositos/cts-1/depositar',
    '/api/finanzas/tesoreria/lote',
    '/api/finanzas/cxp/account-1/aplicar-pago',
    '/api/finanzas/cxc/account-1/pagos',
    '/backend/api/finanzas/cxc/account-1/pagos',
    '/finanzas/cxc/account-1/pagos',
    '/api/finanzas/cxc/account-1/reprogramar',
    '/backend/api/finanzas/cxc/account-1/reprogramar',
    '/finanzas/cxc/account-1/reprogramar',
    '/api/finanzas/cxc/account-1/notas-credito',
    '/backend/api/finanzas/cxc/account-1/notas-credito',
    '/finanzas/cxc/account-1/notas-credito',
    '/api/inventario/movimientos',
    '/api/inventario/transferencias',
    '/api/gre/guias',
    '/api/gre/guias/guide-1/firmar',
    '/api/gre/guias/guide-1/enviar-sunat',
    '/api/gre/guias/guide-1/reenviar',
    '/api/gre/guias/guide-1/consultar-sunat',
    '/api/gre/guias/guide-1/anular',
    '/api/cajas/register-1/apertura',
    '/api/cajas/register-1/cierre',
    '/api/cajas/validar-cierre/session-1',
    '/api/cajas/cerrar/session-1',
    '/api/cajas/retiros/session-1',
    '/api/cajas/retiros/withdrawal-1/conciliar',
    '/api/cajas/cambio-turno/iniciar/session-1',
    '/api/cajas/cambio-turno/completar/shift-1',
    '/api/cajas/cambio-turno/cancelar/shift-1',
    '/api/cajas/movimientos/manual/session-1',
    '/api/cajas/sesiones/session-1/cierre-administrativo',
  ]) {
    for (const connected of [false, true]) {
      online = connected
      mod.invalidateOfflineModeCache()
      globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
      let rejected = false
      try {
        await mod.fetchWithOfflineSupport('http://api.test' + endpoint + '/', {
          method: 'POST', body: JSON.stringify({ idempotency_key: 'same-intent' }),
        }, { endpoint, tenantId: 'tenant-1', userId: 'user-1' })
      } catch (error) {
        rejected = /requiere confirmaci[oó]n/.test(String(error?.message || error))
      }
      assert(rejected, 'una operación financiera sin confirmacion no puede convertirse en exito local: ' + endpoint)
      assert((await mod.listOfflineRequests()).length === queueBeforeSensitiveAttempts, 'una operación financiera no crea cola tras desconexion o perdida de respuesta')
    }
    let directRejected = false
    try {
      await mod.enqueueOfflineRequest({ endpoint: '/unrelated', url: 'http://api.test' + endpoint + '/?x=1', method: 'POST', headers: [], body: '{}', tenant_id: 'tenant-1', user_id: 'user-1' })
    } catch { directRejected = true }
    assert(directRejected, 'enqueue directo tampoco debe guardar operaciones financieras detectadas por URL')
  }
  online = false
  mod.invalidateOfflineModeCache()
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

  let documentFiscalOfflineChecks = 0
  for (const action of ['generar-xml', 'enviar-sunat']) {
    for (const prefix of ['', '/api', '/backend/api', 'http://api.test/backend/api']) {
      const endpoint = prefix + '/documentos/document-id/' + action + '/?retry=1'
      for (const byUrl of [false, true]) {
        const beforeQueue = store.get('erp.desktop.offline.outbox')
        let rejected = false
        try {
          await mod.fetchWithOfflineSupport(byUrl ? endpoint : 'http://api.test/unrelated', { method: 'POST', body: '{}' }, { endpoint: byUrl ? '/unrelated' : endpoint, tenantId: 'tenant-1', userId: 'user-1' })
        } catch (error) { rejected = String(error.message).includes('emision fiscal requiere conexion en vivo') }
        assert(rejected && store.get('erp.desktop.offline.outbox') === beforeQueue, 'Documentos: firma/envio offline must never enter the queue: ' + endpoint)
        documentFiscalOfflineChecks += 1
        rejected = false
        try { await mod.enqueueOfflineRequest({ endpoint: byUrl ? '/unrelated' : endpoint, url: byUrl ? endpoint : 'http://api.test/unrelated', method: 'POST', headers: [], body: '{}', tenant_id: 'tenant-1', user_id: 'user-1' }) }
        catch (error) { rejected = String(error.message).includes('emision fiscal requiere conexion en vivo') }
        assert(rejected && store.get('erp.desktop.offline.outbox') === beforeQueue, 'Public enqueue must reject document fiscal aliases')
        documentFiscalOfflineChecks += 1
      }
    }
  }

  const documentNetworkFetch = globalThis.fetch
  online = true; mod.invalidateOfflineModeCache()
  globalThis.fetch = async () => { throw new TypeError('Document fiscal network unavailable') }
  for (const action of ['generar-xml', 'enviar-sunat']) {
    const endpoint = '/backend/api/documentos/document-id/' + action
    const beforeQueue = store.get('erp.desktop.offline.outbox')
    let rejected = false
    try { await mod.fetchWithOfflineSupport('http://api.test' + endpoint, { method: 'POST', body: '{}' }, { endpoint, tenantId: 'tenant-1', userId: 'user-1' }) }
    catch (error) { rejected = String(error.message).includes('emision fiscal requiere conexion en vivo') }
    assert(rejected && store.get('erp.desktop.offline.outbox') === beforeQueue, 'Network failure cannot queue document fiscal aliases')
    documentFiscalOfflineChecks += 1
  }
  globalThis.fetch = documentNetworkFetch
  online = false; mod.invalidateOfflineModeCache()

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

  // Misma empresa, otro usuario: preservar la intención, pero no exponerla
  // ni permitir ACK, fallo o borrado usando su ID desde la sesión ajena.
  const originalOutbox = store.get('erp.desktop.offline.outbox')
  const ownerPending = queue.find(item => item.status === 'pending')
  store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'reader', tenant_id: 'tenant-1' } }))
  assert((await mod.listOfflineRequests('tenant-1')).length === 0 && (await mod.getOfflineStatus()).total === 0, 'lector no puede ver ni contar la cola del dueño')
  for (const attempt of [() => mod.deleteOfflineRequest(ownerPending.id), () => mod.markOfflineRequestSynced(ownerPending.id, 200), () => mod.markOfflineRequestFailed(ownerPending.id, 'foreign')]) {
    let rejected = false
    try { await attempt() } catch { rejected = true }
    assert(rejected, 'mutación de una cola ajena debe fallar cerrada')
  }
  assert(store.get('erp.desktop.offline.outbox') === originalOutbox, 'rechazos del lector conservan toda la cola original')
  let unauthorizedDispatches = 0
  globalThis.fetch = async () => { unauthorizedDispatches += 1; return new Response('{}') }
  assert((await mod.syncOfflineQueue('reader-token', 'tenant-1')).length === 0 && unauthorizedDispatches === 0, 'lector no puede enviar las intenciones del dueño')
  store.delete('erp.auth.session.snapshot')
  assert((await mod.listOfflineRequests()).length === 0 && (await mod.syncOfflineQueue()).length === 0, 'sin sesión no hay cola ni envío anónimos')
  store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'user-1', tenant_id: 'other-tenant' } }))
  assert((await mod.listOfflineRequests('tenant-1')).length === 0, 'mismo usuario con empresa distinta no recibe la cola anterior')
  store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'user-1', tenant_id: 'tenant-1' } }))
  assert((await mod.listOfflineRequests()).length === 5, 'volver al dueño recupera sus cinco elementos sin cambiarlos')

  // Un ACK tardío cierra sólo la solicitud del actor original. La siguiente
  // solicitud pendiente debe quedar sin enviar después del cambio de actor.
  let finishOwnedSend, signalOwnedSend
  const ownedSendStarted = new Promise(resolve => { signalOwnedSend = resolve })
  let ownedDispatches = 0
  globalThis.fetch = async () => { ownedDispatches += 1; signalOwnedSend(); return new Promise(resolve => { finishOwnedSend = resolve }) }
  const ownedSync = mod.syncOfflineQueue('owner-token', 'tenant-1')
  await ownedSendStarted
  store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'reader', tenant_id: 'tenant-1' } }))
  finishOwnedSend(new Response('{"success":true}', { status: 200 }))
  assert((await ownedSync).length === 1 && ownedDispatches === 1, 'cambio de actor detiene el lote después de la solicitud ya enviada')
  assert((await mod.listOfflineRequests()).length === 0, 'ACK tardío no aparece en la cola del lector')
  const acknowledged = JSON.parse(store.get('erp.desktop.offline.outbox'))
  assert(acknowledged.find(x => x.id === queue.find(x => x.status === 'failed').id).status === 'synced', 'ACK se conserva en la intención del dueño')
  assert(acknowledged.filter(x => x.status === 'pending').length === 2, 'restantes pendientes no se envían con sesión cambiada')
  store.set('erp.desktop.offline.outbox', originalOutbox)
  store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'user-1', tenant_id: 'tenant-1' } }))

  window.__TAURI_INTERNALS__ = { invoke: () => {} }
  store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'user-1', tenant_id: 'tenant-1' } }))
  let purgedDesktopSensitiveId = null
  invokeHandler = async (command, args) => {
    if (command === 'list_offline_requests') {
      assert(args.tenantId === 'tenant-1' && args.userId === 'user-1', 'La cola nativa exige empresa y propietario')
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
  const legacyCustomerBody = JSON.stringify({ telefono: '987000001', local_id: 'customer-id', external_id: 'customer-id', idempotency_key: 'customer-id', offline_entity_type: 'customer' })
  invokeHandler = async (command, args) => {
    if (command === 'list_offline_requests') return [{ id: 'native-legacy-customer', endpoint: '/api/ventas/clientes/customer-id', method: 'PUT', url: 'http://api.test/api/ventas/clientes/customer-id', headers: [{ name: 'x-erp-local-entity-type', value: 'customer' }], body: legacyCustomerBody, tenant_id: 'tenant-1', user_id: 'user-1', status: 'failed', attempts: 1 }]
    if (command === 'list_local_id_mappings') return []
    if (command === 'mark_offline_request_failed') { assert(args.userId === 'user-1' && args.tenantId === 'tenant-1', 'Fallo debe conservar la cola del propietario'); return null }
    throw new Error('invoke inesperado en recuperación cliente legacy: ' + command)
  }
  const recoveredNativeCustomer = await mod.syncOfflineQueue()
  assert(!recoveredNativeCustomer[0].ok && /no tiene clave/.test(recoveredNativeCustomer[0].error), 'Cliente legacy sin clave requiere conciliación antes de otro envío')
  assert(JSON.parse(legacyCustomerBody).local_id === 'customer-id', 'La recuperación no modifica el cuerpo de la intención durable')

  for (const responseStatus of [200, 503]) {
    const nativePending = ['in-flight', 'not-sent'].map(id => ({ id, endpoint: '/api/ventas/clientes/customer-id', method: 'PUT', url: 'http://api.test/api/ventas/clientes/customer-id', headers: [{name:'Idempotency-Key',value:'customer-edit-'+id}], body: '{}', tenant_id: 'tenant-1', user_id: 'user-1', status: 'pending', attempts: 0 }))
    let nativeAck, releaseNativeResponse, signalNativeRequest
    const nativeRequestStarted = new Promise(resolve => { signalNativeRequest = resolve })
    let nativeSends = 0
    invokeHandler = async (command, args) => {
      if (command === 'list_offline_requests') return nativePending
      if (command === 'list_local_id_mappings') {
        assert(args.tenantId === 'tenant-1' && args.userId === 'user-1', 'mappings de sincronización mantienen el dueño original')
        return []
      }
      if (command === 'mark_offline_request_synced' || command === 'mark_offline_request_failed') { nativeAck = { command, ...args }; return null }
      throw new Error('invoke inesperado en respuesta nativa tardía: ' + command)
    }
    globalThis.fetch = async () => { nativeSends += 1; signalNativeRequest(); return new Promise(resolve => { releaseNativeResponse = resolve }) }
    const nativeSync = mod.syncOfflineQueue('owner-token', 'tenant-1')
    await nativeRequestStarted
    store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'reader', tenant_id: 'tenant-1' } }))
    releaseNativeResponse(new Response('{"success":true}', { status: responseStatus }))
    assert((await nativeSync).length === 1 && nativeSends === 1, 'cambio de actor detiene el siguiente envío nativo')
    assert(nativeAck.id === 'in-flight' && nativeAck.tenantId === 'tenant-1' && nativeAck.userId === 'user-1', 'ACK/fallo nativos se persisten en SQLite del dueño original')
    assert(nativeAck.command === (responseStatus === 200 ? 'mark_offline_request_synced' : 'mark_offline_request_failed'), 'respuesta nativa conserva su estado real')
    store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'user-1', tenant_id: 'tenant-1' } }))
  }

  online = false
  mod.invalidateOfflineModeCache()
  invokeCalls = []
  invokeHandler = async (command, args) => {
    if (command === 'get_offline_status') {
      return { offline_mode: true, total: 0, pending: 0, failed: 0, synced: 0 }
    }
    if (command === 'get_local_first_response') {
      assert(args.userId === 'user-1' && args.authorization, 'SQLite exige actor y autorización vigente')
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
    { endpoint: '/api/pos/productos', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert(localProducts.headers.get('x-erp-local-first') === 'true', 'GET POS offline debe salir de SQLite local-first')
  assert((await localProducts.json()).data[0].id === 'p1', 'GET POS local-first debe preservar data')

  const localCpeList = await mod.fetchWithOfflineSupport(
    'http://api.test/api/cpe/comprobantes',
    { method: 'GET' },
    { endpoint: '/api/cpe/comprobantes', tenantId: 'tenant-1', userId: 'user-1' },
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
    { endpoint: '/api/inventario/productos?search=abc', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert(localInventory.headers.get('x-erp-local-first') === 'true', 'inventario offline debe leer SQLite')

  let localProductBlocked = false
  const productInvokeBefore = invokeCalls.length
  try { await mod.fetchWithOfflineSupport(
    'http://api.test/api/inventario/productos',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: 'P1', nombre: 'Producto 1' }),
    },
    { endpoint: '/api/inventario/productos', tenantId: 'tenant-1', userId: 'user-1' },
  )
  } catch (error) { localProductBlocked = /requiere confirmación/.test(error.message) }
  assert(localProductBlocked && invokeCalls.length === productInvokeBefore, 'producto offline conserva alta pendiente para confirmación sin escritura local')

  const localCustomerCreate = await mod.fetchWithOfflineSupport(
    'http://api.test/api/ventas/clientes',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razon_social: 'Cliente 1', ruc: '20123456789' }),
    },
    { endpoint: '/api/ventas/clientes', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert((await localCustomerCreate.json()).data.sync_status === 'pending', 'cliente offline debe quedar pending')

  const localQuoteList = await mod.fetchWithOfflineSupport(
    'http://api.test/api/ventas/cotizaciones?page=1',
    { method: 'GET' },
    { endpoint: '/api/ventas/cotizaciones?page=1', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert(localQuoteList.headers.get('x-erp-local-first') === 'true', 'cotizaciones offline deben leer SQLite')

  const localQuoteCreate = await mod.fetchWithOfflineSupport(
    'http://api.test/api/ventas/cotizaciones',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: 'c1', detalle: [{ producto_id: 'p1', cantidad: 1, precio_unitario: 10 }] }),
    },
    { endpoint: '/api/ventas/cotizaciones', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert((await localQuoteCreate.json()).data.sync_status === 'pending', 'cotizacion offline debe quedar pending')

  const localOrderCreate = await mod.fetchWithOfflineSupport(
    'http://api.test/api/ventas/pedidos',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: 'c1', detalle: [{ producto_id: 'p1', cantidad: 1, precio_unitario: 10 }] }),
    },
    { endpoint: '/api/ventas/pedidos', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert((await localOrderCreate.json()).data.sync_status === 'pending', 'pedido offline debe quedar pending')

  const localGenericList = await mod.fetchWithOfflineSupport(
    'http://api.test/api/rrhh/empleados',
    { method: 'GET' },
    { endpoint: '/api/rrhh/empleados', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert(localGenericList.headers.get('x-erp-local-first') === 'true', 'modulo generico offline debe leer SQLite')

  const localGenericCreate = await mod.fetchWithOfflineSupport(
    'http://api.test/api/rrhh/empleados',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombres: 'Empleado', apellidos: 'Offline' }),
    },
    { endpoint: '/api/rrhh/empleados', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert((await localGenericCreate.json()).data.sync_status === 'pending', 'modulo generico offline debe quedar pending')

  let localCashMovementBlocked = false
  try { await mod.fetchWithOfflineSupport(
    'http://api.test/api/cajas/movimientos/manual/active-session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'INGRESO', monto: 15, motivo: 'Ajuste local' }),
    },
    { endpoint: '/api/cajas/movimientos/manual/active-session', tenantId: 'tenant-1', userId: 'user-1' },
  ) } catch (error) { localCashMovementBlocked = String(error?.message || error).includes('requiere confirmación del servidor') }
  assert(localCashMovementBlocked, 'un movimiento de caja requiere confirmación real y no se anuncia pending local')

  const localCashBalance = await mod.fetchWithOfflineSupport(
    'http://api.test/api/cajas/saldo-esperado/active-session',
    { method: 'GET' },
    { endpoint: '/api/cajas/saldo-esperado/active-session', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert(localCashBalance.headers.get('x-erp-local-first') === 'true', 'saldo esperado offline debe leer SQLite')

  let treasuryBatchBlocked = false
  try { await mod.fetchWithOfflineSupport(
    'http://api.test/api/finanzas/tesoreria/lote',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagos: [{ cxp_id: 'cxp-1', monto: 10 }], cuenta_bancaria_id: 'bank-1' }),
    },
    { endpoint: '/api/finanzas/tesoreria/lote', tenantId: 'tenant-1', userId: 'user-1' },
  ) } catch (error) { treasuryBatchBlocked = String(error?.message || error).includes('requiere confirmación del servidor') }
  assert(treasuryBatchBlocked, 'pago masivo offline no debe anunciar un pago ni crear otra intención local')

  const localNotificationsRead = await mod.fetchWithOfflineSupport(
    'http://api.test/api/notifications/mark-all-read',
    { method: 'PUT' },
    { endpoint: '/api/notifications/mark-all-read', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert((await localNotificationsRead.json()).data.sync_status === 'pending', 'notificaciones offline deben quedar pending')

  const localCountryConfig = await mod.fetchWithOfflineSupport(
    'http://api.test/api/paises/usuario/configuracion',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pais_preferido_id: 1 }),
    },
    { endpoint: '/api/paises/usuario/configuracion', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert((await localCountryConfig.json()).data.sync_status === 'pending', 'preferencia de pais offline debe quedar pending')

  const localPdf = await mod.fetchWithOfflineSupport(
    'http://api.test/api/reportes/pdf',
    { method: 'GET' },
    { endpoint: '/api/reportes/pdf', tenantId: 'tenant-1', userId: 'user-1' },
  )
  assert(localPdf.headers.get('x-erp-offline-cache') === 'true', 'binario offline debe salir del cache SQLite')
  assert((await localPdf.text()).includes('%PDF-local'), 'binario offline debe preservar bytes')

  const mappings = await mod.listLocalIdMappings()
  assert(mappings[0].local_id === 'local-entity-1', 'mapeos local-remoto deben exponerse al UI')

  delete window.__TAURI_INTERNALS__
  delete window.__TAURI__
  online = true
  mod.invalidateOfflineModeCache()
  store.set('erp.auth.session.snapshot', JSON.stringify({ user: { id: 'user-1', tenant_id: 'tenant-1' } }))
  const paymentIntent = { metodo_pago: 'transferencia', idempotency_key: 'original-payment-key', cuenta_bancaria_id: 'bank-1', referencia: 'original-reference' }
  store.set('erp.desktop.offline.outbox', JSON.stringify([{
    id: 'legacy-payment', endpoint: '/api/rrhh/planillas/payroll-1/pagar', url: 'http://api.test/api/rrhh/planillas/payroll-1/pagar/', method: 'POST', headers: [],
    body: JSON.stringify({ ...paymentIntent, local_id: 'generic-1', external_id: 'generic-1', offline_entity_type: 'generic_record' }),
    tenant_id: 'tenant-1', user_id: 'user-1', status: 'pending', attempts: 0, created_at: 1, updated_at: 1,
  }]))
  assert((await mod.listOfflineRequests()).length === 1, 'una intención anterior se conserva para recuperación explícita, sin descartarla')
  let legacySent
  globalThis.fetch = async (_url, init) => { legacySent = JSON.parse(init.body); return new Response('{"success":true}', { status: 201 }) }
  await mod.syncOfflineQueue(undefined, 'tenant-1')
  assert(JSON.stringify(legacySent) === JSON.stringify(paymentIntent), 'recuperación legacy envía el DTO original y conserva la clave idempotente')
  assert((await mod.listOfflineRequests())[0].status === 'synced', 'sólo la respuesta real confirma la intención antigua')

  store.set('erp.desktop.offline.outbox', JSON.stringify([{
    id: 'legacy-treasury-payment', endpoint: '/api/finanzas/tesoreria/lote', url: 'http://api.test/api/finanzas/tesoreria/lote/', method: 'POST', headers: [],
    body: JSON.stringify({ ...paymentIntent, local_id: 'generic-2', external_id: 'generic-2', offline_entity_type: 'generic_record' }),
    tenant_id: 'tenant-1', user_id: 'user-1', status: 'pending', attempts: 0, created_at: 1, updated_at: 1,
  }]))
  assert((await mod.listOfflineRequests()).length === 1, 'lote legacy se conserva para confirmación explícita')
  await mod.syncOfflineQueue(undefined, 'tenant-1')
  assert(JSON.stringify(legacySent) === JSON.stringify(paymentIntent), 'lote legacy conserva clave original y no envía campos locales al DTO')

  // A local accounting closure GET/HEAD must never become external_validation.
  let periodPreviewChecks = 0
  const periodQueueBefore = store.get('erp.desktop.offline.outbox')
  globalThis.fetch = async () => { throw new Error('period preview network down') }
  for (const connected of [false, true]) {
    online = connected
    mod.invalidateOfflineModeCache()
    for (const prefix of ['/api/', '/backend/api/', '/']) {
      const endpoint = prefix + 'contabilidad/periodos/f38bf3f5-b8ce-4dbf-af20-80bbbf869472/validar-cierre'
      for (const method of ['GET', 'HEAD']) {
        let rejected = false
        try {
          await mod.fetchWithOfflineSupport('http://api.test' + endpoint + '/?uat=570', { method }, { endpoint: endpoint + '/', tenantId: 'tenant-1', userId: 'user-1' })
        } catch (error) { rejected = /lectura en vivo/.test(error.message) }
        assert(rejected, 'period closure preview requires live read on network loss and forced offline')
        assert(store.get('erp.desktop.offline.outbox') === periodQueueBefore, 'period preview does not change or purge previous queue')
        periodPreviewChecks += 1
      }
      let rejected = false
      try {
        await mod.enqueueOfflineRequest({ endpoint, url: 'http://api.test' + endpoint, method: 'GET', headers: [], body: null, tenant_id: 'tenant-1', user_id: 'user-1' })
      } catch (error) { rejected = /lectura en vivo/.test(error.message) }
      assert(rejected && store.get('erp.desktop.offline.outbox') === periodQueueBefore, 'public queue entry point rejects accounting previews without erasing history')
      periodPreviewChecks += 1
    }
  }

  const originalDocumentQueue = store.get('erp.desktop.offline.outbox')
  let documentFiscalAutoSends = 0
  for (const action of ['generar-xml', 'enviar-sunat']) {
    const endpoint = '/backend/api/documentos/document-id/' + action
    const original = { id: 'legacy-document-' + action, endpoint, url: 'http://api.test' + endpoint, method: 'POST', headers: [], body: '{"idempotency_key":"document-original-key"}', tenant_id: 'tenant-1', user_id: 'user-1', status: 'pending', attempts: 0, created_at: 1, updated_at: 1 }
    const foreign = { ...original, id: 'foreign-document-' + action, tenant_id: 'tenant-2' }
    store.set('erp.desktop.offline.outbox', JSON.stringify([original, foreign]))
    globalThis.fetch = async () => { documentFiscalAutoSends += 1; return new Response('{"success":true}') }
    online = true; mod.invalidateOfflineModeCache()
    const results = await mod.syncOfflineQueue(undefined, 'tenant-1')
    const stored = JSON.parse(store.get('erp.desktop.offline.outbox'))
    const preserved = stored.find(item => item.id === original.id)
    assert(documentFiscalAutoSends === 0 && results.length === 1 && !results[0].ok, 'Legacy document fiscal original must never be automatically sent')
    assert(preserved?.body === original.body && preserved.status === 'failed', 'Legacy document fiscal original body/key must survive manual review')
    assert(JSON.stringify(stored.find(item => item.id === foreign.id)) === JSON.stringify(foreign), 'Other actor document original is preserved exactly')
    documentFiscalOfflineChecks += 1
  }
  store.set('erp.desktop.offline.outbox', originalDocumentQueue)

  const originalQueueBeforeCollection = store.get('erp.desktop.offline.outbox')
  const legacyCollectionBody = JSON.stringify({ monto: 0.01, fecha_pago: '2026-10-14', metodo_pago: 'EFECTIVO', idempotency_key: 'original-collection-key' })
  store.set('erp.desktop.offline.outbox', JSON.stringify([{ id: 'legacy-collection', endpoint: '/api/finanzas/cxc/account-1/pagos', url: 'http://api.test/api/finanzas/cxc/account-1/pagos', method: 'POST', headers: [], body: legacyCollectionBody, tenant_id: 'tenant-1', user_id: 'user-1', status: 'pending', attempts: 0, created_at: 1, updated_at: 1 }]))
  let forbiddenCollectionSends = 0
  globalThis.fetch = async () => { forbiddenCollectionSends += 1; return new Response('{"success":true}') }
  online = true
  mod.invalidateOfflineModeCache()
  const collectionResults = await mod.syncOfflineQueue(undefined, 'tenant-1')
  const preservedCollection = JSON.parse(store.get('erp.desktop.offline.outbox')).find(item => item.id === 'legacy-collection')
  assert(forbiddenCollectionSends === 0 && collectionResults.length === 1 && !collectionResults[0].ok, 'legacy collection is never automatically sent by generic sync')
  assert(preservedCollection?.body === legacyCollectionBody && preservedCollection.status === 'failed', 'legacy collection retains original body/key for manual review')
  store.set('erp.desktop.offline.outbox', originalQueueBeforeCollection)

  let legacyAdjustmentAutoSends = 0
  for (const action of ['reprogramar', 'notas-credito']) {
    const originalBody = JSON.stringify({ idempotency_key: 'original-adjustment-key', motivo: 'Original' })
    store.set('erp.desktop.offline.outbox', JSON.stringify([{ id: 'legacy-' + action, endpoint: '/api/finanzas/cxc/account-1/' + action, url: 'http://api.test/api/finanzas/cxc/account-1/' + action, method: 'POST', headers: [], body: originalBody, tenant_id: 'tenant-1', user_id: 'user-1', status: 'pending', attempts: 0, created_at: 1, updated_at: 1 }]))
    globalThis.fetch = async () => { legacyAdjustmentAutoSends += 1; return new Response('{"success":true}') }
    const results = await mod.syncOfflineQueue(undefined, 'tenant-1')
    const saved = JSON.parse(store.get('erp.desktop.offline.outbox'))[0]
    assert(results.length === 1 && !results[0].ok && legacyAdjustmentAutoSends === 0, 'CxC adjustment cannot be sent by automatic queue replay')
    assert(saved.body === originalBody && saved.status === 'failed', 'original legacy CxC adjustment is preserved for manual review')
  }
  store.set('erp.desktop.offline.outbox', originalQueueBeforeCollection)


  const depreciationEndpoint='/api/contabilidad/activos-fijos/depreciar',depreciationOriginal='{"anio":2025,"mes":7}';
  store.set('erp.desktop.offline.outbox',JSON.stringify([{id:'legacy-depreciation',endpoint:depreciationEndpoint,url:'http://api.test'+depreciationEndpoint,method:'POST',headers:[{name:'Idempotency-Key',value:'original-batch-key'}],body:depreciationOriginal,tenant_id:'tenant-1',user_id:'user-1',status:'pending',attempts:0,created_at:1,updated_at:1}]));
  let depreciationAutoSends=0;globalThis.fetch=async()=>{depreciationAutoSends+=1;return new Response('{"success":true}')};
  const depreciationResults=await mod.syncOfflineQueue(undefined,'tenant-1');
  const depreciationSaved=JSON.parse(store.get('erp.desktop.offline.outbox'))[0];
  assert(depreciationAutoSends===0&&depreciationResults.length===1&&!depreciationResults[0].ok,'depreciation batch never automatically replays');
  assert(depreciationSaved.body===depreciationOriginal&&depreciationSaved.headers[0].value==='original-batch-key'&&depreciationSaved.status==='failed','legacy batch original body/key preserved for manual review');
  const depreciationQueueBefore=store.get('erp.desktop.offline.outbox');let depreciationRejected=false;
  try{await mod.enqueueOfflineRequest({endpoint:depreciationEndpoint,url:'http://api.test'+depreciationEndpoint,method:'POST',headers:[],body:depreciationOriginal,tenant_id:'tenant-1',user_id:'user-1'})}catch(error){depreciationRejected=/confirmación/.test(error.message)}
  assert(depreciationRejected&&store.get('erp.desktop.offline.outbox')===depreciationQueueBefore,'new batch cannot enter generic queue or erase original history');
  store.set('erp.desktop.offline.outbox',originalQueueBeforeCollection);

  let assetLifecycleAutoSends=0;
  for(const [endpoint,method] of [['/api/contabilidad/activos-fijos/asset-id','PUT'],['/backend/api/contabilidad/activos-fijos/asset-id/baja','POST']]){
    const originalBody='{"original":true,"motivo":"Original asset request"}';
    store.set('erp.desktop.offline.outbox',JSON.stringify([{id:'legacy-asset-'+method,endpoint,url:'http://api.test'+endpoint,method,headers:[{name:'Idempotency-Key',value:'original-asset-key'}],body:originalBody,tenant_id:'tenant-1',user_id:'user-1',status:'pending',attempts:0,created_at:1,updated_at:1}]));
    globalThis.fetch=async()=>{assetLifecycleAutoSends+=1;return new Response('{"success":true}')};
    const results=await mod.syncOfflineQueue(undefined,'tenant-1'),saved=JSON.parse(store.get('erp.desktop.offline.outbox'))[0];
    assert(results.length===1&&!results[0].ok&&assetLifecycleAutoSends===0,'legacy asset lifecycle cannot automatically replay');
    assert(saved.body===originalBody&&saved.headers[0].value==='original-asset-key'&&saved.status==='failed','legacy asset lifecycle preserves original body and key');
    const originalQueue=store.get('erp.desktop.offline.outbox');let rejected=false;
    try{await mod.enqueueOfflineRequest({endpoint,url:'http://api.test'+endpoint,method,headers:[],body:originalBody,tenant_id:'tenant-1',user_id:'user-1'})}catch(error){rejected=/confirmación/.test(error.message)}
    assert(rejected&&store.get('erp.desktop.offline.outbox')===originalQueue,'new lifecycle request cannot enter queue or erase original history');
  }
  store.set('erp.desktop.offline.outbox',originalQueueBeforeCollection);
  const savedCustomerQueue = store.get('erp.desktop.offline.outbox');
  store.set('erp.desktop.offline.outbox','[]');
  online=true;mod.invalidateOfflineModeCache();
  let firstCustomerKey, replayCustomerKey, customerSends=0;
  const customerBody='{"telefono":"987000001"}';
  globalThis.fetch=async(_url,init)=>{
    customerSends++;
    const key=new Headers(init.headers).get('Idempotency-Key');
    assert(init.body===customerBody,'replay conserva los bytes del cuerpo de edición');
    if(customerSends===1){firstCustomerKey=key;throw new TypeError('ACK lost after COMMIT');}
    replayCustomerKey=key;return new Response('{"id":"customer-id","telefono":"987000001"}',{status:200});
  };
  const customerQueued=await mod.fetchWithOfflineSupport('http://api.test/api/ventas/clientes/customer-id',
    {method:'PUT',body:customerBody},{endpoint:'/api/ventas/clientes/customer-id',tenantId:'tenant-1',userId:'user-1'});
  assert(customerQueued.status===202&&firstCustomerKey,'clave generada antes del primer envío incierto');
  const customerPending=(await mod.listOfflineRequests())[0];
  assert(new Headers(customerPending.headers.map(h=>[h.name,h.value])).get('Idempotency-Key')===firstCustomerKey,'la cola persiste la clave enviada originalmente');
  const customerReplay=await mod.syncOfflineQueue(undefined,'tenant-1');
  assert(customerReplay.length===1&&customerReplay[0].ok&&firstCustomerKey===replayCustomerKey&&customerSends===2,'el replay conserva clave y cuerpo, sin sustituir la intención');
  store.set('erp.desktop.offline.outbox',savedCustomerQueue);
  console.log(JSON.stringify({ ok: true, documentFiscalOfflineChecks, documentFiscalAutoSends, fetchCalls, syncCall, status, periodPreviewChecks, collectionQueueExcluded: true, legacyCollectionAutoSends: forbiddenCollectionSends, legacyAdjustmentAutoSends, depreciationAutoSends, depreciationRejected, assetLifecycleAutoSends, customerIntentKeyPreserved: true }, null, 2))
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
