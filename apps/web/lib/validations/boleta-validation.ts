/**
 * Boleta Validation Rules
 * Requirements: 15.4, 19.4
 * 
 * According to SUNAT regulations:
 * - Boletas issued to clients without RUC and total > S/ 700 require GRE (Guía de Remisión Electrónica)
 */

import { TipoDocumento } from '@/types/ventas'

export const BOLETA_GRE_THRESHOLD = 700

export interface BoletaValidationResult {
  requiresGRE: boolean
  reason?: string
  threshold: number
  total: number
}

/**
 * Validates if a boleta requires GRE based on client document type and total amount
 * 
 * @param documentoTipo - Client's document type
 * @param total - Total amount of the sale
 * @returns Validation result indicating if GRE is required
 */
export function validateBoletaGRERequirement(
  documentoTipo: TipoDocumento,
  total: number
): BoletaValidationResult {
  // GRE is required if:
  // 1. Client doesn't have RUC (DNI, CE, or PASAPORTE)
  // 2. Total amount exceeds S/ 700
  const clientWithoutRUC = documentoTipo !== TipoDocumento.RUC
  const exceedsThreshold = total > BOLETA_GRE_THRESHOLD

  const requiresGRE = clientWithoutRUC && exceedsThreshold

  return {
    requiresGRE,
    reason: requiresGRE
      ? `Boleta sin RUC con monto mayor a S/ ${BOLETA_GRE_THRESHOLD} requiere Guía de Remisión Electrónica`
      : undefined,
    threshold: BOLETA_GRE_THRESHOLD,
    total
  }
}

/**
 * Checks if a client has RUC
 */
export function clientHasRUC(documentoTipo: TipoDocumento): boolean {
  return documentoTipo === TipoDocumento.RUC
}

/**
 * Gets a warning message for boleta without RUC
 */
export function getBoletaWarningMessage(
  documentoTipo: TipoDocumento,
  total: number
): string | null {
  const validation = validateBoletaGRERequirement(documentoTipo, total)

  if (validation.requiresGRE) {
    return `⚠️ Esta venta requiere Guía de Remisión Electrónica (GRE) porque el cliente no tiene RUC y el monto (S/ ${total.toFixed(2)}) supera los S/ ${BOLETA_GRE_THRESHOLD}.`
  }

  // Show warning when approaching threshold
  if (!clientHasRUC(documentoTipo) && total > BOLETA_GRE_THRESHOLD * 0.8) {
    const remaining = BOLETA_GRE_THRESHOLD - total
    if (remaining > 0) {
      return `Advertencia: Si el monto supera S/ ${BOLETA_GRE_THRESHOLD}, será necesario generar una Guía de Remisión Electrónica. Faltan S/ ${remaining.toFixed(2)} para alcanzar el límite.`
    }
  }

  return null
}

/**
 * Gets the action message for GRE requirement
 */
export function getGREActionMessage(requiresGRE: boolean): string | null {
  if (requiresGRE) {
    return 'Deberá generar una Guía de Remisión Electrónica (GRE) después de emitir la factura.'
  }
  return null
}
