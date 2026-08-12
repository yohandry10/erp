#!/usr/bin/env node
/**
 * Verifica que cada spotlight de los tours apunte a un ancla que exista.
 *
 * Por qué existe: los 6 spotlights del tour del cajero apuntaban a selectores
 * inexistentes (btn-abrir-caja, input-buscar-producto, carrito, metodo-pago,
 * btn-procesar-venta, btn-cerrar-caja) y el del vendedor a menu-facturas.
 * OnboardingSpotlight hace `if (!rect) return null`, así que el fallo era
 * silencioso: el usuario veía la pantalla oscurecida y un texto flotando sin
 * nada iluminado. Nadie se enteró porque no había nada que lo detectara.
 *
 * Uso: node tests/onboarding/verify-tour-anchors.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const toursDir = join(web, 'components', 'onboarding', 'tours')
const sidebar = join(web, 'components', 'layout', 'sidebar.tsx')

const IGNORAR = new Set(['node_modules', '.next', 'out', 'dist', 'playwright-report', 'test-results'])

function archivosFuente(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORAR.has(entry)) continue
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) archivosFuente(p, acc)
    else if (/\.(tsx?|jsx?)$/.test(entry) && !p.startsWith(toursDir)) acc.push(p)
  }
  return acc
}

// 1. Selectores que los tours pretenden iluminar
const pedidos = []
for (const f of readdirSync(toursDir).filter((n) => n.endsWith('-tour.ts'))) {
  const src = readFileSync(join(toursDir, f), 'utf8')
  for (const m of src.matchAll(/selector:\s*'\[data-tour="([^"]+)"\]'/g)) {
    pedidos.push({ tour: f, ancla: m[1] })
  }
}

// 2. Anclas literales en el resto del código
const disponibles = new Set()
for (const f of archivosFuente(web)) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/data-tour="([^"{]+)"/g)) disponibles.add(m[1])
}

// 3. Anclas que el sidebar genera dinámicamente vía getDataTour(item.title)
const sidebarSrc = readFileSync(sidebar, 'utf8')
for (const m of sidebarSrc.matchAll(/'(menu-[\w-]+)'/g)) disponibles.add(m[1])
for (const m of sidebarSrc.matchAll(/title:\s*'([^']+)'/g)) {
  disponibles.add(`menu-${m[1].toLowerCase().replace(/\s+/g, '-')}`)
}

// 4. Veredicto
const huerfanos = pedidos.filter((p) => !disponibles.has(p.ancla))

console.log(`Selectores de tour revisados: ${pedidos.length}`)
console.log(`Anclas disponibles en la app: ${disponibles.size}`)

if (huerfanos.length > 0) {
  console.error(`\n✗ ${huerfanos.length} selector(es) no apuntan a ningún elemento:\n`)
  for (const h of huerfanos) console.error(`   ${h.tour.padEnd(20)} [data-tour="${h.ancla}"]`)
  console.error(
    '\nAgrega el atributo data-tour al elemento correspondiente, o convierte el paso\n' +
      "a tipo 'modal' si el elemento no está en pantalla cuando corre el tour.\n" +
      `Archivos de tour: ${relative(web, toursDir)}\n`,
  )
  process.exit(1)
}

console.log('\n✓ Todos los spotlights apuntan a un ancla existente.')
