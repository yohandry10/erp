import type { Pais } from '@/hooks/use-paises'

export type ActiveCountryCode = 'PE' | 'AR' | 'CO'

export const ACTIVE_COUNTRIES = [
  {
    id: 1,
    codigo_iso: 'PE',
    nombre: 'Perú',
    nombre_fiscal: 'SUNAT',
    moneda_codigo: 'PEN',
    moneda_simbolo: 'S/',
    locale: 'es-PE',
    documento_fiscal: 'RUC',
    impuesto_nombre: 'IGV',
    impuesto_tasa: 0.18,
    activo: true,
  },
  {
    id: 5,
    codigo_iso: 'AR',
    nombre: 'Argentina',
    nombre_fiscal: 'ARCA',
    moneda_codigo: 'ARS',
    moneda_simbolo: '$',
    locale: 'es-AR',
    documento_fiscal: 'CUIT',
    impuesto_nombre: 'IVA',
    impuesto_tasa: 0.21,
    activo: true,
  },
  {
    id: 2,
    codigo_iso: 'CO',
    nombre: 'Colombia',
    nombre_fiscal: 'DIAN',
    moneda_codigo: 'COP',
    moneda_simbolo: '$',
    locale: 'es-CO',
    documento_fiscal: 'NIT',
    impuesto_nombre: 'IVA',
    impuesto_tasa: 0.19,
    activo: true,
  },
] as const

// Perú permanece como fallback para tenants históricos sin país.
export const INITIAL_ACTIVE_COUNTRY = ACTIVE_COUNTRIES[0] satisfies Pais
export const INITIAL_ACTIVE_COUNTRY_ID = String(INITIAL_ACTIVE_COUNTRY.id)
export const INITIAL_ACTIVE_COUNTRY_CODE = INITIAL_ACTIVE_COUNTRY.codigo_iso

export const ROADMAP_COUNTRIES = ['CL', 'MX', 'EC'] as const

export function isActiveCountryId(value: unknown): boolean {
  return ACTIVE_COUNTRIES.some((country) => String(country.id) === String(value ?? ''))
}

export function isActiveCountryCode(value: unknown): value is ActiveCountryCode {
  const code = String(value ?? '').trim().toUpperCase()
  return ACTIVE_COUNTRIES.some((country) => country.codigo_iso === code)
}

export function getActiveCountryById(value: unknown) {
  return ACTIVE_COUNTRIES.find((country) => String(country.id) === String(value ?? '')) ?? null
}

export function getActiveCountryByCode(value: unknown) {
  const code = String(value ?? '').trim().toUpperCase()
  return ACTIVE_COUNTRIES.find((country) => country.codigo_iso === code) ?? null
}

export function isInitialActiveCountryId(value: unknown): boolean {
  return isActiveCountryId(value)
}

export function isInitialActiveCountryCode(value: unknown): boolean {
  return isActiveCountryCode(value)
}

export function keepActiveCountries<T extends { id?: number | string; codigo_iso?: string }>(items: T[]): T[] {
  const filtered = items.filter((item) => {
    const byId = item.id !== undefined && isActiveCountryId(item.id)
    const byCode = item.codigo_iso !== undefined && isActiveCountryCode(item.codigo_iso)
    return byId || byCode
  })

  return filtered.length > 0 ? filtered : [...ACTIVE_COUNTRIES] as unknown as T[]
}

export const keepInitialActiveCountry = keepActiveCountries
