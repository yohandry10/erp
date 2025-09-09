"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SireModule = void 0;
const common_1 = require("@nestjs/common");
const sire_controller_1 = require("./sire.controller");
const sire_service_1 = require("./sire.service");
const supabase_module_1 = require("../../shared/supabase/supabase.module");
const integration_module_1 = require("../../shared/integration/integration.module");
let SireModule = class SireModule {
};
exports.SireModule = SireModule;
exports.SireModule = SireModule = __decorate([
    (0, common_1.Module)({
        imports: [supabase_module_1.SupabaseModule, integration_module_1.IntegrationModule],
        controllers: [sire_controller_1.SireController],
        providers: [sire_service_1.SireService],
        exports: [sire_service_1.SireService],
    })
], SireModule);
//# sourceMappingURL=sire.module.js.map