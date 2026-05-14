'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Lock, Loader2 } from 'lucide-react'
import { useApi } from '@/hooks/use-api'

interface PeriodoCierreWizardProps {
  periodoId: string
  anio: number
  mes: number
  onClose: () => void
  onSuccess: () => void
}

interface ValidationResult {
  asientos: {
    valido: boolean
    asientosDescuadrados: any[]
  }
  eventos: {
    valido: boolean
    eventosPendientes: number
  }
}

export default function PeriodoCierreWizard({
  periodoId,
  anio,
  mes,
  onClose,
  onSuccess
}: PeriodoCierreWizardProps) {
  const [step, setStep] = useState<'validating' | 'results' | 'confirming' | 'processing'>('validating')
  const [validationResults, setValidationResults] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false, throwOnError: true })

  const formatPeriodo = (anio: number, mes: number) => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    return `${meses[mes - 1]} ${anio}`
  }

  const validatePeriodo = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await apiCall(`/contabilidad/periodos/${periodoId}/validar-cierre`)
      setValidationResults(data)
      setStep('results')
    } catch (err: any) {
      setError(err.message || 'Error al validar el período')
      setStep('results')
    } finally {
      setLoading(false)
    }
  }, [apiCall, periodoId])

  const cerrarPeriodo = async () => {
    setStep('processing')
    setLoading(true)
    setError(null)

    try {
      await apiCall(`/contabilidad/periodos/${periodoId}/cerrar`, { method: 'POST' })
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Error al cerrar el período')
      setStep('results')
    } finally {
      setLoading(false)
    }
  }

  // Auto-validate on mount
  useEffect(() => {
    validatePeriodo()
  }, [validatePeriodo])

  const canClose = validationResults?.asientos.valido && validationResults?.eventos.valido

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      zIndex: 1000,
      animation: 'modal-overlay-enter 0.3s ease-out'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: '24px',
        padding: '2rem',
        width: '90%',
        maxWidth: '600px',
        boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        animation: 'modal-content-enter 0.3s ease-out',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Header Bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
          borderRadius: '24px 24px 0 0'
        }} />

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Lock size={24} />
            Cerrar Período Contable
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: '#64748b',
              padding: '0.5rem',
              borderRadius: '50%',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              opacity: loading ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = '#f1f5f9'
                e.currentTarget.style.color = '#334155'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.color = '#64748b'
            }}
          >
            ×
          </button>
        </div>

        {/* Period Info */}
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <p style={{
            margin: 0,
            fontSize: '0.875rem',
            color: '#1e40af',
            fontWeight: '500'
          }}>
            Período: <strong style={{ fontSize: '1rem' }}>{formatPeriodo(anio, mes)}</strong>
          </p>
        </div>

        {/* Content */}
        {step === 'validating' && (
          <div style={{
            textAlign: 'center',
            padding: '2rem 0'
          }}>
            <Loader2 size={48} style={{
              color: '#3b82f6',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem'
            }} />
            <p style={{
              margin: 0,
              fontSize: '1rem',
              color: '#475569',
              fontWeight: '500'
            }}>
              Validando período contable...
            </p>
            <p style={{
              margin: '0.5rem 0 0 0',
              fontSize: '0.875rem',
              color: '#64748b'
            }}>
              Verificando asientos y eventos pendientes
            </p>
          </div>
        )}

        {step === 'results' && validationResults && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            {/* Validation: Asientos */}
            <div style={{
              background: validationResults.asientos.valido ? '#dcfce7' : '#fee2e2',
              border: `1px solid ${validationResults.asientos.valido ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '12px',
              padding: '1rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.5rem'
              }}>
                {validationResults.asientos.valido ? (
                  <CheckCircle size={24} style={{ color: '#059669', flexShrink: 0 }} />
                ) : (
                  <XCircle size={24} style={{ color: '#dc2626', flexShrink: 0 }} />
                )}
                <h3 style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: validationResults.asientos.valido ? '#166534' : '#991b1b'
                }}>
                  Validación de Asientos Contables
                </h3>
              </div>
              <p style={{
                margin: 0,
                fontSize: '0.875rem',
                color: validationResults.asientos.valido ? '#166534' : '#991b1b'
              }}>
                {validationResults.asientos.valido
                  ? '✓ Todos los asientos cuadran correctamente (Debe = Haber)'
                  : `✗ Hay ${validationResults.asientos.asientosDescuadrados.length} asiento(s) descuadrado(s)`
                }
              </p>
              {!validationResults.asientos.valido && validationResults.asientos.asientosDescuadrados.length > 0 && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: '8px'
                }}>
                  <p style={{
                    margin: '0 0 0.5rem 0',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: '#991b1b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Asientos con problemas:
                  </p>
                  <ul style={{
                    margin: 0,
                    paddingLeft: '1.25rem',
                    fontSize: '0.875rem',
                    color: '#991b1b'
                  }}>
                    {validationResults.asientos.asientosDescuadrados.slice(0, 5).map((asiento: any) => (
                      <li key={asiento.id}>
                        {asiento.numero_asiento} - Diferencia: S/ {Math.abs(asiento.total_debe - asiento.total_haber).toFixed(2)}
                      </li>
                    ))}
                    {validationResults.asientos.asientosDescuadrados.length > 5 && (
                      <li>... y {validationResults.asientos.asientosDescuadrados.length - 5} más</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Validation: Eventos */}
            <div style={{
              background: validationResults.eventos.valido ? '#dcfce7' : '#fef3c7',
              border: `1px solid ${validationResults.eventos.valido ? '#bbf7d0' : '#fde68a'}`,
              borderRadius: '12px',
              padding: '1rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.5rem'
              }}>
                {validationResults.eventos.valido ? (
                  <CheckCircle size={24} style={{ color: '#059669', flexShrink: 0 }} />
                ) : (
                  <AlertTriangle size={24} style={{ color: '#d97706', flexShrink: 0 }} />
                )}
                <h3 style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: validationResults.eventos.valido ? '#166534' : '#92400e'
                }}>
                  Validación de Eventos Pendientes
                </h3>
              </div>
              <p style={{
                margin: 0,
                fontSize: '0.875rem',
                color: validationResults.eventos.valido ? '#166534' : '#92400e'
              }}>
                {validationResults.eventos.valido
                  ? '✓ No hay eventos pendientes de procesar'
                  : `⚠ Hay ${validationResults.eventos.eventosPendientes} evento(s) pendiente(s) de procesar`
                }
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div style={{
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '1rem'
              }}>
                <p style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  color: '#991b1b',
                  fontWeight: '500'
                }}>
                  ⚠️ {error}
                </p>
              </div>
            )}

            {/* Warning if cannot close */}
            {!canClose && (
              <div style={{
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: '12px',
                padding: '1rem'
              }}>
                <p style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  color: '#92400e',
                  fontWeight: '500'
                }}>
                  ⚠️ No se puede cerrar el período hasta que se corrijan todos los problemas detectados.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 'confirming' && (
          <div style={{
            background: '#fef3c7',
            border: '1px solid #fde68a',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem'
            }}>
              <AlertTriangle size={24} style={{ color: '#d97706', flexShrink: 0, marginTop: '0.125rem' }} />
              <div>
                <h3 style={{
                  margin: '0 0 0.5rem 0',
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#92400e'
                }}>
                  ¿Está seguro de cerrar este período?
                </h3>
                <p style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  color: '#92400e',
                  lineHeight: '1.5'
                }}>
                  Una vez cerrado, no se podrán crear nuevos asientos contables en este período.
                  Solo un superadministrador podrá reabrir el período.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div style={{
            textAlign: 'center',
            padding: '2rem 0',
            marginBottom: '1.5rem'
          }}>
            <Loader2 size={48} style={{
              color: '#3b82f6',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem'
            }} />
            <p style={{
              margin: 0,
              fontSize: '1rem',
              color: '#475569',
              fontWeight: '500'
            }}>
              Cerrando período contable...
            </p>
          </div>
        )}

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end',
          flexWrap: 'wrap'
        }}>
          {step === 'results' && (
            <>
              <button
                onClick={onClose}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  fontSize: '0.875rem',
                  minWidth: '120px',
                  opacity: loading ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = '#e2e8f0'
                    e.currentTarget.style.borderColor = '#94a3b8'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f1f5f9'
                  e.currentTarget.style.borderColor = '#cbd5e1'
                }}
              >
                Cancelar
              </button>
              {canClose && (
                <button
                  onClick={() => setStep('confirming')}
                  disabled={loading}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    fontSize: '0.875rem',
                    minWidth: '120px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    justifyContent: 'center',
                    opacity: loading ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                >
                  <Lock size={16} />
                  Cerrar Período
                </button>
              )}
            </>
          )}

          {step === 'confirming' && (
            <>
              <button
                onClick={() => setStep('results')}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  fontSize: '0.875rem',
                  minWidth: '120px',
                  opacity: loading ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = '#e2e8f0'
                    e.currentTarget.style.borderColor = '#94a3b8'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f1f5f9'
                  e.currentTarget.style.borderColor = '#cbd5e1'
                }}
              >
                Volver
              </button>
              <button
                onClick={cerrarPeriodo}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '0.875rem',
                  minWidth: '120px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  justifyContent: 'center',
                  opacity: loading ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Cerrando...
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    Confirmar Cierre
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes modal-overlay-enter {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modal-content-enter {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}
