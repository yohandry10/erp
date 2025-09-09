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
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaisesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const paises_service_1 = require("./paises.service");
const paises_dto_1 = require("./paises.dto");
const express_1 = require("express");
const api_response_wrapper_decorator_1 = require("../../common/decorators/api-response-wrapper.decorator");
let PaisesController = class PaisesController {
    constructor(paisesService) {
        this.paisesService = paisesService;
    }
    async obtenerPaises() {
        const paises = await this.paisesService.obtenerPaises();
        return {
            success: true,
            data: paises,
            message: 'Países obtenidos exitosamente'
        };
    }
    async obtenerConfiguracionFiscal(codigo) {
        const configuracion = await this.paisesService.obtenerConfiguracionPorCodigo(codigo);
        return {
            success: true,
            data: configuracion,
            message: 'Configuración fiscal obtenida exitosamente'
        };
    }
    async obtenerLibrosRequeridos(codigo) {
        const resultado = await this.paisesService.obtenerLibrosRequeridosPorCodigo(codigo);
        return {
            success: true,
            data: resultado,
            message: 'Libros requeridos obtenidos exitosamente'
        };
    }
    async obtenerConfiguracionCompleta(id) {
        const configuracion = await this.paisesService.getConfiguracionPais(id);
        return {
            success: true,
            data: configuracion,
            message: 'Configuración del país obtenida exitosamente'
        };
    }
    async obtenerConfiguracionUsuario(req) {
        const user = req.user;
        const configuracion = await this.paisesService.obtenerOCrearConfiguracionUsuario(user.id);
        return {
            success: true,
            data: configuracion,
            message: 'Configuración de usuario obtenida exitosamente'
        };
    }
    async actualizarConfiguracionUsuario(req, configuracion) {
        const user = req.user;
        const configuracionActualizada = await this.paisesService.actualizarConfiguracionUsuario(user.id, configuracion);
        return {
            success: true,
            data: configuracionActualizada,
            message: 'Configuración de usuario actualizada exitosamente'
        };
    }
    async validarDocumento(codigo, documento) {
        const resultado = await this.paisesService.validarDocumentoPorCodigo(codigo, documento);
        return {
            success: true,
            data: resultado,
            message: resultado.es_valido ? 'Documento válido' : 'Documento inválido'
        };
    }
};
exports.PaisesController = PaisesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Obtener lista de países disponibles',
        description: 'Retorna todos los países activos con sus configuraciones básicas'
    }),
    (0, api_response_wrapper_decorator_1.ApiResponseWrapper)(paises_dto_1.PaisDto, { isArray: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaisesController.prototype, "obtenerPaises", null);
__decorate([
    (0, common_1.Get)(':codigo/configuracion-fiscal'),
    (0, swagger_1.ApiOperation)({
        summary: 'Obtener configuración fiscal por código de país',
        description: 'Retorna la configuración fiscal completa (impuestos, documentos, etc.) para un país específico'
    }),
    (0, api_response_wrapper_decorator_1.ApiResponseWrapper)(paises_dto_1.ConfiguracionFiscalDto),
    __param(0, (0, common_1.Param)('codigo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaisesController.prototype, "obtenerConfiguracionFiscal", null);
__decorate([
    (0, common_1.Get)(':codigo/libros-requeridos'),
    (0, swagger_1.ApiOperation)({
        summary: 'Obtener libros contables requeridos por país',
        description: 'Retorna la lista de libros contables obligatorios según la jurisdicción fiscal'
    }),
    (0, api_response_wrapper_decorator_1.ApiResponseWrapper)(paises_dto_1.LibrosRequeridosDto),
    __param(0, (0, common_1.Param)('codigo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaisesController.prototype, "obtenerLibrosRequeridos", null);
__decorate([
    (0, common_1.Get)(':id/configuracion'),
    (0, swagger_1.ApiOperation)({
        summary: 'Obtener configuración completa del país',
        description: 'Retorna toda la configuración necesaria para el renderizado dinámico de la interfaz'
    }),
    (0, api_response_wrapper_decorator_1.ApiResponseWrapper)(paises_dto_1.ConfiguracionPaisDto),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], PaisesController.prototype, "obtenerConfiguracionCompleta", null);
__decorate([
    (0, common_1.Get)('usuario/configuracion'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Obtener configuración de país del usuario actual',
        description: 'Retorna las preferencias de país, idioma y zona horaria del usuario'
    }),
    (0, api_response_wrapper_decorator_1.ApiResponseWrapper)(paises_dto_1.UsuarioConfiguracionDto),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], PaisesController.prototype, "obtenerConfiguracionUsuario", null);
__decorate([
    (0, common_1.Put)('usuario/configuracion'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Actualizar configuración de país del usuario',
        description: 'Permite al usuario cambiar su país preferido, idioma y zona horaria'
    }),
    (0, api_response_wrapper_decorator_1.ApiResponseWrapper)(paises_dto_1.UsuarioConfiguracionDto),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object, paises_dto_1.UpdateUsuarioConfiguracionDto]),
    __metadata("design:returntype", Promise)
], PaisesController.prototype, "actualizarConfiguracionUsuario", null);
__decorate([
    (0, common_1.Get)(':codigo/validar-documento/:documento'),
    (0, swagger_1.ApiOperation)({
        summary: 'Validar documento empresarial según país',
        description: 'Valida formato y estructura de documentos empresariales (RUC, NIT, etc.)'
    }),
    (0, api_response_wrapper_decorator_1.ApiResponseWrapper)(paises_dto_1.ValidacionDocumentoDto),
    __param(0, (0, common_1.Param)('codigo')),
    __param(1, (0, common_1.Param)('documento')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PaisesController.prototype, "validarDocumento", null);
exports.PaisesController = PaisesController = __decorate([
    (0, swagger_1.ApiTags)('paises'),
    (0, common_1.Controller)('paises'),
    __metadata("design:paramtypes", [paises_service_1.PaisesService])
], PaisesController);
//# sourceMappingURL=paises.controller.js.map