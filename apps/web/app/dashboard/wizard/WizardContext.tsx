'use client'

import React, { createContext, useCallback, useContext, useReducer, ReactNode } from 'react'
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
  setPersistedConfiguration: (value: boolean) => void
  resetWizardState: () => void
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
  | { type: 'SET_PERSISTED'; payload: boolean }
  | { type: 'RESET' }

const createInitialState = (): WizardState => ({
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
      title: 'Identificación Fiscal',
      description: 'Documento y datos registrales de la empresa',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'certificate',
      title: 'Certificado Digital',
      description: 'Carga de certificado digital',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'fiscal',
      title: 'Configuración Fiscal',
      description: 'Parámetros tributarios y numeración',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'sunat',
      title: 'Autoridad Fiscal',
      description: 'Conexión con la autoridad fiscal del país',
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
    pais: 'PE',
    pais_id: 1,
    ruc: '',
    razonSocial: '',
    direccion: '',
    ubigeo: '',
    departamento: '',
    provincia: '',
    distrito: '',
    logoUrl: undefined,
    logoBase64: undefined,
    tipo_empresa: undefined,
    usar_flujo_logistica: undefined,
    gre_obligatorio: false,
    gre_automatico_habilitado: false,
    umbral_gre_automatico: 700,
    // Configuración Fiscal
    regimen_tributario: undefined,
    igv_porcentaje: 18,
    retencion_renta_porcentaje: 0,
    serie_factura: '',
    serie_boleta: '',
    serie_nota_credito: '',
    // Configuración SUNAT
    emision_cpe_modo: 'SUNAT_DIRECTO',
    sunat_environment: 'homologacion',
    sunat_username: '',
    sunat_password: '',
    sunat_cpe_url: '',
    sunat_summary_url: '',
    sunat_query_url: '',
    sunat_gre_url: '',
    sunat_gre_transport: 'soap',
    sunat_gre_rest_base_url: 'https://api-cpe.sunat.gob.pe/v1',
    sunat_gre_auth_url: '',
    sunat_gre_client_id: '',
    sunat_gre_client_secret: '',
    sunat_cert_expected_ruc: '',
    sunat_cert_ruc_mismatch_confirmed: false,
    sunat_cert_ruc_mismatch_reason: '',
    ose_url: '',
    ose_status_url: '',
    ose_username: '',
    ose_password: '',
    ose_auth_tipo: 'BASIC',
    ose_api_key: '',
    ose_api_header: '',
    ose_bearer_token: '',
    ose_activo: false,
    dian_activo: false,
    dian_url: '',
    dian_usuario: '',
    dian_password: '',
    dian_software_id: '',
    dian_software_pin: '',
    dian_test_set_id: '',
    dian_environment: 'HOMOLOGACION',
    dian_regimen_fiscal: '',
    dian_tipo_contribuyente: undefined,
    dian_resolucion_numero: '',
    dian_resolucion_prefijo: '',
    dian_resolucion_desde: undefined,
    dian_resolucion_hasta: undefined,
    dian_resolucion_fecha_inicio: '',
    dian_resolucion_fecha_fin: '',
    arca_activo: false,
    arca_environment: 'homologacion',
    arca_wsaa_url: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    arca_wsfe_url: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    arca_cuit_representada: '',
    arca_punto_venta: 1,
    arca_condicion_iva: 'RESPONSABLE_INSCRIPTO',
    ingresos_brutos: '',
    fecha_inicio_actividades: '',
    provincia_fiscal: '',
  },
  validationResults: {},
  isLoading: false,
  error: null,
  hasPersistedConfiguration: false,
})

const initialState: WizardState = createInitialState()

const WizardContext = createContext<WizardContextType | undefined>(undefined)

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'GO_TO_STEP':
      return { ...state, currentStep: action.payload, error: null }

    case 'NEXT_STEP':
      if (state.currentStep < state.steps.length - 1) {
        // Mark current step as complete before moving to next
        const updatedSteps = state.steps.map((step, index) =>
          index === state.currentStep ? { ...step, isComplete: true } : step
        )
        return {
          ...state,
          currentStep: state.currentStep + 1,
          steps: updatedSteps,
          error: null
        }
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

    case 'SET_PERSISTED':
      return { ...state, hasPersistedConfiguration: action.payload }

    case 'RESET':
      return createInitialState()

    default:
      return state
  }
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState)

  // Todos los wrappers se memoizan con useCallback (deps vacías porque dispatch
  // de useReducer es estable). Sin esto, cualquier useEffect en un step que use
  // estas funciones en su array de dependencias entra en bucle infinito:
  // render → nueva referencia → effect re-corre → setState → render → ...
  // (Caso real: CompanyTypeStep.useEffect disparaba "Maximum update depth").
  const goToStep = useCallback((step: number) => {
    dispatch({ type: 'GO_TO_STEP', payload: step })
  }, [])

  const nextStep = useCallback(() => {
    dispatch({ type: 'NEXT_STEP' })
  }, [])

  const previousStep = useCallback(() => {
    dispatch({ type: 'PREVIOUS_STEP' })
  }, [])

  const updateConfiguration = useCallback((config: Partial<WizardConfiguration>) => {
    dispatch({ type: 'UPDATE_CONFIGURATION', payload: config })
  }, [])

  const updateValidationResults = useCallback((results: Partial<WizardValidationResults>) => {
    dispatch({ type: 'UPDATE_VALIDATION_RESULTS', payload: results })
  }, [])

  const markStepComplete = useCallback((stepIndex: number) => {
    dispatch({ type: 'MARK_STEP_COMPLETE', payload: stepIndex })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }, [])

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error })
  }, [])

  const resetWizardState = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  const setPersistedConfiguration = useCallback((value: boolean) => {
    dispatch({ type: 'SET_PERSISTED', payload: value })
  }, [])

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
        setPersistedConfiguration,
        resetWizardState,
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
