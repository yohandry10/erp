export interface CertificateValidationResult {
  isValid: boolean;
  expiresAt?: Date;
  daysUntilExpiration?: number;
  errors: string[];
  warnings: string[];
}

export interface RucValidationResult {
  isValid: boolean;
  missingFields: string[];
  errors: string[];
}

export interface DocumentValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
}

export enum ValidationErrorCode {
  CERTIFICATE_NOT_FOUND = 'CERT_001',
  CERTIFICATE_EXPIRED = 'CERT_002',
  CERTIFICATE_INVALID_FORMAT = 'CERT_003',
  RUC_INCOMPLETE = 'RUC_001',
  RUC_INVALID_FORMAT = 'RUC_002',
  ITEMS_LIMIT_EXCEEDED = 'DOC_001',
  AMOUNT_LIMIT_EXCEEDED = 'DOC_002',
  INVALID_SERIE_FORMAT = 'DOC_003',
  INVALID_CORRELATIVE_FORMAT = 'DOC_004',
}

export interface ValidateCertificateDto {
  tenantId: string;
}

export interface ValidateRucDto {
  tenantId: string;
}

export interface ValidateDocumentDto {
  items: any[];
  total: number;
  serie?: string;
  correlativo?: string;
  tipoDocumento?: string;
}

export interface ValidationStatusResponse {
  certificate: CertificateValidationResult;
  ruc: RucValidationResult;
  overallStatus: 'complete' | 'incomplete' | 'warning';
}

export interface ValidateDniLookupDto {
  dni: string;
}

export interface DniLookupResult {
  dni: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
  codigoVerificacion?: string;
}
