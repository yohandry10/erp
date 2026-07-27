export interface ConfigurationStatus {
  isComplete: boolean;
  completionPercentage: number;
  missingItems: string[];
  certificate: {
    exists: boolean;
    isValid: boolean;
    expiresAt?: Date;
  };
  ruc: {
    isConfigured: boolean;
    missingFields: string[];
  };
}

export interface GREThresholds {
  umbralGREAutomatico: number;
  greAutomaticoHabilitado: boolean;
}

export interface WizardProgress {
  id: string;
  tenantId: string;
  pasoActual: number;
  pasosCompletados: number[];
  configuracionTemporal?: any;
  completado: boolean;
  completadoAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveWizardStepDto {
  pasoActual: number;
  configuracionTemporal?: any;
}

export interface UpdateEmpresaConfigDto {
  ruc?: string;
  razonSocial?: string;
  direccion?: string;
  certificadoPfx?: Buffer | string;
  certificadoPassword?: string;
  certificadoExpiraEn?: Date;
  umbralGREAutomatico?: number;
  greAutomaticoHabilitado?: boolean;
  emisionCpeModo?: 'SUNAT_DIRECTO' | 'OSE_API';
  sunatEnvironment?: 'homologacion' | 'produccion';
  sunatUsername?: string;
  sunatPassword?: string;
  sunatCpeUrl?: string;
  sunatSummaryUrl?: string;
  sunatQueryUrl?: string;
  sunatGreUrl?: string;
  sunatGreTransport?: 'soap' | 'rest';
  sunatGreRestBaseUrl?: string;
  sunatGreAuthUrl?: string;
  sunatGreClientId?: string;
  sunatGreClientSecret?: string;
  sunatCertExpectedRuc?: string;
  sunatCertRucMismatchConfirmed?: boolean;
  sunatCertRucMismatchReason?: string;
  oseUrl?: string;
  oseStatusUrl?: string;
  oseUsername?: string;
  osePassword?: string;
  oseApiKey?: string;
  oseApiHeader?: string;
  oseBearerToken?: string;
  oseAuthTipo?: 'BASIC' | 'BEARER' | 'API_KEY' | 'NONE';
  oseActivo?: boolean;
  dianActivo?: boolean;
  dianUrl?: string;
  dianUsuario?: string;
  dianPassword?: string;
  dianSoftwareId?: string;
  dianSoftwarePin?: string;
  dianTestSetId?: string;
  dianEnvironment?: 'HOMOLOGACION' | 'PRODUCCION';
  dianRegimenFiscal?: string;
  dianTipoContribuyente?: '1' | '2';
  dianResolucionNumero?: string;
  dianResolucionPrefijo?: string;
  dianResolucionDesde?: number;
  dianResolucionHasta?: number;
  dianResolucionFechaInicio?: Date;
  dianResolucionFechaFin?: Date;
}

export interface UpdateGREThresholdsDto {
  umbralGREAutomatico: number;
  greAutomaticoHabilitado: boolean;
}

export interface ValidateWizardCertificateDto {
  certificateBase64: string;
  certificatePassword: string;
}

export interface WizardCertificateValidationResult {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  daysUntilExpiration: number;
}
