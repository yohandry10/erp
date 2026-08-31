const FISCAL_TIME_ZONES: Record<string, string> = {
  PE: 'America/Lima',
  CO: 'America/Bogota',
  AR: 'America/Argentina/Buenos_Aires',
}

/** Devuelve YYYY-MM-DD en la zona fiscal del país, nunca en UTC. */
export function fiscalDateForCountry(countryCode?: string, now = new Date()): string {
  const timeZone = FISCAL_TIME_ZONES[String(countryCode || '').trim().toUpperCase()]

  if (!timeZone) {
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 10)
  }

  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}
