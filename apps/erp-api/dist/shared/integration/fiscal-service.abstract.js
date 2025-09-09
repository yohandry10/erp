"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FiscalServiceAbstract = void 0;
const common_1 = require("@nestjs/common");
class FiscalServiceAbstract {
    constructor(config) {
        this.logger = new common_1.Logger(this.constructor.name);
        this.config = config;
    }
    getConfiguracion() {
        return {
            url: this.config.url,
            empresaId: this.config.empresaId,
            environment: this.config.environment,
            pais: this.config.pais
        };
    }
    async verificarConfiguracion() {
        const errors = [];
        if (!this.config.url)
            errors.push('URL del servicio fiscal no configurada');
        if (!this.config.usuario)
            errors.push('Usuario no configurado');
        if (!this.config.password)
            errors.push('Contraseña no configurada');
        if (!this.config.empresaId)
            errors.push('ID de empresa no configurado');
        if (!this.config.certificatePath)
            errors.push('Ruta del certificado no configurada');
        return {
            valid: errors.length === 0,
            errors
        };
    }
    logOperation(operation, details) {
        this.logger.log(`🔧 [${this.config.pais}] ${operation}:`, details);
    }
    logError(operation, error) {
        this.logger.error(`❌ [${this.config.pais}] Error en ${operation}:`, error);
    }
    logSuccess(operation, details) {
        this.logger.log(`✅ [${this.config.pais}] ${operation} exitoso:`, details);
    }
}
exports.FiscalServiceAbstract = FiscalServiceAbstract;
//# sourceMappingURL=fiscal-service.abstract.js.map