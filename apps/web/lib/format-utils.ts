/**
 * Utilidades de formateo GLOBALES para todo el proyecto
 * Evita duplicación de código en componentes y páginas
 */

// ============================================
// ARITMÉTICA DE MONEDA
// ============================================

/**
 * Multiplica un importe por un factor y redondea a céntimos, mitad hacia arriba.
 *
 * `Math.round(importe * factor * 100) / 100` no sirve: el producto intermedio en
 * coma flotante cae por debajo del medio céntimo justo cuando el valor exacto está
 * encima. 1,25 al 18 % es 0,225 exacto y debería dar 0,23; en binario queda
 * 0,22499999999999998 y sale 0,22. Sobre 1,2 millones de bases con las tres tasas
 * del ERP —IGV 18 %, IVA 21 %, IVA 19 %— eso son 2 524 importes con un céntimo de
 * menos.
 *
 * Tampoco basta con limpiar el producto antes de redondear: la multiplicación por
 * 100 vuelve a introducir el error y sigue fallando en 971 casos. La única forma
 * de acertar sin traerse una librería decimal al paquete del navegador es no salir
 * de los enteros: el importe en céntimos por el factor en millonésimas, y el
 * redondeo como una suma y una división enteras.
 *
 * El servidor ya calcula con Decimal y es él quien fija los importes del documento;
 * esto existe para que la pantalla no le prometa al usuario un total distinto del
 * que se va a emitir.
 */
export function multiplicarMoneda(importe: number, factor: number): number {
  if (!Number.isFinite(importe) || !Number.isFinite(factor)) return 0
  const centimos = Math.round(importe * 100)
  const millonesimas = Math.round(factor * 1_000_000)
  const producto = centimos * millonesimas
  const signo = producto < 0 ? -1 : 1
  return (signo * Math.floor((Math.abs(producto) + 500_000) / 1_000_000)) / 100
}

/**
 * Redondea a céntimos una suma de importes que ya son múltiplos exactos de un
 * céntimo. Para eso el error binario acumulado es de ~1e-13 y `Math.round` acierta;
 * para un producto hay que usar `multiplicarMoneda`.
 */
export function redondearMoneda(importe: number): number {
  if (!Number.isFinite(importe)) return 0
  return Math.round(importe * 100) / 100
}

// ============================================
// FORMATEO DE MONEDA
// ============================================

/**
 * Formatea un monto como moneda según el código de moneda
 * @param amount - Monto a formatear
 * @param moneda - Código ISO de moneda (PEN, ARS, COP, USD, EUR)
 * @returns String formateado como moneda
 */
export function formatCurrency(amount: number | undefined | null, moneda: string = 'PEN'): string {
  if (amount === undefined || amount === null) return '-'
  
  const currencyMap: Record<string, string> = {
    'PEN': 'PEN',
    'ARS': 'ARS',
    'COP': 'COP',
    'USD': 'USD',
    'EUR': 'EUR',
    'S/': 'PEN',
    '€': 'EUR'
  }

  const currency = currencyMap[moneda] || 'PEN'
  const locale = currency === 'ARS' ? 'es-AR' : currency === 'COP' ? 'es-CO' : 'es-PE'

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

/**
 * Formatea un monto sin símbolo de moneda
 * @param amount - Monto a formatear
 * @param decimals - Número de decimales (default: 2)
 * @returns String formateado con separadores de miles
 */
export function formatNumber(amount: number | undefined | null, decimals: number = 2): string {
  if (amount === undefined || amount === null) return '-'
  
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

// ============================================
// FORMATEO DE FECHAS
// ============================================

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseDisplayDate(dateString: string | Date): Date {
  if (dateString instanceof Date) return dateString

  if (DATE_ONLY_PATTERN.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  return new Date(dateString)
}

/**
 * Formatea una fecha en formato corto (DD/MM/YYYY)
 * @param dateString - String de fecha ISO
 * @returns Fecha formateada
 */
export function formatDate(dateString: string | Date | undefined | null): string {
  if (!dateString) return '-'

  const date = parseDisplayDate(dateString)

  return date.toLocaleDateString('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

/**
 * Formatea una fecha con hora
 * @param dateString - String de fecha ISO
 * @returns Fecha y hora formateada
 */
export function formatDateTime(dateString: string | Date | undefined | null): string {
  if (!dateString) return '-'

  const date = parseDisplayDate(dateString)

  return date.toLocaleDateString('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Formatea una fecha en formato largo (DD de MMMM de YYYY)
 * @param dateString - String de fecha ISO
 * @returns Fecha formateada en formato largo
 */
export function formatDateLong(dateString: string | Date | undefined | null): string {
  if (!dateString) return '-'

  const date = parseDisplayDate(dateString)

  return date.toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Obtiene el período en formato "Mes YYYY"
 * @param dateString - String de fecha ISO
 * @returns Período formateado
 */
export function getPeriodo(dateString: string | Date): string {
  const date = parseDisplayDate(dateString)

  return date.toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'long'
  })
}

// ============================================
// FORMATEO DE PORCENTAJES
// ============================================

/**
 * Formatea un número como porcentaje
 * @param value - Valor a formatear (0-100)
 * @param decimals - Número de decimales (default: 2)
 * @returns String formateado como porcentaje
 */
export function formatPercentage(value: number | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null) return '-'
  
  return `${value.toFixed(decimals)}%`
}
