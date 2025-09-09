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
exports.RetencionesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../modules/auth/guards/jwt-auth.guard");
const retenciones_service_1 = require("../modules/retenciones/retenciones.service");
let RetencionesController = class RetencionesController {
    constructor(retencionesService) {
        this.retencionesService = retencionesService;
    }
    async calcularRetencion(data) {
        try {
            const calculo = await this.retencionesService.calcularRetencion(data);
            return {
                success: true,
                data: calculo
            };
        }
        catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
    async crearRetencion(data) {
        try {
            const retencion = await this.retencionesService.crearRetencion(data);
            return {
                success: true,
                data: retencion,
                message: 'Retención creada exitosamente'
            };
        }
        catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
    async getRetenciones(fechaDesde, fechaHasta, categoria, proveedorId) {
        try {
            const retenciones = await this.retencionesService.getRetenciones(fechaDesde, fechaHasta, categoria, proveedorId);
            return {
                success: true,
                data: retenciones,
                total: retenciones.total
            };
        }
        catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
    async getResumenRetenciones(fechaDesde, fechaHasta) {
        try {
            const resumen = await this.retencionesService.getResumenRetenciones(fechaDesde, fechaHasta);
            return {
                success: true,
                data: resumen
            };
        }
        catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
    async getRetencionById(id) {
        try {
            const retencion = await this.retencionesService.getRetencionById(id);
            return {
                success: true,
                data: retencion
            };
        }
        catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
    async anularRetencion(id, motivo) {
        try {
            await this.retencionesService.anularRetencion(id, motivo);
            return {
                success: true,
                message: 'Retención anulada exitosamente'
            };
        }
        catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
};
exports.RetencionesController = RetencionesController;
__decorate([
    (0, common_1.Post)('calcular'),
    (0, swagger_1.ApiOperation)({ summary: 'Calcular retención para un pago' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cálculo de retención realizado exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RetencionesController.prototype, "calcularRetencion", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crear nueva retención' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Retención creada exitosamente' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RetencionesController.prototype, "crearRetencion", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener listado de retenciones' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Retenciones obtenidas exitosamente' }),
    __param(0, (0, common_1.Query)('fechaDesde')),
    __param(1, (0, common_1.Query)('fechaHasta')),
    __param(2, (0, common_1.Query)('categoria')),
    __param(3, (0, common_1.Query)('proveedorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], RetencionesController.prototype, "getRetenciones", null);
__decorate([
    (0, common_1.Get)('resumen'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener resumen de retenciones por período' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Resumen obtenido exitosamente' }),
    __param(0, (0, common_1.Query)('fechaDesde')),
    __param(1, (0, common_1.Query)('fechaHasta')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], RetencionesController.prototype, "getResumenRetenciones", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener retención por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Retención obtenida exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RetencionesController.prototype, "getRetencionById", null);
__decorate([
    (0, common_1.Put)(':id/anular'),
    (0, swagger_1.ApiOperation)({ summary: 'Anular retención' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Retención anulada exitosamente' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('motivo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], RetencionesController.prototype, "anularRetencion", null);
exports.RetencionesController = RetencionesController = __decorate([
    (0, swagger_1.ApiTags)('retenciones'),
    (0, common_1.Controller)('retenciones'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [retenciones_service_1.RetencionesService])
], RetencionesController);
//# sourceMappingURL=retenciones.controller.js.map