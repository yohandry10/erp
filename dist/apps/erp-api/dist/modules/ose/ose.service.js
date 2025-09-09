"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined)
        k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined)
        k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function (o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o)
                if (Object.prototype.hasOwnProperty.call(o, k))
                    ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule)
            return mod;
        var result = {};
        if (mod != null)
            for (var k = ownKeys(mod), i = 0; i < k.length; i++)
                if (k[i] !== "default")
                    __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
var OseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OseService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("@erp-suite/crypto");
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
let OseService = OseService_1 = class OseService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(OseService_1.name);
        this.initializeOseConfig();
        this.initializeXmlSigner();
    }
    initializeOseConfig() {
        this.oseConfig = {
            url: this.configService.get('OSE_URL') || 'https://api-cpe-beta.sunat.gob.pe',
            usuario: this.configService.get('OSE_USUARIO') || '',
            password: this.configService.get('OSE_PASSWORD') || '',
            ruc: this.configService.get('EMPRESA_RUC') || '',
            certificatePath: this.configService.get('CERTIFICATE_PATH') || '/certificates/certificado.pfx',
            certificatePassword: this.configService.get('CERTIFICATE_PASSWORD') || '',
            environment: this.configService.get('SUNAT_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion'
        };
        this.logger.log(`🔧 OSE configurado para: ${this.oseConfig.environment}`);
        this.logger.log(`🔧 URL OSE: ${this.oseConfig.url}`);
        this.logger.log(`🔧 RUC Empresa: ${this.oseConfig.ruc}`);
    }
    initializeXmlSigner() {
        try {
            if (fs.existsSync(this.oseConfig.certificatePath)) {
                this.xmlSigner = new crypto_1.XmlSigner({
                    pfxPath: this.oseConfig.certificatePath,
                    pfxPassword: this.oseConfig.certificatePassword,
                });
                this.logger.log('✅ Certificado digital real cargado exitosamente');
            }
            else {
                this.logger.warn('⚠️ Certificado no encontrado, usando modo DEMO para testing');
                this.xmlSigner = new crypto_1.XmlSigner({
                    useDemoMode: true
                });
                this.logger.log('✅ XmlSigner inicializado en modo DEMO');
            }
        }
        catch (error) {
            this.logger.error('❌ Error inicializando certificado:', error);
            this.logger.warn('🔧 Iniciando en modo DEMO como fallback...');
            this.xmlSigner = new crypto_1.XmlSigner({
                useDemoMode: true
            });
        }
    }
    async enviarCpe(xmlUnsigned, fileName) {
        try {
            this.logger.log(`📤 Enviando CPE a SUNAT: ${fileName}`);
            const xmlSigned = this.xmlSigner.signXml(xmlUnsigned);
            const hash = this.xmlSigner.generateHash(xmlSigned);
            const zipBuffer = await this.compressXml(xmlSigned, fileName);
            const response = await this.sendToSunat(zipBuffer, fileName);
            if (response.success) {
                this.logger.log(`✅ CPE enviado exitosamente: ${fileName}`);
                return {
                    success: true,
                    codigoRespuesta: response.codigoRespuesta,
                    descripcionRespuesta: response.descripcionRespuesta,
                    cdr: response.cdr,
                    numeroComprobante: fileName,
                    hashCPE: hash
                };
            }
            else {
                this.logger.error(`❌ Error enviando CPE: ${response.descripcionRespuesta}`);
                return response;
            }
        }
        catch (error) {
            this.logger.error('❌ Error en envío CPE:', error);
            return {
                success: false,
                codigoRespuesta: '99',
                descripcionRespuesta: `Error técnico: ${error.message}`
            };
        }
    }
    async enviarGre(xmlUnsigned, fileName) {
        try {
            this.logger.log(`🚚 Enviando GRE a SUNAT: ${fileName}`);
            const xmlSigned = this.xmlSigner.signXml(xmlUnsigned);
            const hash = this.xmlSigner.generateHash(xmlSigned);
            const zipBuffer = await this.compressXml(xmlSigned, fileName);
            const response = await this.sendGreToSunat(zipBuffer, fileName);
            if (response.success) {
                this.logger.log(`✅ GRE enviada exitosamente: ${fileName}`);
                return {
                    success: true,
                    codigoRespuesta: response.codigoRespuesta,
                    descripcionRespuesta: response.descripcionRespuesta,
                    cdr: response.cdr,
                    numeroComprobante: fileName,
                    hashCPE: hash
                };
            }
            else {
                this.logger.error(`❌ Error enviando GRE: ${response.descripcionRespuesta}`);
                return response;
            }
        }
        catch (error) {
            this.logger.error('❌ Error en envío GRE:', error);
            return {
                success: false,
                codigoRespuesta: '99',
                descripcionRespuesta: `Error técnico: ${error.message}`
            };
        }
    }
    async consultarEstadoCpe(ruc, tipoDocumento, serie, numero) {
        try {
            this.logger.log(`🔍 Consultando estado CPE: ${ruc}-${tipoDocumento}-${serie}-${numero}`);
            const response = await this.queryStatusInSunat(ruc, tipoDocumento, serie, numero);
            return response;
        }
        catch (error) {
            this.logger.error('❌ Error consultando estado CPE:', error);
            return {
                success: false,
                codigoRespuesta: '99',
                descripcionRespuesta: `Error consultando estado: ${error.message}`
            };
        }
    }
    async compressXml(xmlContent, fileName) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        zip.addFile(`${fileName}.xml`, Buffer.from(xmlContent, 'utf8'));
        return zip.toBuffer();
    }
    async sendToSunat(zipBuffer, fileName) {
        return new Promise((resolve, reject) => {
            const postData = this.buildSunatRequest(zipBuffer, fileName, 'cpe');
            const options = {
                hostname: new URL(this.oseConfig.url).hostname,
                port: 443,
                path: '/ol-ti-itcpfegem-beta/billService',
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(postData),
                    'SOAPAction': 'urn:sendBill'
                },
                auth: `${this.oseConfig.usuario}:${this.oseConfig.password}`
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const response = this.parseSunatResponse(data);
                        resolve(response);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            });
            req.on('error', (error) => {
                this.logger.error('❌ Error en petición HTTPS a SUNAT:', error);
                reject(error);
            });
            req.write(postData);
            req.end();
        });
    }
    async sendGreToSunat(zipBuffer, fileName) {
        return new Promise((resolve, reject) => {
            const postData = this.buildSunatRequest(zipBuffer, fileName, 'gre');
            const options = {
                hostname: new URL(this.oseConfig.url).hostname,
                port: 443,
                path: '/ol-ti-itemision-otroscpe-gem-beta/billService',
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(postData),
                    'SOAPAction': 'urn:sendBill'
                },
                auth: `${this.oseConfig.usuario}:${this.oseConfig.password}`
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const response = this.parseSunatResponse(data);
                        resolve(response);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            });
            req.on('error', (error) => {
                this.logger.error('❌ Error en petición HTTPS GRE a SUNAT:', error);
                reject(error);
            });
            req.write(postData);
            req.end();
        });
    }
    buildSunatRequest(zipBuffer, fileName, type) {
        const zipBase64 = zipBuffer.toString('base64');
        return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ser="http://service.sunat.gob.pe"
               xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soap:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${this.oseConfig.usuario}</wsse:Username>
        <wsse:Password>${this.oseConfig.password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <ser:sendBill>
      <fileName>${fileName}.zip</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:sendBill>
  </soap:Body>
</soap:Envelope>`;
    }
    parseSunatResponse(soapResponse) {
        try {
            if (soapResponse.includes('<faultstring>')) {
                const faultMatch = soapResponse.match(/<faultstring>(.*?)<\/faultstring>/);
                return {
                    success: false,
                    codigoRespuesta: '99',
                    descripcionRespuesta: faultMatch ? faultMatch[1] : 'Error SOAP desconocido'
                };
            }
            if (soapResponse.includes('applicationResponse')) {
                const cdrMatch = soapResponse.match(/<applicationResponse>(.*?)<\/applicationResponse>/);
                return {
                    success: true,
                    codigoRespuesta: '0',
                    descripcionRespuesta: 'Aceptado por SUNAT',
                    cdr: cdrMatch ? cdrMatch[1] : undefined
                };
            }
            return {
                success: false,
                codigoRespuesta: '98',
                descripcionRespuesta: 'Respuesta de SUNAT no reconocida'
            };
        }
        catch (error) {
            this.logger.error('❌ Error parseando respuesta SUNAT:', error);
            return {
                success: false,
                codigoRespuesta: '97',
                descripcionRespuesta: `Error parseando respuesta: ${error.message}`
            };
        }
    }
    async queryStatusInSunat(ruc, tipoDocumento, serie, numero) {
        return new Promise((resolve, reject) => {
            const postData = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ser="http://service.sunat.gob.pe">
  <soap:Header/>
  <soap:Body>
    <ser:getStatus>
      <rucComprobante>${ruc}</rucComprobante>
      <tipoComprobante>${tipoDocumento}</tipoComprobante>
      <serieComprobante>${serie}</serieComprobante>
      <numeroComprobante>${numero}</numeroComprobante>
    </ser:getStatus>
  </soap:Body>
</soap:Envelope>`;
            const options = {
                hostname: new URL(this.oseConfig.url).hostname,
                port: 443,
                path: '/ol-ti-itcpfegem-beta/billService',
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(postData),
                    'SOAPAction': 'urn:getStatus'
                },
                auth: `${this.oseConfig.usuario}:${this.oseConfig.password}`
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const response = this.parseSunatResponse(data);
                        resolve(response);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            });
            req.on('error', (error) => {
                reject(error);
            });
            req.write(postData);
            req.end();
        });
    }
    async verificarConfiguracion() {
        const errors = [];
        if (!this.oseConfig.url)
            errors.push('URL de OSE no configurada');
        if (!this.oseConfig.usuario)
            errors.push('Usuario OSE no configurado');
        if (!this.oseConfig.password)
            errors.push('Password OSE no configurado');
        if (!this.oseConfig.ruc)
            errors.push('RUC de empresa no configurado');
        if (!fs.existsSync(this.oseConfig.certificatePath))
            errors.push('Certificado digital no encontrado');
        return {
            valid: errors.length === 0,
            errors
        };
    }
    getConfiguracion() {
        return {
            environment: this.oseConfig.environment,
            url: this.oseConfig.url,
            ruc: this.oseConfig.ruc,
            certificateExists: fs.existsSync(this.oseConfig.certificatePath),
            usuario: this.oseConfig.usuario ? '***configurado***' : 'no configurado',
            password: this.oseConfig.password ? '***configurado***' : 'no configurado'
        };
    }
    async signXmlOnly(xmlContent) {
        try {
            console.log('🔐 [OSE] Firmando XML para testing...');
            const xmlSigned = this.xmlSigner.signXml(xmlContent);
            const hash = this.xmlSigner.generateHash(xmlSigned);
            const isValid = this.xmlSigner.validateSignature(xmlSigned);
            console.log('📜 [OSE] Info certificado: DEMO MODE');
            console.log(`📊 [OSE] Hash generado: ${hash}`);
            console.log(`📊 [OSE] Firma válida: ${isValid ? '✅' : '⚠️'}`);
            return xmlSigned;
        }
        catch (error) {
            console.error('❌ [OSE] Error firmando XML:', error);
            throw new Error(`Error firmando XML: ${error.message}`);
        }
    }
};
exports.OseService = OseService;
exports.OseService = OseService = OseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OseService);
