/**
 * Certificate Digital Validation
 * Requirements: 15.5, 19.6, 19.7
 * 
 * Validates digital certificate before generating invoices (CPE)
 */

export interface CertificateValidationResult {
  isValid: boolean
  expiresAt?: Date
  daysUntilExpiration?: number
  errors: string[]
  warnings: string[]
}

export interface CertificateStatus {
  exists: boolean
  isExpired: boolean
  isExpiringSoon: boolean
  daysUntilExpiration?: number
  expiresAt?: Date
}

/**
 * Validates certificate from API response
 */
export function validateCertificateResponse(
  validation: CertificateValidationResult
): {
  canProceed: boolean
  message: string
  severity: 'error' | 'warning' | 'info'
} {
  if (!validation.isValid) {
    return {
      canProceed: false,
      message: validation.errors.join('. '),
      severity: 'error'
    }
  }

  if (validation.warnings.length > 0) {
    return {
      canProceed: true,
      message: validation.warnings.join('. '),
      severity: 'warning'
    }
  }

  return {
    canProceed: true,
    message: 'Certificado digital válido',
    severity: 'info'
  }
}

/**
 * Gets certificate status from validation result
 */
export function getCertificateStatus(
  validation: CertificateValidationResult | null
): CertificateStatus {
  if (!validation) {
    return {
      exists: false,
      isExpired: false,
      isExpiringSoon: false
    }
  }

  const exists = validation.isValid || validation.errors.some(
    e => !e.includes('No se ha cargado') && !e.includes('No se encontró')
  )

  const isExpired = validation.errors.some(e => e.includes('vencido'))
  
  const isExpiringSoon = validation.daysUntilExpiration !== undefined && 
    validation.daysUntilExpiration <= 30 && 
    validation.daysUntilExpiration > 0

  return {
    exists,
    isExpired,
    isExpiringSoon,
    daysUntilExpiration: validation.daysUntilExpiration,
    expiresAt: validation.expiresAt
  }
}

/**
 * Gets user-friendly error message for certificate issues
 */
export function getCertificateErrorMessage(errors: string[]): string {
  if (errors.length === 0) {
    return ''
  }

  const hasNoCertificate = errors.some(
    e => e.includes('No se ha cargado') || e.includes('No se encontró')
  )
  
  const isExpired = errors.some(e => e.includes('vencido'))
  
  const hasInvalidFormat = errors.some(e => e.includes('formato'))

  if (hasNoCertificate) {
    return '❌ No se ha configurado un certificado digital. Debe cargar un certificado PFX/P12 válido en la configuración de la empresa.'
  }

  if (isExpired) {
    return '❌ El certificado digital ha vencido. Debe renovar su certificado antes de poder emitir comprobantes electrónicos.'
  }

  if (hasInvalidFormat) {
    return '❌ El certificado digital tiene un formato inválido. Debe ser un archivo PFX/P12 válido.'
  }

  return `❌ ${errors.join('. ')}`
}

/**
 * Gets user-friendly warning message for certificate issues
 */
export function getCertificateWarningMessage(warnings: string[]): string | null {
  if (warnings.length === 0) {
    return null
  }

  return `⚠️ ${warnings.join('. ')}`
}

/**
 * Gets action message for certificate issues
 */
export function getCertificateActionMessage(
  validation: CertificateValidationResult | null
): string | null {
  if (!validation || validation.isValid) {
    return null
  }

  const hasNoCertificate = validation.errors.some(
    e => e.includes('No se ha cargado') || e.includes('No se encontró')
  )
  
  const isExpired = validation.errors.some(e => e.includes('vencido'))

  if (hasNoCertificate) {
    return 'Vaya a Configuración > Empresa > Certificado Digital para cargar su certificado.'
  }

  if (isExpired) {
    return 'Vaya a Configuración > Empresa > Certificado Digital para renovar su certificado.'
  }

  return 'Vaya a Configuración > Empresa > Certificado Digital para resolver este problema.'
}

/**
 * Formats expiration date for display
 */
export function formatExpirationDate(date: Date | string | undefined): string {
  if (!date) {
    return 'No disponible'
  }

  const expirationDate = typeof date === 'string' ? new Date(date) : date
  
  return expirationDate.toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Gets color class for certificate status badge
 */
export function getCertificateStatusColor(status: CertificateStatus): string {
  if (!status.exists) {
    return 'bg-gray-100 text-gray-700'
  }

  if (status.isExpired) {
    return 'bg-red-100 text-red-700'
  }

  if (status.isExpiringSoon) {
    return 'bg-yellow-100 text-yellow-700'
  }

  return 'bg-green-100 text-green-700'
}

/**
 * Gets status text for certificate
 */
export function getCertificateStatusText(status: CertificateStatus): string {
  if (!status.exists) {
    return 'No configurado'
  }

  if (status.isExpired) {
    return 'Vencido'
  }

  if (status.isExpiringSoon) {
    return `Vence en ${status.daysUntilExpiration} días`
  }

  return 'Válido'
}
