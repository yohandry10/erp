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

  let syncCall = 0
  globalThis.fetch = async () => {
    syncCall += 1
    return new Response(JSON.stringify({ success: true, id: 'remote-1' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const syncResult = await mod.syncOfflineQueue()
  assert(syncResult.length === 1 && syncResult[0].ok === true, 'sync exitosa debe marcar ok')
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
  assert(failed.last_error.includes('conflict'), 'fallo debe persistir error del backend')

  const status = await mod.getOfflineStatus()
  assert(status.total === 2 && status.synced === 1 && status.failed === 1, 'status debe contar synced/failed')
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
