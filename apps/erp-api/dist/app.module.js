"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const config_1 = require("@nestjs/config");
const auth_module_1 = require("./modules/auth/auth.module");
const supabase_module_1 = require("./shared/supabase/supabase.module");
const security_module_1 = require("./shared/security/security.module");
const core_1 = require("@nestjs/core");
const rate_limit_guard_1 = require("./shared/security/guards/rate-limit.guard");
const validation_interceptor_1 = require("./shared/security/interceptors/validation.interceptor");
const integration_module_1 = require("./shared/integration/integration.module");
const compras_module_1 = require("./modules/compras/compras.module");
const cotizaciones_module_1 = require("./modules/cotizaciones/cotizaciones.module");
const inventario_module_1 = require("./modules/inventario/inventario.module");
const contabilidad_module_1 = require("./modules/contabilidad/contabilidad.module");
const documentos_module_1 = require("./modules/documentos/documentos.module");
const reports_module_1 = require("./modules/reports/reports.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const sire_module_1 = require("./modules/sire/sire.module");
const ose_module_1 = require("./modules/ose/ose.module");
const cpe_module_1 = require("./modules/cpe/cpe.module");
const gre_module_1 = require("./modules/gre/gre.module");
const pos_module_1 = require("./modules/pos/pos.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
const dashboard_module_1 = require("./modules/dashboard/dashboard.module");
const rrhh_module_1 = require("./modules/rrhh/rrhh.module");
const retenciones_module_1 = require("./modules/retenciones/retenciones.module");
const paises_module_1 = require("./modules/paises/paises.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
            }),
            security_module_1.SecurityModule,
            auth_module_1.AuthModule,
            supabase_module_1.SupabaseModule,
            integration_module_1.IntegrationModule,
            compras_module_1.ComprasModule,
            cotizaciones_module_1.CotizacionesModule,
            inventario_module_1.InventarioModule,
            contabilidad_module_1.ContabilidadModule,
            documentos_module_1.DocumentosModule,
            reports_module_1.ReportsModule,
            notifications_module_1.NotificationsModule,
            sire_module_1.SireModule,
            ose_module_1.OseModule,
            cpe_module_1.CpeModule,
            gre_module_1.GreModule,
            pos_module_1.PosModule,
            analytics_module_1.AnalyticsModule,
            dashboard_module_1.DashboardModule,
            rrhh_module_1.RrhhModule,
            retenciones_module_1.RetencionesModule,
            paises_module_1.PaisesModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            {
                provide: core_1.APP_GUARD,
                useClass: rate_limit_guard_1.RateLimitGuard,
            },
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: validation_interceptor_1.ValidationInterceptor,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map