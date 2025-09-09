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
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
// Módulos principales
const supabase_module_1 = require("./shared/supabase/supabase.module");
const integration_module_1 = require("./shared/integration/integration.module");
const jobs_module_1 = require("./shared/jobs/jobs.module");
// Módulos de negocio
const auth_module_1 = require("./modules/auth/auth.module");
const rrhh_module_1 = require("./modules/rrhh/rrhh.module");
const configuracion_module_1 = require("./modules/configuracion.module");
const cpe_module_1 = require("./modules/cpe/cpe.module");
const gre_module_1 = require("./modules/gre/gre.module");
const sire_module_1 = require("./modules/sire/sire.module");
const documentos_module_1 = require("./modules/documentos.module");
// Controladores individuales (solo los que existen)
const analytics_controller_1 = require("./modules/analytics.controller");
const compras_controller_1 = require("./modules/compras.controller");
const contabilidad_controller_1 = require("./modules/contabilidad.controller");
const cotizaciones_controller_1 = require("./modules/cotizaciones.controller");
const dashboard_controller_1 = require("./modules/dashboard.controller");
const finanzas_controller_1 = require("./modules/finanzas.controller");
const inventario_controller_1 = require("./modules/inventario.controller");
const pos_controller_1 = require("./modules/pos.controller");
const usuarios_controller_1 = require("./modules/usuarios.controller");
// Servicios compartidos
const event_bus_service_1 = require("./shared/events/event-bus.service");
let AppModule = class AppModule {
    constructor() {
        console.log('🚀 [App] Módulo principal inicializado con todas las integraciones');
        console.log('✅ [App] Sistema ERP con integración completa entre módulos activo');
        console.log('🤖 [App] Procesos automáticos en background inicializados');
        console.log('🎯 [App] EventBus expandido para comunicación crítica entre módulos');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            supabase_module_1.SupabaseModule,
            integration_module_1.IntegrationModule,
            jobs_module_1.JobsModule,
            auth_module_1.AuthModule,
            rrhh_module_1.RrhhModule,
            configuracion_module_1.ConfiguracionModule,
            cpe_module_1.CpeModule,
            gre_module_1.GreModule,
            sire_module_1.SireModule,
            documentos_module_1.DocumentosModule,
        ],
        controllers: [
            app_controller_1.AppController,
            analytics_controller_1.AnalyticsController,
            dashboard_controller_1.DashboardController,
            pos_controller_1.PosController,
            compras_controller_1.ComprasController,
            cotizaciones_controller_1.CotizacionesController,
            inventario_controller_1.InventarioController,
            finanzas_controller_1.FinanzasController,
            contabilidad_controller_1.ContabilidadController,
            usuarios_controller_1.UsuariosController,
        ],
        providers: [
            app_service_1.AppService,
            event_bus_service_1.EventBusService,
        ],
    }),
    __metadata("design:paramtypes", [])
], AppModule);
