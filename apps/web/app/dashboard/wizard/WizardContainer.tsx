'use client'

import React, { useEffect } from 'react'
import { useWizard } from './useWizard'
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle } from 'lucide-react'

interface WizardContainerProps {
  children: React.ReactNode
}

export function WizardContainer({ children }: WizardContainerProps) {
  const {
    state,
    nextStep,
    previousStep,
    loadProgress,
    canGoNext,
  } = useWizard()

  useEffect(() => {
    loadProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentStepData = state.steps[state.currentStep]
  const progress = ((state.currentStep + 1) / state.steps.length) * 100

  return (
    <div className="dashboard-container">
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Progress Section */}
        <div style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 'var(--border-radius-xl)',
          padding: '2rem',
          marginBottom: '2rem',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <span style={{ 
              fontSize: '0.875rem', 
              fontWeight: '700',
              color: 'var(--primary-700)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Paso {state.currentStep + 1} de {state.steps.length}
            </span>
            <span style={{ 
              fontSize: '1.25rem',
              fontWeight: '700',
              color: 'var(--amber-600)'
            }}>
              {Math.round(progress)}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div style={{
            width: '100%',
            height: '12px',
            backgroundColor: 'var(--primary-100)',
            borderRadius: 'var(--border-radius)',
            overflow: 'hidden',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              height: '100%',
              background: 'var(--gradient-warning)',
              borderRadius: 'var(--border-radius)',
              transition: 'width 0.3s ease',
              width: `${progress}%`,
            }} />
          </div>

          {/* Step Indicators */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}>
            {state.steps.map((step, index) => (
              <div
                key={step.id}
                style={{
                  flex: 1,
                  textAlign: 'center',
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  margin: '0 auto 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: '700',
                  background: index === state.currentStep
                    ? 'var(--gradient-primary)'
                    : step.isComplete
                    ? 'var(--gradient-success)'
                    : 'var(--primary-100)',
                  color: index === state.currentStep || step.isComplete
                    ? 'white'
                    : 'var(--primary-500)',
                  boxShadow: index === state.currentStep ? 'var(--shadow-lg)' : 'none',
                  transition: 'all 0.3s ease'
                }}>
                  {step.isComplete ? '✓' : index + 1}
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: index === state.currentStep
                    ? 'var(--primary-800)'
                    : 'var(--primary-600)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {step.title}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {state.error && (
          <div style={{
            marginBottom: '2rem',
            padding: '1.25rem',
            background: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: 'var(--border-radius)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            color: '#92400e',
            boxShadow: 'var(--shadow-md)'
          }}>
            <AlertTriangle size={24} />
            <span style={{ fontWeight: '500' }}>{state.error}</span>
          </div>
        )}

        {/* Main Content Card */}
        <div className="stat-card" style={{ padding: '2.5rem' }}>
          {/* Step Title */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: '800',
              color: 'var(--primary-800)',
              marginBottom: '0.75rem',
              letterSpacing: '-0.02em'
            }}>
              {currentStepData.title}
            </h2>
            <p style={{
              fontSize: '1rem',
              color: 'var(--primary-600)',
              fontWeight: '500',
              lineHeight: '1.6'
            }}>
              {currentStepData.description}
            </p>
          </div>

          {/* Step Content */}
          {state.isLoading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p style={{ color: 'var(--primary-600)', fontSize: '1rem', fontWeight: '500' }}>
                Cargando...
              </p>
            </div>
          ) : (
            children
          )}

          {/* Navigation Buttons */}
          {!state.isLoading && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '2.5rem',
              paddingTop: '2rem',
              borderTop: '1px solid var(--primary-200)',
              gap: '1rem'
            }}>
              <button
                className="btn btn-secondary"
                onClick={previousStep}
                disabled={state.currentStep === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <ChevronLeft size={20} />
                Anterior
              </button>

              <button
                className="btn btn-primary"
                onClick={nextStep}
                disabled={!canGoNext() || state.currentStep === state.steps.length - 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                Siguiente
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
