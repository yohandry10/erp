/**
 * Boleta GRE Warning Component
 * Requirements: 15.4, 19.4
 * 
 * Displays warning when a boleta without RUC exceeds S/ 700 and requires GRE
 */

'use client'

import { AlertTriangle, FileText, TruckIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TipoDocumento } from '@/types/ventas'
import { useBoletaValidation } from '@/hooks/use-boleta-validation'

interface BoletaGREWarningProps {
  documentoTipo: TipoDocumento | undefined
  total: number
  className?: string
}

export function BoletaGREWarning({ 
  documentoTipo, 
  total, 
  className 
}: BoletaGREWarningProps) {
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
      variant={validation.requiresGRE ? 'destructive' : 'default'}
      className={className}
    >
      {validation.requiresGRE ? (
        <TruckIcon className="h-4 w-4" />
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      <AlertTitle>
        {validation.requiresGRE 
          ? 'Guía de Remisión Electrónica Requerida' 
          : 'Advertencia de Monto'}
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
 * Inline badge showing GRE requirement status
 */
interface GRERequirementBadgeProps {
  documentoTipo: TipoDocumento | undefined
  total: number
  className?: string
}

export function GRERequirementBadge({ 
  documentoTipo, 
  total, 
  className 
}: GRERequirementBadgeProps) {
  const { validation } = useBoletaValidation(documentoTipo, total)

  if (!validation.requiresGRE) {
    return null
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 ${className}`}
    >
      <TruckIcon className="h-3 w-3" />
      GRE Requerida
    </span>
  )
}

/**
 * Modal/Dialog content for GRE requirement explanation
 */
export function BoletaGREExplanation() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">¿Qué es una Guía de Remisión Electrónica?</h4>
          <p className="text-sm text-gray-600 mt-1">
            La Guía de Remisión Electrónica (GRE) es un documento que sustenta el traslado 
            de bienes. Es obligatoria según las regulaciones de SUNAT.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">¿Cuándo es obligatoria?</h4>
          <p className="text-sm text-gray-600 mt-1">
            Es obligatoria cuando se emite una boleta a un cliente sin RUC y el monto 
            total supera los S/ 700.00.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <TruckIcon className="h-5 w-5 text-green-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">¿Cómo proceder?</h4>
          <p className="text-sm text-gray-600 mt-1">
            Después de emitir la factura, el sistema le sugerirá generar la GRE 
            automáticamente con los datos del pedido precargados.
          </p>
        </div>
      </div>
    </div>
  )
}
