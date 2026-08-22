#!/usr/bin/env node
/**
 * Comprueba que la pantalla no le promete al usuario un céntimo que no es.
 *
 * `Math.round(importe * factor * 100) / 100` parece redondeo a céntimos y no lo
 * es: el producto en coma flotante cae por debajo del medio céntimo justo cuando
 * el valor exacto está encima. 1,25 al 18 % es 0,225 y debe dar 0,23; en binario
 * queda 0,22499999999999998 y salía 0,22. Con las tres tasas del ERP —IGV 18 %,
 * IVA 21 %, IVA 19 %— eso son 2 524 importes equivocados sobre 1,2 millones, todos
 * un céntimo por debajo.
 *
 * Limpiar el producto antes de redondear tampoco vale: la multiplicación por 100
 * reintroduce el error y sigue fallando en 971 casos. Se comprobó. La única forma
 * de acertar sin traerse una librería decimal al paquete del navegador es no salir
 * de los enteros, que es lo que hace `multiplicarMoneda`.
 *
 * El servidor calcula con Decimal y es él quien fija los importes del documento,
 * así que esto nunca emitió un comprobante mal. Lo que hacía era enseñar un total
 * distinto del que se iba a emitir, que es justo lo que una previsualización existe
 * para evitar.
 *
 * Uso: node tests/dinero/verify-aritmetica-moneda.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const fallos = []

// ---------------------------------------------------------------------------
// 1. La aritmética, ejecutada de verdad contra una referencia entera exacta
// ---------------------------------------------------------------------------
const fuente = readFileSync(join(web, 'lib', 'format-utils.ts'), 'utf8')
const js = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText

const tmp = join(web, '.dinero-test-tmp')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
const tmpFile = join(tmp, 'format-utils.mjs')
writeFileSync(tmpFile, js)
const { multiplicarMoneda, redondearMoneda } = await import(pathToFileURL(tmpFile).href)
rmSync(tmp, { recursive: true, force: true })

// Referencia: importe en céntimos por tasa en enteros, mitad hacia arriba.
// No interviene la coma flotante en ningún paso.
const exacto = (centimos, tasaEntera) => Math.floor((centimos * tasaEntera + 50) / 100) / 100

for (const tasa of [18, 21, 19]) {
  let discrepancias = 0
  let ejemplo = null
  for (let c = 1; c <= 200000; c += 1) {
    const obtenido = multiplicarMoneda(c / 100, tasa / 100)
    const esperado = exacto(c, tasa)
    if (obtenido !== esperado) {
      discrepancias += 1
      if (!ejemplo) ejemplo = `${c / 100} al ${tasa}% dio ${obtenido} y debía dar ${esperado}`
    }
  }
  if (discrepancias > 0) {
    fallos.push(`multiplicarMoneda falla en ${discrepancias} bases al ${tasa}%: ${ejemplo}`)
  }
}

// Control de la medición: la fórmula vieja tiene que salir mal, o esta prueba no
// está midiendo nada. Es el error que se vino a corregir.
const vieja = (a, b) => Math.round(a * b * 100) / 100
let fallosDeLaVieja = 0
for (let c = 1; c <= 200000; c += 1) {
  if (vieja(c / 100, 0.18) !== exacto(c, 18)) fallosDeLaVieja += 1
}
if (fallosDeLaVieja === 0) {
  fallos.push('la referencia no distingue la fórmula vieja de la nueva: la prueba no mide nada')
}

// Casos concretos, por si el barrido cambiara alguna vez.
const casos = [
  [1.25, 0.18, 0.23],
  [5.75, 0.18, 1.04],
  [21.5, 0.21, 4.52],
  [42.5, 0.19, 8.08],
  [3, 1.115, 3.35],
  [0, 0.18, 0],
  [-1.25, 0.18, -0.23],
]
for (const [importe, factor, esperado] of casos) {
  const obtenido = multiplicarMoneda(importe, factor)
  if (obtenido !== esperado) fallos.push(`multiplicarMoneda(${importe}, ${factor}) dio ${obtenido}, esperado ${esperado}`)
}
if (redondearMoneda(0.1 + 0.2) !== 0.3) fallos.push('redondearMoneda(0.1 + 0.2) no da 0.3')
if (multiplicarMoneda(Number.NaN, 0.18) !== 0) fallos.push('multiplicarMoneda no protege NaN')

// ---------------------------------------------------------------------------
// 2. Que no vuelva la fórmula vieja sobre un producto
// ---------------------------------------------------------------------------
// En este entorno las barras invertidas de una cadena se colapsan al escribir el
// fichero, y un patron como '\\b' acaba buscando un retroceso en vez de un limite
// de palabra. `E` compone el escape a partir del codigo del caracter, que no se
// puede colapsar.
const BARRA = String.fromCharCode(92)
const E = (c) => BARRA + c

// Los comentarios citan la formula vieja para explicar por que se cambio; contarlos
// convertiria la explicacion en un fallo.
const esComentario = (linea) => /:\s*(\/\/|\*|\/\*)/.test(linea.replace(/^[^:]*:\d+:/, ':'))

function buscar(patron, ...rutas) {
  try {
    return execFileSync('git', ['grep', '-n', '-E', patron, '--', ...rutas], { cwd: web, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  } catch (error) {
    // git grep sale con 1 cuando no encuentra nada: aquí es el caso bueno.
    if (error.status === 1) return []
    throw error
  }
}

// Control del buscador: algo que sí existe.
if (buscar('multiplicarMoneda', 'lib', 'hooks', 'components').length === 0) {
  fallos.push('el buscador no encuentra multiplicarMoneda: git grep no está midiendo')
}

const productos = buscar(
  ['Math', E('.'), 'round', E('('), '[^)]*', E('*'), '[^)]*', E('*'), '[^)]*100', E(')'), E('s'), '*/', E('s'), '*100'].join(''),
  'app', 'components', 'hooks', 'lib',
)
const productosReales = productos.filter((l) => !esComentario(l))
if (productosReales.length > 0) {
  fallos.push(`redondeo de un producto con coma flotante; use multiplicarMoneda:\n    ${productosReales.join('\n    ')}`)
}

// ---------------------------------------------------------------------------
// 3. Que no vuelva la tasa peruana como valor por defecto
// ---------------------------------------------------------------------------
const tasasPorDefecto = buscar(
  ['(', E('|'), E('|'), '|', E('?'), E('?'), ')', E('s'), '*0', E('.'), '(18|21|19)', E('b')].join(''),
  'app', 'components', 'hooks', 'lib',
)
const tasasReales = tasasPorDefecto.filter((l) => !esComentario(l))
if (tasasReales.length > 0) {
  fallos.push(`tasa de impuesto por defecto; el país decide la tasa, no el código:\n    ${tasasReales.join('\n    ')}`)
}

// ---------------------------------------------------------------------------
// 4. Que no vuelva la moneda peruana fijada en un formateo
// ---------------------------------------------------------------------------
// `currency: 'PEN'` escrito a mano no respeta al contribuyente nunca, no sólo
// mientras carga el país: un PDF del estado de resultados de una empresa
// argentina salía en soles. Las dos excepciones son las pantallas de tributos
// peruanos, que el API ya restringe a Perú.
const TRIBUTOS_PERUANOS = /impuestos\/(anual\/)?page\.tsx/
const monedaFijada = buscar(
  ['currency', E('s'), '*:', E('s'), '*[' + String.fromCharCode(39) + '"]PEN'].join(''),
  'app', 'components', 'lib',
).filter((l) => !esComentario(l) && !TRIBUTOS_PERUANOS.test(l) && !l.includes('.md:'))
if (monedaFijada.length > 0) {
  fallos.push(
    'moneda peruana fijada en un formateo; use la del contribuyente:\n    ' +
      monedaFijada.join('\n    '),
  )
}

if (fallos.length > 0) {
  console.error('\nAritmética de moneda incorrecta:\n')
  for (const f of fallos) console.error('  - ' + f)
  console.error('')
  process.exit(1)
}

console.log('OK: multiplicarMoneda coincide con la aritmética exacta en 600 000 casos;')
console.log('    sin redondeos de producto en coma flotante y sin tasas por defecto.')
