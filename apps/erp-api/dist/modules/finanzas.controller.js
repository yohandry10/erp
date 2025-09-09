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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanzasController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const event_bus_service_1 = require("../shared/events/event-bus.service");
const financial_integration_service_1 = require("../shared/integration/financial-integration.service");
let FinanzasController = class FinanzasController {
    constructor(supabase, eventBus, financialService) {
        this.supabase = supabase;
        this.eventBus = eventBus;
        this.financialService = financialService;
    }
    async getDashboardFinancieroCompleto() {
        try {
            const [kpis, datosHistoricos] = await Promise.all([
                this.financialService.getKPIsFinancieros(),
                this.financialService.getDatosHistoricosCompleto()
            ]);
            return {
                success: true,
                data: {
                    indicadoresActuales: kpis,
                    tendencias: {
                        ventasMensuales: datosHistoricos.ventasMensuales,
                        gastosMensuales: datosHistoricos.gastosMensuales,
                        utilidadMensual: datosHistoricos.utilidadMensual
                    },
                    comparativas: {
                        crecimientoAnual: this.calcularCrecimientoAnual(datosHistoricos.ventasMensuales),
                        margenPromedio: this.calcularMargenPromedio(datosHistoricos.utilidadMensual)
                    }
                }
            };
        }
        catch (error) {
            return { success: false, message: 'Error obteniendo dashboard completo' };
        }
    }
    async getFlujoProyectado(meses) {
        return this.financialService.getFlujoProyectado(meses || 12);
    }
    async getAnalisisCredito(solicitudData) {
        return this.financialService.getAnalisisCredito(solicitudData);
    }
    async getHistoricoVentas() {
        const datos = await this.financialService.getDatosHistoricosCompleto();
        return { success: true, data: datos.ventasMensuales };
    }
    async getHistoricoGastos() {
        const datos = await this.financialService.getDatosHistoricosCompleto();
        return { success: true, data: datos.gastosMensuales };
    }
    async getHistoricoUtilidad() {
        const datos = await this.financialService.getDatosHistoricosCompleto();
        return { success: true, data: datos.utilidadMensual };
    }
    calcularCrecimientoAnual(ventas) {
        if (ventas.length < 12)
            return 0;
        const ventasActuales = ventas.slice(-12).reduce((sum, v) => sum + v.ventas, 0);
        const ventasAnteriores = ventas.slice(-24, -12).reduce((sum, v) => sum + v.ventas, 0);
        return ventasAnteriores > 0 ? ((ventasActuales - ventasAnteriores) / ventasAnteriores) * 100 : 0;
    }
    calcularMargenPromedio(utilidad) {
        if (utilidad.length === 0)
            return 0;
        return utilidad.reduce((sum, u) => sum + u.margen, 0) / utilidad.length;
    }
};
exports.FinanzasController = FinanzasController;
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard financiero completo con datos históricos' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Dashboard con tendencias históricas' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getDashboardFinancieroCompleto", null);
__decorate([
    (0, common_1.Get)('flujo-efectivo/proyectado'),
    (0, swagger_1.ApiOperation)({ summary: 'Flujo de efectivo proyectado con escenarios' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Proyección de flujo de efectivo' }),
    __param(0, (0, common_1.Query)('meses')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getFlujoProyectado", null);
__decorate([
    (0, common_1.Post)('analisis-credito'),
    (0, swagger_1.ApiOperation)({ summary: 'Análisis de crédito basado en datos reales' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Análisis crediticio completo' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getAnalisisCredito", null);
__decorate([
    (0, common_1.Get)('historico/ventas'),
    (0, swagger_1.ApiOperation)({ summary: 'Datos históricos de ventas mensuales' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getHistoricoVentas", null);
__decorate([
    (0, common_1.Get)('historico/gastos'),
    (0, swagger_1.ApiOperation)({ summary: 'Datos históricos de gastos mensuales' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getHistoricoGastos", null);
__decorate([
    (0, common_1.Get)('historico/utilidad'),
    (0, swagger_1.ApiOperation)({ summary: 'Datos históricos de utilidad mensual' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanzasController.prototype, "getHistoricoUtilidad", null);
exports.FinanzasController = FinanzasController = __decorate([
    (0, swagger_1.ApiTags)('finanzas'),
    (0, common_1.Controller)('finanzas'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService,
        financial_integration_service_1.FinancialIntegrationService])
], FinanzasController);
//# sourceMappingURL=finanzas.controller.js.map