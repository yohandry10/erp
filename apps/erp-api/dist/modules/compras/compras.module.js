"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComprasModule = void 0;
const common_1 = require("@nestjs/common");
const compras_controller_1 = require("../compras.controller");
const supabase_module_1 = require("../../shared/supabase/supabase.module");
const event_bus_service_1 = require("../../shared/events/event-bus.service");
const inventory_integration_service_1 = require("../../shared/integration/inventory-integration.service");
let ComprasModule = class ComprasModule {
};
exports.ComprasModule = ComprasModule;
exports.ComprasModule = ComprasModule = __decorate([
    (0, common_1.Module)({
        imports: [supabase_module_1.SupabaseModule],
        controllers: [compras_controller_1.ComprasController],
        providers: [
            event_bus_service_1.EventBusService,
            inventory_integration_service_1.InventoryIntegrationService
        ],
        exports: [
            event_bus_service_1.EventBusService,
            inventory_integration_service_1.InventoryIntegrationService
        ]
    })
], ComprasModule);
//# sourceMappingURL=compras.module.js.map