"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RrhhModule = void 0;
const common_1 = require("@nestjs/common");
const rrhh_controller_1 = require("./rrhh.controller");
const rrhh_service_1 = require("./rrhh.service");
const planillas_service_1 = require("./planillas.service");
const rrhh_accounting_integration_service_1 = require("./rrhh-accounting-integration.service");
const supabase_module_1 = require("../../shared/supabase/supabase.module");
const event_bus_service_1 = require("../../shared/events/event-bus.service");
let RrhhModule = class RrhhModule {
};
exports.RrhhModule = RrhhModule;
exports.RrhhModule = RrhhModule = __decorate([
    (0, common_1.Module)({
        imports: [supabase_module_1.SupabaseModule],
        controllers: [rrhh_controller_1.RrhhController],
        providers: [
            rrhh_service_1.RrhhService,
            planillas_service_1.PlanillasService,
            rrhh_accounting_integration_service_1.RrhhAccountingIntegrationService,
            event_bus_service_1.EventBusService
        ],
        exports: [
            rrhh_service_1.RrhhService,
            planillas_service_1.PlanillasService,
            rrhh_accounting_integration_service_1.RrhhAccountingIntegrationService
        ]
    })
], RrhhModule);
//# sourceMappingURL=rrhh.module.js.map