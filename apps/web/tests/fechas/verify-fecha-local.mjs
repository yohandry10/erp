#!/usr/bin/env node
/**
 * Impide que vuelva a colarse `new Date(x).toLocaleDateString(...)` en la UI.
 *
 * Una columna DATE llega de la API como "2026-08-19". `new Date("2026-08-19")`
 * la interpreta como medianoche UTC, y al pintarla con la zona del navegador
 * (Lima es UTC-5) retrocede un día: una orden fechada el 19 se muestra el 18.
 * Se detectó en producción sobre una cotización de compra y estaba repetido en
 * 27 archivos.
 *
 * `parseDateLocal` ya resuelve los dos casos: fija el día cuando el valor es
 * una fecha de calendario y deja pasar los instantes reales sin tocarlos.
 *
 * Uso: node tests/fechas/verify-fecha-local.mjs
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// `new Date()` sin argumentos es el instante actual y es correcto.
// `new Date(anio, mes, dia)` ya construye en hora local y también lo es.
const PATRON = 'new Date\\([^),]+\\)\\.toLocaleDateString'

let salida = ''
try {
  salida = execFileSync('git', ['grep', '-n', '-E', PATRON, '--', 'app', 'components'], {
    cwd: web,
    encoding: 'utf8',
  })
} catch (error) {
  // git grep sale con 1 cuando no hay coincidencias: es el caso bueno.
  if (error.status !== 1) throw error
}

const hallazgos = salida.split('\n').filter(Boolean)

if (hallazgos.length > 0) {
  console.error('Fechas resueltas en UTC al pintarlas. Use parseDateLocal de @/lib/date-utils:\n')
  for (const linea of hallazgos) console.error('  ' + linea)
  console.error(`\n${hallazgos.length} ocurrencia(s).`)
  process.exit(1)
}

console.log('✓ Ninguna fecha se pinta interpretándola en UTC.')
