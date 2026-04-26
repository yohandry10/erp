/**
 * Certificate Validation Alert Component
 * Requirements: 15.5, 19.6, 19.7
 * 
 * Displays certificate validation status before generating invoices
 */

'use client'

import { AlertTriangle, XCircle, CheckCircle, Shield, ExternalLink } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useCertificateValidation } from '@/hooks/use-certificate-validation'
import {
  getCertificateStatusColor,
  getCertificateStatusText,
  formatExpirationDate
} from '@/lib/validations/certificate-validation'
import Link from 'next/link'

interface CertificateValidationAlertProps {
  className?: string
  showOnlyErrors?: boolean
}

export function CertificateValidationAlert({ 
  className,
  showOnlyErrors = false
}: CertificateValidationAlertProps) {
  const { 
    validation, 
    status, 
    isLoading, 
    errorMessage, 
    warningMessage,
    actionMessage,
    canProceed 
  } = useCertificateValidation()

  if (isLoading) {
    return (
      <Alert className={className}>
        <Shield className="h-4 w-4 animate-pulse" />
        <AlertDescription>
          Validando certificado digital...
        </AlertDescription>
      </Alert>
    )
  }

  // Don't show if valid and only showing errors
  if (showOnlyErrors && canProceed && !warningMessage) {
    return null
  }

  // Error state
  if (!canProceed && errorMessage) {
    return (
      <Alert variant="destructive" className={className}>
        <XCircle className="h-4 w-4" />
        <AlertTitle>Certificado Digital Inválido</AlertTitle>
        <AlertDescription>
          <div className="space-y-2">
            <p>{errorMessage}</p>
            {actionMessage && (
              <div className="flex items-center gap-2 mt-3">
                <Link href="/dashboard/configuracion/empresa">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Ir a Configuración
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  // Warning state
  if (warningMessage) {
    return (
      <Alert className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Advertencia de Certificado</AlertTitle>
        <AlertDescription>
          <div className="space-y-2">
            <p>{warningMessage}</p>
            {status.expiresAt && (
              <p className="text-sm">
                Fecha de vencimiento: {formatExpirationDate(status.expiresAt)}
              </p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Link href="/dashboard/configuracion/empresa">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Renovar Certificado
                </Button>
              </Link>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  // Success state (only show if not hiding success)
  if (!showOnlyErrors) {
    return (
      <Alert className={className}>
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription>
          Certificado digital válido
          {status.expiresAt && status.daysUntilExpiration && (
            <span className="text-sm text-gray-600 ml-2">
              (vence en {status.daysUntilExpiration} días)
            </span>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

/**
 * Certificate status badge
 */
interface CertificateStatusBadgeProps {
  className?: string
}

export function CertificateStatusBadge({ className }: CertificateStatusBadgeProps) {
  const { status, isLoading } = useCertificateValidation()

  if (isLoading) {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 ${className}`}>
        <Shield className="h-3 w-3 animate-pulse" />
        Validando...
      </span>
    )
  }

  const colorClass = getCertificateStatusColor(status)
  const statusText = getCertificateStatusText(status)

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}
    >
      <Shield className="h-3 w-3" />
      {statusText}
    </span>
  )
}

/**
 * Certificate validation modal content
 */
export function CertificateValidationExplanation() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">¿Qué es el Certificado Digital?</h4>
          <p className="text-sm text-gray-600 mt-1">
            El certificado digital es un archivo PFX/P12 que permite firmar electrónicamente 
            los comprobantes de pago (facturas, boletas, notas) para enviarlos a SUNAT.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">¿Por qué es obligatorio?</h4>
          <p className="text-sm text-gray-600 mt-1">
            SUNAT requiere que todos los comprobantes electrónicos estén firmados digitalmente 
            para garantizar su autenticidad e integridad.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">¿Cómo obtenerlo?</h4>
          <p className="text-sm text-gray-600 mt-1">
            Puede obtener un certificado digital de entidades certificadoras autorizadas 
            por SUNAT. Una vez obtenido, cárguelo en Configuración &gt; Empresa &gt; Certificado Digital.
          </p>
        </div>
      </div>
    </div>
  )
}
