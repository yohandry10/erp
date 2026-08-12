#!/usr/bin/env node
/**
 * Verifica que toda ruta del sidebar tenga ficha de ayuda ("¿Qué hace esta
 * pantalla?"), resolviendo por prefijo más largo igual que getGuiaPorRuta.
 *
 * El sistema tiene 35 pantallas y mucha gente no sabe para qué sirve cada una.
 * Si alguien agrega un módulo al menú y olvida la ficha, el usuario se queda
 * sin explicación justo ahí. Esto lo detecta antes de que llegue a producción.
 *
 * Uso: node tests/onboarding/verify-module-guides.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const guiasFile = join(web, 'components', 'help', 'module-guide', 'guias.ts')
const sidebarFile = join(web, 'components', 'layout', 'sidebar.tsx')

// Claves de ficha declaradas
const guiasSrc = readFileSync(guiasFile, 'utf8')
const claves = [...guiasSrc.matchAll(/^\s{2}'(\/dashboard[^']*)':\s*\{/gm)].map((m) => m[1])

// Rutas que el menú realmente ofrece
const sidebarSrc = readFileSync(sidebarFile, 'utf8')
const rutas = [...new Set([...sidebarSrc.matchAll(/href:\s*'(\/dashboard[^']*)'/g)].map((m) => m[1]))]

// Misma resolución que getGuiaPorRuta: prefijo más largo
function resuelve(ruta) {
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta
  let mejor = null
  for (const c of claves) {
    if (limpia === c || limpia.startsWith(`${c}/`)) {
      if (mejor === null || c.length > mejor.length) mejor = c
    }
  }
  return mejor
}

const sinFicha = rutas.filter((r) => resuelve(r) === null)
const heredadas = rutas.filter((r) => {
  const m = resuelve(r)
  return m !== null && m !== (r.length > 1 ? r.replace(/\/+$/, '') : r)
})

console.log(`Fichas declaradas:      ${claves.length}`)
console.log(`Rutas en el menú:       ${rutas.length}`)
console.log(`Con ficha propia:       ${rutas.length - sinFicha.length - heredadas.length}`)
console.log(`Heredan del módulo padre: ${heredadas.length}`)

if (heredadas.length > 0) {
  console.log('\nHeredan (aceptable, pero una ficha propia explica mejor):')
  for (const r of heredadas) console.log(`   ${r.padEnd(52)} → ${resuelve(r)}`)
}

if (sinFicha.length > 0) {
  console.error(`\n✗ ${sinFicha.length} ruta(s) del menú se quedan sin ninguna ayuda:\n`)
  for (const r of sinFicha) console.error(`   ${r}`)
  console.error(`\nAgrega su ficha en components/help/module-guide/guias.ts\n`)
  process.exit(1)
}

console.log('\n✓ Toda ruta del menú resuelve a una ficha.')
