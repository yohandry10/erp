/**
 * Boleta validation rules for Peru.
 * Requirements: 15.4, 19.4
 *
 * SUNAT requires buyer/user identification on boletas when the total exceeds S/ 700.
 * This threshold does not by itself create a GRE requirement.
 */

import { TipoDocumento } from '@/types/ventas'

export const BOLETA_IDENTIFICATION_THRESHOLD = 700
export const BOLETA_GRE_THRESHOLD = BOLETA_IDENTIFICATION_THRESHOLD

export interface BoletaValidationResult {
  requiresBuyerIdentity: boolean
  requiresGRE: boolean
  reason?: string
  threshold: number
  total: number
}

/**
 * Validates if a boleta must include buyer/user identity data.
 *
 * @param documentoTipo - Client's document type
 * @param total - Total amount of the sale
 * @returns Validation result indicating if buyer identity is required
 */
export function validateBoletaBuyerIdentityRequirement(
  documentoTipo: TipoDocumento,
  total: number
): BoletaValidationResult {
  const requiresBuyerIdentity = total > BOLETA_IDENTIFICATION_THRESHOLD

  void documentoTipo

  return {
    requiresBuyerIdentity,
    // Backwards-compatible field. A boleta over S/ 700 requires buyer identity,
    // not a GRE by amount alone.
    requiresGRE: false,
    reason: requiresBuyerIdentity
      ? `Boleta con monto mayor a S/ ${BOLETA_IDENTIFICATION_THRESHOLD} requiere identificar al adquirente o usuario`
      : undefined,
    threshold: BOLETA_IDENTIFICATION_THRESHOLD,
    total
  }
}

/**
 * Backwards-compatible alias. Kept to avoid breaking older imports; do not use the
 * returned requiresGRE flag for new behavior.
 */
export function validateBoletaGRERequirement(
  documentoTipo: TipoDocumento,
  total: number
): BoletaValidationResult {
  return validateBoletaBuyerIdentityRequirement(documentoTipo, total)
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
  const validation = validateBoletaBuyerIdentityRequirement(documentoTipo, total)

  if (validation.requiresBuyerIdentity) {
    return `Esta boleta supera S/ ${BOLETA_IDENTIFICATION_THRESHOLD}. Debe consignar apellidos y nombres o razón social, y número de documento del adquirente o usuario.`
  }

  // Show warning when approaching threshold
  if (total > BOLETA_IDENTIFICATION_THRESHOLD * 0.8) {
    const remaining = BOLETA_IDENTIFICATION_THRESHOLD - total
    if (remaining > 0) {
      return `Si la boleta supera S/ ${BOLETA_IDENTIFICATION_THRESHOLD}, será obligatorio consignar los datos de identificación del adquirente o usuario. Faltan S/ ${remaining.toFixed(2)} para alcanzar el límite.`
    }
  }

  return null
}

/**
 * Gets the action message for buyer identity requirement.
 */
export function getBuyerIdentityActionMessage(requiresBuyerIdentity: boolean): string | null {
  if (requiresBuyerIdentity) {
    return 'Confirme que el comprobante incluye nombre completo o razón social y documento del receptor antes de emitir.'
  }
  return null
}

/**
 * Backwards-compatible alias for older UI code.
 */
export function getGREActionMessage(requiresGRE: boolean): string | null {
  void requiresGRE
  return null
}
