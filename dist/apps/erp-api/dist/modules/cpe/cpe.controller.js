"use strict";
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CpeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const cpe_service_1 = require("./cpe.service");
const dtos_1 = require("@erp-suite/dtos");
const express_1 = require("express");
let CpeController = class CpeController {
    constructor(cpeService) {
        this.cpeService = cpeService;
    }
    async create(createFacturaDto, req) {
        const user = req.user;
        return this.cpeService.create(createFacturaDto, user.tenant_id);
    }
    async findAll(paginationDto, req) {
        const user = req.user;
        const tenantId = user?.tenant_id || 'mock-tenant';
        return this.cpeService.findAll(paginationDto, tenantId);
    }
    async getStats(req) {
        try {
            console.log('📊 Calculando estadísticas CPE...');
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.cpeService.getStatsFromDatabase(tenantId);
        }
        catch (error) {
            console.error('❌ Error calculando stats CPE:', error);
            return {
                success: false,
                data: {
                    cpeEmitidosHoy: 0,
                    cpeDelMes: 0,
                    montoFacturado: 0,
                    rechazados: 0
                }
            };
        }
    }
    async getComprobantes(filters, req) {
        try {
            console.log('📄 Cargando comprobantes CPE desde BD...');
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.cpeService.getComprobantesFromDatabase(filters, tenantId);
        }
        catch (error) {
            console.error('❌ Error cargando comprobantes CPE:', error);
            return {
                success: false,
                message: 'Error cargando comprobantes',
                data: []
            };
        }
    }
    async getCpeData(id, req) {
        try {
            console.log(`📄 Obteniendo datos CPE: ${id}`);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const cpeData = await this.cpeService.getCpeById(id, tenantId);
            return {
                success: true,
                data: cpeData
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo datos CPE:', error);
            return {
                success: false,
                message: 'Error obteniendo datos del CPE',
                error: error.message
            };
        }
    }
    async downloadPdf(id, req, res) {
        try {
            console.log(`📄 Generando PDF para CPE: ${id}`);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const pdfBuffer = await this.cpeService.generatePdf(id, tenantId);
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="cpe-${id}.pdf"`,
                'Content-Length': pdfBuffer.length,
            });
            res.send(pdfBuffer);
        }
        catch (error) {
            console.error('❌ Error generando PDF:', error);
            res.status(500).json({
                success: false,
                message: 'Error generando PDF',
                error: error.message
            });
        }
    }
    async enviarSunat(id, req) {
        try {
            console.log(`📡 Enviando CPE a SUNAT: ${id}`);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const result = await this.cpeService.resendToOse(id, tenantId);
            return {
                success: true,
                message: 'CPE enviado a SUNAT exitosamente',
                data: result
            };
        }
        catch (error) {
            console.error('❌ Error enviando a SUNAT:', error);
            return {
                success: false,
                message: 'Error enviando CPE a SUNAT',
                error: error.message
            };
        }
    }
    async findOne(id, req) {
        const user = req.user;
        const tenantId = user?.tenant_id || 'mock-tenant';
        return this.cpeService.findOne(id, tenantId);
    }
    async downloadXml(id, req, res) {
        const user = req.user;
        const xmlContent = await this.cpeService.getSignedXml(id, user.tenant_id);
        res.set({
            'Content-Type': 'application/xml',
            'Content-Disposition': `attachment; filename="cpe-${id}.xml"`,
        });
        res.send(xmlContent);
    }
    async resend(id, req) {
        const user = req.user;
        return this.cpeService.resendToOse(id, user.tenant_id);
    }
    async checkStatus(id, req) {
        const user = req.user;
        return this.cpeService.checkOseStatus(id, user.tenant_id);
    }
    async enviarManualmenteSunat(id, req) {
        console.log(`🚀 [CPE] Envío manual a SUNAT solicitado para CPE ${id}`);
        try {
            const user = req.user || { tenant_id: 'default' };
            const cpe = await this.cpeService.findOne(id, user.tenant_id);
            if (cpe.estado !== 'FIRMADO') {
                return {
                    success: false,
                    message: `CPE debe estar en estado FIRMADO para enviar a SUNAT. Estado actual: ${cpe.estado}`
                };
            }
            const fileName = `${cpe.ruc_emisor}-${cpe.tipo_documento}-${cpe.serie}-${cpe.numero}`;
            await this.cpeService.sendToOseManual(id, cpe.xml_firmado, fileName);
            return {
                success: true,
                message: 'CPE enviado a SUNAT exitosamente',
                data: { id, estado: 'ENVIADO', timestamp: new Date() }
            };
        }
        catch (error) {
            console.error(`❌ Error enviando CPE ${id} a SUNAT:`, error);
            return {
                success: false,
                message: `Error enviando CPE a SUNAT: ${error.message}`
            };
        }
    }
};
exports.CpeController = CpeController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crear y enviar comprobante CPE' }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'CPE creado y enviado exitosamente',
        type: dtos_1.FacturaDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dtos_1.CreateFacturaDto, typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Listar CPEs con paginación' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dtos_1.PaginationDto, typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener estadísticas de CPE' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('comprobantes'),
    (0, swagger_1.ApiOperation)({ summary: 'Listar comprobantes CPE' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "getComprobantes", null);
__decorate([
    (0, common_1.Get)('comprobantes/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener datos del CPE' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "getCpeData", null);
__decorate([
    (0, common_1.Get)('comprobantes/:id/pdf'),
    (0, swagger_1.ApiOperation)({ summary: 'Descargar PDF del CPE' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object, typeof (_g = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "downloadPdf", null);
__decorate([
    (0, common_1.Post)('comprobantes/:id/enviar-sunat'),
    (0, swagger_1.ApiOperation)({ summary: 'Enviar CPE a SUNAT' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_h = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _h : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "enviarSunat", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener CPE por ID' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_j = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _j : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/xml'),
    (0, swagger_1.ApiOperation)({ summary: 'Descargar XML firmado del CPE' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_k = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _k : Object, typeof (_l = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _l : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "downloadXml", null);
__decorate([
    (0, common_1.Post)(':id/resend'),
    (0, swagger_1.ApiOperation)({ summary: 'Reenviar CPE a OSE/SUNAT' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_m = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _m : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "resend", null);
__decorate([
    (0, common_1.Get)(':id/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Consultar estado del CPE en OSE' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_o = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _o : Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "checkStatus", null);
__decorate([
    (0, common_1.Post)(':id/enviar-sunat'),
    (0, swagger_1.ApiOperation)({ summary: 'Enviar CPE firmado a SUNAT manualmente' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'CPE enviado a SUNAT exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CpeController.prototype, "enviarManualmenteSunat", null);
exports.CpeController = CpeController = __decorate([
    (0, swagger_1.ApiTags)('cpe'),
    (0, common_1.Controller)('cpe'),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [cpe_service_1.CpeService])
], CpeController);
