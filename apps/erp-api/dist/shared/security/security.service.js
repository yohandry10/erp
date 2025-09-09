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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let SecurityService = class SecurityService {
    constructor(configService) {
        this.configService = configService;
    }
    getHelmetConfig() {
        return {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    scriptSrc: ["'self'"],
                    connectSrc: [
                        "'self'",
                        'https://api.supabase.co',
                        'wss://realtime.supabase.co',
                        'http://localhost:3001',
                        'http://localhost:3002',
                    ],
                },
            },
            crossOriginEmbedderPolicy: false,
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
            },
            noSniff: true,
            frameguard: { action: 'deny' },
            xssFilter: true,
        };
    }
    getCorsConfig() {
        const envOrigins = this.configService.get('ALLOWED_ORIGINS') ?? '';
        const allowedOrigins = envOrigins
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (allowedOrigins.length === 0) {
            allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'https://localhost:3000', 'https://localhost:3001');
        }
        return {
            origin: allowedOrigins,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
            allowedHeaders: [
                'Origin',
                'X-Requested-With',
                'Content-Type',
                'Accept',
                'Authorization',
                'Cache-Control',
                'X-HTTP-Method-Override',
                'X-Forwarded-For',
                'X-Real-IP',
                'x-country-id',
            ],
            exposedHeaders: ['Content-Disposition'],
            credentials: true,
            preflightContinue: false,
            optionsSuccessStatus: 204,
            maxAge: 86400,
        };
    }
    getCompressionConfig() {
        return {
            filter: (req) => {
                if (req.headers['x-no-compression'])
                    return false;
                return true;
            },
            threshold: 1024,
        };
    }
};
exports.SecurityService = SecurityService;
exports.SecurityService = SecurityService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SecurityService);
//# sourceMappingURL=security.service.js.map