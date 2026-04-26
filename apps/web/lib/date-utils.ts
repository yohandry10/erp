/**
 * Utilidades de cálculos de fechas GLOBALES para todo el proyecto
 */

// ============================================
// CÁLCULOS DE FECHAS
// ============================================

/**
 * Calcula los días hasta una fecha de vencimiento
 * @param vencimiento - Fecha de vencimiento
 * @returns Número de días (negativo si ya venció)
 */
export function getDaysUntilDue(vencimiento: string | Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const dueDate = typeof vencimiento === 'string' ? new Date(vencimiento) : vencimiento
  dueDate.setHours(0, 0, 0, 0)
  
  const diffTime = dueDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  return diffDays
}

/**
 * Determina si una fecha está vencida
 * @param vencimiento - Fecha de vencimiento
 * @returns true si está vencida
 */
export function isOverdue(vencimiento: string | Date): boolean {
  return getDaysUntilDue(vencimiento) < 0
}

/**
 * Determina si una fecha vence pronto (dentro de N días)
 * @param vencimiento - Fecha de vencimiento
 * @param days - Número de días para considerar "pronto" (default: 7)
 * @returns true si vence pronto
 */
export function isDueSoon(vencimiento: string | Date, days: number = 7): boolean {
  const daysUntil = getDaysUntilDue(vencimiento)
  return daysUntil >= 0 && daysUntil <= days
}

/**
 * Obtiene el texto descriptivo de vencimiento
 * @param vencimiento - Fecha de vencimiento
 * @returns Texto descriptivo (ej: "Vence en 5 días", "Vencido hace 3 días")
 */
export function getVencimientoText(vencimiento: string | Date): string {
  const days = getDaysUntilDue(vencimiento)
  
  if (days < 0) {
    return `Vencido hace ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'}`
  } else if (days === 0) {
    return 'Vence hoy'
  } else {
    return `Vence en ${days} ${days === 1 ? 'día' : 'días'}`
  }
}

/**
 * Valida que una fecha sea válida
 * @param date - Fecha a validar
 * @returns true si es válida
 */
export function isValidDate(date: string | Date | undefined | null): boolean {
  if (!date) return false
  
  const d = typeof date === 'string' ? new Date(date) : date
  
  return d instanceof Date && !isNaN(d.getTime())
}

/**
 * Valida que una fecha no sea futura
 * @param date - Fecha a validar
 * @returns true si no es futura
 */
export function isNotFutureDate(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  
  return d <= today
}
