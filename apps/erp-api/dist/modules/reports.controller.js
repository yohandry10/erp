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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
let ReportsController = class ReportsController {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
    }
    async reporteVentas(req, fechaInicio, fechaFin) {
        try {
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const { data, error } = await this.supabaseService
                .getClient()
                .from('ventas')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('fecha', fechaInicio || '2024-01-01')
                .lte('fecha', fechaFin || new Date().toISOString().split('T')[0]);
            if (error)
                throw error;
            return {
                success: true,
                data: data || [],
                total: data?.length || 0
            };
        }
        catch (error) {
            console.error('Error generando reporte de ventas:', error);
            throw error;
        }
    }
    async reporteInventario(req) {
        try {
            const user = req.user;
            const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
            const { data, error } = await this.supabaseService
                .getClient()
                .from('productos')
                .select('*')
                .eq('tenant_id', tenantId);
            if (error)
                throw error;
            return {
                success: true,
                data: data || [],
                total: data?.length || 0
            };
        }
        catch (error) {
            console.error('Error generando reporte de inventario:', error);
            throw error;
        }
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('/ventas'),
    (0, swagger_1.ApiOperation)({ summary: 'Reporte de ventas' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Reporte generado exitosamente' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('fechaInicio')),
    __param(2, (0, common_1.Query)('fechaFin')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "reporteVentas", null);
__decorate([
    (0, common_1.Get)('/inventario'),
    (0, swagger_1.ApiOperation)({ summary: 'Reporte de inventario' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Reporte generado exitosamente' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "reporteInventario", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('reports'),
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map