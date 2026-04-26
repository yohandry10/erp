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
    <div style={{ padding: '1rem 0' }}>
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem',
      }}>
        {isValidating ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: '2rem',
          }}>
            <Loader2 className="animate-spin" size={48} style={{ color: 'var(--primary-600)' }} />
            <p style={{
              fontSize: '1rem',
              color: 'var(--primary-700)',
              fontWeight: '500',
            }}>
              Validando tu configuración...
            </p>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--primary-500)',
            }}>
              Esto puede tomar unos segundos
            </p>
          </div>
        ) : hasValidated ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: '2rem',
          }}>
            {allValid ? (
              <>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--success-100)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <CheckCircle size={48} style={{ color: 'var(--success-600)' }} />
                </div>
                <h3 style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  color: 'var(--success-700)',
                  margin: 0,
                }}>
                  ¡Validación Exitosa!
                </h3>
                <p style={{
                  fontSize: '1rem',
                  color: 'var(--primary-600)',
                  margin: 0,
                }}>
                  Tu configuración está lista para usar
                </p>
              </>
            ) : (
              <>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--error-100)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <XCircle size={48} style={{ color: 'var(--error-600)' }} />
                </div>
                <h3 style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  color: 'var(--error-700)',
                  margin: 0,
                }}>
                  Se encontraron problemas
                </h3>
                <p style={{
                  fontSize: '1rem',
                  color: 'var(--primary-600)',
                  margin: 0,
                }}>
                  Revisa los detalles a continuación
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>

      {hasValidated && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Certificate Validation Result */}
          <div style={{
            padding: '1.25rem',
            backgroundColor: certificateResult?.isValid
              ? 'rgba(16, 185, 129, 0.05)'
              : 'rgba(239, 68, 68, 0.05)',
            border: `1px solid ${certificateResult?.isValid ? 'var(--success-300)' : 'var(--error-300)'}`,
            borderRadius: '8px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}>
              {certificateResult?.isValid ? (
                <CheckCircle size={24} style={{ color: 'var(--success-600)' }} />
              ) : (
                <XCircle size={24} style={{ color: 'var(--error-600)' }} />
              )}
              <h4 style={{
                fontSize: '1rem',
                fontWeight: '600',
                color: certificateResult?.isValid ? 'var(--success-700)' : 'var(--error-700)',
                margin: 0,
              }}>
                Certificado Digital
              </h4>
            </div>

            {certificateResult?.isValid ? (
              <div style={{ paddingLeft: '2rem' }}>
                <p style={{
                  fontSize: '0.875rem',
                  color: 'var(--success-700)',
                  margin: '0 0 0.5rem 0',
                }}>
                  ✓ Certificado válido y activo
                </p>
                {certificateResult.subject && (
                  <p style={{
                    fontSize: '0.85rem',
                    color: 'var(--primary-600)',
                    margin: '0 0 0.25rem 0',
                  }}>
                    <strong>Entidad:</strong> {certificateResult.subject}
                  </p>
                )}
                {certificateResult.issuer && (
                  <p style={{
                    fontSize: '0.85rem',
                    color: 'var(--primary-600)',
                    margin: '0 0 0.25rem 0',
                  }}>
                    <strong>Emisor:</strong> {certificateResult.issuer}
                  </p>
                )}
                {certificateResult.serialNumber && (
                  <p style={{
                    fontSize: '0.85rem',
                    color: 'var(--primary-600)',
                    margin: '0 0 0.25rem 0',
                  }}>
                    <strong>Serie:</strong> {certificateResult.serialNumber}
                  </p>
                )}
                {certificateResult.expiresAt && (
                  <p style={{
                    fontSize: '0.875rem',
                    color: 'var(--primary-600)',
                    margin: 0,
                  }}>
                    Expira el: {certificateResult.expiresAt.toLocaleDateString('es-PE')}
                    {certificateResult.daysUntilExpiration !== undefined && (
                      <span> ({certificateResult.daysUntilExpiration} días restantes)</span>
                    )}
                  </p>
                )}
                {certificateResult.warnings && certificateResult.warnings.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    {certificateResult.warnings.map((warning, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginTop: '0.25rem',
                      }}>
                        <AlertTriangle size={16} style={{ color: 'var(--warning-600)' }} />
                        <span style={{
                          fontSize: '0.875rem',
                          color: 'var(--warning-700)',
                        }}>
                          {warning}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ paddingLeft: '2rem' }}>
                {certificateResult?.errors && certificateResult.errors.length > 0 ? (
                  certificateResult.errors.map((error, index) => (
                    <p key={index} style={{
                      fontSize: '0.875rem',
                      color: 'var(--error-700)',
                      margin: '0.25rem 0',
                    }}>
                      ✗ {error}
                    </p>
                  ))
                ) : (
                  <p style={{
                    fontSize: '0.875rem',
                    color: 'var(--error-700)',
                    margin: 0,
                  }}>
                    ✗ Error al validar el certificado
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Documento Fiscal Validation Result */}
          <div style={{
            padding: '1.25rem',
            backgroundColor: rucResult?.isValid
              ? 'rgba(16, 185, 129, 0.05)'
              : 'rgba(239, 68, 68, 0.05)',
            border: `1px solid ${rucResult?.isValid ? 'var(--success-300)' : 'var(--error-300)'}`,
            borderRadius: '8px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}>
              {rucResult?.isValid ? (
                <CheckCircle size={24} style={{ color: 'var(--success-600)' }} />
              ) : (
                <XCircle size={24} style={{ color: 'var(--error-600)' }} />
              )}
              <h4 style={{
                fontSize: '1rem',
                fontWeight: '600',
                color: rucResult?.isValid ? 'var(--success-700)' : 'var(--error-700)',
                margin: 0,
              }}>
                Configuración {documentoFiscal}
              </h4>
            </div>

            {rucResult?.isValid ? (
              <div style={{ paddingLeft: '2rem' }}>
                <p style={{
                  fontSize: '0.875rem',
                  color: 'var(--success-700)',
                  margin: 0,
                }}>
                  ✓ Todos los datos están completos y válidos
                </p>
              </div>
            ) : (
              <div style={{ paddingLeft: '2rem' }}>
                {rucResult?.missingFields && rucResult.missingFields.length > 0 && (
                  <div>
                    <p style={{
                      fontSize: '0.875rem',
                      color: 'var(--error-700)',
                      margin: '0 0 0.5rem 0',
                      fontWeight: '600',
                    }}>
                      Campos faltantes:
                    </p>
                    {rucResult.missingFields.map((field, index) => (
                      <p key={index} style={{
                        fontSize: '0.875rem',
                        color: 'var(--error-700)',
                        margin: '0.25rem 0',
                      }}>
                        ✗ {field}
                      </p>
                    ))}
                  </div>
                )}
                {rucResult?.errors && rucResult.errors.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {rucResult.errors.map((error, index) => (
                      <p key={index} style={{
                        fontSize: '0.875rem',
                        color: 'var(--error-700)',
                        margin: '0.25rem 0',
                      }}>
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
              variant="outline"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              <RefreshCw size={18} className={isValidating ? 'animate-spin' : ''} />
              Validar Nuevamente
            </Button>
          )}
        </div>
      )}

      {allValid && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        }}>
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--success-700)',
            margin: 0,
            lineHeight: '1.5',
          }}>
            <strong>✓ Todo listo:</strong> Puedes continuar al siguiente paso para finalizar la configuración.
          </p>
        </div>
      )}
    </div>
  )
}
