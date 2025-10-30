/**
 * Utilidades de formateo GLOBALES para todo el proyecto
 * Evita duplicación de código en componentes y páginas
 */

// ============================================
// FORMATEO DE MONEDA
// ============================================

/**
 * Formatea un monto como moneda según el código de moneda
 * @param amount - Monto a formatear
 * @param moneda - Código de moneda (PEN, USD, EUR)
 * @returns String formateado como moneda
 */
export function formatCurrency(amount: number | undefined | null, moneda: string = 'PEN'): string {
  if (amount === undefined || amount === null) return '-'
  
  const currencyMap: Record<string, string> = {
    'PEN': 'PEN',
    'USD': 'USD',
    'EUR': 'EUR',
    'S/': 'PEN',
    '$': 'USD',
    '€': 'EUR'
  }
  
  const currency = currencyMap[moneda] || 'PEN'
  
  return new Intl.NumberFormat('es-PE', {
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

/**
 * Formatea una fecha en formato corto (DD/MM/YYYY)
 * @param dateString - String de fecha ISO
 * @returns Fecha formateada
 */
export function formatDate(dateString: string | Date | undefined | null): string {
  if (!dateString) return '-'
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  
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
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  
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
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  
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
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  
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
