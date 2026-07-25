'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useWizard } from '../useWizard'
import { useCountryContext } from '@/hooks/use-country-context'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'

export function ValidationStep() {
  const { state, validateCertificate, validateRuc, saveStepProgress, completeWizard } = useWizard()
  const country = useCountryContext()
  const documentoFiscal = country.documentoFiscal || 'RUC'
  const [isValidating, setIsValidating] = useState(false)
  const [hasValidated, setHasValidated] = useState(false)
  const hasAutoValidatedRef = useRef(false)
  const hasSavedProgressRef = useRef(false)
  const hasFinalizedRef = useRef(false)

  const runValidations = useCallback(async () => {
    try {
      setIsValidating(true)
      setHasValidated(false)

      const [certificateResponse, rucResponse] = await Promise.all([
        validateCertificate(),
        validateRuc(),
      ])

      const certificateValid = !!certificateResponse?.data?.isValid
      const rucValid = !!rucResponse?.data?.isValid

      if (certificateValid && rucValid) {
        if (!hasSavedProgressRef.current) {
          hasSavedProgressRef.current = true
          await saveStepProgress('validation', {
            certificateValid: true,
            rucValid: true,
            validatedAt: new Date().toISOString(),
            certificateMetadata: certificateResponse?.data?.certificate,
          }, { silent: true })
        }

        if (!state.hasPersistedConfiguration && !hasFinalizedRef.current) {
          try {
            hasFinalizedRef.current = true
            await completeWizard({ silent: true })
          } catch (error) {
            hasFinalizedRef.current = false
            throw error
          }
        }
      }
    } catch (error) {
      console.error('Validation error:', error)
    } finally {
      setIsValidating(false)
      setHasValidated(true)
    }
  }, [validateCertificate, validateRuc, saveStepProgress, state.hasPersistedConfiguration, completeWizard])

  useEffect(() => {
    if (hasAutoValidatedRef.current) {
      return
    }
    hasAutoValidatedRef.current = true
    runValidations()
  }, [runValidations])

  const certificateResult = state.validationResults.certificate
  const rucResult = state.validationResults.ruc

  const allValid = certificateResult?.isValid && rucResult?.isValid

  return (
    <div className="py-4 px-0">
      <div className="text-center mb-8">
        {isValidating ? (
          <div className="flex flex-col items-center gap-4 p-8">
            <Loader2 className="animate-spin text-[var(--primary-600)]" size={48} />
            <p className="text-base text-[var(--primary-700)] font-medium">
              Validando tu configuración...
            </p>
            <p className="text-[0.875rem] text-[var(--primary-500)]">
              Esto puede tomar unos segundos
            </p>
          </div>
        ) : hasValidated ? (
          <div className="flex flex-col items-center gap-4 p-8">
            {allValid ? (
              <>
                <div className="w-[80px] h-[80px] rounded-full bg-[var(--success-100)] flex items-center justify-center">
                  <CheckCircle size={48} className="text-[var(--success-600)]" />
                </div>
                <h3 className="text-2xl font-bold text-[var(--success-700)] m-0">
                  ¡Validación Exitosa!
                </h3>
                <p className="text-base text-[var(--primary-600)] m-0">
                  Tu configuración está lista para usar
                </p>
              </>
            ) : (
              <>
                <div className="w-[80px] h-[80px] rounded-full bg-[var(--error-100)] flex items-center justify-center">
                  <XCircle size={48} className="text-[var(--error-600)]" />
                </div>
                <h3 className="text-2xl font-bold text-[var(--error-700)] m-0">
                  Se encontraron problemas
                </h3>
                <p className="text-base text-[var(--primary-600)] m-0">
                  Revisa los detalles a continuación
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>

      {hasValidated && (
        <div className="flex flex-col gap-4">
          {/* Certificate Validation Result */}
          <div className="p-5 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              {certificateResult?.isValid ? (
                <CheckCircle size={24} className="text-[var(--success-600)]" />
              ) : (
                <XCircle size={24} className="text-[var(--error-600)]" />
              )}
              <h4 className="text-base font-semibold m-0">
                Certificado Digital
              </h4>
            </div>

            {certificateResult?.isValid ? (
              <div className="pl-8">
                <p className="text-[0.875rem] text-[var(--success-700)] mt-0 mr-0 mb-2 ml-0">
                  ✓ Certificado válido y activo
                </p>
                {certificateResult.subject && (
                  <p className="text-sm text-[var(--primary-600)] mt-0 mr-0 mb-1 ml-0">
                    <strong>Entidad:</strong> {certificateResult.subject}
                  </p>
                )}
                {certificateResult.issuer && (
                  <p className="text-sm text-[var(--primary-600)] mt-0 mr-0 mb-1 ml-0">
                    <strong>Emisor:</strong> {certificateResult.issuer}
                  </p>
                )}
                {certificateResult.serialNumber && (
                  <p className="text-sm text-[var(--primary-600)] mt-0 mr-0 mb-1 ml-0">
                    <strong>Serie:</strong> {certificateResult.serialNumber}
                  </p>
                )}
                {certificateResult.expiresAt && (
                  <p className="text-[0.875rem] text-[var(--primary-600)] m-0">
                    Expira el: {certificateResult.expiresAt.toLocaleDateString('es-PE')}
                    {certificateResult.daysUntilExpiration !== undefined && (
                      <span> ({certificateResult.daysUntilExpiration} días restantes)</span>
                    )}
                  </p>
                )}
                {certificateResult.warnings && certificateResult.warnings.length > 0 && (
                  <div className="mt-3">
                    {certificateResult.warnings.map((warning, index) => (
                      <div key={index} className="flex items-center gap-2 mt-1">
                        <AlertTriangle size={16} className="text-[var(--warning-600)]" />
                        <span className="text-[0.875rem] text-[var(--warning-700)]">
                          {warning}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="pl-8">
                {certificateResult?.errors && certificateResult.errors.length > 0 ? (
                  certificateResult.errors.map((error, index) => (
                    <p key={index} className="text-[0.875rem] text-[var(--error-700)] my-1 mx-0">
                      ✗ {error}
                    </p>
                  ))
                ) : (
                  <p className="text-[0.875rem] text-[var(--error-700)] m-0">
                    ✗ Error al validar el certificado
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Documento Fiscal Validation Result */}
          <div className="p-5 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              {rucResult?.isValid ? (
                <CheckCircle size={24} className="text-[var(--success-600)]" />
              ) : (
                <XCircle size={24} className="text-[var(--error-600)]" />
              )}
              <h4 className="text-base font-semibold m-0">
                Configuración {documentoFiscal}
              </h4>
            </div>

            {rucResult?.isValid ? (
              <div className="pl-8">
                <p className="text-[0.875rem] text-[var(--success-700)] m-0">
                  ✓ Todos los datos están completos y válidos
                </p>
              </div>
            ) : (
              <div className="pl-8">
                {rucResult?.missingFields && rucResult.missingFields.length > 0 && (
                  <div>
                    <p className="text-[0.875rem] text-[var(--error-700)] mt-0 mr-0 mb-2 ml-0 font-semibold">
                      Campos faltantes:
                    </p>
                    {rucResult.missingFields.map((field, index) => (
                      <p key={index} className="text-[0.875rem] text-[var(--error-700)] my-1 mx-0">
                        ✗ {field}
                      </p>
                    ))}
                  </div>
                )}
                {rucResult?.errors && rucResult.errors.length > 0 && (
                  <div className="mt-2">
                    {rucResult.errors.map((error, index) => (
                      <p key={index} className="text-[0.875rem] text-[var(--error-700)] my-1 mx-0">
                        ✗ {error}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Retry Button */}
          {!allValid && (
            <Button
              onClick={runValidations}
              disabled={isValidating}
              variant="outline" className="flex items-center gap-2 mt-2"
            >
              <RefreshCw size={18} className={isValidating ? 'animate-spin' : ''} />
              Validar Nuevamente
            </Button>
          )}
        </div>
      )}

      {allValid && (
        <div className="mt-6 p-4 bg-[rgba(16,_185,_129,_0.1)] rounded-lg border">
          <p className="text-[0.875rem] text-[var(--success-700)] m-0 leading-6">
            <strong>✓ Todo listo:</strong> Puedes continuar al siguiente paso para finalizar la configuración.
          </p>
        </div>
      )}
    </div>
  )
}
