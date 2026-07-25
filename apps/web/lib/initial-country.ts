import type { Pais } from '@/hooks/use-paises'

export const INITIAL_ACTIVE_COUNTRY = {
  id: 1,
  codigo_iso: 'PE',
  nombre: 'Perú',
  nombre_fiscal: 'SUNAT',
  moneda_codigo: 'PEN',
  moneda_simbolo: 'S/',
  activo: true,
} satisfies Pais

export const INITIAL_ACTIVE_COUNTRY_ID = String(INITIAL_ACTIVE_COUNTRY.id)
export const INITIAL_ACTIVE_COUNTRY_CODE = INITIAL_ACTIVE_COUNTRY.codigo_iso

export const ROADMAP_COUNTRIES = ['CO', 'CL', 'MX', 'EC'] as const

export function isInitialActiveCountryId(value: unknown): boolean {
  return String(value ?? '') === INITIAL_ACTIVE_COUNTRY_ID
}

export function isInitialActiveCountryCode(value: unknown): boolean {
  return String(value ?? '').trim().toUpperCase() === INITIAL_ACTIVE_COUNTRY_CODE
}

export function keepInitialActiveCountry<T extends { id?: number | string; codigo_iso?: string }>(items: T[]): T[] {
  const filtered = items.filter((item) => {
    const byId = item.id !== undefined && isInitialActiveCountryId(item.id)
    const byCode = item.codigo_iso !== undefined && isInitialActiveCountryCode(item.codigo_iso)
    return byId || byCode
  })

  return filtered.length > 0 ? filtered : [INITIAL_ACTIVE_COUNTRY as unknown as T]
}
