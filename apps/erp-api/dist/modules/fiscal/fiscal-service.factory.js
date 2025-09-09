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
exports.FiscalServiceFactory = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const sunat_fiscal_service_1 = require("./sunat-fiscal.service");
const dian_fiscal_service_1 = require("./dian-fiscal.service");
let FiscalServiceFactory = class FiscalServiceFactory {
    constructor(configService, sunatService, dianService) {
        this.configService = configService;
        this.sunatService = sunatService;
        this.dianService = dianService;
    }
    getFiscalService(paisId) {
        switch (paisId) {
            case 1:
                return this.sunatService;
            case 2:
                return this.dianService;
            default:
                throw new Error(`Servicio fiscal no disponible para país ID: ${paisId}`);
        }
    }
    getFiscalServiceByCode(paisCode) {
        switch (paisCode.toUpperCase()) {
            case 'PE':
                return this.sunatService;
            case 'CO':
                return this.dianService;
            default:
                throw new Error(`Servicio fiscal no disponible para país: ${paisCode}`);
        }
    }
};
exports.FiscalServiceFactory = FiscalServiceFactory;
exports.FiscalServiceFactory = FiscalServiceFactory = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        sunat_fiscal_service_1.SunatFiscalService,
        dian_fiscal_service_1.DianFiscalService])
], FiscalServiceFactory);
//# sourceMappingURL=fiscal-service.factory.js.map