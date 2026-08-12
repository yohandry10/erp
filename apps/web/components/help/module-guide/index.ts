'use client'

import { guias } from './guias'
import { GuiaModulo } from './types'

export type { GuiaModulo }
export { guias }

/**
 * Devuelve la ficha de la ruta actual buscando el prefijo más largo que
 * coincida. Así una subruta sin ficha propia hereda la de su módulo padre en
 * vez de dejar al usuario sin ninguna ayuda.
 */
export function getGuiaPorRuta(pathname: string | null | undefined): GuiaModulo | null {
  if (!pathname) return null

  // Next.js puede entregar la ruta con o sin barra final segun la navegacion.
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  let mejor: string | null = null
  for (const clave of Object.keys(guias)) {
    if (ruta === clave || ruta.startsWith(`${clave}/`)) {
      if (mejor === null || clave.length > mejor.length) mejor = clave
    }
  }

  return mejor ? guias[mejor] : null
}
