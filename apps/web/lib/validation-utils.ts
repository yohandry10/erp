/**
 * Utilidades de validación GLOBALES para todo el proyecto
 */

/**
 * Valida que un monto sea válido
 * @param amount - Monto a validar
 * @returns true si es válido
 */
export function isValidAmount(amount: number | string | undefined | null): boolean {
  if (amount === undefined || amount === null || amount === '') return false
  
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  
  return !isNaN(num) && num >= 0
}

/**
 * Valida que un email sea válido
 * @param email - Email a validar
 * @returns true si es válido
 */
export function isValidEmail(email: string | undefined | null): boolean {
  if (!email) return false
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Valida que un RUC peruano sea válido
 * @param ruc - RUC a validar
 * @returns true si es válido
 */
export function isValidRUC(ruc: string | undefined | null): boolean {
  if (!ruc) return false
  
  // RUC debe tener 11 dígitos
  return /^\d{11}$/.test(ruc)
}

/**
 * Valida que un DNI peruano sea válido
 * @param dni - DNI a validar
 * @returns true si es válido
 */
export function isValidDNI(dni: string | undefined | null): boolean {
  if (!dni) return false
  
  // DNI debe tener 8 dígitos
  return /^\d{8}$/.test(dni)
}

/**
 * Valida que un teléfono sea válido
 * @param phone - Teléfono a validar
 * @returns true si es válido
 */
export function isValidPhone(phone: string | undefined | null): boolean {
  if (!phone) return false
  
  // Acepta números con o sin espacios, guiones, paréntesis
  const phoneRegex = /^[\d\s\-\(\)]+$/
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 7
}
