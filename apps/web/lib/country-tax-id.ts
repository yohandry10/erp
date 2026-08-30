export function normalizeTaxId(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function validateArgentinaCuit(value: unknown): boolean {
  const cuit = normalizeTaxId(value)
  if (!/^\d{11}$/.test(cuit)) return false
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((total, weight, index) => total + Number(cuit[index]) * weight, 0)
  const remainder = 11 - (sum % 11)
  const digit = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder
  return digit === Number(cuit[10])
}

export function validateColombiaNit(value: unknown): boolean {
  return parseColombiaNit(value) !== null
}

export function parseColombiaNit(value: unknown): {
  base: string
  dv: string
  compact: string
  formatted: string
} | null {
  const raw = String(value ?? '').trim().replace(/\s+/g, '')
  const separated = raw.match(/^(\d{9,10})-(\d)$/)
  const compact = raw.match(/^\d{10,11}$/)
  const base = separated?.[1] ?? (compact ? raw.slice(0, -1) : '')
  const dv = separated?.[2] ?? (compact ? raw.slice(-1) : '')
  if (!base || !dv) return null
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const sum = base
    .split('')
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * weights[index], 0)
  const remainder = sum % 11
  const expected = remainder === 0 || remainder === 1 ? remainder : 11 - remainder
  if (expected !== Number(dv)) return null
  return { base, dv, compact: `${base}${dv}`, formatted: `${base}-${dv}` }
}

export function validateCountryTaxId(countryCode: string, value: unknown): boolean {
  const normalized = normalizeTaxId(value)
  if (countryCode === 'AR') return validateArgentinaCuit(normalized)
  if (countryCode === 'CO') return validateColombiaNit(value)
  return /^\d{11}$/.test(normalized)
}
