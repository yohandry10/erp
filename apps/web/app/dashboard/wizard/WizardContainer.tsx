'use client'

import React, { useEffect } from 'react'
import { useWizard } from './useWizard'
import { useCountryContext } from '@/hooks/use-country-context'
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
    saveStepProgress,
    canGoNext,
  } = useWizard()
  const country = useCountryContext()
  const documentoFiscal = country.documentoFiscal || 'RUC'
  const servicioFiscal = country.servicioFiscal || 'SUNAT'

  useEffect(() => {
    loadProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNextStep = async () => {
    try {
      // Save current step progress before moving to next
      const currentStepData = state.steps[state.currentStep]
      await saveStepProgress(currentStepData.id, state.configuration)

      // Move to next step
      nextStep()
    } catch (error) {
      console.error('Error saving step progress:', error)
    }
  }

  const stepOverrides: Record<string, { title?: string; description?: string }> = {
    ruc: {
      title: `Configuración ${documentoFiscal}`,
      description: 'Datos fiscales de la empresa',
    },
    sunat: {
      title: 'Autoridad fiscal',
      description: `Conexión con ${servicioFiscal} u OSE según tu país`,
    },
  }

  const resolvedSteps = state.steps.map((step) => ({
    ...step,
    ...stepOverrides[step.id],
  }))

  const currentStepData = resolvedSteps[state.currentStep]
  const isFinalStep = state.currentStep === state.steps.length - 1
  const progress = ((state.currentStep + 1) / state.steps.length) * 100

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="max-w-[1000px] my-0 mx-auto">
        {/* Progress Section */}
        <div className="p-8 mb-8 shadow border">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[0.875rem] font-bold text-[var(--primary-700)]">
              Paso {state.currentStep + 1} de {state.steps.length}
            </span>
            <span className="text-xl font-bold text-[var(--amber-600)]">
              {Math.round(progress)}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-[100%] h-3 bg-[var(--primary-100)] overflow-hidden mb-6">
            <div className="h-[100%] bg-[var(--gradient-warning)] transition" />
          </div>

          {/* Step Indicators */}
          <div className="flex justify-between gap-2">
            {resolvedSteps.map((step, index) => (
              <div
                key={step.id} className="flex-[1] text-center"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold transition">
                  {step.isComplete ? '✓' : index + 1}
                </div>
                <div className="text-xs font-semibold">
                  {step.title}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {state.error && (
          <div className="mb-8 p-5 bg-[#fef3c7] border flex items-center gap-4 text-[#92400e] shadow">
            <AlertTriangle size={24} />
            <span className="font-medium">{state.error}</span>
          </div>
        )}

        {/* Main Content Card */}
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg p-10">
          {/* Step Title */}
          <div className="mb-8">
            <h2 className="text-[2rem] font-extrabold text-[var(--primary-800)] mb-3">
              {state.hasPersistedConfiguration ? 'Resumen de Configuración' : currentStepData.title}
            </h2>
            <p className="text-base text-[var(--primary-600)] font-medium leading-7">
              {state.hasPersistedConfiguration
                ? 'Tu sistema está configurado. Aquí puedes ver y editar algunos ajustes.'
                : currentStepData.description}
            </p>
          </div>

          {/* Step Content */}
          {state.isLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
              <p className="text-[var(--primary-600)] text-base font-medium">
                Cargando configuración inicial del sistema
              </p>
            </div>
          ) : (
            children
          )}

          {/* Navigation Buttons - No mostrar si el wizard ya está completado */}
          {!state.isLoading && !state.hasPersistedConfiguration && (
            <div className="flex mt-10 pt-8 border-t gap-4">
              {state.currentStep > 0 && !isFinalStep && (
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 flex items-center gap-2"
                  onClick={previousStep}
                >
                  <ChevronLeft size={20} />
                  Anterior
                </button>
              )}

              {state.currentStep < state.steps.length - 1 && (
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 flex items-center gap-2"
                  onClick={handleNextStep}
                  disabled={!canGoNext()}
                >
                  Siguiente
                  <ChevronRight size={20} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
