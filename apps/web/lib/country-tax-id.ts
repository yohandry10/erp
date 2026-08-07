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
  const raw = String(value ?? '').trim().replace(/\s+/g, '')
  const compactMatch = raw.match(/^(\d{9})(\d)$/)
  const match = raw.match(/^(\d{9,10})-(\d)$/) ?? compactMatch
  if (!match) return false
  const weights = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3]
  const sum = match[1]
    .split('')
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * weights[index], 0)
  const remainder = sum % 11
  const expected = remainder === 0 || remainder === 1 ? remainder : 11 - remainder
  return expected === Number(match[2])
}

export function validateCountryTaxId(countryCode: string, value: unknown): boolean {
  const normalized = normalizeTaxId(value)
  if (countryCode === 'AR') return validateArgentinaCuit(normalized)
  if (countryCode === 'CO') return validateColombiaNit(value)
  return /^\d{11}$/.test(normalized)
}
