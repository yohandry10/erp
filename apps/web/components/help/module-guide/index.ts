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

export interface GrupoGuias {
  area: string
  modulos: Array<{ ruta: string; guia: GuiaModulo }>
}

/** Área a la que pertenece una ruta, deducida de su prefijo. */
function areaDeRuta(ruta: string): string {
  if (ruta.startsWith('/dashboard/inventario')) return 'Inventario y logística'
  if (ruta.startsWith('/dashboard/ventas')) return 'Ventas'
  if (ruta.startsWith('/dashboard/finanzas')) return 'Finanzas'
  if (ruta.startsWith('/dashboard/rrhh')) return 'Recursos humanos'
  if (['/dashboard/cpe', '/dashboard/gre', '/dashboard/sire', '/dashboard/documentos'].includes(ruta)) {
    return 'Facturación y fiscal'
  }
  if (['/dashboard/configuracion', '/dashboard/usuarios', '/dashboard/offline', '/dashboard/ayuda', '/dashboard/audit-logs'].includes(ruta)) {
    return 'Sistema'
  }
  return 'General'
}

const ORDEN_AREAS = [
  'General',
  'Ventas',
  'Inventario y logística',
  'Facturación y fiscal',
  'Finanzas',
  'Recursos humanos',
  'Sistema',
]

/** Todas las fichas agrupadas por área, para navegarlas como catálogo. */
export function agruparGuias(): GrupoGuias[] {
  const porArea = new Map<string, GrupoGuias['modulos']>()

  for (const [ruta, guia] of Object.entries(guias)) {
    const area = areaDeRuta(ruta)
    if (!porArea.has(area)) porArea.set(area, [])
    porArea.get(area)!.push({ ruta, guia })
  }

  return ORDEN_AREAS.filter((a) => porArea.has(a)).map((area) => ({
    area,
    modulos: porArea.get(area)!.sort((a, b) => a.guia.titulo.localeCompare(b.guia.titulo, 'es')),
  }))
}
