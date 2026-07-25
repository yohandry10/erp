/**
 * Pre-Invoice Validation Component
 * Requirements: 15.5, 19.6, 19.7
 *
 * Validates all requirements before allowing invoice generation
 */

'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCertificateValidation } from '@/hooks/use-certificate-validation'
import { CertificateValidationAlert } from './CertificateValidationAlert'

interface PreInvoiceValidationProps {
  onValidationSuccess: () => void
  onValidationFailure?: () => void
  children: React.ReactNode
}

/**
 * Wrapper component that validates certificate before allowing invoice generation
 *
 * @example
 * ```tsx
 * <PreInvoiceValidation onValidationSuccess={handleGenerateInvoice}>
 *   <Button>Generar Factura</Button>
 * </PreInvoiceValidation>
 * ```
 */
export function PreInvoiceValidation({
  onValidationSuccess,
  onValidationFailure,
  children
}: PreInvoiceValidationProps) {
  const [showDialog, setShowDialog] = useState(false)
  const {
    validation,
    isLoading,
    canProceed,
    errorMessage,
    warningMessage,
    refetch
  } = useCertificateValidation()

  const handleClick = async () => {
    // Refetch validation to ensure it's current
    await refetch()

    if (canProceed) {
      // If valid, proceed directly
      onValidationSuccess()
    } else {
      // If invalid, show dialog
      setShowDialog(true)
      onValidationFailure?.()
    }
  }

  const handleRetry = async () => {
    await refetch()
    if (canProceed) {
      setShowDialog(false)
      onValidationSuccess()
    }
  }

  return (
    <>
      <div onClick={handleClick}>
        {children}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              No se puede generar la factura
            </DialogTitle>
            <DialogDescription>
              Debe resolver los siguientes problemas antes de continuar:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <CertificateValidationAlert />

            {errorMessage && (
              <div className="text-sm text-foreground/80">
                <p className="font-medium mb-2">¿Qué debo hacer?</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Vaya a Configuración &gt; Empresa &gt; Certificado Digital</li>
                  <li>Cargue un certificado PFX/P12 válido</li>
                  <li>Ingrese la contraseña del certificado</li>
                  <li>Guarde los cambios</li>
                  <li>Vuelva a intentar generar la factura</li>
                </ol>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRetry}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verificar Nuevamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Validation checklist component showing all pre-invoice requirements
 */
interface ValidationChecklistProps {
  className?: string
}

export function ValidationChecklist({ className }: ValidationChecklistProps) {
  const { validation, isLoading, canProceed } = useCertificateValidation()

  const checks = [
    {
      id: 'certificate',
      label: 'Certificado digital válido',
      status: isLoading ? 'loading' : (canProceed ? 'success' : 'error'),
      message: validation?.errors[0] || validation?.warnings[0]
    }
  ]

  return (
    <div className={`space-y-2 ${className}`}>
      <h4 className="text-sm font-medium text-foreground/85">
        Validaciones pre-emisión:
      </h4>
      <div className="space-y-1">
        {checks.map((check) => (
          <div key={check.id} className="flex items-start gap-2 text-sm">
            {check.status === 'loading' && (
              <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-muted-foreground" />
            )}
            {check.status === 'success' && (
              <CheckCircle className="h-4 w-4 mt-0.5 text-emerald-400" />
            )}
            {check.status === 'error' && (
              <XCircle className="h-4 w-4 mt-0.5 text-destructive" />
            )}
            <div>
              <p className={
                check.status === 'error'
                  ? 'text-destructive'
                  : check.status === 'success'
                  ? 'text-emerald-400'
                  : 'text-foreground/85'
              }>
                {check.label}
              </p>
              {check.message && (
                <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
