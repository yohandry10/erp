export interface FiscalDocumentNumberOptions {
  padNonColombiaTo?: number
  fallback?: string
}

function normalizedConsecutive(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return /^\d+$/.test(raw) ? raw.replace(/^0+(?=\d)/, '') : raw
}

/**
 * DIAN define el identificador visible como prefijo asignado + consecutivo,
 * sin separadores ni relleno agregado por la interfaz. Perú y Argentina
 * conservan el formato histórico con guion y el padding que indique cada vista.
 */
export function formatFiscalDocumentNumber(
  countryCode: string | null | undefined,
  serie: string | null | undefined,
  numero: string | number | null | undefined,
  options: FiscalDocumentNumberOptions = {},
): string {
  const country = String(countryCode ?? '').trim().toUpperCase()
  const normalizedSerie = String(serie ?? '').trim()
  const rawNumber = String(numero ?? '').trim()

  if (!rawNumber) return options.fallback ?? ''
  if (country === 'CO') {
    return `${normalizedSerie.toUpperCase()}${normalizedConsecutive(rawNumber)}`
  }

  const visibleNumber = options.padNonColombiaTo
    ? rawNumber.padStart(options.padNonColombiaTo, '0')
    : rawNumber
  return normalizedSerie
    ? `${normalizedSerie}-${visibleNumber}`
    : visibleNumber || options.fallback || ''
}
