#!/usr/bin/env node
/**
 * Toda ruta del API sin barra final se responde con un 308.
 *
 * La web tiene dos caminos para llamar al API y sólo uno añadía la barra:
 * `useApi` sí, y `fetchApi` no. Como `TenantContext` y el banner de demo van por
 * `fetchApi` y se montan en **todas** las pantallas, cada carga de página pagaba
 * dos redirecciones de ida y vuelta antes de recibir un solo dato. Medido en el
 * navegador: cuatro 308 por carga del panel, cero después del arreglo.
 *
 * No se nota mirando la pantalla —los datos acaban llegando— y por eso conviene
 * que lo vigile algo que no dependa de que alguien lo mire.
 *
 * Uso: node tests/contrato/verify-barra-final.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const OBLIGADOS = [
  {
    fichero: 'lib/api-fetch.ts',
    porque:
      'fetchApi lo usan TenantContext y DemoBanner, que se montan en todas las pantallas',
  },
  {
    fichero: 'hooks/use-api.ts',
    porque: 'useApi es el camino de datos de la mayoría de pantallas',
  },
]

const fallos = []

for (const { fichero, porque } of OBLIGADOS) {
  let fuente
  try {
    fuente = readFileSync(join(raiz, fichero), 'utf8')
  } catch (error) {
    fallos.push(`${fichero}: no se pudo leer (${error.message})`)
    continue
  }

  if (!fuente.includes('withTrailingSlash')) {
    fallos.push(
      `${fichero} no aplica withTrailingSlash. ${porque}, así que cada llamada ` +
        `suya costará un 308 de ida y vuelta.`,
    )
  }
}

// Control positivo: si el helper desapareciera o cambiara de nombre, la
// comprobación de arriba pasaría en verde sin comprobar nada.
const urlHelper = readFileSync(join(raiz, 'lib/api-url.ts'), 'utf8')
if (!/export function withTrailingSlash/.test(urlHelper)) {
  fallos.push(
    'lib/api-url.ts ya no exporta withTrailingSlash: esta comprobación estaría ' +
      'buscando un nombre que no existe y daría verde sin mirar nada.',
  )
}

if (fallos.length > 0) {
  console.error('\nContrato de barra final incumplido:\n')
  for (const fallo of fallos) console.error(`  - ${fallo}`)
  console.error('')
  process.exit(1)
}

console.log(
  `Contrato de barra final OK: ${OBLIGADOS.length} caminos HTTP aplican withTrailingSlash.`,
)
