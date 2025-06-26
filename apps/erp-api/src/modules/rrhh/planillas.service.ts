import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService, PlanillaCalculadaEvent, PlanillaPagadaEvent } from '../../shared/events/event-bus.service';

@Injectable()
export class PlanillasService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService
  ) {}

  // Obtener todas las planillas
  async getPlanillas() {
    const { data, error } = await this.supabaseService.getClient()
      .from('planillas')
      .select('*')
      .order('periodo', { ascending: false });
    if (error) throw error;
    return {
      success: true,
      data: data || []
    };
  }

  // Crear nueva planilla
  async crearPlanilla(planillaData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('planillas')
      .insert(planillaData)
      .select();
    if (error) throw error;
    return data[0];
  }

  // Calcular planilla mensual para todos los empleados activos
  async calcularPlanillaMensual(planillaId: string) {
    console.log(`🧮 Iniciando cálculo de planilla: ${planillaId}`);
    const client = this.supabaseService.getClient();
    
    // Obtener empleados activos
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

    // Obtener conceptos de planilla
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

    // Obtener información de la planilla para el evento
    const { data: planillaInfo, error: planillaError } = await client
      .from('planillas')
      .select('periodo')
      .eq('id', planillaId)
      .single();

    if (planillaError) {
      console.error('❌ Error obteniendo información de planilla:', planillaError);
      throw planillaError;
    }

    // Procesar cada empleado
    for (const empleado of empleados) {
      const contratoActual = empleado.contratos?.find(c => c.estado === 'vigente');
      if (!contratoActual) {
        console.log(`⚠️ Empleado sin contrato vigente: ${empleado.nombres} ${empleado.apellidos}`);
        continue;
      }

      const sueldoBasico = parseFloat(contratoActual.sueldo_bruto) || 0;
      console.log(`💰 Procesando: ${empleado.nombres} ${empleado.apellidos} - Sueldo: S/ ${sueldoBasico}`);
      
      const calculoEmpleado = this.calcularEmpleado(empleado, sueldoBasico, conceptos);

      // Insertar empleado en planilla
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

      // Insertar conceptos detallados
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
          // No hacer throw aquí, solo loggear el error y continuar
        }
      }

      totalIngresos += calculoEmpleado.totalIngresos;
      totalDescuentos += calculoEmpleado.totalDescuentos;
      totalAportes += calculoEmpleado.totalAportes;
      totalNeto += calculoEmpleado.netoPagar;

      // Agregar empleado al array para el evento
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

    // Actualizar totales de la planilla
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

    // 🎯 EMITIR EVENTO PARA INTEGRACIÓN CONTABLE
    console.log('🎯 [RRHH] Emitiendo evento de planilla calculada para contabilidad...');
    
    const eventoplanilla: PlanillaCalculadaEvent = {
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

  // Lógica de cálculo por empleado
  private calcularEmpleado(empleado: any, sueldoBasico: number, conceptos: any[]) {
    const conceptosDetalle = [];
    let totalIngresos = 0;
    let totalDescuentos = 0;
    let totalAportes = 0;

    // 1. INGRESOS

    // Sueldo básico
    const conceptoBasico = conceptos.find(c => c.codigo === '001');
    if (conceptoBasico) {
      conceptosDetalle.push({
        id: conceptoBasico.id,
        monto: sueldoBasico,
        observaciones: 'Sueldo mensual'
      });
      totalIngresos += sueldoBasico;
    }

    // Asignación familiar (S/ 102.50 si tiene hijos)
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

    // 2. DESCUENTOS

    const contratoActual = empleado.contratos?.find(c => c.estado === 'vigente');
    const regimenPensionario = contratoActual?.regimen_pensionario || 'AFP';

    if (regimenPensionario === 'AFP') {
      // AFP - Aporte obligatorio (10%)
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

      // AFP - Comisión (varía por AFP, promedio 1.25%)
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

      // AFP - Seguro (1.36%)
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
    } else if (regimenPensionario === 'ONP') {
      // ONP (13%)
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

    // Impuesto a la Renta (solo si supera las 7 UIT anuales)
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

    // 3. APORTES DEL EMPLEADOR

    // ESSALUD (9%)
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

  // Verificar si el empleado tiene hijos (simplificado)
  private tieneHijos(empleado: any): boolean {
    // En un sistema real, esto vendría de una tabla de familiares
    // Por ahora asumimos que algunos empleados tienen hijos
    return Math.random() > 0.6; // 40% tienen hijos
  }

  // Calcular impuesto a la renta (simplificado)
  private calcularImpuestoRenta(ingresoMensual: number): number {
    const ingresoAnual = ingresoMensual * 12;
    const UIT_2024 = 5150; // UIT para 2024
    const limite = 7 * UIT_2024; // 7 UIT

    if (ingresoAnual <= limite) {
      return 0; // No paga impuesto
    }

    // Cálculo simplificado del impuesto (8% - 30% según tramos)
    const exceso = ingresoAnual - limite;
    let impuestoAnual = 0;

    if (exceso <= 27 * UIT_2024) {
      impuestoAnual = exceso * 0.08; // 8%
    } else if (exceso <= 54 * UIT_2024) {
      impuestoAnual = (27 * UIT_2024 * 0.08) + ((exceso - 27 * UIT_2024) * 0.14); // 14%
    } else {
      impuestoAnual = (27 * UIT_2024 * 0.08) + (27 * UIT_2024 * 0.14) + ((exceso - 54 * UIT_2024) * 0.17); // 17%
    }

    return Math.round(impuestoAnual / 12 * 100) / 100; // Impuesto mensual
  }

  // Obtener detalle de planilla por empleado
  async getDetallePlanilla(planillaId: string) {
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

  // Generar boleta de pago individual
  async getBoleta(empleadoPlanillaId: string) {
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
    
    if (error) throw error;
    return data;
  }

  // Actualizar planilla (para cambiar estado, por ejemplo)
  async updatePlanilla(planillaId: string, updateData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('planillas')
      .update(updateData)
      .eq('id', planillaId)
      .select();
    
    if (error) throw error;
    return data[0];
  }

  // Eliminar planilla y todos sus datos asociados
  async deletePlanilla(planillaId: string) {
    console.log(`🗑️ Iniciando eliminación de planilla: ${planillaId}`);
    const client = this.supabaseService.getClient();

    try {
      // 1. Eliminar conceptos de empleados en planilla (cascada automática por FK)
      console.log('🧹 Eliminando conceptos de empleados...');
      
      // 2. Eliminar empleados de planilla (cascada automática por FK)
      console.log('🧹 Eliminando empleados de planilla...');
      
      // 3. Eliminar la planilla principal
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

    } catch (error) {
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
    
    if (error) throw error;
    return {
      success: true,
      data: data || []
    };
  }

  async calcularPlanillaPersonalizada(planillaId: string, empleadosPersonalizados: any[]) {
    console.log(`🧮 Iniciando cálculo personalizado de planilla: ${planillaId}`);
    console.log(`👥 Empleados personalizados: ${empleadosPersonalizados.length}`);
    
    const client = this.supabaseService.getClient();

    // Obtener conceptos de planilla
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

    // Procesar cada empleado personalizado
    for (const empleado of empleadosPersonalizados) {
      console.log(`💰 Procesando empleado personalizado: ${empleado.nombres} ${empleado.apellidos} - Sueldo: S/ ${empleado.sueldo_base}`);
      
      const calculoEmpleado = this.calcularEmpleadoPersonalizado(empleado, conceptos);

      // Insertar empleado en planilla
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

      // Insertar conceptos detallados
      console.log(`📝 Insertando ${calculoEmpleado.conceptosDetalle.length} conceptos para empleado ${empleado.nombres || 'Sin nombre'}`);
      for (const concepto of calculoEmpleado.conceptosDetalle) {
        // Validar que el concepto tenga monto válido
        if (!concepto.monto || concepto.monto <= 0) {
          console.warn(`⚠️ Concepto con monto inválido omitido: ${concepto.observaciones} - Monto: ${concepto.monto}`);
          continue;
        }

        const { error: conceptoError } = await client
          .from('empleado_planilla_conceptos')
          .insert({
            id_empleado_planilla: empleadoPlanilla[0].id,
            id_concepto: concepto.id,
            monto: parseFloat(concepto.monto) || 0,
            observaciones: concepto.observaciones || ''
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

    // Actualizar totales de la planilla
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

  // Lógica de cálculo personalizada por empleado
  private calcularEmpleadoPersonalizado(empleado: any, conceptos: any[]) {
    const conceptosDetalle = [];
    let totalIngresos = 0;
    let totalDescuentos = 0;
    let totalAportes = 0;

    // Validar datos del empleado
    if (!empleado) {
      console.error('❌ Empleado no definido');
      throw new Error('Datos del empleado requeridos');
    }

    const sueldoBasico = parseFloat(empleado.sueldo_base) || 0;
    const diasTrabajados = parseInt(empleado.dias_trabajados) || 30;
    const horasExtras25 = parseFloat(empleado.horas_extras_25) || 0;
    const horasExtras35 = parseFloat(empleado.horas_extras_35) || 0;
    const tardanzasMinutos = parseInt(empleado.tardanzas_minutos) || 0;
    const faltas = parseInt(empleado.faltas) || 0;
    const bonosAdicionales = parseFloat(empleado.bonos_adicionales) || 0;

    console.log(`💰 Calculando empleado: ${empleado.nombres || 'Sin nombre'} ${empleado.apellidos || 'Sin apellido'} - Sueldo: S/ ${sueldoBasico}`);

    if (sueldoBasico <= 0) {
      console.warn(`⚠️ Sueldo básico inválido para empleado ${empleado.nombres || 'Sin nombre'}: ${sueldoBasico}`);
      // No procesar si no hay sueldo básico válido
      return {
        conceptosDetalle: [],
        totalIngresos: 0,
        totalDescuentos: 0,
        totalAportes: 0,
        netoPagar: 0
      };
    }

    // 1. INGRESOS

    // Sueldo básico (proporcional a días trabajados)
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

    // Horas extras 25%
    if (horasExtras25 > 0) {
      const conceptoHE25 = conceptos.find(c => c.codigo === '003');
      if (conceptoHE25) {
        const valorHora = sueldoBasico / (30 * 8); // 8 horas por día
        const montoHE25 = valorHora * horasExtras25 * 1.25;
        conceptosDetalle.push({
          id: conceptoHE25.id,
          monto: montoHE25,
          observaciones: `${horasExtras25} horas al 25%`
        });
        totalIngresos += montoHE25;
      }
    }

    // Horas extras 35%
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

    // Bonos adicionales
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

    // 2. DESCUENTOS

    // Descuento por tardanzas (valor por minuto)
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

    // Descuento por faltas
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

    // Descuentos automáticos (AFP/ONP) - usar datos del empleado si están disponibles
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
    } else if (regimenPensionario === 'ONP') {
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

  /**
   * Pagar planilla completa - Genera pagos individuales y emite evento contable
   */
  async pagarPlanillaCompleta(planillaId: string, metodoPago: 'efectivo' | 'transferencia') {
    try {
      console.log(`💰 [RRHH] Iniciando pago de planilla ${planillaId} por ${metodoPago}`);

      // 1. Obtener planilla con detalles
      const { data: planilla, error: planillaError } = await this.supabaseService.getClient()
        .from('planillas')
        .select(`
          *,
          empleado_planilla(
            *,
            empleados(*)
          )
        `)
        .eq('id', planillaId)
        .single();

      if (planillaError || !planilla) {
        throw new Error('Planilla no encontrada');
      }

      if (planilla.estado !== 'CALCULADA') {
        throw new Error('Solo se pueden pagar planillas en estado CALCULADA');
      }

      if (planilla.estado_pago === 'PAGADO') {
        throw new Error('Esta planilla ya ha sido pagada');
      }

      // 2. Crear registro de pago para cada empleado
      const pagosCreados = [];
      let totalPagado = 0;

      for (const empleadoPlanilla of planilla.empleado_planilla) {
        const montoPago = empleadoPlanilla.neto_pagar;
        if (montoPago <= 0) continue;

        const { data: pago, error: pagoError } = await this.supabaseService.getClient()
          .from('pagos_empleados')
          .insert({
            empleado_id: empleadoPlanilla.empleado_id,
            planilla_id: planillaId,
            periodo: planilla.periodo,
            sueldo_bruto: empleadoPlanilla.total_ingresos,
            descuentos: empleadoPlanilla.total_descuentos,
            monto_neto: montoPago,
            metodo_pago: metodoPago,
            estado: 'PROCESADO',
            fecha_pago: new Date().toISOString(),
            usuario_id: 'sistema'
          })
          .select()
          .single();

        if (pagoError) {
          console.error('❌ Error creando pago para empleado:', pagoError);
          continue;
        }

        pagosCreados.push(pago);
        totalPagado += montoPago;
      }

      // 3. Actualizar estado de la planilla
      const { error: updateError } = await this.supabaseService.getClient()
        .from('planillas')
        .update({
          estado_pago: 'PAGADO',
          fecha_pago: new Date().toISOString(),
          metodo_pago: metodoPago,
          total_pagado: totalPagado
        })
        .eq('id', planillaId);

      if (updateError) {
        throw updateError;
      }

      // 4. 🎯 EMITIR EVENTO PARA CONTABILIDAD
      console.log('🎯 [RRHH] Emitiendo evento de planilla pagada para contabilidad...');
      
      const eventoPago: PlanillaPagadaEvent = {
        planillaId: planillaId,
        periodo: planilla.periodo,
        totalPagado: totalPagado,
        metodoPago: metodoPago,
        cantidadEmpleados: pagosCreados.length,
        fechaPago: new Date().toISOString()
      };

      this.eventBus.emitPlanillaPagada(eventoPago);
      console.log('✅ [RRHH] Evento de planilla pagada emitido exitosamente');

      console.log(`✅ Planilla ${planilla.periodo} pagada exitosamente`);
      console.log(`   💰 Total pagado: S/ ${totalPagado}`);
      console.log(`   👥 Empleados pagados: ${pagosCreados.length}`);
      console.log(`   💳 Método: ${metodoPago}`);

      return {
        success: true,
        message: 'Planilla pagada exitosamente',
        data: {
          planillaId,
          periodo: planilla.periodo,
          totalPagado,
          empleadosPagados: pagosCreados.length,
          metodoPago,
          pagos: pagosCreados
        }
      };

    } catch (error) {
      console.error('❌ Error pagando planilla:', error);
      throw error;
    }
  }

  /**
   * Pagar empleados seleccionados de una planilla
   */
  async pagarEmpleadosSeleccionados(planillaId: string, pagoData: any) {
    try {
      console.log(`💰 [RRHH] Pagando empleados seleccionados de planilla ${planillaId}`);

      const { empleados_ids, metodo_pago, numero_operacion, observaciones } = pagoData;

      if (!empleados_ids || empleados_ids.length === 0) {
        throw new Error('Debe seleccionar al menos un empleado');
      }

      // Obtener detalles de empleados planilla
      const { data: empleadosPlanilla, error } = await this.supabaseService.getClient()
        .from('empleado_planilla')
        .select(`
          *,
          empleados!empleado_planilla_id_empleado_fkey(nombres, apellidos, numero_documento)
        `)
        .in('id', empleados_ids)
        .eq('id_planilla', planillaId);

      if (error) throw error;

      let totalPagado = 0;
      const empleadosPagados = [];

      // Procesar cada empleado
      for (const empleadoPlanilla of empleadosPlanilla) {
        const { error: updateError } = await this.supabaseService.getClient()
          .from('empleado_planilla')
          .update({
            estado_pago: 'pagado',
            fecha_pago: new Date().toISOString(),
            metodo_pago: metodo_pago,
            numero_operacion: numero_operacion || null,
            observaciones_pago: observaciones || null
          })
          .eq('id', empleadoPlanilla.id);

        if (updateError) {
          console.error('Error actualizando empleado planilla:', updateError);
          continue;
        }

        totalPagado += parseFloat(empleadoPlanilla.neto_pagar) || 0;
        empleadosPagados.push(empleadoPlanilla);
      }

      // Crear registro en historial de pagos
      const { error: historialError } = await this.supabaseService.getClient()
        .from('historial_pagos_planilla')
        .insert({
          planilla_id: planillaId,
          fecha: new Date().toISOString(),
          metodo: metodo_pago,
          monto: totalPagado,
          empleados_count: empleadosPagados.length,
          numero_operacion: numero_operacion || null,
          observaciones: observaciones || null
        });

      if (historialError) {
        console.warn('Error creando historial de pago:', historialError);
      }

      // 🎯 SINCRONIZAR CON TABLA RRHH_PAGOS para que aparezca en "Pagos & Comprobantes"
      const fechaPago = new Date().toISOString();
      
      // Obtener el período de la planilla para usar como referencia
      const { data: planillaInfo } = await this.supabaseService.getClient()
        .from('planillas')
        .select('periodo')
        .eq('id', planillaId)
        .single();
      
      const periodoDisplay = planillaInfo?.periodo || new Date().toISOString().substring(0, 7);
      
      console.log(`🔄 [RRHH] Sincronizando ${empleadosPagados.length} pagos con tabla rrhh_pagos...`);
      
      for (const empleadoPlanilla of empleadosPagados) {
        console.log(`📝 [RRHH] Insertando pago para empleado ${empleadoPlanilla.id_empleado}:`, {
          empleado_id: empleadoPlanilla.id_empleado,
          planilla_id: planillaId,
          periodo: periodoDisplay,
          monto_bruto: parseFloat(empleadoPlanilla.total_ingresos) || 0,
          descuentos: parseFloat(empleadoPlanilla.total_descuentos) || 0,
          monto_neto: parseFloat(empleadoPlanilla.neto_pagar) || 0,
          metodo_pago: metodo_pago
        });

        const { error: rrhhPagoError } = await this.supabaseService.getClient()
          .from('rrhh_pagos')
          .insert({
            empleado_id: empleadoPlanilla.id_empleado,
            planilla_id: planillaId,
            periodo: periodoDisplay, // Usar el período real de la planilla
            monto_bruto: parseFloat(empleadoPlanilla.total_ingresos) || 0,
            descuentos: parseFloat(empleadoPlanilla.total_descuentos) || 0,
            monto_neto: parseFloat(empleadoPlanilla.neto_pagar) || 0,
            metodo_pago: metodo_pago,
            estado: 'PROCESADO',
            fecha_pago: fechaPago,
            usuario_id: 'sistema'
          });

        if (rrhhPagoError) {
          console.warn('⚠️ Error sincronizando con rrhh_pagos:', rrhhPagoError);
          console.warn('⚠️ Detalles del error:', JSON.stringify(rrhhPagoError, null, 2));
        } else {
          console.log(`✅ Pago sincronizado para empleado ${empleadoPlanilla.id_empleado}`);
        }
      }
      
      console.log(`✅ [RRHH] Sincronización completada - ${empleadosPagados.length} registros en rrhh_pagos`)

      // 🎯 GENERAR ASIENTOS CONTABLES AUTOMÁTICAMENTE
      try {
        console.log('📊 [RRHH] Generando asientos contables automáticamente...');
        await this.generarAsientosContables(planillaId);
        console.log('✅ [RRHH] Asientos contables generados automáticamente');
      } catch (asientosError) {
        console.warn('⚠️ [RRHH] Error generando asientos automáticos (no crítico):', asientosError);
      }

      return {
        success: true,
        message: `Pago procesado para ${empleadosPagados.length} empleados`,
        data: {
          empleados_pagados: empleadosPagados.length,
          total_pagado: totalPagado,
          metodo_pago,
          asientos_generados: true
        }
      };

    } catch (error) {
      console.error('❌ Error pagando empleados seleccionados:', error);
      throw error;
    }
  }

  /**
   * Obtener UUID de cuenta por código
   */
  private async getCuentaIdPorCodigo(codigo: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('plan_cuentas')
        .select('id')
        .eq('codigo', codigo)
        .single();

      if (error || !data) {
        console.warn(`⚠️ No se encontró cuenta con código ${codigo}, usando código como ID`);
        return codigo; // Fallback al código si no existe la cuenta
      }

      return data.id;
    } catch (error) {
      console.warn(`⚠️ Error buscando cuenta ${codigo}:`, error);
      return codigo; // Fallback al código si hay error
    }
  }

  /**
   * Generar asientos contables para planilla
   */
  async generarAsientosContables(planillaId: string) {
    try {
      console.log(`📊 [RRHH] Generando asientos contables para planilla ${planillaId}`);

      // Obtener planilla con empleados
      const { data: planilla, error } = await this.supabaseService.getClient()
        .from('planillas')
        .select(`
          *,
          empleado_planilla(*)
        `)
        .eq('id', planillaId)
        .single();

      if (error || !planilla) {
        throw new Error('Planilla no encontrada');
      }

      // ✅ VERIFICAR ESTADO (aceptar tanto 'calculada' como 'borrador' si tiene empleados procesados)
      console.log(`🔍 [RRHH] Estado de la planilla: ${planilla.estado}`);
      console.log(`🔍 [RRHH] Empleados en planilla: ${planilla.empleado_planilla?.length || 0}`);
      
      if (planilla.estado !== 'calculada' && (!planilla.empleado_planilla || planilla.empleado_planilla.length === 0)) {
        throw new Error(`No se pueden generar asientos - Estado: ${planilla.estado}, Empleados: ${planilla.empleado_planilla?.length || 0}`);
      }

      // Calcular totales
      const totalIngresos = planilla.empleado_planilla.reduce(
        (sum, emp) => sum + (parseFloat(emp.total_ingresos) || 0), 0
      );
      const totalDescuentos = planilla.empleado_planilla.reduce(
        (sum, emp) => sum + (parseFloat(emp.total_descuentos) || 0), 0
      );
      const totalNeto = planilla.empleado_planilla.reduce(
        (sum, emp) => sum + (parseFloat(emp.neto_pagar) || 0), 0
      );

      // 🎯 CREAR ASIENTOS EN SISTEMA PRINCIPAL DIRECTAMENTE
      console.log('📝 [RRHH] Creando asientos contables en sistema principal...');
      
      // 1. Obtener IDs reales de las cuentas del plan contable
      const cuentaGastos = await this.getCuentaIdPorCodigo('621');
      const cuentaRemuneraciones = await this.getCuentaIdPorCodigo('411');
      const cuentaInstituciones = await this.getCuentaIdPorCodigo('403');

      console.log(`🔍 [RRHH] IDs de cuentas obtenidos:`);
      console.log(`   - Gastos (621): ${cuentaGastos}`);
      console.log(`   - Remuneraciones (411): ${cuentaRemuneraciones}`);
      console.log(`   - Instituciones (403): ${cuentaInstituciones}`);

      // 2. Crear cabecera del asiento en tabla principal
      const numeroAsiento = `RRHH-${planilla.periodo}-${Date.now()}`;
      const fechaAsiento = new Date().toISOString().split('T')[0]; // Solo fecha, no timestamp

      console.log(`📊 [RRHH] Creando cabecera del asiento: ${numeroAsiento}`);
      
      const { data: asientoCreado, error: asientoError } = await this.supabaseService.getClient()
        .from('asientos_contables')
        .insert({
          numero_asiento: numeroAsiento,
          fecha: fechaAsiento,
          concepto: `Planilla de sueldos ${planilla.periodo}`,
          referencia: `PLANILLA-${planillaId}`,
          total_debe: totalIngresos,
          total_haber: totalIngresos,
          estado: 'CONFIRMADO',
          usuario_id: null
        })
        .select()
        .single();

      if (asientoError) {
        console.error('❌ [RRHH] Error creando cabecera del asiento:', asientoError);
        throw new Error(`Error creando asiento contable: ${asientoError.message}`);
      }

      console.log('✅ [RRHH] Cabecera del asiento creada:', asientoCreado.id);

      // 3. Crear detalles del asiento
      const detallesAsiento = [
        {
          asiento_id: asientoCreado.id,
          cuenta_id: cuentaGastos,
          debe: totalIngresos,
          haber: 0,
          concepto: `Gasto planilla ${planilla.periodo}`
        },
        {
          asiento_id: asientoCreado.id,
          cuenta_id: cuentaRemuneraciones,
          debe: 0,
          haber: totalNeto,
          concepto: `Remuneraciones por pagar ${planilla.periodo}`
        },
        {
          asiento_id: asientoCreado.id,
          cuenta_id: cuentaInstituciones,
          debe: 0,
          haber: totalDescuentos,
          concepto: `Aportes planilla ${planilla.periodo}`
        }
      ];

      console.log(`📝 [RRHH] Insertando ${detallesAsiento.length} detalles del asiento...`);

      // 4. Insertar detalles
      const { error: detallesError } = await this.supabaseService.getClient()
        .from('detalle_asientos')
        .insert(detallesAsiento);

      if (detallesError) {
        console.error('❌ [RRHH] Error insertando detalles del asiento:', detallesError);
        // Eliminar cabecera si fallan los detalles
        await this.supabaseService.getClient()
          .from('asientos_contables')
          .delete()
          .eq('id', asientoCreado.id);
        throw new Error(`Error creando detalles del asiento: ${detallesError.message}`);
      }

      console.log('✅ [RRHH] Asiento contable completo creado exitosamente:', numeroAsiento);

      // Marcar planilla como con asientos generados
      try {
        await this.supabaseService.getClient()
          .from('planillas')
          .update({
            asientos_generados: true,
            fecha_asientos: new Date().toISOString()
          })
          .eq('id', planillaId);
        console.log('✅ Planilla marcada con asientos generados');
      } catch (updateError) {
        console.warn('⚠️ Error actualizando flag de asientos:', updateError);
      }

      return {
        success: true,
        message: 'Asientos contables generados correctamente en sistema principal',
        data: {
          numero_asiento: numeroAsiento,
          asiento_id: asientoCreado.id,
          registros: detallesAsiento.length,
          monto_total: totalIngresos,
          planilla_periodo: planilla.periodo,
          tablas_utilizadas: ['asientos_contables', 'detalle_asientos']
        }
      };

    } catch (error) {
      console.error('❌ Error generando asientos contables:', error);
      throw error;
    }
  }

  /**
   * Obtener historial de pagos de una planilla
   */
  async getHistorialPagos(planillaId: string) {
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('historial_pagos_planilla')
        .select('*')
        .eq('planilla_id', planillaId)
        .order('fecha', { ascending: false });

      if (error) {
        console.warn('Tabla historial_pagos_planilla no existe:', error);
        return { success: true, data: [] };
      }

      return {
        success: true,
        data: data || []
      };

    } catch (error) {
      console.error('❌ Error obteniendo historial de pagos:', error);
      return { success: true, data: [] };
    }
  }
} 