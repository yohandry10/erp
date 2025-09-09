"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanillasService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../../shared/supabase/supabase.service");
const event_bus_service_1 = require("../../shared/events/event-bus.service");
let PlanillasService = class PlanillasService {
    constructor(supabaseService, eventBus) {
        this.supabaseService = supabaseService;
        this.eventBus = eventBus;
    }
    async getPlanillas() {
        const { data, error } = await this.supabaseService.getClient()
            .from('planillas')
            .select('*')
            .order('periodo', { ascending: false });
        if (error)
            throw error;
        return {
            success: true,
            data: data || []
        };
    }
    async crearPlanilla(planillaData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('planillas')
            .insert(planillaData)
            .select();
        if (error)
            throw error;
        return data[0];
    }
    async calcularPlanillaMensual(planillaId) {
        console.log(`🧮 Iniciando cálculo de planilla: ${planillaId}`);
        const client = this.supabaseService.getClient();
        const { data: empleados, error: empleadosError } = await client
            .from('empleados')
            .select('*, contratos(*)')
            .eq('estado', 'activo');
        if (empleadosError) {
            console.error('❌ Error obteniendo empleados:', empleadosError);
            throw empleadosError;
        }
        console.log(`👥 Empleados activos encontrados: ${empleados?.length || 0}`);
        if (!empleados || empleados.length === 0) {
            throw new Error('No se encontraron empleados activos para procesar');
        }
        const { data: conceptos, error: conceptosError } = await client
            .from('conceptos_planilla')
            .select('*')
            .eq('activo', true);
        if (conceptosError) {
            console.error('❌ Error obteniendo conceptos:', conceptosError);
            throw conceptosError;
        }
        console.log(`📋 Conceptos de planilla encontrados: ${conceptos?.length || 0}`);
        if (!conceptos || conceptos.length === 0) {
            throw new Error('No se encontraron conceptos de planilla configurados');
        }
        let totalIngresos = 0;
        let totalDescuentos = 0;
        let totalAportes = 0;
        let totalNeto = 0;
        const empleadosCalculados = [];
        const { data: planillaInfo, error: planillaError } = await client
            .from('planillas')
            .select('periodo')
            .eq('id', planillaId)
            .single();
        if (planillaError) {
            console.error('❌ Error obteniendo información de planilla:', planillaError);
            throw planillaError;
        }
        for (const empleado of empleados) {
            const contratoActual = empleado.contratos?.find(c => c.estado === 'vigente');
            if (!contratoActual) {
                console.log(`⚠️ Empleado sin contrato vigente: ${empleado.nombres} ${empleado.apellidos}`);
                continue;
            }
            const sueldoBasico = parseFloat(contratoActual.sueldo_bruto) || 0;
            console.log(`💰 Procesando: ${empleado.nombres} ${empleado.apellidos} - Sueldo: S/ ${sueldoBasico}`);
            const calculoEmpleado = this.calcularEmpleado(empleado, sueldoBasico, conceptos);
            const { data: empleadoPlanilla, error: empError } = await client
                .from('empleado_planilla')
                .insert({
                id_planilla: planillaId,
                id_empleado: empleado.id,
                dias_trabajados: 30,
                total_ingresos: calculoEmpleado.totalIngresos,
                total_descuentos: calculoEmpleado.totalDescuentos,
                total_aportes: calculoEmpleado.totalAportes,
                neto_pagar: calculoEmpleado.netoPagar
            })
                .select();
            if (empError) {
                console.error('❌ Error insertando empleado en planilla:', empError);
                throw empError;
            }
            console.log(`✅ Empleado insertado: ${empleado.nombres} ${empleado.apellidos} - ID: ${empleadoPlanilla[0].id}`);
            console.log(`📝 Insertando ${calculoEmpleado.conceptosDetalle.length} conceptos para empleado ${empleado.nombres}`);
            for (const concepto of calculoEmpleado.conceptosDetalle) {
                const { error: conceptoError } = await client
                    .from('empleado_planilla_conceptos')
                    .insert({
                    id_empleado_planilla: empleadoPlanilla[0].id,
                    id_concepto: concepto.id,
                    monto: concepto.monto,
                    observaciones: concepto.observaciones
                });
                if (conceptoError) {
                    console.error('❌ Error insertando concepto:', conceptoError);
                }
            }
            totalIngresos += calculoEmpleado.totalIngresos;
            totalDescuentos += calculoEmpleado.totalDescuentos;
            totalAportes += calculoEmpleado.totalAportes;
            totalNeto += calculoEmpleado.netoPagar;
            empleadosCalculados.push({
                empleadoId: empleado.id,
                nombres: empleado.nombres,
                apellidos: empleado.apellidos,
                numeroDocumento: empleado.numero_documento,
                ingresos: calculoEmpleado.totalIngresos,
                descuentos: calculoEmpleado.totalDescuentos,
                aportes: calculoEmpleado.totalAportes,
                neto: calculoEmpleado.netoPagar
            });
        }
        const { error: updateError } = await client
            .from('planillas')
            .update({
            total_ingresos: totalIngresos,
            total_descuentos: totalDescuentos,
            total_aportes: totalAportes,
            total_neto: totalNeto,
            estado: 'calculada'
        })
            .eq('id', planillaId);
        if (updateError) {
            console.error('❌ Error actualizando totales:', updateError);
            throw updateError;
        }
        console.log(`✅ Planilla calculada exitosamente:`);
        console.log(`   - Empleados procesados: ${empleados.length}`);
        console.log(`   - Total ingresos: S/ ${totalIngresos.toFixed(2)}`);
        console.log(`   - Total descuentos: S/ ${totalDescuentos.toFixed(2)}`);
        console.log(`   - Total neto: S/ ${totalNeto.toFixed(2)}`);
        console.log('🎯 [RRHH] Emitiendo evento de planilla calculada para contabilidad...');
        const eventoplanilla = {
            planillaId: planillaId,
            periodo: planillaInfo.periodo,
            totalIngresos: totalIngresos,
            totalDescuentos: totalDescuentos,
            totalAportes: totalAportes,
            totalNeto: totalNeto,
            cantidadEmpleados: empleadosCalculados.length,
            empleados: empleadosCalculados
        };
        this.eventBus.emitPlanillaCalculada(eventoplanilla);
        console.log('✅ [RRHH] Evento de planilla calculada emitido exitosamente');
        return {
            success: true,
            totalEmpleados: empleados.length,
            totalIngresos,
            totalDescuentos,
            totalNeto
        };
    }
    calcularEmpleado(empleado, sueldoBasico, conceptos) {
        const conceptosDetalle = [];
        let totalIngresos = 0;
        let totalDescuentos = 0;
        let totalAportes = 0;
        const conceptoBasico = conceptos.find(c => c.codigo === '001');
        if (conceptoBasico) {
            conceptosDetalle.push({
                id: conceptoBasico.id,
                monto: sueldoBasico,
                observaciones: 'Sueldo mensual'
            });
            totalIngresos += sueldoBasico;
        }
        const conceptoAsigFam = conceptos.find(c => c.codigo === '002');
        if (conceptoAsigFam && this.tieneHijos(empleado)) {
            const asignacionFamiliar = 102.50;
            conceptosDetalle.push({
                id: conceptoAsigFam.id,
                monto: asignacionFamiliar,
                observaciones: 'Asignación familiar'
            });
            totalIngresos += asignacionFamiliar;
        }
        const contratoActual = empleado.contratos?.find(c => c.estado === 'vigente');
        const regimenPensionario = contratoActual?.regimen_pensionario || 'AFP';
        if (regimenPensionario === 'AFP') {
            const aporteAFP = sueldoBasico * 0.10;
            const conceptoAporteAFP = conceptos.find(c => c.codigo === '101');
            if (conceptoAporteAFP) {
                conceptosDetalle.push({
                    id: conceptoAporteAFP.id,
                    monto: aporteAFP,
                    observaciones: 'AFP 10%'
                });
                totalDescuentos += aporteAFP;
            }
            const comisionAFP = sueldoBasico * 0.0125;
            const conceptoComisionAFP = conceptos.find(c => c.codigo === '102');
            if (conceptoComisionAFP) {
                conceptosDetalle.push({
                    id: conceptoComisionAFP.id,
                    monto: comisionAFP,
                    observaciones: 'Comisión AFP 1.25%'
                });
                totalDescuentos += comisionAFP;
            }
            const seguroAFP = sueldoBasico * 0.0136;
            const conceptoSeguroAFP = conceptos.find(c => c.codigo === '103');
            if (conceptoSeguroAFP) {
                conceptosDetalle.push({
                    id: conceptoSeguroAFP.id,
                    monto: seguroAFP,
                    observaciones: 'Seguro AFP 1.36%'
                });
                totalDescuentos += seguroAFP;
            }
        }
        else if (regimenPensionario === 'ONP') {
            const aporteONP = sueldoBasico * 0.13;
            const conceptoONP = conceptos.find(c => c.codigo === '104');
            if (conceptoONP) {
                conceptosDetalle.push({
                    id: conceptoONP.id,
                    monto: aporteONP,
                    observaciones: 'ONP 13%'
                });
                totalDescuentos += aporteONP;
            }
        }
        const impuestoRenta = this.calcularImpuestoRenta(totalIngresos);
        if (impuestoRenta > 0) {
            const conceptoImpuesto = conceptos.find(c => c.codigo === '105');
            if (conceptoImpuesto) {
                conceptosDetalle.push({
                    id: conceptoImpuesto.id,
                    monto: impuestoRenta,
                    observaciones: 'Impuesto a la Renta'
                });
                totalDescuentos += impuestoRenta;
            }
        }
        const aporteESSALUD = sueldoBasico * 0.09;
        const conceptoESSALUD = conceptos.find(c => c.codigo === '201');
        if (conceptoESSALUD) {
            conceptosDetalle.push({
                id: conceptoESSALUD.id,
                monto: aporteESSALUD,
                observaciones: 'ESSALUD 9%'
            });
            totalAportes += aporteESSALUD;
        }
        const netoPagar = totalIngresos - totalDescuentos;
        return {
            totalIngresos,
            totalDescuentos,
            totalAportes,
            netoPagar,
            conceptosDetalle
        };
    }
    tieneHijos(empleado) {
        return Math.random() > 0.6;
    }
    calcularImpuestoRenta(ingresoMensual) {
        const ingresoAnual = ingresoMensual * 12;
        const UIT_2024 = 5150;
        const limite = 7 * UIT_2024;
        if (ingresoAnual <= limite) {
            return 0;
        }
        const exceso = ingresoAnual - limite;
        let impuestoAnual = 0;
        if (exceso <= 27 * UIT_2024) {
            impuestoAnual = exceso * 0.08;
        }
        else if (exceso <= 54 * UIT_2024) {
            impuestoAnual = (27 * UIT_2024 * 0.08) + ((exceso - 27 * UIT_2024) * 0.14);
        }
        else {
            impuestoAnual = (27 * UIT_2024 * 0.08) + (27 * UIT_2024 * 0.14) + ((exceso - 54 * UIT_2024) * 0.17);
        }
        return Math.round(impuestoAnual / 12 * 100) / 100;
    }
    async getDetallePlanilla(planillaId) {
        console.log(`📊 Obteniendo detalle de planilla: ${planillaId}`);
        const { data, error } = await this.supabaseService.getClient()
            .from('empleado_planilla')
            .select(`
        *,
        empleados(nombres, apellidos, numero_documento),
        empleado_planilla_conceptos(
          monto,
          observaciones,
          conceptos_planilla(codigo, nombre, tipo)
        )
      `)
            .eq('id_planilla', planillaId);
        if (error) {
            console.error('❌ Error obteniendo detalle de planilla:', error);
            throw error;
        }
        console.log(`📋 Detalle obtenido: ${data?.length || 0} empleados`);
        return data || [];
    }
    async getBoleta(empleadoPlanillaId) {
        const { data, error } = await this.supabaseService.getClient()
            .from('empleado_planilla')
            .select(`
        *,
        empleados(*, departamentos(nombre)),
        planillas(*),
        empleado_planilla_conceptos(
          monto,
          observaciones,
          conceptos_planilla(codigo, nombre, tipo)
        )
      `)
            .eq('id', empleadoPlanillaId)
            .single();
        if (error)
            throw error;
        return data;
    }
    async updatePlanilla(planillaId, updateData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('planillas')
            .update(updateData)
            .eq('id', planillaId)
            .select();
        if (error)
            throw error;
        return data[0];
    }
    async deletePlanilla(planillaId) {
        console.log(`🗑️ Iniciando eliminación de planilla: ${planillaId}`);
        const client = this.supabaseService.getClient();
        try {
            console.log('🧹 Eliminando conceptos de empleados...');
            console.log('🧹 Eliminando empleados de planilla...');
            console.log('🧹 Eliminando planilla principal...');
            const { data, error } = await client
                .from('planillas')
                .delete()
                .eq('id', planillaId)
                .select();
            if (error) {
                console.error('❌ Error eliminando planilla:', error);
                throw error;
            }
            console.log('✅ Planilla eliminada exitosamente');
            return {
                success: true,
                message: 'Planilla eliminada exitosamente',
                deletedPlanilla: data[0]
            };
        }
        catch (error) {
            console.error('❌ Error en proceso de eliminación:', error);
            throw error;
        }
    }
    async getConceptos() {
        const client = this.supabaseService.getClient();
        const { data, error } = await client
            .from('conceptos_planilla')
            .select('*')
            .eq('activo', true)
            .order('codigo', { ascending: true });
        if (error)
            throw error;
        return {
            success: true,
            data: data || []
        };
    }
    async calcularPlanillaPersonalizada(planillaId, empleadosPersonalizados) {
        console.log(`🧮 Iniciando cálculo personalizado de planilla: ${planillaId}`);
        console.log(`👥 Empleados personalizados: ${empleadosPersonalizados.length}`);
        const client = this.supabaseService.getClient();
        const { data: conceptos, error: conceptosError } = await client
            .from('conceptos_planilla')
            .select('*')
            .eq('activo', true);
        if (conceptosError) {
            console.error('❌ Error obteniendo conceptos:', conceptosError);
            throw conceptosError;
        }
        console.log(`📋 Conceptos de planilla encontrados: ${conceptos?.length || 0}`);
        if (!conceptos || conceptos.length === 0) {
            throw new Error('No se encontraron conceptos de planilla configurados');
        }
        let totalIngresos = 0;
        let totalDescuentos = 0;
        let totalAportes = 0;
        let totalNeto = 0;
        for (const empleado of empleadosPersonalizados) {
            console.log(`💰 Procesando empleado personalizado: ${empleado.nombres} ${empleado.apellidos} - Sueldo: S/ ${empleado.sueldo_base}`);
            const calculoEmpleado = this.calcularEmpleadoPersonalizado(empleado, conceptos);
            const { data: empleadoPlanilla, error: empError } = await client
                .from('empleado_planilla')
                .insert({
                id_planilla: planillaId,
                id_empleado: empleado.id,
                dias_trabajados: empleado.dias_trabajados,
                horas_extras_25: empleado.horas_extras_25,
                horas_extras_35: empleado.horas_extras_35,
                tardanzas_minutos: empleado.tardanzas_minutos,
                faltas: empleado.faltas,
                total_ingresos: calculoEmpleado.totalIngresos,
                total_descuentos: calculoEmpleado.totalDescuentos,
                total_aportes: calculoEmpleado.totalAportes,
                neto_pagar: calculoEmpleado.netoPagar
            })
                .select();
            if (empError) {
                console.error('❌ Error insertando empleado en planilla:', empError);
                throw empError;
            }
            console.log(`✅ Empleado insertado: ${empleado.nombres} ${empleado.apellidos} - ID: ${empleadoPlanilla[0].id}`);
            console.log(`📝 Insertando ${calculoEmpleado.conceptosDetalle.length} conceptos para empleado ${empleado.nombres}`);
            for (const concepto of calculoEmpleado.conceptosDetalle) {
                const { error: conceptoError } = await client
                    .from('empleado_planilla_conceptos')
                    .insert({
                    id_empleado_planilla: empleadoPlanilla[0].id,
                    id_concepto: concepto.id,
                    monto: concepto.monto,
                    observaciones: concepto.observaciones
                });
                if (conceptoError) {
                    console.error('❌ Error insertando concepto:', conceptoError);
                }
            }
            totalIngresos += calculoEmpleado.totalIngresos;
            totalDescuentos += calculoEmpleado.totalDescuentos;
            totalAportes += calculoEmpleado.totalAportes;
            totalNeto += calculoEmpleado.netoPagar;
        }
        const { error: updateError } = await client
            .from('planillas')
            .update({
            total_ingresos: totalIngresos,
            total_descuentos: totalDescuentos,
            total_aportes: totalAportes,
            total_neto: totalNeto,
            estado: 'calculada'
        })
            .eq('id', planillaId);
        if (updateError) {
            console.error('❌ Error actualizando totales:', updateError);
            throw updateError;
        }
        console.log(`✅ Planilla personalizada calculada exitosamente:`);
        console.log(`   - Empleados procesados: ${empleadosPersonalizados.length}`);
        console.log(`   - Total ingresos: S/ ${totalIngresos.toFixed(2)}`);
        console.log(`   - Total descuentos: S/ ${totalDescuentos.toFixed(2)}`);
        console.log(`   - Total neto: S/ ${totalNeto.toFixed(2)}`);
        return {
            success: true,
            totalEmpleados: empleadosPersonalizados.length,
            totalIngresos,
            totalDescuentos,
            totalNeto
        };
    }
    calcularEmpleadoPersonalizado(empleado, conceptos) {
        const conceptosDetalle = [];
        let totalIngresos = 0;
        let totalDescuentos = 0;
        let totalAportes = 0;
        const sueldoBasico = empleado.sueldo_base;
        const diasTrabajados = empleado.dias_trabajados;
        const horasExtras25 = empleado.horas_extras_25 || 0;
        const horasExtras35 = empleado.horas_extras_35 || 0;
        const tardanzasMinutos = empleado.tardanzas_minutos || 0;
        const faltas = empleado.faltas || 0;
        const bonosAdicionales = empleado.bonos_adicionales || 0;
        const conceptoBasico = conceptos.find(c => c.codigo === '001');
        if (conceptoBasico) {
            const sueldoProporcional = (sueldoBasico / 30) * diasTrabajados;
            conceptosDetalle.push({
                id: conceptoBasico.id,
                monto: sueldoProporcional,
                observaciones: `Sueldo ${diasTrabajados} días`
            });
            totalIngresos += sueldoProporcional;
        }
        if (horasExtras25 > 0) {
            const conceptoHE25 = conceptos.find(c => c.codigo === '003');
            if (conceptoHE25) {
                const valorHora = sueldoBasico / (30 * 8);
                const montoHE25 = valorHora * horasExtras25 * 1.25;
                conceptosDetalle.push({
                    id: conceptoHE25.id,
                    monto: montoHE25,
                    observaciones: `${horasExtras25} horas al 25%`
                });
                totalIngresos += montoHE25;
            }
        }
        if (horasExtras35 > 0) {
            const conceptoHE35 = conceptos.find(c => c.codigo === '004');
            if (conceptoHE35) {
                const valorHora = sueldoBasico / (30 * 8);
                const montoHE35 = valorHora * horasExtras35 * 1.35;
                conceptosDetalle.push({
                    id: conceptoHE35.id,
                    monto: montoHE35,
                    observaciones: `${horasExtras35} horas al 35%`
                });
                totalIngresos += montoHE35;
            }
        }
        if (bonosAdicionales > 0) {
            const conceptoBono = conceptos.find(c => c.codigo === '005');
            if (conceptoBono) {
                conceptosDetalle.push({
                    id: conceptoBono.id,
                    monto: bonosAdicionales,
                    observaciones: 'Bono adicional'
                });
                totalIngresos += bonosAdicionales;
            }
        }
        if (tardanzasMinutos > 0) {
            const conceptoTardanzas = conceptos.find(c => c.codigo === '106');
            if (conceptoTardanzas) {
                const valorMinuto = sueldoBasico / (30 * 8 * 60);
                const descuentoTardanzas = valorMinuto * tardanzasMinutos;
                conceptosDetalle.push({
                    id: conceptoTardanzas.id,
                    monto: descuentoTardanzas,
                    observaciones: `${tardanzasMinutos} minutos de tardanza`
                });
                totalDescuentos += descuentoTardanzas;
            }
        }
        if (faltas > 0) {
            const conceptoFaltas = conceptos.find(c => c.codigo === '107');
            if (conceptoFaltas) {
                const valorDia = sueldoBasico / 30;
                const descuentoFaltas = valorDia * faltas;
                conceptosDetalle.push({
                    id: conceptoFaltas.id,
                    monto: descuentoFaltas,
                    observaciones: `${faltas} días de falta`
                });
                totalDescuentos += descuentoFaltas;
            }
        }
        const regimenPensionario = empleado.contratos?.[0]?.regimen_pensionario || 'AFP';
        if (regimenPensionario === 'AFP') {
            const aporteAFP = totalIngresos * 0.10;
            const comisionAFP = totalIngresos * 0.0125;
            const seguroAFP = totalIngresos * 0.0136;
            const conceptoAporteAFP = conceptos.find(c => c.codigo === '101');
            if (conceptoAporteAFP) {
                conceptosDetalle.push({
                    id: conceptoAporteAFP.id,
                    monto: aporteAFP,
                    observaciones: 'AFP 10%'
                });
                totalDescuentos += aporteAFP;
            }
            const conceptoComisionAFP = conceptos.find(c => c.codigo === '102');
            if (conceptoComisionAFP) {
                conceptosDetalle.push({
                    id: conceptoComisionAFP.id,
                    monto: comisionAFP,
                    observaciones: 'Comisión AFP 1.25%'
                });
                totalDescuentos += comisionAFP;
            }
            const conceptoSeguroAFP = conceptos.find(c => c.codigo === '103');
            if (conceptoSeguroAFP) {
                conceptosDetalle.push({
                    id: conceptoSeguroAFP.id,
                    monto: seguroAFP,
                    observaciones: 'Seguro AFP 1.36%'
                });
                totalDescuentos += seguroAFP;
            }
        }
        else if (regimenPensionario === 'ONP') {
            const aporteONP = totalIngresos * 0.13;
            const conceptoONP = conceptos.find(c => c.codigo === '104');
            if (conceptoONP) {
                conceptosDetalle.push({
                    id: conceptoONP.id,
                    monto: aporteONP,
                    observaciones: 'ONP 13%'
                });
                totalDescuentos += aporteONP;
            }
        }
        const netoPagar = totalIngresos - totalDescuentos;
        return {
            conceptosDetalle,
            totalIngresos,
            totalDescuentos,
            totalAportes,
            netoPagar
        };
    }
};
exports.PlanillasService = PlanillasService;
exports.PlanillasService = PlanillasService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], PlanillasService);
