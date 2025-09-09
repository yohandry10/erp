"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
let RateLimitGuard = class RateLimitGuard extends throttler_1.ThrottlerGuard {
    getTracker(req) {
        return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    }
    generateKey(context, suffix) {
        const request = context.switchToHttp().getRequest();
        const route = request.route?.path || request.url;
        const tracker = this.getTracker(request);
        return `${tracker}-${route}-${suffix}`;
    }
};
exports.RateLimitGuard = RateLimitGuard;
exports.RateLimitGuard = RateLimitGuard = __decorate([
    (0, common_1.Injectable)()
], RateLimitGuard);
//# sourceMappingURL=rate-limit.guard.js.map