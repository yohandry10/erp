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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentosController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const documentos_service_1 = require("./documentos.service");
const express_1 = require("express");
let DocumentosController = class DocumentosController {
    constructor(documentosService) {
        this.documentosService = documentosService;
    }
    async getStats(req) {
        try {
            console.log('📊 Endpoint documentos stats llamado');
            const user = req.user;
            console.log('🔍 Usuario detectado:', user);
            const resultSinTenant = await this.documentosService.getStats(null);
            console.log('📊 Resultado SIN tenant_id:', resultSinTenant);
            if (resultSinTenant.success) {
                const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
                console.log('🔍 Intentando con tenant_id:', tenantId);
                return await this.documentosService.getStats(tenantId);
            }
            return resultSinTenant;
        }
        catch (error) {
            console.error('❌ Error en endpoint documentos stats:', error);
            return {
                success: false,
                data: {
                    totalDocumentos: 0,
                    facturas: 0,
                    boletas: 0,
                    notasCredito: 0,
                    contratos: 0,
                    pendientesEnvio: 0
                },
                error: error.message
            };
        }
    }
    async getDocumentos(filters, req) {
        try {
            console.log('📄 Endpoint documentos lista llamado con filtros:', filters);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.documentosService.getDocumentos(filters, tenantId);
        }
        catch (error) {
            console.error('❌ Error en endpoint documentos lista:', error);
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    }
    async getDocumento(id, req) {
        try {
            console.log('📄 Endpoint obtener documento:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.documentosService.getDocumento(id, tenantId);
        }
        catch (error) {
            console.error('❌ Error obteniendo documento:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async crearDocumento(documentoData, req) {
        try {
            console.log('📝 Creando nuevo documento:', documentoData.tipo_documento);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const userId = user?.id;
            return await this.documentosService.crearDocumento(documentoData, tenantId, userId);
        }
        catch (error) {
            console.error('❌ Error creando documento:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async actualizarDocumento(id, documentoData, req) {
        try {
            console.log('📝 Actualizando documento:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const userId = user?.id;
            return await this.documentosService.actualizarDocumento(id, documentoData, tenantId, userId);
        }
        catch (error) {
            console.error('❌ Error actualizando documento:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async generarXML(id, req) {
        try {
            console.log('🔧 Generando XML para documento:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.documentosService.generarXML(id, tenantId);
        }
        catch (error) {
            console.error('❌ Error generando XML:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async enviarSUNAT(id, req) {
        try {
            console.log('📡 Enviando documento a SUNAT:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const userId = user?.id;
            return await this.documentosService.enviarSUNAT(id, tenantId, userId);
        }
        catch (error) {
            console.error('❌ Error enviando a SUNAT:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async descargarPDF(id, req) {
        try {
            console.log('📥 Descargando PDF documento:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.documentosService.generarPDF(id, tenantId);
        }
        catch (error) {
            console.error('❌ Error descargando PDF:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async descargarXML(id, req) {
        try {
            console.log('📥 Descargando XML documento:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.documentosService.descargarXML(id, tenantId);
        }
        catch (error) {
            console.error('❌ Error descargando XML:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async validarRUC(data, req) {
        try {
            console.log('🔍 Validando RUC:', data.ruc);
            return await this.documentosService.validarRUC(data.ruc);
        }
        catch (error) {
            console.error('❌ Error validando RUC:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async validarDocumento(documentoData, req) {
        try {
            console.log('✅ Validando documento antes de envío');
            return await this.documentosService.validarDocumento(documentoData);
        }
        catch (error) {
            console.error('❌ Error validando documento:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async getSeries(req) {
        try {
            console.log('📋 Obteniendo configuración de series');
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.documentosService.getSeries(tenantId);
        }
        catch (error) {
            console.error('❌ Error obteniendo series:', error);
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    }
    async crearSerie(serieData, req) {
        try {
            console.log('📋 Creando nueva serie:', serieData);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.documentosService.crearSerie(serieData, tenantId);
        }
        catch (error) {
            console.error('❌ Error creando serie:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async getAuditoria(id, req) {
        try {
            console.log('📋 Obteniendo auditoría documento:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.documentosService.getAuditoria(id, tenantId);
        }
        catch (error) {
            console.error('❌ Error obteniendo auditoría:', error);
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    }
    async anularDocumento(id, data, req) {
        try {
            console.log('❌ Anulando documento:', id, 'motivo:', data.motivo);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const userId = user?.id;
            return await this.documentosService.anularDocumento(id, data.motivo, tenantId, userId);
        }
        catch (error) {
            console.error('❌ Error anulando documento:', error);
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
};
exports.DocumentosController = DocumentosController;
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get documents statistics' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Documents statistics retrieved successfully' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('lista'),
    (0, swagger_1.ApiOperation)({ summary: 'Get documents list' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Documents list retrieved successfully' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "getDocumentos", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get document by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Document retrieved successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "getDocumento", null);
__decorate([
    (0, common_1.Post)('crear'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new document' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Document created successfully' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "crearDocumento", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update document' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Document updated successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "actualizarDocumento", null);
__decorate([
    (0, common_1.Post)(':id/generar-xml'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate XML for electronic invoice' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'XML generated successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "generarXML", null);
__decorate([
    (0, common_1.Post)(':id/enviar-sunat'),
    (0, swagger_1.ApiOperation)({ summary: 'Send document to SUNAT' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Document sent to SUNAT successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_g = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "enviarSUNAT", null);
__decorate([
    (0, common_1.Get)(':id/descargar-pdf'),
    (0, swagger_1.ApiOperation)({ summary: 'Download document PDF' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'PDF downloaded successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_h = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _h : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "descargarPDF", null);
__decorate([
    (0, common_1.Get)(':id/descargar-xml'),
    (0, swagger_1.ApiOperation)({ summary: 'Download document XML' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'XML downloaded successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_j = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _j : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "descargarXML", null);
__decorate([
    (0, common_1.Post)('validar-ruc'),
    (0, swagger_1.ApiOperation)({ summary: 'Validate RUC with SUNAT' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'RUC validated successfully' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_k = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _k : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "validarRUC", null);
__decorate([
    (0, common_1.Post)('validar-documento'),
    (0, swagger_1.ApiOperation)({ summary: 'Validate document data before sending' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Document validated successfully' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_l = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _l : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "validarDocumento", null);
__decorate([
    (0, common_1.Get)('config/series'),
    (0, swagger_1.ApiOperation)({ summary: 'Get document series configuration' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Series configuration retrieved successfully' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_m = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _m : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "getSeries", null);
__decorate([
    (0, common_1.Post)('config/series'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new document series' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Series created successfully' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_o = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _o : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "crearSerie", null);
__decorate([
    (0, common_1.Get)(':id/auditoria'),
    (0, swagger_1.ApiOperation)({ summary: 'Get document audit log' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Audit log retrieved successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_p = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _p : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "getAuditoria", null);
__decorate([
    (0, common_1.Post)(':id/anular'),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel/void document' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Document cancelled successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_q = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _q : Object]),
    __metadata("design:returntype", Promise)
], DocumentosController.prototype, "anularDocumento", null);
exports.DocumentosController = DocumentosController = __decorate([
    (0, swagger_1.ApiTags)('Documentos'),
    (0, common_1.Controller)('documentos'),
    __metadata("design:paramtypes", [documentos_service_1.DocumentosService])
], DocumentosController);
//# sourceMappingURL=documentos.controller.js.map