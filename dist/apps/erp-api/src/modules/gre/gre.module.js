"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreModule = void 0;
const common_1 = require("@nestjs/common");
const gre_controller_1 = require("./gre.controller");
const gre_service_1 = require("./gre.service");
const supabase_module_1 = require("../../shared/supabase/supabase.module");
const integration_module_1 = require("../../shared/integration/integration.module");
const ose_module_1 = require("../ose/ose.module");
let GreModule = class GreModule {
};
exports.GreModule = GreModule;
exports.GreModule = GreModule = __decorate([
    (0, common_1.Module)({
        imports: [supabase_module_1.SupabaseModule, integration_module_1.IntegrationModule, ose_module_1.OseModule],
        controllers: [gre_controller_1.GreController],
        providers: [gre_service_1.GreService],
        exports: [gre_service_1.GreService],
    })
], GreModule);
