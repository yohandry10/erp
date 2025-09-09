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
exports.RrhhAccountingIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../../shared/supabase/supabase.service");
let RrhhAccountingIntegrationService = class RrhhAccountingIntegrationService {
    constructor(supabase) {
        this.supabase = supabase;
    }
    async generarAsientosPlanilla(planillaData) {
        try {
            console.log(`📚 Generando asientos contables para planilla ${planillaData.periodo}`);
            const numeroAsiento = `PLAN-${planillaData.periodo}-${Date.now()}`;
            const fechaAsiento = new Date().toISOString();
            const { data: asientoCreado, error: asientoError } = await this.supabase.getClient()
                .from('asientos_contables')
                .insert({
                numero_asiento: numeroAsiento,
                fecha: fechaAsiento,
                concepto: `Planilla de sueldos ${planillaData.periodo}`,
                referencia: `PLANILLA-${planillaData.planillaId}`,
                total_debe: planillaData.totalIngresos + planillaData.totalAportes,
                total_haber: planillaData.totalIngresos + planillaData.totalAportes,
                estado: 'BORRADOR',
                usuario_id: null,
                created_at: fechaAsiento
            })
                .select()
                .single();
            if (asientoError)
                throw asientoError;
            const detalles = this.generarDetallesAsiento(planillaData);
            const detallesParaGuardar = detalles.map(detalle => ({
                asiento_id: asientoCreado.id,
                cuenta_id: detalle.cuentaCodigo,
                debe: detalle.debe,
                haber: detalle.haber,
                concepto: detalle.descripcion,
                created_at: fechaAsiento
            }));
            const { error: detallesError } = await this.supabase.getClient()
                .from('detalle_asientos')
                .insert(detallesParaGuardar);
            if (detallesError)
                throw detallesError;
            console.log(`✅ Asiento contable creado: ${numeroAsiento}`);
            console.log(`   📊 Total Debe: S/ ${planillaData.totalIngresos + planillaData.totalAportes}`);
            console.log(`   📊 Total Haber: S/ ${planillaData.totalIngresos + planillaData.totalAportes}`);
            return asientoCreado.id;
        }
        catch (error) {
            console.error('❌ Error generando asientos de planilla:', error);
            throw error;
        }
    }
    generarDetallesAsiento(planillaData) {
        const detalles = [];
        detalles.push({
            cuentaCodigo: '621',
            cuentaNombre: 'Remuneraciones',
            debe: planillaData.totalIngresos,
            haber: 0,
            descripcion: `Sueldos y salarios ${planillaData.periodo}`
        });
        detalles.push({
            cuentaCodigo: '627',
            cuentaNombre: 'Seguridad y Previsión Social',
            debe: planillaData.totalAportes,
            haber: 0,
            descripcion: `ESSALUD y aportes empleador ${planillaData.periodo}`
        });
        detalles.push({
            cuentaCodigo: '411',
            cuentaNombre: 'Remuneraciones por Pagar',
            debe: 0,
            haber: planillaData.totalNeto,
            descripcion: `Neto a pagar empleados ${planillaData.periodo}`
        });
        const aportesPensiones = this.calcularAportesPensiones(planillaData);
        if (aportesPensiones > 0) {
            detalles.push({
                cuentaCodigo: '403',
                cuentaNombre: 'Instituciones Públicas',
                debe: 0,
                haber: aportesPensiones,
                descripcion: `AFP/ONP descuentos ${planillaData.periodo}`
            });
        }
        if (planillaData.totalAportes > 0) {
            detalles.push({
                cuentaCodigo: '407',
                cuentaNombre: 'Administradoras de Fondos',
                debe: 0,
                haber: planillaData.totalAportes,
                descripcion: `ESSALUD por pagar ${planillaData.periodo}`
            });
        }
        const impuestoRenta = this.calcularImpuestoRenta(planillaData);
        if (impuestoRenta > 0) {
            detalles.push({
                cuentaCodigo: '401',
                cuentaNombre: 'Gobierno Central',
                debe: 0,
                haber: impuestoRenta,
                descripcion: `Impuesto 5ta categoría ${planillaData.periodo}`
            });
        }
        return detalles;
    }
    calcularAportesPensiones(planillaData) {
        return planillaData.totalIngresos * 0.126;
    }
    calcularImpuestoRenta(planillaData) {
        const UIT_2024 = 5150;
        const limiteAnualExonerado = 7 * UIT_2024;
        const limiteExoneradoMensual = limiteAnualExonerado / 12;
        let totalImpuesto = 0;
        for (const empleado of planillaData.empleados) {
            if (empleado.ingresos > limiteExoneradoMensual) {
                const excesoMensual = empleado.ingresos - limiteExoneradoMensual;
                totalImpuesto += excesoMensual * 0.08;
            }
        }
        return totalImpuesto;
    }
    async generarAsientoPagoPlanilla(planillaId, metodoPago) {
        try {
            const { data: planilla, error: planillaError } = await this.supabase.getClient()
                .from('planillas')
                .select('*')
                .eq('id', planillaId)
                .single();
            if (planillaError || !planilla)
                throw new Error('Planilla no encontrada');
            const numeroAsiento = `PAGO-PLAN-${planilla.periodo}-${Date.now()}`;
            const fechaAsiento = new Date().toISOString();
            const { data: asientoCreado, error: asientoError } = await this.supabase.getClient()
                .from('asientos_contables')
                .insert({
                numero_asiento: numeroAsiento,
                fecha: fechaAsiento,
                concepto: `Pago de planilla ${planilla.periodo}`,
                referencia: `PAGO-PLANILLA-${planillaId}`,
                total_debe: planilla.total_neto,
                total_haber: planilla.total_neto,
                estado: 'BORRADOR',
                usuario_id: null,
                created_at: fechaAsiento
            })
                .select()
                .single();
            if (asientoError)
                throw asientoError;
            const detallesPago = [
                {
                    asiento_id: asientoCreado.id,
                    cuenta_id: '411',
                    debe: planilla.total_neto,
                    haber: 0,
                    concepto: `Cancelación sueldos ${planilla.periodo}`,
                    created_at: fechaAsiento
                },
                {
                    asiento_id: asientoCreado.id,
                    cuenta_id: metodoPago === 'transferencia' ? '104' : '101',
                    debe: 0,
                    haber: planilla.total_neto,
                    concepto: `Pago ${metodoPago} planilla ${planilla.periodo}`,
                    created_at: fechaAsiento
                }
            ];
            const { error: detallesError } = await this.supabase.getClient()
                .from('detalle_asientos')
                .insert(detallesPago);
            if (detallesError)
                throw detallesError;
            console.log(`✅ Asiento de pago creado: ${numeroAsiento}`);
            return asientoCreado.id;
        }
        catch (error) {
            console.error('❌ Error generando asiento de pago:', error);
            throw error;
        }
    }
    async generarAsientoLiquidacion(liquidacionId) {
        try {
            const { data: liquidacion, error: liquidacionError } = await this.supabase.getClient()
                .from('liquidaciones')
                .select(`
          *,
          empleados(nombres, apellidos, numero_documento)
        `)
                .eq('id', liquidacionId)
                .single();
            if (liquidacionError || !liquidacion)
                throw new Error('Liquidación no encontrada');
            const numeroAsiento = `LIQ-${liquidacion.empleados.numero_documento}-${Date.now()}`;
            const fechaAsiento = new Date().toISOString();
            const { data: asientoCreado, error: asientoError } = await this.supabase.getClient()
                .from('asientos_contables')
                .insert({
                numero_asiento: numeroAsiento,
                fecha: fechaAsiento,
                concepto: `Liquidación ${liquidacion.empleados.nombres} ${liquidacion.empleados.apellidos}`,
                referencia: `LIQUIDACION-${liquidacionId}`,
                total_debe: liquidacion.total_liquidacion,
                total_haber: liquidacion.total_liquidacion,
                estado: 'BORRADOR',
                usuario_id: null,
                created_at: fechaAsiento
            })
                .select()
                .single();
            if (asientoError)
                throw asientoError;
            const detallesLiquidacion = [];
            if (liquidacion.monto_cts > 0) {
                detallesLiquidacion.push({
                    asiento_id: asientoCreado.id,
                    cuenta_id: '415',
                    debe: liquidacion.monto_cts,
                    haber: 0,
                    concepto: `CTS ${liquidacion.empleados.nombres}`,
                    created_at: fechaAsiento
                });
            }
            if (liquidacion.indemnizacion > 0) {
                detallesLiquidacion.push({
                    asiento_id: asientoCreado.id,
                    cuenta_id: '629',
                    debe: liquidacion.indemnizacion,
                    haber: 0,
                    concepto: `Indemnización ${liquidacion.empleados.nombres}`,
                    created_at: fechaAsiento
                });
            }
            detallesLiquidacion.push({
                asiento_id: asientoCreado.id,
                cuenta_id: '411',
                debe: 0,
                haber: liquidacion.total_liquidacion,
                concepto: `Liquidación por pagar ${liquidacion.empleados.nombres}`,
                created_at: fechaAsiento
            });
            const { error: detallesError } = await this.supabase.getClient()
                .from('detalle_asientos')
                .insert(detallesLiquidacion);
            if (detallesError)
                throw detallesError;
            console.log(`✅ Asiento de liquidación creado: ${numeroAsiento}`);
            return asientoCreado.id;
        }
        catch (error) {
            console.error('❌ Error generando asiento de liquidación:', error);
            throw error;
        }
    }
    async getResumenContableRrhh(fechaDesde, fechaHasta) {
        try {
            const client = this.supabase.getClient();
            let query = client
                .from('asientos_contables')
                .select(`
          *,
          detalle_asientos(*)
        `)
                .or('numero_asiento.like.PLAN-%,numero_asiento.like.PAGO-PLAN-%,numero_asiento.like.LIQ-%')
                .order('fecha', { ascending: false });
            if (fechaDesde)
                query = query.gte('fecha', fechaDesde);
            if (fechaHasta)
                query = query.lte('fecha', fechaHasta);
            const { data: asientos, error } = await query;
            if (error)
                throw error;
            const totales = (asientos || []).reduce((acc, asiento) => {
                if (asiento.numero_asiento.startsWith('PLAN-')) {
                    acc.totalPlanillas += asiento.total_debe || 0;
                }
                else if (asiento.numero_asiento.startsWith('PAGO-PLAN-')) {
                    acc.totalPagos += asiento.total_debe || 0;
                }
                else if (asiento.numero_asiento.startsWith('LIQ-')) {
                    acc.totalLiquidaciones += asiento.total_debe || 0;
                }
                return acc;
            }, {
                totalPlanillas: 0,
                totalPagos: 0,
                totalLiquidaciones: 0
            });
            return {
                success: true,
                data: {
                    periodo: fechaDesde && fechaHasta ? `${fechaDesde} al ${fechaHasta}` : 'Todos los registros',
                    totalAsientos: asientos?.length || 0,
                    totales,
                    asientos: asientos || []
                }
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo resumen contable RRHH:', error);
            throw error;
        }
    }
};
exports.RrhhAccountingIntegrationService = RrhhAccountingIntegrationService;
exports.RrhhAccountingIntegrationService = RrhhAccountingIntegrationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], RrhhAccountingIntegrationService);
//# sourceMappingURL=rrhh-accounting-integration.service.js.map