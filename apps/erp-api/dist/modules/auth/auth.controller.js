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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const auth_service_1 = require("./auth.service");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const auth_rate_limit_guard_1 = require("../../shared/security/guards/auth-rate-limit.guard");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    async login(loginDto) {
        return this.authService.login(loginDto);
    }
    async getProfile(req) {
        return req.user;
    }
    async refresh(req) {
        return this.authService.refreshToken(req.user);
    }
    async validateToken(token) {
        try {
            const payload = await this.authService.validateToken(token);
            return { valid: true, payload };
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Token inválido');
        }
    }
    async getConfigStatus() {
        try {
            const hasJwtSecret = !!process.env.JWT_SECRET;
            const hasRefreshSecret = !!process.env.JWT_REFRESH_SECRET;
            const hasEncryptionKey = !!process.env.ENCRYPTION_KEY;
            return {
                security: {
                    jwtConfigured: hasJwtSecret,
                    refreshConfigured: hasRefreshSecret,
                    encryptionConfigured: hasEncryptionKey,
                    environment: process.env.NODE_ENV || 'development'
                }
            };
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Error verificando configuración');
        }
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.UseGuards)(auth_rate_limit_guard_1.AuthRateLimitGuard),
    (0, throttler_1.Throttle)(5, 60),
    (0, swagger_1.ApiOperation)({ summary: 'Iniciar sesión' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Login exitoso' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Credenciales inválidas' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Demasiados intentos' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('profile'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Obtener perfil del usuario autenticado' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Perfil del usuario' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'No autorizado' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, throttler_1.Throttle)(10, 60),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Renovar token de acceso' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Token renovado' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('validate'),
    (0, throttler_1.Throttle)(20, 60),
    (0, swagger_1.ApiOperation)({ summary: 'Validar token' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Token válido' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Token inválido' }),
    __param(0, (0, common_1.Body)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "validateToken", null);
__decorate([
    (0, common_1.Get)('config-status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getConfigStatus", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Autenticación'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map