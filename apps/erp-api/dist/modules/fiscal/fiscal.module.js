"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FiscalModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const sunat_fiscal_service_1 = require("./sunat-fiscal.service");
const dian_fiscal_service_1 = require("./dian-fiscal.service");
const fiscal_service_factory_1 = require("./fiscal-service.factory");
let FiscalModule = class FiscalModule {
};
exports.FiscalModule = FiscalModule;
exports.FiscalModule = FiscalModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [
            sunat_fiscal_service_1.SunatFiscalService,
            dian_fiscal_service_1.DianFiscalService,
            fiscal_service_factory_1.FiscalServiceFactory
        ],
        exports: [
            sunat_fiscal_service_1.SunatFiscalService,
            dian_fiscal_service_1.DianFiscalService,
            fiscal_service_factory_1.FiscalServiceFactory
        ]
    })
], FiscalModule);
//# sourceMappingURL=fiscal.module.js.map