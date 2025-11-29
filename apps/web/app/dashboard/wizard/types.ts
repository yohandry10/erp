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
  subject?: string
  issuer?: string
  serialNumber?: string
  validFrom?: Date
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
  // Logo de la empresa (multi-tenant)
  logoFile?: File
  logoUrl?: string
  logoBase64?: string
  certificateFile?: File
  certificatePassword?: string
  certificateBase64?: string
  // Nuevos campos para configuración de ventas
  tipo_empresa?: 'MICRO' | 'PEQUEÑA' | 'MEDIANA' | 'GRANDE'
  usar_flujo_logistica?: boolean
  gre_obligatorio?: boolean
  gre_automatico_habilitado?: boolean
  umbral_gre_automatico?: number
  // Configuración Fiscal
  regimen_tributario?: 'GENERAL' | 'MYPE' | 'RER' | 'RUS'
  igv_porcentaje?: number
  retencion_renta_porcentaje?: number
  // Numeración de comprobantes
  serie_factura?: string
  serie_boleta?: string
  serie_nota_credito?: string
  // Configuración SUNAT/OSE
  ose_url?: string
  ose_username?: string
  ose_password?: string
  ose_activo?: boolean
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
  hasPersistedConfiguration: boolean
}

export interface WizardProgress {
  paso_actual: number
  pasos_completados: string[]
  configuracion_temporal: any
  completado: boolean
}
