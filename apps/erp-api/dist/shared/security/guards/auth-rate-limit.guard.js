"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
let AuthRateLimitGuard = class AuthRateLimitGuard extends throttler_1.ThrottlerGuard {
    getTracker(req) {
        const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'unknown';
        return `${ip}-${Buffer.from(userAgent).toString('base64').slice(0, 10)}`;
    }
    generateKey(context, suffix) {
        const request = context.switchToHttp().getRequest();
        const tracker = this.getTracker(request);
        return `auth-${tracker}-${suffix}`;
    }
};
exports.AuthRateLimitGuard = AuthRateLimitGuard;
exports.AuthRateLimitGuard = AuthRateLimitGuard = __decorate([
    (0, common_1.Injectable)()
], AuthRateLimitGuard);
//# sourceMappingURL=auth-rate-limit.guard.js.map