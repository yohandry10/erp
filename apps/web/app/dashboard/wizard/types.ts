export interface WizardStep {
  id: string
  title: string
  description: string
  isComplete: boolean
  isRequired: boolean
}

export interface CertificateValidationResult {
  isValid: boolean
  expiresAt?: Date
  daysUntilExpiration?: number
  errors: string[]
  warnings: string[]
}

export interface RucValidationResult {
  isValid: boolean
  missingFields: string[]
  errors: string[]
}

export interface WizardConfiguration {
  ruc: string
  razonSocial: string
  direccion: string
  certificateFile?: File
  certificatePassword?: string
  certificateBase64?: string
  // Nuevos campos para configuración de ventas
  tipo_empresa?: 'MICRO' | 'PEQUEÑA' | 'MEDIANA' | 'GRANDE'
  usar_flujo_logistica?: boolean
  gre_obligatorio?: boolean
  gre_automatico_habilitado?: boolean
  umbral_gre_automatico?: number
}

export interface WizardValidationResults {
  certificate?: CertificateValidationResult
  ruc?: RucValidationResult
}

export interface WizardState {
  currentStep: number
  steps: WizardStep[]
  configuration: WizardConfiguration
  validationResults: WizardValidationResults
  isLoading: boolean
  error: string | null
}

export interface WizardProgress {
  paso_actual: number
  pasos_completados: string[]
  configuracion_temporal: any
  completado: boolean
}
