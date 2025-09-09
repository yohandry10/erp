"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationInterceptor = void 0;
const common_1 = require("@nestjs/common");
let ValidationInterceptor = class ValidationInterceptor {
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const contentLength = parseInt(request.headers['content-length'] || '0');
        const maxSize = 10 * 1024 * 1024;
        if (contentLength > maxSize) {
            throw new common_1.BadRequestException('Payload demasiado grande');
        }
        this.validateHeaders(request);
        this.validateQueryParams(request);
        return next.handle();
    }
    validateHeaders(request) {
        const suspiciousHeaders = ['x-forwarded-host', 'x-original-url', 'x-rewrite-url'];
        for (const header of suspiciousHeaders) {
            if (request.headers[header]) {
                throw new common_1.BadRequestException(`Header ${header} no permitido`);
            }
        }
    }
    validateQueryParams(request) {
        const query = request.query;
        for (const [key, value] of Object.entries(query)) {
            if (typeof value === 'string') {
                const dangerousPatterns = [
                    /<script[^>]*>.*?<\/script>/gi,
                    /javascript:/gi,
                    /on\w+\s*=/gi,
                    /(union|select|insert|update|delete|drop|create|alter)\s+/gi,
                ];
                for (const pattern of dangerousPatterns) {
                    if (pattern.test(value)) {
                        throw new common_1.BadRequestException(`Parámetro ${key} contiene contenido no válido`);
                    }
                }
            }
        }
    }
};
exports.ValidationInterceptor = ValidationInterceptor;
exports.ValidationInterceptor = ValidationInterceptor = __decorate([
    (0, common_1.Injectable)()
], ValidationInterceptor);
//# sourceMappingURL=validation.interceptor.js.map