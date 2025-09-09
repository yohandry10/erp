"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityModule = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const security_service_1 = require("./security.service");
const rate_limit_guard_1 = require("./guards/rate-limit.guard");
const auth_rate_limit_guard_1 = require("./guards/auth-rate-limit.guard");
const validation_interceptor_1 = require("./interceptors/validation.interceptor");
let SecurityModule = class SecurityModule {
};
exports.SecurityModule = SecurityModule;
exports.SecurityModule = SecurityModule = __decorate([
    (0, common_1.Module)({
        imports: [
            throttler_1.ThrottlerModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    ttl: parseInt(configService.get('THROTTLE_TTL', '60000')),
                    limit: parseInt(configService.get('THROTTLE_LIMIT', '100')),
                }),
            }),
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    secret: configService.get('JWT_SECRET'),
                    signOptions: {
                        expiresIn: configService.get('JWT_EXPIRES_IN', '1h'),
                    },
                }),
            }),
        ],
        providers: [
            security_service_1.SecurityService,
            rate_limit_guard_1.RateLimitGuard,
            auth_rate_limit_guard_1.AuthRateLimitGuard,
            validation_interceptor_1.ValidationInterceptor,
        ],
        exports: [
            security_service_1.SecurityService,
            rate_limit_guard_1.RateLimitGuard,
            auth_rate_limit_guard_1.AuthRateLimitGuard,
            validation_interceptor_1.ValidationInterceptor,
        ],
    })
], SecurityModule);
//# sourceMappingURL=security.module.js.map