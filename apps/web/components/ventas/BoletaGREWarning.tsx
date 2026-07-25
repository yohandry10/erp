/**
 * Boleta buyer identity warning component.
 * Requirements: 15.4, 19.4
 *
 * Displays warning when a boleta exceeds S/ 700 and buyer identity data must be present.
 */

'use client'

import { AlertTriangle, FileText } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TipoDocumento } from '@/types/ventas'
import { useBoletaValidation } from '@/hooks/use-boleta-validation'

interface BoletaBuyerIdentityWarningProps {
  documentoTipo: TipoDocumento | undefined
  total: number
  className?: string
}

export function BoletaBuyerIdentityWarning({
  documentoTipo,
  total,
  className
}: BoletaBuyerIdentityWarningProps) {
  const { validation, warningMessage, actionMessage } = useBoletaValidation(
    documentoTipo,
    total
  )

  // Don't show anything if no warning
  if (!warningMessage) {
    return null
  }

  return (
    <Alert
      variant={validation.requiresBuyerIdentity ? 'destructive' : 'default'}
      className={className}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {validation.requiresBuyerIdentity
          ? 'Identificación del adquirente requerida'
          : 'Advertencia de monto'}
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-2">
          <p>{warningMessage}</p>
          {actionMessage && (
            <p className="text-sm font-medium">{actionMessage}</p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Backwards-compatible export. Older code imported this name when the rule was
 * incorrectly described as a GRE requirement.
 */
export const BoletaGREWarning = BoletaBuyerIdentityWarning

/**
 * Inline badge showing buyer identity requirement status.
 */
interface BuyerIdentityRequirementBadgeProps {
  documentoTipo: TipoDocumento | undefined
  total: number
  className?: string
}

export function BuyerIdentityRequirementBadge({
  documentoTipo,
  total,
  className
}: BuyerIdentityRequirementBadgeProps) {
  const { validation } = useBoletaValidation(documentoTipo, total)

  if (!validation.requiresBuyerIdentity) {
    return null
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 ${className}`}
    >
      <FileText className="h-3 w-3" />
      Identificación requerida
    </span>
  )
}

/**
 * Backwards-compatible export. The badge now refers to buyer identity, not GRE.
 */
export const GRERequirementBadge = BuyerIdentityRequirementBadge

/**
 * Modal/Dialog content for buyer identity requirement explanation.
 */
export function BoletaBuyerIdentityExplanation() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <FileText className="h-5 w-5 text-primary mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">¿Qué exige SUNAT?</h4>
          <p className="text-sm text-foreground/80 mt-1">
            En boletas de venta con importe mayor a S/ 700, deben consignarse los datos
            de identificación del adquirente o usuario.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">¿Cuándo es obligatoria?</h4>
          <p className="text-sm text-foreground/80 mt-1">
            Cuando el importe total de la boleta supera S/ 700.00. El requisito no
            convierte la operación en GRE automática por ese monto.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <FileText className="h-5 w-5 text-emerald-400 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">¿Cómo proceder?</h4>
          <p className="text-sm text-foreground/80 mt-1">
            Verifique nombre completo o razón social y número de documento del receptor
            antes de emitir el comprobante.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Backwards-compatible export.
 */
export const BoletaGREExplanation = BoletaBuyerIdentityExplanation
