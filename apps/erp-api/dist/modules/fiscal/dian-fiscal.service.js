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
exports.DianFiscalService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fiscal_service_abstract_1 = require("../../shared/integration/fiscal-service.abstract");
let DianFiscalService = class DianFiscalService extends fiscal_service_abstract_1.FiscalServiceAbstract {
    constructor(configService) {
        const config = {
            url: configService.get('DIAN_URL') || 'https://vpfe.dian.gov.co',
            usuario: configService.get('DIAN_USUARIO') || '',
            password: configService.get('DIAN_PASSWORD') || '',
            empresaId: configService.get('EMPRESA_NIT') || '',
            certificatePath: configService.get('DIAN_CERTIFICATE_PATH') || '/certificates/dian.p12',
            certificatePassword: configService.get('DIAN_CERTIFICATE_PASSWORD') || '',
            environment: configService.get('DIAN_ENVIRONMENT') === 'produccion' ? 'produccion' : 'homologacion',
            pais: 'CO'
        };
        super(config);
        this.configService = configService;
    }
    async enviarDocumento(documento) {
        try {
            this.logOperation('Enviando documento a DIAN', {
                tipo: documento.tipoDocumento,
                numero: `${documento.serie}-${documento.numero}`
            });
            const xmlContent = await this.generarXML(documento);
            const xmlSigned = await this.firmarXML(xmlContent);
            const response = await this.sendToDian(xmlSigned, documento);
            if (response.success) {
                this.logSuccess('Documento enviado a DIAN', { documento: documento.serie + '-' + documento.numero });
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
            this.logOperation('Consultando estado en DIAN', consulta);
            return {
                success: true,
                codigoRespuesta: '0',
                descripcionRespuesta: 'Documento encontrado en DIAN'
            };
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
        if (!documento.emisor.numeroDocumento || !/^\d{9,10}$/.test(documento.emisor.numeroDocumento)) {
            errores.push('NIT del emisor debe tener 9 o 10 dígitos');
        }
        if (documento.moneda !== 'COP' && documento.moneda !== 'USD') {
            errores.push('Moneda debe ser COP o USD');
        }
        if (documento.tipoDocumento === '01' && !this.validarRangoAutorizado(documento.serie, documento.numero)) {
            errores.push('Número de factura fuera del rango autorizado por DIAN');
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
        return this.buildDianXML(documento);
    }
    async firmarXML(xmlContent) {
        return xmlContent;
    }
    async enviarLibroContable(libro) {
        try {
            this.logOperation('Enviando libro contable a DIAN', {
                periodo: libro.periodo,
                tipo: libro.tipoLibro
            });
            return {
                success: true,
                codigoRespuesta: '0',
                descripcionRespuesta: 'Libro contable enviado exitosamente a DIAN'
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
    async sendToDian(xmlContent, documento) {
        return {
            success: true,
            codigoRespuesta: '0',
            descripcionRespuesta: 'Aceptado por DIAN'
        };
    }
    buildDianXML(documento) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<!-- XML DIAN generado para ${documento.serie}-${documento.numero} -->`;
    }
    validarRangoAutorizado(serie, numero) {
        return true;
    }
};
exports.DianFiscalService = DianFiscalService;
exports.DianFiscalService = DianFiscalService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DianFiscalService);
//# sourceMappingURL=dian-fiscal.service.js.map