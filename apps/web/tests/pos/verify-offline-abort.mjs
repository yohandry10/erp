import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

/**
 * Verifica que un timeout del cliente no se confunda con estar sin conexión.
 *
 * `use-api` aborta la petición a los 12 s (30 s en el POS). Cuando eso pasa el
 * servidor pudo haberla procesado: sólo se perdió la respuesta. `offline-store`
 * trataba ese aborto como desconexión, encolaba la escritura y devolvía 202 con
 * `success: true`, así que el POS daba la venta por cobrada y más tarde la cola
 * la reenviaba, arriesgando un duplicado.
 *
 * Estas comprobaciones fijan que un aborto se propaga y que sólo un fallo de red
 * real se encola.
 */

const webRoot = process.cwd()
const repoRoot = path.resolve(webRoot, '../..')
const tempRoot = path.join(webRoot, '.offline-abort-tmp')
fs.rmSync(tempRoot, { recursive: true, force: true })
fs.mkdirSync(tempRoot, { recursive: true })
const tempDir = fs.mkdtempSync(path.join(tempRoot, 'run-'))

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit', ...options })
}

let fallos = 0
async function check(nombre, fn) {
  try {
    await fn()
    process.stdout.write(`  ok  ${nombre}\n`)
  } catch (error) {
    fallos += 1
    process.stdout.write(`  FALLA  ${nombre}\n         ${error.message}\n`)
  }
}

try {
  const tscBin = path.join(webRoot, 'node_modules', 'typescript', 'bin', 'tsc')
  run(process.execPath, [
    tscBin,
    'apps/web/lib/offline-store.ts',
    '--outDir', tempDir,
    '--module', 'commonjs',
    '--target', 'es2022',
    '--skipLibCheck',
    '--moduleResolution', 'node',
    '--esModuleInterop',
    '--noEmitOnError', 'false',
  ])
} catch {
  // `offline-store.ts` importa @tauri-apps y alias `@/`; el emit igual se produce.
}

try {
  const compilado = path.join(tempDir, 'offline-store.js')
  assert.ok(fs.existsSync(compilado), 'no se generó offline-store.js')
  const fuente = fs.readFileSync(compilado, 'utf8')

  process.stdout.write('Timeout frente a desconexión\n')

  // El módulo arrastra dependencias de Tauri que no se pueden cargar en Node, así
  // que se verifica el contrato sobre el código emitido: es la garantía de que la
  // rama existe y precede al encolado.
  await check('existe la distinción de aborto de cliente', () => {
    assert.match(fuente, /function esAbortoDeCliente/)
    assert.match(fuente, /AbortError/)
    assert.match(fuente, /TimeoutError/)
  })

  await check('el aborto se relanza antes de poder encolarse', () => {
    const iAbort = fuente.indexOf('esAbortoDeCliente(error)')
    const iEnqueue = fuente.indexOf('enqueueOfflineRequest', iAbort)
    assert.ok(iAbort > -1, 'no se comprueba el aborto en el catch')
    assert.ok(iEnqueue > iAbort, 'el encolado ocurre antes de descartar el aborto')
  })

  // La función es pura y no depende de Tauri: se reimplanta su contrato exacto
  // para ejercitarla con los errores que fetch produce de verdad.
  const esAborto = (error) => {
    if (!error || typeof error !== 'object') return false
    const nombre = error.name
    return nombre === 'AbortError' || nombre === 'TimeoutError'
  }

  await check('un AbortController produce un error reconocido como aborto', async () => {
    const controller = new AbortController()
    controller.abort()
    let capturado = null
    try {
      await fetch('http://127.0.0.1:9/never', { signal: controller.signal })
    } catch (error) {
      capturado = error
    }
    assert.ok(capturado, 'no hubo error')
    assert.equal(esAborto(capturado), true, `nombre recibido: ${capturado?.name}`)
  })

  await check('un fallo de red real NO se toma por aborto y sí puede encolarse', async () => {
    let capturado = null
    try {
      // Puerto 9 (discard): conexión rechazada, sin abort.
      await fetch('http://127.0.0.1:9/never')
    } catch (error) {
      capturado = error
    }
    assert.ok(capturado, 'no hubo error')
    assert.equal(esAborto(capturado), false, `nombre recibido: ${capturado?.name}`)
  })

  await check('el POS no confirma una respuesta encolada', () => {
    const pos = fs.readFileSync(
      path.join(repoRoot, 'apps/web/app/dashboard/pos/page.tsx'),
      'utf8',
    )
    const iGuard = pos.indexOf("resultado?.queued === true")
    const iPagada = pos.indexOf("estado: 'PAGADA'")
    assert.ok(iGuard > -1, 'el POS no comprueba `queued`')
    assert.ok(iGuard < iPagada, 'el POS marca PAGADA antes de descartar el encolado')
  })

  if (fallos > 0) {
    process.stdout.write(`\nTimeout/offline: ${fallos} comprobación(es) fallida(s)\n`)
    process.exit(1)
  }
  process.stdout.write('\nTimeout/offline OK\n')
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
