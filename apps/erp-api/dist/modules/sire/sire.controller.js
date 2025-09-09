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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SireController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const express_1 = require("express");
const sire_service_1 = require("./sire.service");
const event_bus_service_1 = require("../../shared/events/event-bus.service");
let SireController = class SireController {
    constructor(sireService, eventBus) {
        this.sireService = sireService;
        this.eventBus = eventBus;
    }
    async getStats(req) {
        try {
            console.log('📊 Endpoint SIRE stats llamado');
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.sireService.getStats(tenantId);
        }
        catch (error) {
            console.error('❌ Error en endpoint SIRE stats:', error);
            return {
                success: false,
                data: {
                    reportesDelMes: 0,
                    registrosTotales: 0,
                    enviadosASunat: 0,
                    pendientes: 0,
                },
                error: error.message
            };
        }
    }
    async getReportes(filters, req) {
        try {
            console.log('📄 Endpoint SIRE reportes llamado con filtros:', filters);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.sireService.getReportes(filters, tenantId);
        }
        catch (error) {
            console.error('❌ Error en endpoint SIRE reportes:', error);
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    }
    async generarReporte(reportData, req) {
        try {
            console.log('🔄 Endpoint SIRE generar-reporte llamado con data:', reportData);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.sireService.generarReporte(reportData, tenantId);
        }
        catch (error) {
            console.error('❌ Error en endpoint SIRE generar-reporte:', error);
            return {
                success: false,
                message: 'Error al generar el reporte SIRE',
                error: error.message
            };
        }
    }
    async downloadReporte(id, req) {
        try {
            console.log('📥 Endpoint SIRE download llamado para ID:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.sireService.downloadReporte(id, tenantId);
        }
        catch (error) {
            console.error('❌ Error en endpoint SIRE download:', error);
            return {
                success: false,
                message: 'Error al descargar el reporte',
                error: error.message
            };
        }
    }
    async enviarSunat(id, req) {
        try {
            console.log('📡 Endpoint SIRE enviar-sunat llamado para ID:', id);
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            return await this.sireService.enviarSunat(id, tenantId);
        }
        catch (error) {
            console.error('❌ Error en endpoint SIRE enviar-sunat:', error);
            return {
                success: false,
                message: 'Error al enviar reporte a SUNAT',
                error: error.message
            };
        }
    }
    async testEvento(testData) {
        try {
            console.log('🧪 [SIRE TEST] Probando evento de comprobante...');
            const eventoTest = {
                id: 'test-cpe-123',
                numero_comprobante: 'F001-00001',
                tipo_comprobante: '01',
                fecha_emision: new Date().toISOString(),
                total: 100.00,
                serie: 'F001',
                numero: 1
            };
            console.log('🧪 [SIRE TEST] Emitiendo evento de prueba:', eventoTest);
            this.eventBus.emitComprobanteCreadoEvent({
                cpeId: eventoTest.id,
                tipoDocumento: eventoTest.tipo_comprobante,
                serie: eventoTest.serie,
                numero: eventoTest.numero,
                clienteId: '12345678',
                total: eventoTest.total,
                esCredito: false
            });
            return {
                success: true,
                message: 'Evento de prueba emitido correctamente - Revisa logs del servidor para ver si SIRE procesó el evento',
                data: eventoTest
            };
        }
        catch (error) {
            console.error('❌ [SIRE TEST] Error en prueba:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async testIntegracionPOS(testData) {
        try {
            console.log('🧪 [INTEGRATION TEST] Probando flujo completo POS → CPE → SIRE...');
            const comprobanteFromPOS = {
                cpeId: 'pos-cpe-456',
                tipoDocumento: '03',
                serie: 'T001',
                numero: '000123',
                clienteId: '12345678',
                total: 250.00,
                esCredito: false,
                ventaId: 'venta-789'
            };
            console.log('🧪 [INTEGRATION TEST] Simulando evento desde POS:', comprobanteFromPOS);
            await this.sireService.procesarComprobanteParaSire(comprobanteFromPOS);
            return {
                success: true,
                message: '✅ Test de integración POS → CPE → SIRE completado - Revisa las estadísticas de SIRE',
                data: comprobanteFromPOS
            };
        }
        catch (error) {
            console.error('❌ [INTEGRATION TEST] Error en test de integración:', error);
            return {
                success: false,
                error: error.message,
                message: 'Error en test de integración - Revisa logs del servidor'
            };
        }
    }
    findAll() {
        return this.sireService.findAll();
    }
};
exports.SireController = SireController;
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get SIRE statistics' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'SIRE statistics retrieved successfully' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], SireController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('reportes'),
    (0, swagger_1.ApiOperation)({ summary: 'Get SIRE reports' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'SIRE reports retrieved successfully' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], SireController.prototype, "getReportes", null);
__decorate([
    (0, common_1.Post)('generar-reporte'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate new SIRE report' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'SIRE report generated successfully' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], SireController.prototype, "generarReporte", null);
__decorate([
    (0, common_1.Get)('reportes/:id/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Download SIRE report' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'SIRE report downloaded successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], SireController.prototype, "downloadReporte", null);
__decorate([
    (0, common_1.Post)('reportes/:id/enviar-sunat'),
    (0, swagger_1.ApiOperation)({ summary: 'Send SIRE report to SUNAT' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'SIRE report sent to SUNAT successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], SireController.prototype, "enviarSunat", null);
__decorate([
    (0, common_1.Post)('test-evento'),
    (0, swagger_1.ApiOperation)({ summary: 'Test SIRE event processing' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SireController.prototype, "testEvento", null);
__decorate([
    (0, common_1.Post)('test-integracion-pos'),
    (0, swagger_1.ApiOperation)({ summary: 'Test POS → CPE → SIRE integration' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SireController.prototype, "testIntegracionPOS", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get SIRE exports (placeholder)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SireController.prototype, "findAll", null);
exports.SireController = SireController = __decorate([
    (0, swagger_1.ApiTags)('sire'),
    (0, common_1.Controller)('sire'),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [sire_service_1.SireService,
        event_bus_service_1.EventBusService])
], SireController);
//# sourceMappingURL=sire.controller.js.map