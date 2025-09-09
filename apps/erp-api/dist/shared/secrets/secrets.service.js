"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SecretsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let SecretsService = SecretsService_1 = class SecretsService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(SecretsService_1.name);
        this.algorithm = 'aes-256-gcm';
        this.secretsConfig = [
            { key: 'JWT_SECRET', encrypted: false, required: true, minLength: 32 },
            { key: 'JWT_REFRESH_SECRET', encrypted: false, required: true, minLength: 32 },
            { key: 'ENCRYPTION_KEY', encrypted: false, required: true, minLength: 32 },
            { key: 'SESSION_SECRET', encrypted: false, required: true, minLength: 32 },
            { key: 'CSRF_SECRET', encrypted: false, required: true, minLength: 32 },
            { key: 'DB_ENCRYPTION_KEY', encrypted: false, required: true, minLength: 32 },
            { key: 'SUPABASE_SERVICE_ROLE_KEY', encrypted: true, required: true },
            { key: 'SUNAT_API_KEY', encrypted: true, required: false },
            { key: 'SUNAT_API_SECRET', encrypted: true, required: false },
        ];
        this.encryptionKey = this.configService.get('ENCRYPTION_KEY');
        this.validateSecrets();
    }
    validateSecrets() {
        const missingSecrets = [];
        const invalidSecrets = [];
        for (const config of this.secretsConfig) {
            const value = this.configService.get(config.key);
            if (config.required && !value) {
                missingSecrets.push(config.key);
                continue;
            }
            if (value && config.minLength && value.length < config.minLength) {
                invalidSecrets.push(`${config.key} (mínimo ${config.minLength} caracteres)`);
            }
        }
        if (missingSecrets.length > 0) {
            this.logger.error(`Secretos requeridos faltantes: ${missingSecrets.join(', ')}`);
            throw new Error(`Configuración incompleta: faltan secretos requeridos`);
        }
        if (invalidSecrets.length > 0) {
            this.logger.error(`Secretos inválidos: ${invalidSecrets.join(', ')}`);
            throw new Error(`Configuración inválida: secretos no cumplen requisitos`);
        }
        this.logger.log('✅ Validación de secretos completada exitosamente');
    }
    getSecret(key) {
        const config = this.secretsConfig.find(c => c.key === key);
        const value = this.configService.get(key);
        if (!value) {
            if (config?.required) {
                throw new Error(`Secreto requerido no encontrado: ${key}`);
            }
            return null;
        }
        if (config?.encrypted) {
            return this.decrypt(value);
        }
        return value;
    }
    encrypt(text) {
        if (!this.encryptionKey) {
            throw new Error('Clave de encriptación no configurada');
        }
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }
    decrypt(encryptedText) {
        if (!this.encryptionKey) {
            throw new Error('Clave de encriptación no configurada');
        }
        try {
            const parts = encryptedText.split(':');
            if (parts.length !== 3) {
                throw new Error('Formato de texto encriptado inválido');
            }
            const [ivHex, authTagHex, encrypted] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            this.logger.error(`Error desencriptando secreto: ${error.message}`);
            throw new Error('Error desencriptando secreto');
        }
    }
    generateSecret(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }
    async rotateSecret(key) {
        const config = this.secretsConfig.find(c => c.key === key);
        if (!config) {
            throw new Error(`Configuración de secreto no encontrada: ${key}`);
        }
        const newSecret = this.generateSecret(config.minLength || 32);
        this.logger.warn(`🔄 Rotación de secreto solicitada para: ${key}`);
        this.logger.warn(`Nuevo secreto generado (actualizar manualmente): ${newSecret}`);
        return newSecret;
    }
    validateSSLCertificates() {
        try {
            const certPath = this.configService.get('SSL_CERT_PATH');
            const keyPath = this.configService.get('SSL_KEY_PATH');
            if (!certPath || !keyPath) {
                this.logger.warn('⚠️ Rutas de certificados SSL no configuradas');
                return false;
            }
            const certExists = fs.existsSync(path.resolve(certPath));
            const keyExists = fs.existsSync(path.resolve(keyPath));
            if (!certExists || !keyExists) {
                this.logger.warn('⚠️ Archivos de certificados SSL no encontrados');
                return false;
            }
            const certContent = fs.readFileSync(path.resolve(certPath), 'utf8');
            this.logger.log('✅ Certificados SSL validados correctamente');
            return true;
        }
        catch (error) {
            this.logger.error(`Error validando certificados SSL: ${error.message}`);
            return false;
        }
    }
    getSecretsStatus() {
        const status = {
            totalSecrets: this.secretsConfig.length,
            configuredSecrets: 0,
            missingSecrets: [],
            encryptedSecrets: 0,
            sslCertificatesValid: this.validateSSLCertificates(),
        };
        for (const config of this.secretsConfig) {
            const value = this.configService.get(config.key);
            if (value) {
                status.configuredSecrets++;
                if (config.encrypted) {
                    status.encryptedSecrets++;
                }
            }
            else if (config.required) {
                status.missingSecrets.push(config.key);
            }
        }
        return status;
    }
};
exports.SecretsService = SecretsService;
exports.SecretsService = SecretsService = SecretsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SecretsService);
//# sourceMappingURL=secrets.service.js.map