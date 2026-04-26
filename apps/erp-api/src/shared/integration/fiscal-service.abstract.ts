import { Logger } from '@nestjs/common';
import { 
  FiscalConfig, 
  FiscalResponse, 
  DocumentoElectronico, 
  ValidacionDocumento,
  ConsultaEstado,
  LibroContableFiscal 
} from './fiscal.interfaces';

export abstract class FiscalServiceAbstract {
  protected readonly logger = new Logger(this.constructor.name);
  protected config: FiscalConfig;

  constructor(config: FiscalConfig) {
    this.config = config;
  }

  // Métodos abstractos que deben implementar las clases hijas
  abstract enviarDocumento(documento: DocumentoElectronico): Promise<FiscalResponse>;
  abstract consultarEstado(consulta: ConsultaEstado): Promise<FiscalResponse>;
  abstract validarDocumento(documento: DocumentoElectronico): Promise<ValidacionDocumento>;
  abstract generarXML(documento: DocumentoElectronico): Promise<string>;
  abstract firmarXML(xmlContent: string): Promise<string>;
  abstract enviarLibroContable(libro: LibroContableFiscal): Promise<FiscalResponse>;
  
  // Métodos comunes implementados en la clase base
  getConfiguracion(): Partial<FiscalConfig> {
    return {
      url: this.config.url,
      empresaId: this.config.empresaId,
      environment: this.config.environment,
      pais: this.config.pais
    };
  }

  async verificarConfiguracion(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.config.url) errors.push('URL del servicio fiscal no configurada');
    if (!this.config.usuario) errors.push('Usuario no configurado');
    if (!this.config.password) errors.push('Contraseña no configurada');
    if (!this.config.empresaId) errors.push('ID de empresa no configurado');
    if (!this.config.certificatePath) errors.push('Ruta del certificado no configurada');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  protected logOperation(operation: string, details: any): void {
    this.logger.log(`🔧 [${this.config.pais}] ${operation}:`, details);
  }

  protected logError(operation: string, error: any): void {
    this.logger.error(`❌ [${this.config.pais}] Error en ${operation}:`, error);
  }

  protected logSuccess(operation: string, details: any): void {
    this.logger.log(`✅ [${this.config.pais}] ${operation} exitoso:`, details);
  }
}