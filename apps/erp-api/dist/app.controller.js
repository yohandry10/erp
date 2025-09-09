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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("./shared/supabase/supabase.service");
const jwt_auth_guard_1 = require("./modules/auth/guards/jwt-auth.guard");
const express_1 = require("express");
let AppController = class AppController {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
    }
    getStatus() {
        return {
            status: 'OK',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            message: '🚀 ERP KAME API - Sistema de Facturación Electrónica SUNAT',
            endpoints: {
                docs: '/api/docs',
                health: '/api/health'
            }
        };
    }
    healthCheck() {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0'
        };
    }
    async testConnection(req) {
        try {
            const user = req.user;
            const { data, error } = await this.supabaseService
                .getClient()
                .from('profiles')
                .select('id')
                .eq('id', user.sub)
                .single();
            if (error) {
                throw error;
            }
            return {
                status: 'OK',
                message: 'Database connection successful',
                user_id: user.sub,
                tenant_id: user.tenant_id,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            return {
                status: 'ERROR',
                message: 'Database connection failed',
                error: error.message,
                timestamp: new Date().toISOString(),
            };
        }
    }
    getApiInfo() {
        return {
            name: 'ERP KAME API',
            version: '1.0.0',
            description: 'Sistema ERP completo con CPE, GRE, SIRE - Monorepo TypeScript',
            modules: {
                auth: 'Authentication & Authorization',
                cpe: 'Comprobantes de Pago Electrónicos (Facturas, Boletas, Notas)',
                gre: 'Guías de Remisión Electrónicas',
                sire: 'Sistema Integrado de Registros Electrónicos',
                ose: 'Operador de Servicios Electrónicos'
            },
            features: [
                'Facturación Electrónica SUNAT',
                'Firma Digital XML',
                'Multi-tenant architecture',
                'Real-time notifications',
                'PDF generation',
                'XML validation',
                'OSE integration'
            ],
            documentation: '/api/docs',
            timestamp: new Date().toISOString()
        };
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Health check and API info' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Get)('api/health'),
    (0, swagger_1.ApiOperation)({ summary: 'Health check endpoint for Docker' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "healthCheck", null);
__decorate([
    (0, common_1.Post)('api/test-connection'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Test database connection (authenticated)' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "testConnection", null);
__decorate([
    (0, common_1.Get)('api/info'),
    (0, swagger_1.ApiOperation)({ summary: 'API information and available modules' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getApiInfo", null);
exports.AppController = AppController = __decorate([
    (0, swagger_1.ApiTags)('app'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], AppController);
//# sourceMappingURL=app.controller.js.map