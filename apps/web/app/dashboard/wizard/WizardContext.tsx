'use client'

import React, { createContext, useContext, useReducer, ReactNode } from 'react'
import { WizardState, WizardConfiguration, WizardValidationResults } from './types'

interface WizardContextType {
  state: WizardState
  goToStep: (step: number) => void
  nextStep: () => void
  previousStep: () => void
  updateConfiguration: (config: Partial<WizardConfiguration>) => void
  updateValidationResults: (results: Partial<WizardValidationResults>) => void
  markStepComplete: (stepIndex: number) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

type WizardAction =
  | { type: 'GO_TO_STEP'; payload: number }
  | { type: 'NEXT_STEP' }
  | { type: 'PREVIOUS_STEP' }
  | { type: 'UPDATE_CONFIGURATION'; payload: Partial<WizardConfiguration> }
  | { type: 'UPDATE_VALIDATION_RESULTS'; payload: Partial<WizardValidationResults> }
  | { type: 'MARK_STEP_COMPLETE'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }

const initialState: WizardState = {
  currentStep: 0,
  steps: [
    {
      id: 'welcome',
      title: 'Bienvenido',
      description: 'Configuración inicial del sistema',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'company-type',
      title: 'Tipo de Empresa',
      description: 'Configuración de flujos de trabajo',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'ruc',
      title: 'Configuración RUC',
      description: 'Datos de la empresa',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'certificate',
      title: 'Certificado Digital',
      description: 'Carga de certificado SUNAT',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'validation',
      title: 'Validación',
      description: 'Verificación de configuración',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'completion',
      title: 'Completado',
      description: 'Configuración finalizada',
      isComplete: false,
      isRequired: true,
    },
  ],
  configuration: {
    ruc: '',
    razonSocial: '',
    direccion: '',
    tipo_empresa: undefined,
    usar_flujo_logistica: undefined,
    gre_obligatorio: false,
    gre_automatico_habilitado: true,
    umbral_gre_automatico: 700,
  },
  validationResults: {},
  isLoading: false,
  error: null,
}

const WizardContext = createContext<WizardContextType | undefined>(undefined)

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'GO_TO_STEP':
      return { ...state, currentStep: action.payload, error: null }
    
    case 'NEXT_STEP':
      if (state.currentStep < state.steps.length - 1) {
        return { ...state, currentStep: state.currentStep + 1, error: null }
      }
      return state
    
    case 'PREVIOUS_STEP':
      if (state.currentStep > 0) {
        return { ...state, currentStep: state.currentStep - 1, error: null }
      }
      return state
    
    case 'UPDATE_CONFIGURATION':
      return {
        ...state,
        configuration: { ...state.configuration, ...action.payload },
      }
    
    case 'UPDATE_VALIDATION_RESULTS':
      return {
        ...state,
        validationResults: { ...state.validationResults, ...action.payload },
      }
    
    case 'MARK_STEP_COMPLETE':
      return {
        ...state,
        steps: state.steps.map((step, index) =>
          index === action.payload ? { ...step, isComplete: true } : step
        ),
      }
    
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    
    default:
      return state
  }
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState)

  const goToStep = (step: number) => {
    dispatch({ type: 'GO_TO_STEP', payload: step })
  }

  const nextStep = () => {
    dispatch({ type: 'NEXT_STEP' })
  }

  const previousStep = () => {
    dispatch({ type: 'PREVIOUS_STEP' })
  }

  const updateConfiguration = (config: Partial<WizardConfiguration>) => {
    dispatch({ type: 'UPDATE_CONFIGURATION', payload: config })
  }

  const updateValidationResults = (results: Partial<WizardValidationResults>) => {
    dispatch({ type: 'UPDATE_VALIDATION_RESULTS', payload: results })
  }

  const markStepComplete = (stepIndex: number) => {
    dispatch({ type: 'MARK_STEP_COMPLETE', payload: stepIndex })
  }

  const setLoading = (loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }

  const setError = (error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error })
  }

  return (
    <WizardContext.Provider
      value={{
        state,
        goToStep,
        nextStep,
        previousStep,
        updateConfiguration,
        updateValidationResults,
        markStepComplete,
        setLoading,
        setError,
      }}
    >
      {children}
    </WizardContext.Provider>
  )
}

export function useWizardContext() {
  const context = useContext(WizardContext)
  if (context === undefined) {
    throw new Error('useWizardContext must be used within a WizardProvider')
  }
  return context
}
