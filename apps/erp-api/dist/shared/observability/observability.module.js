"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityModule = void 0;
const common_1 = require("@nestjs/common");
const metrics_service_1 = require("./metrics.service");
const logger_service_1 = require("./logger.service");
const observability_interceptor_1 = require("./observability.interceptor");
const observability_controller_1 = require("./observability.controller");
const tracing_module_1 = require("../tracing/tracing.module");
let ObservabilityModule = class ObservabilityModule {
};
exports.ObservabilityModule = ObservabilityModule;
exports.ObservabilityModule = ObservabilityModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [tracing_module_1.TracingModule],
        providers: [
            metrics_service_1.MetricsService,
            logger_service_1.LoggerService,
            observability_interceptor_1.ObservabilityInterceptor,
        ],
        controllers: [observability_controller_1.ObservabilityController],
        exports: [
            metrics_service_1.MetricsService,
            logger_service_1.LoggerService,
            observability_interceptor_1.ObservabilityInterceptor,
        ],
    })
], ObservabilityModule);
//# sourceMappingURL=observability.module.js.map