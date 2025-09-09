"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CpeModule = void 0;
const common_1 = require("@nestjs/common");
const cpe_controller_1 = require("./cpe.controller");
const cpe_service_1 = require("./cpe.service");
const crypto_module_1 = require("../../shared/crypto/crypto.module");
const supabase_module_1 = require("../../shared/supabase/supabase.module");
const integration_module_1 = require("../../shared/integration/integration.module");
const ose_module_1 = require("../ose/ose.module");
let CpeModule = class CpeModule {
};
exports.CpeModule = CpeModule;
exports.CpeModule = CpeModule = __decorate([
    (0, common_1.Module)({
        imports: [crypto_module_1.CryptoModule, supabase_module_1.SupabaseModule, integration_module_1.IntegrationModule, ose_module_1.OseModule],
        controllers: [cpe_controller_1.CpeController],
        providers: [cpe_service_1.CpeService],
        exports: [cpe_service_1.CpeService],
    })
], CpeModule);
//# sourceMappingURL=cpe.module.js.map