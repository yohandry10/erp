'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  CheckCircle, 
  Circle, 
  Upload, 
  RefreshCw, 
  Eye, 
  FileCheck,
  AlertCircle,
  ChevronRight,
  ChevronLeft
} from 'lucide-react'

interface WizardStep {
  id: number
  title: string
  description: string
  status: 'pending' | 'current' | 'completed'
}

interface ConciliacionWizardProps {
  conciliacionId: string
  conciliacion: any
  onComplete: () => void
}

export default function ConciliacionWizard({ 
  conciliacionId, 
  conciliacion,
  onComplete 
}: ConciliacionWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [extractoImportado, setExtractoImportado] = useState(false)
  const [matchAutomaticoEjecutado, setMatchAutomaticoEjecutado] = useState(false)
  const [estadisticas, setEstadisticas] = useState<any>(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

  const steps: WizardStep[] = [
    {
      id: 1,
      title: 'Importar Extracto',
      description: 'Sube el archivo CSV del banco',
      status: currentStep > 1 ? 'completed' : currentStep === 1 ? 'current' : 'pending'
    },
    {
      id: 2,
      title: 'Match Automático',
      description: 'Ejecuta la conciliación automática',
      status: currentStep > 2 ? 'completed' : currentStep === 2 ? 'current' : 'pending'
    },
    {
      id: 3,
      title: 'Ajustes Manuales',
      description: 'Revisa y ajusta los matches',
      status: currentStep > 3 ? 'completed' : currentStep === 3 ? 'current' : 'pending'
    },
    {
      id: 4,
      title: 'Revisar Diferencias',
      description: 'Verifica el resultado final',
      status: currentStep > 4 ? 'completed' : currentStep === 4 ? 'current' : 'pending'
    },
    {
      id: 5,
      title: 'Cerrar Conciliación',
      description: 'Finaliza el proceso',
      status: currentStep === 5 ? 'current' : 'pending'
    }
  ]

  const loadEstadisticas = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/finanzas/conciliacion/${conciliacionId}/diferencias`,
        {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      )
      if (response.ok) {
        const data = await response.json()
        setEstadisticas(data.data)
      }
    } catch (error) {
      console.error('Error loading estadisticas:', error)
    }
  }, [API_BASE_URL, conciliacionId])

  useEffect(() => {
    loadEstadisticas()
  }, [loadEstadisticas])

  const handleMatchAutomatico = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/finanzas/conciliacion/${conciliacionId}/match-automatico`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      )
      
      if (response.ok) {
        setMatchAutomaticoEjecutado(true)
        await loadEstadisticas()
        alert('✅ Match automático ejecutado exitosamente')
      } else {
        const error = await response.json()
        alert('Error: ' + (error.message || 'No se pudo ejecutar el match automático'))
      }
    } catch (error) {
      console.error('Error executing match automatico:', error)
      alert('Error: No se pudo ejecutar el match automático')
    } finally {
      setLoading(false)
    }
  }

  const handleNextStep = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: conciliacion?.cuentas_bancarias?.moneda || 'PEN',
    }).format(amount)
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Upload size={64} style={{ margin: '0 auto 1rem', color: '#3b82f6' }} />
            <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Importar Extracto Bancario
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
              Sube el archivo CSV del extracto bancario para comenzar la conciliación
            </p>
            <button
              onClick={() => router.push(`/dashboard/finanzas/conciliacion/${conciliacionId}`)}
              style={{
                padding: '0.75rem 2rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Ir a Importar CSV
            </button>
            {extractoImportado && (
              <div style={{ 
                marginTop: '1.5rem', 
                padding: '1rem', 
                background: '#d1fae5', 
                borderRadius: '0.5rem',
                color: '#065f46'
              }}>
                ✓ Extracto importado correctamente
              </div>
            )}
          </div>
        )

      case 2:
        return (
          <div style={{ padding: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <RefreshCw size={64} style={{ margin: '0 auto 1rem', color: '#3b82f6' }} />
              <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                Match Automático
              </h3>
              <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
                El sistema intentará conciliar automáticamente los movimientos por monto y fecha
              </p>
            </div>

            {estadisticas && (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '1rem',
                marginBottom: '2rem'
              }}>
                <div style={{ 
                  padding: '1.5rem', 
                  background: 'white', 
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Movimientos Sistema
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                    {estadisticas.movimientos_sistema.total}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#10b981', marginTop: '0.5rem' }}>
                    {estadisticas.movimientos_sistema.conciliados} conciliados
                  </div>
                </div>

                <div style={{ 
                  padding: '1.5rem', 
                  background: 'white', 
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Movimientos Extracto
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                    {estadisticas.movimientos_extracto.total}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#10b981', marginTop: '0.5rem' }}>
                    {estadisticas.movimientos_extracto.conciliados} conciliados
                  </div>
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={handleMatchAutomatico}
                disabled={loading || matchAutomaticoEjecutado}
                style={{
                  padding: '0.75rem 2rem',
                  background: matchAutomaticoEjecutado ? '#10b981' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: loading || matchAutomaticoEjecutado ? 'not-allowed' : 'pointer',
                  opacity: loading || matchAutomaticoEjecutado ? 0.6 : 1
                }}
              >
                {loading ? 'Ejecutando...' : matchAutomaticoEjecutado ? '✓ Ejecutado' : 'Ejecutar Match Automático'}
              </button>
            </div>
          </div>
        )

      case 3:
        return (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Eye size={64} style={{ margin: '0 auto 1rem', color: '#3b82f6' }} />
            <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Ajustes Manuales
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
              Revisa los movimientos y realiza ajustes manuales si es necesario
            </p>

            {estadisticas && (
              <div style={{ 
                padding: '1.5rem', 
                background: '#fef3c7', 
                borderRadius: '0.5rem',
                marginBottom: '2rem',
                textAlign: 'left'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#92400e' }}>
                  Pendientes de Conciliar:
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Sistema:</span>
                  <span style={{ fontWeight: '600' }}>{estadisticas.movimientos_sistema.pendientes}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Extracto:</span>
                  <span style={{ fontWeight: '600' }}>{estadisticas.movimientos_extracto.pendientes}</span>
                </div>
              </div>
            )}

            <button
              onClick={() => router.push(`/dashboard/finanzas/conciliacion/${conciliacionId}`)}
              style={{
                padding: '0.75rem 2rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Ir a Tabla de Conciliación
            </button>
          </div>
        )

      case 4:
        return (
          <div style={{ padding: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <AlertCircle size={64} style={{ margin: '0 auto 1rem', color: '#3b82f6' }} />
              <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                Revisar Diferencias
              </h3>
              <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
                Verifica los saldos y diferencias antes de cerrar
              </p>
            </div>

            {estadisticas && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: '1rem'
                }}>
                  <div style={{ 
                    padding: '1.5rem', 
                    background: 'white', 
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Saldo Libro
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>
                      {formatCurrency(estadisticas.saldos.saldo_libro)}
                    </div>
                  </div>

                  <div style={{ 
                    padding: '1.5rem', 
                    background: 'white', 
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Saldo Banco
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>
                      {formatCurrency(estadisticas.saldos.saldo_banco)}
                    </div>
                  </div>

                  <div style={{ 
                    padding: '1.5rem', 
                    background: 'white', 
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Diferencia
                    </div>
                    <div style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: '700', 
                      color: Math.abs(estadisticas.saldos.diferencia_neta) < 0.01 ? '#10b981' : '#ef4444'
                    }}>
                      {formatCurrency(estadisticas.saldos.diferencia_neta)}
                    </div>
                  </div>
                </div>

                <div style={{ 
                  padding: '1.5rem', 
                  background: Math.abs(estadisticas.saldos.diferencia_neta) < 0.01 ? '#d1fae5' : '#fee2e2', 
                  borderRadius: '0.5rem',
                  textAlign: 'center'
                }}>
                  <div style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: '600',
                    color: Math.abs(estadisticas.saldos.diferencia_neta) < 0.01 ? '#065f46' : '#991b1b'
                  }}>
                    {Math.abs(estadisticas.saldos.diferencia_neta) < 0.01 
                      ? '✓ Conciliación Cuadrada' 
                      : '⚠ Hay Diferencias'}
                  </div>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    marginTop: '0.5rem',
                    color: Math.abs(estadisticas.saldos.diferencia_neta) < 0.01 ? '#065f46' : '#991b1b'
                  }}>
                    {Math.abs(estadisticas.saldos.diferencia_neta) < 0.01 
                      ? 'Los saldos coinciden perfectamente' 
                      : 'Revisa los movimientos pendientes antes de cerrar'}
                  </div>
                </div>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, 1fr)', 
                  gap: '1rem'
                }}>
                  <div style={{ 
                    padding: '1.5rem', 
                    background: 'white', 
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
                      Progreso Sistema
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height: '8px', 
                      background: '#e5e7eb', 
                      borderRadius: '4px',
                      overflow: 'hidden',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{
                        width: `${estadisticas.metricas.porcentaje_conciliado_sistema}%`,
                        height: '100%',
                        background: '#3b82f6',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {estadisticas.metricas.porcentaje_conciliado_sistema.toFixed(1)}% conciliado
                    </div>
                  </div>

                  <div style={{ 
                    padding: '1.5rem', 
                    background: 'white', 
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
                      Progreso Extracto
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height: '8px', 
                      background: '#e5e7eb', 
                      borderRadius: '4px',
                      overflow: 'hidden',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{
                        width: `${estadisticas.metricas.porcentaje_conciliado_extracto}%`,
                        height: '100%',
                        background: '#3b82f6',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {estadisticas.metricas.porcentaje_conciliado_extracto.toFixed(1)}% conciliado
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )

      case 5:
        return (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <FileCheck size={64} style={{ margin: '0 auto 1rem', color: '#10b981' }} />
            <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Cerrar Conciliación
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
              Finaliza el proceso de conciliación y marca los movimientos como conciliados
            </p>

            {estadisticas && (
              <div style={{ 
                padding: '1.5rem', 
                background: estadisticas.movimientos_sistema.pendientes === 0 && 
                           estadisticas.movimientos_extracto.pendientes === 0 
                  ? '#d1fae5' 
                  : '#fef3c7', 
                borderRadius: '0.5rem',
                marginBottom: '2rem',
                textAlign: 'left'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '1rem' }}>
                  Estado Final:
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Movimientos Sistema Pendientes:</span>
                  <span style={{ fontWeight: '600', color: estadisticas.movimientos_sistema.pendientes === 0 ? '#10b981' : '#f59e0b' }}>
                    {estadisticas.movimientos_sistema.pendientes}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Movimientos Extracto Pendientes:</span>
                  <span style={{ fontWeight: '600', color: estadisticas.movimientos_extracto.pendientes === 0 ? '#10b981' : '#f59e0b' }}>
                    {estadisticas.movimientos_extracto.pendientes}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                  <span>Diferencia Final:</span>
                  <span style={{ 
                    fontWeight: '700', 
                    color: Math.abs(estadisticas.saldos.diferencia_neta) < 0.01 ? '#10b981' : '#ef4444'
                  }}>
                    {formatCurrency(estadisticas.saldos.diferencia_neta)}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => router.push(`/dashboard/finanzas/conciliacion/${conciliacionId}`)}
              style={{
                padding: '0.75rem 2rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Ir a Cerrar Conciliación
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div style={{ 
      background: 'white', 
      borderRadius: '0.5rem', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden'
    }}>
      {/* Steps Header */}
      <div style={{ 
        padding: '2rem', 
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          {steps.map((step, index) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                flex: 1
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: step.status === 'completed' ? '#10b981' : 
                             step.status === 'current' ? '#3b82f6' : '#e5e7eb',
                  color: step.status === 'pending' ? '#6b7280' : 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600',
                  marginBottom: '0.5rem'
                }}>
                  {step.status === 'completed' ? (
                    <CheckCircle size={24} />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </div>
                <div style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: '500',
                  color: step.status === 'current' ? '#1f2937' : '#6b7280',
                  textAlign: 'center'
                }}>
                  {step.title}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div style={{
                  flex: 1,
                  height: '2px',
                  background: step.status === 'completed' ? '#10b981' : '#e5e7eb',
                  marginTop: '-2rem'
                }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div style={{ minHeight: '400px' }}>
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div style={{ 
        padding: '1.5rem 2rem', 
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <button
          onClick={handlePrevStep}
          disabled={currentStep === 1}
          style={{
            padding: '0.5rem 1.5rem',
            background: 'white',
            color: '#3b82f6',
            border: '1px solid #3b82f6',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
            opacity: currentStep === 1 ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <ChevronLeft size={16} />
          Anterior
        </button>

        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Paso {currentStep} de {steps.length}
        </div>

        <button
          onClick={handleNextStep}
          disabled={currentStep === 5}
          style={{
            padding: '0.5rem 1.5rem',
            background: currentStep === 5 ? '#e5e7eb' : '#3b82f6',
            color: currentStep === 5 ? '#6b7280' : 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: currentStep === 5 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          Siguiente
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
