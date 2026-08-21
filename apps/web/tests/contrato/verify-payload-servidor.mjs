#!/usr/bin/env node
/**
 * Lo que la web envía tiene que existir en el DTO que valida el servidor.
 *
 * El ValidationPipe global corre con `forbidNonWhitelisted`, así que **un solo
 * campo de más rechaza la petición entera con un 400**. No es teoría: `GreModal`
 * mandaba `tenantId` y `CreateGuiaRemisionDto` no lo declara, de modo que crear
 * una guía de remisión desde un pedido no funcionaba. En pantalla salía
 * «property tenantId should not exist»: correcto, pero en inglés y sin pista de
 * que el arreglo estaba en el cliente.
 *
 * La primera versión de esta prueba era una lista negra —tenant, actor, autoría—
 * y sólo habría cazado ese caso concreto. Ésta compara de verdad: resuelve cada
 * llamada de escritura de la web contra la ruta del API, saca el DTO de su
 * `@Body()` y comprueba que ninguna clave enviada falte en él.
 *
 * Lo que NO cubre, dicho para que no se confunda con una demostración:
 *  - Payloads que no se resuelven estáticamente (se construyen por partes).
 *  - `...spread` de un objeto que no está en el mismo fichero.
 *  - Campos obligatorios que falten, y los tipos. Eso lo dice el servidor.
 *
 * El resumen imprime cuántas llamadas quedaron sin comparar, para que la cifra
 * esté a la vista y nadie confunda «verde» con «revisado».
 *
 * Uso: node tests/contrato/verify-payload-servidor.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const web = join(aqui, '..', '..')
const api = join(web, '..', 'erp-api')

const leer = (base, rel) => readFileSync(join(base, rel), 'utf8')
const listar = (base, ...rutas) =>
  execFileSync('git', ['ls-files', ...rutas], { cwd: base, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)

// ---------------------------------------------------------------------------
// 1. DTOs del API: nombre -> propiedades declaradas, siguiendo `extends`
// ---------------------------------------------------------------------------
const dtos = new Map()
for (const rel of listar(api, 'src').filter((f) => f.endsWith('.ts') && !f.includes('.spec.'))) {
  const txt = leer(api, rel)
  // Sin exigir `export`: `ProductoMaestroBaseDto` no lo lleva, y saltárselo hacía
  // que un DTO que hereda de él se comparase contra tres campos en vez de veinte.
  const decl = /(?:export\s+)?(?:abstract\s+)?(?:class|interface)\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_]+))?[^{]*\{/g
  for (const m of txt.matchAll(decl)) {
    const ini = m.index + m[0].length
    let prof = 1
    let i = ini
    while (i < txt.length && prof > 0) {
      if (txt[i] === '{') prof += 1
      else if (txt[i] === '}') prof -= 1
      i += 1
    }
    const props = new Set()
    const prop = /^[ \t]{2,4}(?:readonly\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*[?!]?\s*:/gm
    for (const pm of txt.slice(ini, i - 1).matchAll(prop)) props.add(pm[1])
    dtos.set(m[1], { props, extiende: m[2] || null })
  }
}

function propiedadesDe(nombre, vistos = new Set()) {
  if (!dtos.has(nombre) || vistos.has(nombre)) return new Set()
  vistos.add(nombre)
  const d = dtos.get(nombre)
  return new Set([...d.props, ...(d.extiende ? propiedadesDe(d.extiende, vistos) : [])])
}

// ---------------------------------------------------------------------------
// 2. Rutas de escritura del API -> DTO de su @Body()
// ---------------------------------------------------------------------------
const rutas = []
for (const rel of listar(api, 'src').filter((f) => f.endsWith('.controller.ts'))) {
  const lineas = leer(api, rel).split(/\r?\n/)
  const cabecera = lineas.join('\n').match(/@Controller\(\s*['"]([^'"]*)['"]/)
  const base = cabecera ? cabecera[1] : ''
  for (let i = 0; i < lineas.length; i += 1) {
    const m = lineas[i].match(/@(Post|Put|Patch)\(\s*(?:['"]([^'"]*)['"])?\s*\)/)
    if (!m) continue
    let dto = null
    for (let j = i; j < Math.min(lineas.length, i + 40); j += 1) {
      const b = lineas[j].match(/@Body\([^)]*\)\s*[a-zA-Z0-9_]+\s*:\s*([A-Za-z0-9_]+)/)
      if (b) {
        dto = b[1]
        break
      }
      if (j > i && /^\s*@(Get|Post|Put|Delete|Patch)\(/.test(lineas[j])) break
    }
    const path = `/api/${base}/${m[2] || ''}`.replace(/\/+/g, '/').replace(/\/$/, '')
    rutas.push({ metodo: m[1].toUpperCase(), path, dto })
  }
}

// ---------------------------------------------------------------------------
// 3. Claves de un objeto literal
// ---------------------------------------------------------------------------
export function clavesDeObjeto(txt, ini) {
  // Dos trampas, las dos vistas en este repositorio:
  //
  // 1. Las cadenas. En `idempotency_key: ` + '`recon-match:${id}`' + `, el texto
  //    `match:` de dentro de la plantilla parece una clave. El analizador
  //    reportaba `match` y `drag` como campos de más en la conciliación
  //    bancaria y los dos eran invención suya. Hay que saltar las cadenas
  //    enteras, y en las plantillas también sus `${...}`, que además llevan
  //    llaves que descuadrarían la profundidad.
  // 2. Los ternarios. En `cond ? match : otro`, `match :` tampoco es una clave.
  let prof = 0
  let ternario = 0
  const ks = []
  const spreads = []

  // Devuelve el índice del carácter siguiente al cierre de la cadena que
  // empieza en `p`. Para plantillas salta los `${...}` con anidamiento.
  const finDeCadena = (p) => {
    const comilla = txt[p]
    let i = p + 1
    while (i < txt.length) {
      const c = txt[i]
      if (c === '\\') { i += 2; continue }
      if (c === comilla) return i + 1
      if (comilla === '`' && c === '$' && txt[i + 1] === '{') {
        let n = 1
        i += 2
        while (i < txt.length && n > 0) {
          if (txt[i] === '{') n += 1
          else if (txt[i] === '}') n -= 1
          else if (txt[i] === '`' || txt[i] === "'" || txt[i] === '"') { i = finDeCadena(i) - 1 }
          i += 1
        }
        continue
      }
      i += 1
    }
    return i
  }

  for (let i = ini; i < txt.length; i += 1) {
    const c = txt[i]
    if (c === '`' || c === "'" || c === '"') {
      i = finDeCadena(i) - 1
      continue
    }
    if (c === '{') {
      prof += 1
      continue
    }
    if (c === '}') {
      prof -= 1
      if (prof === 0) break
      continue
    }
    if (prof !== 1) continue
    if (c === ',') {
      ternario = 0
      continue
    }
    if (c === '?') {
      ternario += 1
      continue
    }
    const resto = txt.slice(i)
    const clave = resto.match(/^\s*(?:\/\/[^\n]*\n\s*)*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/)
    if (clave) {
      if (ternario > 0) ternario -= 1
      else ks.push(clave[1])
      i += clave[0].length - 1
      continue
    }
    const sp = resto.match(/^\.\.\.\(?\s*([a-zA-Z_][a-zA-Z0-9_.?]*)/)
    if (sp) {
      spreads.push(sp[1])
      i += sp[0].length - 1
    }
  }
  return { ks, spreads }
}

// ---------------------------------------------------------------------------
// 4. Llamadas de escritura de la web
// ---------------------------------------------------------------------------
const llamadas = []
const ficherosWeb = listar(web, 'app', 'components', 'hooks', 'lib', 'contexts').filter(
  (f) => /\.(ts|tsx)$/.test(f) && !/\.spec\.|\.test\./.test(f),
)
for (const rel of ficherosWeb) {
  const txt = leer(web, rel)
  const registrar = (metodo, ruta, pos) => {
    const arg = txt.slice(pos, pos + 80).trim()
    if (arg.startsWith('{')) {
      llamadas.push({ rel, metodo, ruta, ...clavesDeObjeto(txt, pos), resuelto: true })
      return
    }
    const nombre = (arg.match(/^[a-zA-Z_][a-zA-Z0-9_]*/) || [])[0]
    const declaracion = nombre
      ? txt.search(new RegExp(`const\\s+${nombre}\\s*(?::[^=]+)?=\\s*\\{`))
      : -1
    if (declaracion < 0) {
      llamadas.push({ rel, metodo, ruta, ks: [], spreads: [], resuelto: false })
      return
    }
    const abre = txt.indexOf('{', declaracion)
    llamadas.push({ rel, metodo, ruta, ...clavesDeObjeto(txt, abre), resuelto: true })
  }

  for (const m of txt.matchAll(/\.(post|put|patch)\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*/g)) {
    registrar(m[1].toUpperCase(), m[2], m.index + m[0].length)
  }
  for (const m of txt.matchAll(/fetchApi\(\s*[`'"]([^`'"]+)[`'"][\s\S]{0,400}?body:\s*JSON\.stringify\(\s*/g)) {
    const pos = m.index + m[0].length
    const encontrado = txt.slice(m.index, pos).match(/method:\s*['"](\w+)/)
    registrar(encontrado ? encontrado[1].toUpperCase() : 'POST', m[1], pos)
  }
}

// ---------------------------------------------------------------------------
// 5. Comparar
// ---------------------------------------------------------------------------
const normalizar = (r) => r.split('?')[0].replace(/\$\{[^}]*\}/g, 'X').replace(/\/$/, '')
const resumen = { comparadas: 0, sinRuta: 0, sinDto: 0, noResueltas: 0 }
const fallos = []

for (const c of llamadas) {
  if (!c.resuelto) {
    resumen.noResueltas += 1
    continue
  }
  const objetivo = normalizar(c.ruta)
  const ruta = rutas.find(
    (x) =>
      x.metodo === c.metodo &&
      new RegExp(`^${x.path.replace(/:[a-zA-Z0-9_]+/g, '[^/]+')}$`).test(objetivo),
  )
  if (!ruta) {
    resumen.sinRuta += 1
    continue
  }
  const declaradas = ruta.dto ? propiedadesDe(ruta.dto) : new Set()
  if (declaradas.size === 0) {
    resumen.sinDto += 1
    continue
  }
  resumen.comparadas += 1
  const sobran = c.ks.filter((k) => !declaradas.has(k))
  if (sobran.length > 0) fallos.push({ ...c, dto: ruta.dto, sobran })
}

// ---------------------------------------------------------------------------
// 6. Controles de la medición
// ---------------------------------------------------------------------------
// Un control más fácil que el caso real no prueba nada: ya pasó una vez en esta
// misma prueba, cuya primera versión daba verde con el fallo delante.
const ctrl = clavesDeObjeto('const x = {\n  destinatario: a,\n  tenantId: b,\n  cond ? rama : otra,\n}', 10)
if (!ctrl.ks.includes('tenantId')) {
  console.error('El extractor no ve una clave evidente: no está midiendo nada.')
  process.exit(1)
}
if (ctrl.ks.includes('rama')) {
  console.error('El extractor confunde la rama de un ternario con una clave: daría falsos positivos.')
  process.exit(1)
}
if (dtos.size < 200) {
  console.error(`Sólo ${dtos.size} DTOs leídos del API: la extracción se ha roto.`)
  process.exit(1)
}
if (resumen.comparadas < 8) {
  console.error(`Sólo ${resumen.comparadas} llamadas comparadas: la resolución se ha roto.`)
  process.exit(1)
}

if (fallos.length > 0) {
  console.error('\nLa web envía campos que el DTO del servidor no declara.')
  console.error('Con `forbidNonWhitelisted`, cada uno rechaza la petición entera con un 400:\n')
  for (const f of fallos) {
    console.error(`  - ${f.rel}`)
    console.error(`      ${f.metodo} ${f.ruta}  valida contra ${f.dto}`)
    console.error(`      sobran: ${f.sobran.join(', ')}\n`)
  }
  process.exit(1)
}

console.log(`OK: ${resumen.comparadas} llamadas de escritura comparadas contra su DTO, sin campos de más.`)
console.log(
  `    Sin comparar: ${resumen.noResueltas} con payload no resoluble, ` +
    `${resumen.sinRuta} sin ruta emparejable, ${resumen.sinDto} sin DTO en la ruta.`,
)
