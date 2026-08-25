import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

/**
 * Verifica la regla de idempotencia de la venta POS.
 *
 * El backend deduplica una venta POS sólo por la clave del cliente: no hay
 * deduplicación por contenido. El POS borraba esa clave en el `catch` y la leía del
 * estado de React en el mismo tick en que la escribía, así que un reintento del
 * cajero tras un fallo de red registraba la venta dos veces. Estas comprobaciones
 * fijan el comportamiento que impide esa duplicación.
 */

const webRoot = process.cwd()
const repoRoot = path.resolve(webRoot, '../..')
const tempRoot = path.join(webRoot, '.pos-idempotencia-tmp')
fs.rmSync(tempRoot, { recursive: true, force: true })
fs.mkdirSync(tempRoot, { recursive: true })
const tempDir = fs.mkdtempSync(path.join(tempRoot, 'run-'))

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit', ...options })
}

let fallos = 0
function check(nombre, fn) {
  try {
    fn()
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
    'apps/web/lib/pos-idempotencia.ts',
    '--outDir', tempDir,
    '--module', 'commonjs',
    '--target', 'es2022',
    '--skipLibCheck',
  ])

  const modulo = await import(
    `file://${path.join(tempDir, 'pos-idempotencia.js').replace(/\\/g, '/')}`
  )
  const { huellaIntencionVenta, resolverIntencionVenta } = modulo.default ?? modulo

  const intencionBase = () => ({
    clienteId: 'cli-1',
    clienteDocumento: '12345678',
    tipoComprobante: 'TICKET',
    metodoPagoId: 'mp-efectivo',
    referenciaPago: '',
    descuentoGlobalTipo: 'PORCENTAJE',
    descuentoGlobalValor: 0,
    items: [
      { productoId: 'p-1', cantidad: 2, precioUnitario: 25, descuentoMonto: 0, subtotal: 50 },
      { productoId: 'p-2', cantidad: 1, precioUnitario: 6.5, descuentoMonto: 0, subtotal: 6.5 },
    ],
    pagos: null,
  })

  let contador = 0
  const generarClave = () => `clave-${++contador}`

  process.stdout.write('Idempotencia de la venta POS\n')

  check('la misma intención reutiliza la clave: un reintento no duplica la venta', () => {
    contador = 0
    const primera = resolverIntencionVenta(null, intencionBase(), generarClave)
    const reintento = resolverIntencionVenta(primera, intencionBase(), generarClave)
    assert.equal(reintento.clave, primera.clave)
    assert.equal(contador, 1, 'no debió generarse una clave nueva')
  })

  check('reordenar el carrito no cuenta como otra intención', () => {
    const a = intencionBase()
    const b = intencionBase()
    b.items = [...b.items].reverse()
    assert.equal(huellaIntencionVenta(a), huellaIntencionVenta(b))
  })

  check('false conserva la huella pre-518 y true sí la cambia', () => {
    const ausente = intencionBase()
    const desactivado = { ...intencionBase(), redondeoEfectivoLegal: false }
    const activado = { ...intencionBase(), redondeoEfectivoLegal: true }
    assert.equal(huellaIntencionVenta(ausente), huellaIntencionVenta(desactivado))
    assert.notEqual(huellaIntencionVenta(ausente), huellaIntencionVenta(activado))
  })

  check('cambiar la cantidad genera clave nueva y evita el mismatch del servidor', () => {
    contador = 0
    const primera = resolverIntencionVenta(null, intencionBase(), generarClave)
    const modificada = intencionBase()
    modificada.items[0].cantidad = 3
    modificada.items[0].subtotal = 75
    const segunda = resolverIntencionVenta(primera, modificada, generarClave)
    assert.notEqual(segunda.clave, primera.clave)
  })

  for (const [campo, mutar] of [
    ['el cliente', (i) => { i.clienteId = 'cli-2' }],
    ['el documento', (i) => { i.clienteDocumento = '87654321' }],
    ['el tipo de comprobante', (i) => { i.tipoComprobante = '03' }],
    ['el método de pago', (i) => { i.metodoPagoId = 'mp-tarjeta' }],
    ['la referencia', (i) => { i.referenciaPago = 'OP-9001' }],
    ['el descuento global', (i) => { i.descuentoGlobalValor = 10 }],
    ['un producto', (i) => { i.items[1].productoId = 'p-9' }],
    ['el precio', (i) => { i.items[0].precioUnitario = 30 }],
    ['los pagos mixtos', (i) => { i.pagos = [{ metodoPagoId: 'mp-1', monto: 56.5, referencia: '' }] }],
    ['el redondeo legal de efectivo', (i) => { i.redondeoEfectivoLegal = true }],
  ]) {
    check(`cambiar ${campo} cambia la huella`, () => {
      const modificada = intencionBase()
      mutar(modificada)
      assert.notEqual(huellaIntencionVenta(intencionBase()), huellaIntencionVenta(modificada))
    })
  }

  check('reordenar los pagos mixtos no cambia la huella', () => {
    const a = intencionBase()
    a.pagos = [
      { metodoPagoId: 'mp-1', monto: 30, referencia: '' },
      { metodoPagoId: 'mp-2', monto: 26.5, referencia: 'OP-1' },
    ]
    const b = intencionBase()
    b.pagos = [...a.pagos].reverse()
    assert.equal(huellaIntencionVenta(a), huellaIntencionVenta(b))
  })

  check('tras confirmar una venta, otra idéntica recibe clave distinta', () => {
    contador = 0
    const primera = resolverIntencionVenta(null, intencionBase(), generarClave)
    // El POS descarta la intención al confirmarse la venta: la siguiente entra sin
    // registro previo. Dos ventas iguales seguidas son normales en comercio y no
    // deben fundirse en una.
    const siguiente = resolverIntencionVenta(null, intencionBase(), generarClave)
    assert.notEqual(siguiente.clave, primera.clave)
  })

  check('una intención registrada sin clave se regenera', () => {
    contador = 0
    const huella = huellaIntencionVenta(intencionBase())
    const resuelta = resolverIntencionVenta({ clave: '   ', huella }, intencionBase(), generarClave)
    assert.equal(resuelta.clave, 'clave-1')
  })

  if (fallos > 0) {
    process.stdout.write(`\nIdempotencia POS: ${fallos} comprobación(es) fallida(s)\n`)
    process.exit(1)
  }
  process.stdout.write('\nIdempotencia POS OK\n')
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
