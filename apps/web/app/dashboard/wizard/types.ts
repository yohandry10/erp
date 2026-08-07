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
  pais?: 'PE' | 'AR' | 'CO'
  pais_id?: number
  ruc: string
  razonSocial: string
  direccion: string
  ubigeo: string
  departamento?: string
  provincia?: string
  distrito?: string
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
  regimen_tributario?:
    | 'GENERAL' | 'MYPE' | 'RER' | 'RUS'
    | 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO' | 'NO_RESPONSABLE'
  igv_porcentaje?: number
  retencion_renta_porcentaje?: number
  // Numeración de comprobantes
  serie_factura?: string
  serie_boleta?: string
  serie_nota_credito?: string
  // Configuración SUNAT/OSE
  emision_cpe_modo?: 'SUNAT_DIRECTO' | 'OSE_API' | 'ARCA_WSFE' | 'DIAN_DIRECTO'
  sunat_environment?: 'homologacion' | 'produccion'
  sunat_username?: string
  sunat_password?: string
  sunat_cpe_url?: string
  sunat_summary_url?: string
  sunat_query_url?: string
  sunat_gre_url?: string
  sunat_gre_transport?: 'soap' | 'rest'
  sunat_gre_rest_base_url?: string
  sunat_gre_auth_url?: string
  sunat_gre_client_id?: string
  sunat_gre_client_secret?: string
  sire_activo?: boolean
  sunat_cert_expected_ruc?: string
  sunat_cert_ruc_mismatch_confirmed?: boolean
  sunat_cert_ruc_mismatch_reason?: string
  ose_url?: string
  ose_status_url?: string
  ose_username?: string
  ose_password?: string
  ose_auth_tipo?: 'BASIC' | 'BEARER' | 'API_KEY' | 'NONE'
  ose_api_key?: string
  ose_api_header?: string
  ose_bearer_token?: string
  ose_activo?: boolean
  dian_activo?: boolean
  dian_url?: string
  dian_usuario?: string
  dian_password?: string
  dian_software_id?: string
  dian_software_pin?: string
  dian_test_set_id?: string
  dian_environment?: 'HOMOLOGACION' | 'PRODUCCION'
  dian_regimen_fiscal?: string
  dian_tipo_contribuyente?: '1' | '2'
  dian_resolucion_numero?: string
  dian_resolucion_prefijo?: string
  dian_resolucion_desde?: number
  dian_resolucion_hasta?: number
  dian_resolucion_fecha_inicio?: string
  dian_resolucion_fecha_fin?: string
  arca_activo?: boolean
  arca_environment?: 'homologacion' | 'produccion'
  arca_wsaa_url?: string
  arca_wsfe_url?: string
  arca_cuit_representada?: string
  arca_punto_venta?: number
  arca_condicion_iva?:
    | 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO' | 'CONSUMIDOR_FINAL'
  ingresos_brutos?: string
  fecha_inicio_actividades?: string
  provincia_fiscal?: string
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
