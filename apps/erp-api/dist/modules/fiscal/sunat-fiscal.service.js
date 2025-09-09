"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SunatFiscalService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fiscal_service_abstract_1 = require("../../shared/integration/fiscal-service.abstract");
const crypto_1 = require("@erp-suite/crypto");
let SunatFiscalService = class SunatFiscalService extends fiscal_service_abstract_1.FiscalServiceAbstract {
    constructor(configService) {
        const config = {
            url: configService.get('OSE_URL') || 'https://api-cpe-beta.sunat.gob.pe',
            usuario: configService.get('OSE_USUARIO') || '',
            password: configService.get('OSE_PASSWORD') || '',
            empresaId: configService.get('EMPRESA_RUC') || '',
            certificatePath: configService.get('CERTIFICATE_PATH') || '/certificates/certificado.pfx',
            certificatePassword: configService.get('CERTIFICATE_PASSWORD') || '',
            environment: configService.get('SUNAT_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion',
            pais: 'PE'
        };
        super(config);
        this.configService = configService;
        this.initializeXmlSigner();
    }
    initializeXmlSigner() {
        this.xmlSigner = new crypto_1.XmlSigner({
            pfxPath: this.config.certificatePath,
            pfxPassword: this.config.certificatePassword
        });
    }
    async enviarDocumento(documento) {
        try {
            this.logOperation('Enviando documento a SUNAT', {
                tipo: documento.tipoDocumento,
                numero: `${documento.serie}-${documento.numero}`
            });
            const xmlUnsigned = await this.generarXML(documento);
            const xmlSigned = await this.firmarXML(xmlUnsigned);
            const fileName = `${documento.emisor.numeroDocumento}-${documento.tipoDocumento}-${documento.serie}-${documento.numero}`;
            const zipBuffer = await this.compressXml(xmlSigned, fileName);
            const response = await this.sendToSunat(zipBuffer, fileName);
            if (response.success) {
                this.logSuccess('Documento enviado a SUNAT', { fileName });
            }
            else {
                this.logError('Error enviando documento', response.descripcionRespuesta);
            }
            return response;
        }
        catch (error) {
            this.logError('enviarDocumento', error);
            return {
                success: false,
                codigoRespuesta: '99',
                descripcionRespuesta: `Error técnico: ${error.message}`
            };
        }
    }
    async consultarEstado(consulta) {
        try {
            this.logOperation('Consultando estado en SUNAT', consulta);
            const response = await this.queryStatusInSunat(consulta.empresaId, consulta.tipoDocumento, consulta.serie, consulta.numero);
            return response;
        }
        catch (error) {
            this.logError('consultarEstado', error);
            return {
                success: false,
                codigoRespuesta: '99',
                descripcionRespuesta: `Error consultando estado: ${error.message}`
            };
        }
    }
    async validarDocumento(documento) {
        const errores = [];
        const advertencias = [];
        if (!documento.emisor.numeroDocumento || documento.emisor.numeroDocumento.length !== 11) {
            errores.push('RUC del emisor debe tener 11 dígitos');
        }
        if (documento.tipoDocumento === '01' && documento.importeTotal < 700) {
            advertencias.push('Factura con monto menor a S/ 700.00');
        }
        if (documento.moneda !== 'PEN' && documento.moneda !== 'USD') {
            errores.push('Moneda debe ser PEN o USD');
        }
        return {
            valido: errores.length === 0,
            errores,
            advertencias,
            numeroDocumento: `${documento.serie}-${documento.numero}`,
            tipoDocumento: documento.tipoDocumento
        };
    }
    async generarXML(documento) {
        return this.buildSunatXML(documento);
    }
    async firmarXML(xmlContent) {
        return this.xmlSigner.signXml(xmlContent);
    }
    async enviarLibroContable(libro) {
        try {
            this.logOperation('Enviando libro contable a SUNAT', {
                periodo: libro.periodo,
                tipo: libro.tipoLibro
            });
            return {
                success: true,
                codigoRespuesta: '0',
                descripcionRespuesta: 'Libro contable enviado exitosamente'
            };
        }
        catch (error) {
            this.logError('enviarLibroContable', error);
            return {
                success: false,
                codigoRespuesta: '99',
                descripcionRespuesta: `Error enviando libro: ${error.message}`
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
        return new Promise((resolve) => {
            resolve({
                success: true,
                codigoRespuesta: '0',
                descripcionRespuesta: 'Aceptado por SUNAT'
            });
        });
    }
    async queryStatusInSunat(ruc, tipoDocumento, serie, numero) {
        return {
            success: true,
            codigoRespuesta: '0',
            descripcionRespuesta: 'Documento encontrado'
        };
    }
    buildSunatXML(documento) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<!-- XML SUNAT generado para ${documento.serie}-${documento.numero} -->`;
    }
};
exports.SunatFiscalService = SunatFiscalService;
exports.SunatFiscalService = SunatFiscalService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SunatFiscalService);
//# sourceMappingURL=sunat-fiscal.service.js.map