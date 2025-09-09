"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationModule = void 0;
const common_1 = require("@nestjs/common");
const supabase_module_1 = require("../supabase/supabase.module");
const event_bus_service_1 = require("../events/event-bus.service");
const accounting_entries_service_1 = require("./accounting-entries.service");
const accounting_books_service_1 = require("./accounting-books.service");
const accounting_reports_service_1 = require("./accounting-reports.service");
const inventory_integration_service_1 = require("./inventory-integration.service");
const dashboard_integration_service_1 = require("./dashboard-integration.service");
const financial_integration_service_1 = require("./financial-integration.service");
const rrhh_accounting_integration_service_1 = require("../../modules/rrhh/rrhh-accounting-integration.service");
let IntegrationModule = class IntegrationModule {
};
exports.IntegrationModule = IntegrationModule;
exports.IntegrationModule = IntegrationModule = __decorate([
    (0, common_1.Module)({
        imports: [supabase_module_1.SupabaseModule],
        providers: [
            event_bus_service_1.EventBusService,
            accounting_entries_service_1.AccountingEntriesService,
            accounting_books_service_1.AccountingBooksService,
            accounting_reports_service_1.AccountingReportsService,
            inventory_integration_service_1.InventoryIntegrationService,
            dashboard_integration_service_1.DashboardIntegrationService,
            financial_integration_service_1.FinancialIntegrationService,
            rrhh_accounting_integration_service_1.RrhhAccountingIntegrationService
        ],
        exports: [
            event_bus_service_1.EventBusService,
            accounting_entries_service_1.AccountingEntriesService,
            accounting_books_service_1.AccountingBooksService,
            accounting_reports_service_1.AccountingReportsService,
            inventory_integration_service_1.InventoryIntegrationService,
            dashboard_integration_service_1.DashboardIntegrationService,
            financial_integration_service_1.FinancialIntegrationService,
            rrhh_accounting_integration_service_1.RrhhAccountingIntegrationService
        ],
    })
], IntegrationModule);
//# sourceMappingURL=integration.module.js.map