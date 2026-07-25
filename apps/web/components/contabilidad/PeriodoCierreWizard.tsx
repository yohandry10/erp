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
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(15,_23,_42,_0.8)] flex items-center justify-center p-4 z-[1100]">
      <div className="bg-card text-card-foreground rounded-3xl p-8 w-[90%] max-w-[600px] max-h-[90vh] shadow border relative overflow-y-auto">
        {/* Header Bar */}
        <div className="absolute top-0 left-0 right-0 h-[4px]" />

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold m-0 flex items-center gap-2">
            <Lock size={24} />
            Cerrar Período Contable
          </h2>
          <button
            onClick={onClose}
            disabled={loading} className="border-0 text-2xl text-muted-foreground p-2 rounded-full transition flex items-center justify-center w-10 h-10"
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
        <div className="bg-muted border rounded-xl p-4 mb-6">
          <p className="m-0 text-[0.875rem] text-[#1e40af] font-medium">
            Período: <strong className="text-base">{formatPeriodo(anio, mes)}</strong>
          </p>
        </div>

        {/* Content */}
        {step === 'validating' && (
          <div className="text-center py-8 px-0">
            <Loader2 size={48} className="text-blue-500" />
            <p className="m-0 text-base text-foreground/80 font-medium">
              Validando período contable...
            </p>
            <p className="mt-2 mr-0 mb-0 ml-0 text-[0.875rem] text-muted-foreground">
              Verificando asientos y eventos pendientes
            </p>
          </div>
        )}

        {step === 'results' && validationResults && (
          <div className="flex flex-col gap-4 mb-6">
            {/* Validation: Asientos */}
            <div className="rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                {validationResults.asientos.valido ? (
                  <CheckCircle size={24} className="text-emerald-400 shrink-0" />
                ) : (
                  <XCircle size={24} className="text-destructive shrink-0" />
                )}
                <h3 className="m-0 text-base font-semibold">
                  Validación de Asientos Contables
                </h3>
              </div>
              <p className="m-0 text-[0.875rem]">
                {validationResults.asientos.valido
                  ? '✓ Todos los asientos cuadran correctamente (Debe = Haber)'
                  : `✗ Hay ${validationResults.asientos.asientosDescuadrados.length} asiento(s) descuadrado(s)`
                }
              </p>
              {!validationResults.asientos.valido && validationResults.asientos.asientosDescuadrados.length > 0 && (
                <div className="mt-3 p-3 bg-card/50 rounded-lg">
                  <p className="mt-0 mr-0 mb-2 ml-0 text-xs font-semibold text-destructive">
                    Asientos con problemas:
                  </p>
                  <ul className="m-0 pl-5 text-[0.875rem] text-destructive">
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
            <div className="rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                {validationResults.eventos.valido ? (
                  <CheckCircle size={24} className="text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle size={24} className="text-[#d97706] shrink-0" />
                )}
                <h3 className="m-0 text-base font-semibold">
                  Validación de Eventos Pendientes
                </h3>
              </div>
              <p className="m-0 text-[0.875rem]">
                {validationResults.eventos.valido
                  ? '✓ No hay eventos pendientes de procesar'
                  : `⚠ Hay ${validationResults.eventos.eventosPendientes} evento(s) pendiente(s) de procesar`
                }
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-[#fee2e2] border rounded-xl p-4">
                <p className="m-0 text-[0.875rem] text-destructive font-medium">
                  ⚠️ {error}
                </p>
              </div>
            )}

            {/* Warning if cannot close */}
            {!canClose && (
              <div className="bg-[#fef3c7] border rounded-xl p-4">
                <p className="m-0 text-[0.875rem] text-[#92400e] font-medium">
                  ⚠️ No se puede cerrar el período hasta que se corrijan todos los problemas detectados.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 'confirming' && (
          <div className="bg-[#fef3c7] border rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle size={24} className="text-[#d97706] shrink-0 mt-0.5" />
              <div>
                <h3 className="mt-0 mr-0 mb-2 ml-0 text-base font-semibold text-[#92400e]">
                  ¿Está seguro de cerrar este período?
                </h3>
                <p className="m-0 text-[0.875rem] text-[#92400e] leading-6">
                  Una vez cerrado, no se podrán crear nuevos asientos contables en este período.
                  Solo un superadministrador podrá reabrir el período.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center py-8 px-0 mb-6">
            <Loader2 size={48} className="text-blue-500" />
            <p className="m-0 text-base text-foreground/80 font-medium">
              Cerrando período contable...
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4 justify-end flex-wrap">
          {step === 'results' && (
            <>
              <button
                onClick={onClose}
                disabled={loading} className="py-3 px-6 bg-muted text-foreground/85 border rounded-xl font-semibold transition text-[0.875rem] min-w-[120px]"
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
                  disabled={loading} className="py-3 px-6 text-white border-0 rounded-xl font-semibold transition shadow text-[0.875rem] min-w-[120px] flex items-center gap-2 justify-center"
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
                disabled={loading} className="py-3 px-6 bg-muted text-foreground/85 border rounded-xl font-semibold transition text-[0.875rem] min-w-[120px]"
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
                disabled={loading} className="py-3 px-6 text-white border-0 rounded-xl font-semibold transition shadow text-[0.875rem] min-w-[120px] flex items-center gap-2 justify-center"
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
                    <Loader2 size={16} />
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
    </div>
  )
}
