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
}

export interface UpdateGREThresholdsDto {
  umbralGREAutomatico: number;
  greAutomaticoHabilitado: boolean;
}
