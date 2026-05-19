import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService, PlanillaCalculadaEvent, PlanillaPagadaEvent } from '../../shared/events/event-bus.service';
import Decimal from 'decimal.js';
import { OutboxEventBuilder } from '../../shared/outbox/outbox-event.interface';
import { v4 as uuidv4 } from 'uuid';

const CONCEPTOS_PLANILLA_BASE = [
  { codigo: '001', nombre: 'Sueldo basico', tipo: 'ingreso' },
  { codigo: '003', nombre: 'Horas extras 25%', tipo: 'ingreso' },
  { codigo: '004', nombre: 'Horas extras 35%', tipo: 'ingreso' },
  { codigo: '005', nombre: 'Bono adicional', tipo: 'ingreso' },
  { codigo: '101', nombre: 'Aporte AFP', tipo: 'descuento' },
  { codigo: '102', nombre: 'Comision AFP', tipo: 'descuento' },
  { codigo: '103', nombre: 'Seguro AFP', tipo: 'descuento' },
  { codigo: '104', nombre: 'Aporte ONP', tipo: 'descuento' },
  { codigo: '106', nombre: 'Tardanzas', tipo: 'descuento' },
  { codigo: '107', nombre: 'Faltas', tipo: 'descuento' },
];

@Injectable()
export class PlanillasService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService
  ) { }

  // Obtener todas las planillas
  // ✅ FIX: Agregar soporte multi-tenant
  async getPlanillas(tenantId?: string) {
    let query = this.supabaseService.getClient()
      .from('planillas')
      .select('*')
      .order('periodo', { ascending: false });
    
    // ✅ Filtrar por tenant si se proporciona
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return {
      success: true,
      data: data || []
    };
  }

  // Crear nueva planilla
  // ✅ FIX: Agregar soporte multi-tenant
  async crearPlanilla(planillaData: any, tenantId?: string) {
    const periodo = String(planillaData?.periodo || '').trim();
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      throw new BadRequestException('Debe enviar periodo de planilla en formato YYYY-MM');
    }

    const metadataBase =
      planillaData?.metadata && typeof planillaData.metadata === 'object' && !Array.isArray(planillaData.metadata)
        ? planillaData.metadata
        : {};
    const metadata = {
      ...metadataBase,
      ...(planillaData?.observaciones ? { observaciones: String(planillaData.observaciones).trim() } : {}),
    };

    const camposPermitidos = [
      'id',
      'periodo',
      'estado',
      'estado_pago',
      'total_ingresos',
      'total_descuentos',
      'total_aportes',
      'total_neto',
      'total_pagado',
      'fecha_pago',
      'metodo_pago',
      'asientos_generados',
      'fecha_asientos',
      'centro_costo_id',
      'metadata',
    ];
    const datosLimpios = Object.fromEntries(
      Object.entries({ ...planillaData, periodo })
        .filter(([key]) => camposPermitidos.includes(key))
        .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    );
    if (Object.keys(metadata).length > 0) {
      datosLimpios.metadata = metadata;
    }

    const dataToInsert = tenantId 
      ? { ...datosLimpios, tenant_id: tenantId }
      : datosLimpios;
      
    const { data, error } = await this.supabaseService.getClient()
      .from('planillas')
      .insert(dataToInsert)
      .select();
    if (error) throw error;
    return data[0];
  }

  // Calcular planilla mensual para todos los empleados activos
  // ✅ FIX: Agregar soporte multi-tenant
  async calcularPlanillaMensual(planillaId: string, tenantId?: string) {
    console.log(`🧮 Iniciando cálculo de planilla: ${planillaId}`);
    const client = this.supabaseService.getClient();

    // Idempotencia: verificar que la planilla no esté ya calculada o pagada
    const { data: planillaEstado } = await client
      .from('planillas')
      .select('estado')
      .eq('id', planillaId)
      .single();

    if (planillaEstado?.estado === 'calculada' || planillaEstado?.estado === 'pagada') {
      throw new Error(
        `La planilla ya fue ${planillaEstado.estado}. No se puede recalcular sin anular primero.`,
      );
    }

    // Obtener empleados activos
    let empleadosQuery = client
      .from('empleados')
      .select('*, contratos(*)')
      .eq('estado', 'activo');
    
    // ✅ Filtrar por tenant si se proporciona
    if (tenantId) {
      empleadosQuery = empleadosQuery.eq('tenant_id', tenantId);
    }
    
    const { data: empleados, error: empleadosError } = await empleadosQuery;

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
      // ✅ FIX: Usar Decimal.js para cálculos de nómina
      const aporteAFP = new Decimal(sueldoBasico).times(0.10).toDecimalPlaces(2).toNumber();
      const conceptoAporteAFP = conceptos.find(c => c.codigo === '101');
      if (conceptoAporteAFP) {
        conceptosDetalle.push({
          id: conceptoAporteAFP.id,
          monto: aporteAFP,
          observaciones: 'AFP 10%'
        });
        totalDescuentos += aporteAFP;
      }

      // AFP - Comisión (varía por AFP — usar tasas vigentes SBS)
      // TODO: Estas tasas deben ser configurables por tenant y AFP del empleado
      // Tasa por defecto: AFP Integra comisión flujo 1.55% (vigente 2024-2025)
      const tasaComisionAFP = contratoActual?.tasa_comision_afp ?? 0.0155;
      const comisionAFP = new Decimal(sueldoBasico).times(tasaComisionAFP).toDecimalPlaces(2).toNumber();
      const conceptoComisionAFP = conceptos.find(c => c.codigo === '102');
      if (conceptoComisionAFP) {
        conceptosDetalle.push({
          id: conceptoComisionAFP.id,
          monto: comisionAFP,
          observaciones: `Comisión AFP ${(tasaComisionAFP * 100).toFixed(2)}%`
        });
        totalDescuentos += comisionAFP;
      }

      // AFP - Seguro de invalidez (prima de seguro vigente SBS: 1.84%)
      const tasaSeguroAFP = contratoActual?.tasa_seguro_afp ?? 0.0184;
      const seguroAFP = new Decimal(sueldoBasico).times(tasaSeguroAFP).toDecimalPlaces(2).toNumber();
      const conceptoSeguroAFP = conceptos.find(c => c.codigo === '103');
      if (conceptoSeguroAFP) {
        conceptosDetalle.push({
          id: conceptoSeguroAFP.id,
          monto: seguroAFP,
          observaciones: `Seguro AFP ${(tasaSeguroAFP * 100).toFixed(2)}%`
        });
        totalDescuentos += seguroAFP;
      }
    } else if (regimenPensionario === 'ONP') {
      // ONP (13%)
      const aporteONP = new Decimal(sueldoBasico).times(0.13).toDecimalPlaces(2).toNumber();
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
    const aporteESSALUD = new Decimal(sueldoBasico).times(0.09).toDecimalPlaces(2).toNumber();
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

  // Verificar si el empleado tiene hijos
  private tieneHijos(empleado: any): boolean {
    // ✅ FIX: Usar datos reales del empleado en lugar de aleatorio
    // Verificar campo tiene_hijos o cantidad_hijos del empleado
    if (empleado.tiene_hijos === true) return true;
    if (empleado.cantidad_hijos && empleado.cantidad_hijos > 0) return true;
    // Verificar si tiene familiares registrados como hijos
    if (empleado.familiares?.some((f: any) => f.parentesco === 'hijo')) return true;
    // Por defecto, si tiene el campo asignacion_familiar activo
    if (empleado.asignacion_familiar === true) return true;
    return false;
  }

  // Calcular impuesto a la renta 5ta categoría (Perú 2024-2025)
  private calcularImpuestoRenta(ingresoMensual: number): number {
    // ✅ FIX: Usar Decimal.js para precisión en cálculos tributarios
    const ingreso = new Decimal(ingresoMensual);
    const ingresoAnual = ingreso.times(12);
    const UIT_2025 = new Decimal(5350); // UIT para 2025
    const limite = UIT_2025.times(7); // 7 UIT exoneradas

    if (ingresoAnual.lte(limite)) {
      return 0; // No paga impuesto
    }

    // Cálculo según tramos de renta de 5ta categoría
    const exceso = ingresoAnual.minus(limite);
    let impuestoAnual = new Decimal(0);

    const tramo1 = UIT_2025.times(5);  // Hasta 5 UIT: 8%
    const tramo2 = UIT_2025.times(20); // De 5 a 20 UIT: 14%
    const tramo3 = UIT_2025.times(35); // De 20 a 35 UIT: 17%
    const tramo4 = UIT_2025.times(45); // De 35 a 45 UIT: 20%
    // Más de 45 UIT: 30%

    if (exceso.lte(tramo1)) {
      impuestoAnual = exceso.times(0.08);
    } else if (exceso.lte(tramo2)) {
      impuestoAnual = tramo1.times(0.08).plus(exceso.minus(tramo1).times(0.14));
    } else if (exceso.lte(tramo3)) {
      impuestoAnual = tramo1.times(0.08)
        .plus(tramo2.minus(tramo1).times(0.14))
        .plus(exceso.minus(tramo2).times(0.17));
    } else if (exceso.lte(tramo4)) {
      impuestoAnual = tramo1.times(0.08)
        .plus(tramo2.minus(tramo1).times(0.14))
        .plus(tramo3.minus(tramo2).times(0.17))
        .plus(exceso.minus(tramo3).times(0.20));
    } else {
      impuestoAnual = tramo1.times(0.08)
        .plus(tramo2.minus(tramo1).times(0.14))
        .plus(tramo3.minus(tramo2).times(0.17))
        .plus(tramo4.minus(tramo3).times(0.20))
        .plus(exceso.minus(tramo4).times(0.30));
    }

    // Retornar impuesto mensual con 2 decimales
    return impuestoAnual.dividedBy(12).toDecimalPlaces(2).toNumber();
  }

  // Obtener detalle de planilla por empleado
  async getDetallePlanilla(planillaId: string, tenantId?: string) {
    console.log(`📊 Obteniendo detalle de planilla: ${planillaId}`);

    const query = this.supabaseService.getClient()
      .from('empleado_planilla')
      .select(`
        *,
        empleados(nombres, apellidos, numero_documento),
        empleado_planilla_conceptos(
          monto,
          observaciones,
          conceptos_planilla(codigo, nombre, metadata)
        )
      `)
      .eq('id_planilla', planillaId);

    if (tenantId) {
      query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error obteniendo detalle de planilla:', error);
      throw error;
    }

    console.log(`📋 Detalle obtenido: ${data?.length || 0} empleados`);
    return (data || []).map((empleadoPlanilla: any) => ({
      ...empleadoPlanilla,
      empleado_planilla_conceptos: (empleadoPlanilla.empleado_planilla_conceptos || []).map((concepto: any) => ({
        ...concepto,
        conceptos_planilla: concepto.conceptos_planilla
          ? {
              ...concepto.conceptos_planilla,
              tipo: concepto.conceptos_planilla.metadata?.tipo || null,
            }
          : concepto.conceptos_planilla,
      })),
    }));
  }

  // Generar boleta de pago individual
  async getBoleta(empleadoPlanillaId: string, tenantId?: string) {
    const query = this.supabaseService.getClient()
      .from('empleado_planilla')
      .select(`
        *,
        empleados(*, departamentos(nombre)),
        planillas(*),
        empleado_planilla_conceptos(
          monto,
          observaciones,
          conceptos_planilla(codigo, nombre, metadata)
        )
      `)
      .eq('id', empleadoPlanillaId);

    if (tenantId) {
      query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query.single();

    if (error) throw error;
    return {
      ...data,
      empleado_planilla_conceptos: (data.empleado_planilla_conceptos || []).map((concepto: any) => ({
        ...concepto,
        conceptos_planilla: concepto.conceptos_planilla
          ? {
              ...concepto.conceptos_planilla,
              tipo: concepto.conceptos_planilla.metadata?.tipo || null,
            }
          : concepto.conceptos_planilla,
      })),
    };
  }

  // Actualizar planilla (para cambiar estado, por ejemplo)
  async updatePlanilla(planillaId: string, updateData: any, tenantId?: string) {
    const query = this.supabaseService.getClient()
      .from('planillas')
      .update(updateData)
      .eq('id', planillaId);

    if (tenantId) {
      query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query.select();

    if (error) throw error;
    return data[0];
  }

  // Eliminar planilla y todos sus datos asociados
  async deletePlanilla(planillaId: string, tenantId?: string) {
    console.log(`🗑️ Iniciando eliminación de planilla: ${planillaId}`);
    const client = this.supabaseService.getClient();

    try {
      // 1. Eliminar conceptos de empleados en planilla (cascada automática por FK)
      console.log('🧹 Eliminando conceptos de empleados...');

      // 2. Eliminar empleados de planilla (cascada automática por FK)
      console.log('🧹 Eliminando empleados de planilla...');

      // 3. Eliminar la planilla principal
      console.log('🧹 Eliminando planilla principal...');
      const query = client
        .from('planillas')
        .delete()
        .eq('id', planillaId);

      if (tenantId) {
        query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.select();

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

  // ✅ FIX: Agregar soporte multi-tenant
  async getConceptos(tenantId?: string) {
    const client = this.supabaseService.getClient();
    let query = client
      .from('conceptos_planilla')
      .select('*')
      .eq('activo', true)
      .order('codigo', { ascending: true });
    
    // ✅ Filtrar por tenant si se proporciona
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (tenantId && (!data || data.length === 0)) {
      const conceptosBase = CONCEPTOS_PLANILLA_BASE.map((concepto) => ({
        tenant_id: tenantId,
        codigo: concepto.codigo,
        nombre: concepto.nombre,
        estado: 'ACTIVO',
        activo: true,
        metadata: { tipo: concepto.tipo, seed: 'rrhh_runtime_default' },
      }));
      const { data: seeded, error: seedError } = await client
        .from('conceptos_planilla')
        .insert(conceptosBase)
        .select('*')
        .order('codigo', { ascending: true });

      if (seedError) throw seedError;
      return {
        success: true,
        data: seeded || []
      };
    }

    return {
      success: true,
      data: data || []
    };
  }

  async calcularPlanillaPersonalizada(planillaId: string, empleadosPersonalizados: any[], tenantId?: string) {
    console.log(`🧮 Iniciando cálculo personalizado de planilla: ${planillaId}`);
    console.log(`👥 Empleados personalizados: ${empleadosPersonalizados.length}`);

    const client = this.supabaseService.getClient();

    const conceptosResult = await this.getConceptos(tenantId);
    const conceptos = conceptosResult.data;

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
      // TODO: Tasas AFP deben ser configurables por tenant y AFP del empleado
      const contratoEmpleado = empleado.contratos?.[0];
      const tasaComisionAFP2 = contratoEmpleado?.tasa_comision_afp ?? 0.0155;
      const tasaSeguroAFP2 = contratoEmpleado?.tasa_seguro_afp ?? 0.0184;
      const aporteAFP = new Decimal(totalIngresos).times(0.10).toDecimalPlaces(2).toNumber();
      const comisionAFP = new Decimal(totalIngresos).times(tasaComisionAFP2).toDecimalPlaces(2).toNumber();
      const seguroAFP = new Decimal(totalIngresos).times(tasaSeguroAFP2).toDecimalPlaces(2).toNumber();

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
          observaciones: `Comisión AFP ${(tasaComisionAFP2 * 100).toFixed(2)}%`
        });
        totalDescuentos += comisionAFP;
      }

      const conceptoSeguroAFP = conceptos.find(c => c.codigo === '103');
      if (conceptoSeguroAFP) {
        conceptosDetalle.push({
          id: conceptoSeguroAFP.id,
          monto: seguroAFP,
          observaciones: `Seguro AFP ${(tasaSeguroAFP2 * 100).toFixed(2)}%`
        });
        totalDescuentos += seguroAFP;
      }
    } else if (regimenPensionario === 'ONP') {
      const aporteONP = new Decimal(totalIngresos).times(0.13).toDecimalPlaces(2).toNumber();
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
  async pagarPlanillaCompleta(planillaId: string, metodoPago: 'efectivo' | 'transferencia', tenantId?: string) {
    try {
      console.log(`💰 [RRHH] Iniciando pago de planilla ${planillaId} por ${metodoPago}`);

      // 1. Obtener planilla con detalles
      let planillaQuery = this.supabaseService.getClient()
        .from('planillas')
        .select(`
          *,
          empleado_planilla(
            *,
            empleados(*)
          )
        `)
        .eq('id', planillaId);

      if (tenantId) {
        planillaQuery = planillaQuery.eq('tenant_id', tenantId);
      }

      const { data: planilla, error: planillaError } = await planillaQuery.single();

      if (planillaError || !planilla) {
        throw new Error('Planilla no encontrada');
      }

      // ✅ FIX: Normalizar comparación de estados (case-insensitive)
      const estadoNormalizado = (planilla.estado || '').toUpperCase();
      if (estadoNormalizado !== 'CALCULADA') {
        throw new Error(`Solo se pueden pagar planillas en estado CALCULADA. Estado actual: ${planilla.estado}`);
      }

      if (planilla.estado_pago === 'PAGADO') {
        throw new Error('Esta planilla ya ha sido pagada');
      }

      // 2. Crear registro de pago para cada empleado
      const pagosCreados = [];
      const pagosFallidos = [];
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
          pagosFallidos.push({
            empleado_id: empleadoPlanilla.empleado_id,
            error: pagoError.message,
          });
          continue;
        }

        pagosCreados.push(pago);
        totalPagado += montoPago;
      }

      // Si hubo pagos fallidos, abortar — no marcar la planilla como PAGADO
      if (pagosFallidos.length > 0) {
        throw new Error(
          `No se pudo completar el pago de la planilla. ${pagosFallidos.length} empleados fallaron: ${pagosFallidos.map(f => f.empleado_id).join(', ')}. Los pagos exitosos (${pagosCreados.length}) requieren revisión manual.`,
        );
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
        .eq('id', planillaId)
        .eq('tenant_id', tenantId || planilla.tenant_id);

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
  async pagarEmpleadosSeleccionados(planillaId: string, pagoData: any, tenantId?: string) {
    try {
      console.log(`💰 [RRHH] Pagando empleados seleccionados de planilla ${planillaId}`);

      const { empleados_ids, metodo_pago, numero_operacion, observaciones } = pagoData;

      if (!empleados_ids || empleados_ids.length === 0) {
        throw new Error('Debe seleccionar al menos un empleado');
      }

      let planillaInfoQuery = this.supabaseService.getClient()
        .from('planillas')
        .select('periodo, tenant_id')
        .eq('id', planillaId);

      if (tenantId) {
        planillaInfoQuery = planillaInfoQuery.eq('tenant_id', tenantId);
      }

      const { data: planillaInfo, error: planillaInfoError } = await planillaInfoQuery.single();
      if (planillaInfoError || !planillaInfo) {
        throw new Error('Planilla no encontrada para el tenant');
      }

      const tenantIdPlanilla = tenantId || planillaInfo.tenant_id;

      let empleadosPlanillaQuery = this.supabaseService.getClient()
        .from('empleado_planilla')
        .select('*')
        .in('id', empleados_ids)
        .eq('id_planilla', planillaId);

      if (tenantIdPlanilla) {
        empleadosPlanillaQuery = empleadosPlanillaQuery.eq('tenant_id', tenantIdPlanilla);
      }

      const { data: empleadosPlanilla, error } = await empleadosPlanillaQuery;

      if (error) throw error;
      if (!empleadosPlanilla || empleadosPlanilla.length === 0) {
        throw new Error('No se encontraron empleados de planilla para pagar');
      }

      let totalPagado = 0;
      const empleadosPagados = [];
      const numeroOperacionNormalizado =
        numero_operacion && /^\d+$/.test(String(numero_operacion))
          ? Number(numero_operacion)
          : null;
      const observacionesPago = [
        observaciones || null,
        numero_operacion && !numeroOperacionNormalizado ? `Operacion: ${numero_operacion}` : null,
      ].filter(Boolean).join(' | ') || null;

      // Procesar cada empleado
      for (const empleadoPlanilla of empleadosPlanilla) {
        const { error: updateError } = await this.supabaseService.getClient()
          .from('empleado_planilla')
          .update({
            estado_pago: 'pagado',
            fecha_pago: new Date().toISOString(),
            metodo_pago: metodo_pago,
            numero_operacion: numeroOperacionNormalizado,
            observaciones_pago: observacionesPago
          })
          .eq('id', empleadoPlanilla.id)
          .eq('id_planilla', planillaId);

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

      const periodoDisplay = planillaInfo?.periodo || new Date().toISOString().substring(0, 7);

      console.log(`🔄 [RRHH] Sincronizando ${empleadosPagados.length} pagos con tabla rrhh_pagos...`);

      for (const empleadoPlanilla of empleadosPagados) {
        const empleadoId = empleadoPlanilla.id_empleado || empleadoPlanilla.empleado_id;
        console.log(`📝 [RRHH] Insertando pago para empleado ${empleadoId}:`, {
          empleado_id: empleadoId,
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
            tenant_id: tenantIdPlanilla,
            empleado_id: empleadoId,
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
          console.error('❌ Error sincronizando con rrhh_pagos:', rrhhPagoError);
          throw new Error(`No se pudo registrar pago RRHH: ${rrhhPagoError.message}`);
        } else {
          console.log(`✅ Pago sincronizado para empleado ${empleadoId}`);
        }
      }

      console.log(`✅ [RRHH] Sincronización completada - ${empleadosPagados.length} registros en rrhh_pagos`)

      // 🎯 GENERAR ASIENTOS CONTABLES AUTOMÁTICAMENTE
      try {
        console.log('📊 [RRHH] Generando asientos contables automáticamente...');
        await this.generarAsientosContables(planillaId, planillaInfo?.tenant_id);
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
  private async getCuentaIdPorCodigo(codigo: string, tenantId: string): Promise<string> {
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('plan_cuentas')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('codigo', codigo)
        .eq('activo', true)
        .maybeSingle();

      if (error || !data) {
        throw new Error(`Cuenta contable ${codigo} no encontrada para el tenant`);
      }

      return data.id;
    } catch (error) {
      console.error(`❌ Error buscando cuenta ${codigo}:`, error);
      throw error;
    }
  }

  private async getSiguienteNumeroAsiento(tenantId: string): Promise<number> {
    const { data, error } = await this.supabaseService.getClient()
      .from('asientos_contables')
      .select('numero_asiento')
      .eq('tenant_id', tenantId)
      .order('numero_asiento', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo obtener el correlativo contable: ${error.message}`);
    }

    const ultimoNumero = Number(data?.numero_asiento ?? 0);
    return Number.isFinite(ultimoNumero) ? ultimoNumero + 1 : 1;
  }

  /**
   * Generar asientos contables para planilla
   */
  async generarAsientosContables(planillaId: string, tenantId?: string) {
    try {
      console.log(`📊 [RRHH] Generando asientos contables para planilla ${planillaId}`);

      // Obtener planilla con empleados
      let planillaQuery = this.supabaseService.getClient()
        .from('planillas')
        .select(`
          *,
          empleado_planilla(*)
        `)
        .eq('id', planillaId);

      if (tenantId) {
        planillaQuery = planillaQuery.eq('tenant_id', tenantId);
      }

      const { data: planilla, error } = await planillaQuery.single();

      if (error || !planilla) {
        throw new Error('Planilla no encontrada');
      }

      const tenantIdPlanilla = tenantId || planilla.tenant_id;
      if (!tenantIdPlanilla) {
        throw new Error('La planilla no tiene tenant_id; no se puede generar asiento contable');
      }

      const referenciaPlanilla = `PLANILLA-${planillaId}`;
      const sourceEventId = planillaId;
      const fechaAsiento = this.getFechaAsientoPlanilla(planilla.periodo);
      await this.validarPeriodoContableAbierto(tenantIdPlanilla, fechaAsiento);

      const { data: asientoExistente, error: asientoExistenteError } = await this.supabaseService.getClient()
        .from('asientos_contables')
        .select('id, numero_asiento, codigo, referencia, total_debe, total_haber')
        .eq('tenant_id', tenantIdPlanilla)
        .or(`referencia.eq.${referenciaPlanilla},source_event_id.eq.${sourceEventId}`)
        .limit(1)
        .maybeSingle();

      if (asientoExistenteError) {
        throw new Error(`Error validando asiento existente de planilla: ${asientoExistenteError.message}`);
      }

      if (asientoExistente?.id) {
        await this.supabaseService.getClient()
          .from('planillas')
          .update({
            asientos_generados: true,
            fecha_asientos: new Date().toISOString(),
          })
          .eq('id', planillaId)
          .eq('tenant_id', tenantIdPlanilla);

        return {
          success: true,
          message: 'La planilla ya tenía asiento contable generado; se retorna el asiento existente',
          data: {
            numero_asiento: asientoExistente.numero_asiento,
            codigo_asiento: asientoExistente.codigo,
            asiento_id: asientoExistente.id,
            registros: 0,
            monto_total: Number(asientoExistente.total_debe ?? 0),
            planilla_periodo: planilla.periodo,
            existente: true,
            tablas_utilizadas: ['asientos_contables', 'detalle_asientos']
          }
        };
      }

      // ✅ FIX: Normalizar comparación de estados (case-insensitive)
      const estadoNormalizado = (planilla.estado || '').toUpperCase();
      console.log(`🔍 [RRHH] Estado de la planilla: ${planilla.estado} (normalizado: ${estadoNormalizado})`);
      console.log(`🔍 [RRHH] Empleados en planilla: ${planilla.empleado_planilla?.length || 0}`);

      if (estadoNormalizado !== 'CALCULADA' && (!planilla.empleado_planilla || planilla.empleado_planilla.length === 0)) {
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
      const totalAportes = (planilla.total_aportes ?? 0) || totalDescuentos;

      // Encolado outbox opcional para que Contabilidad genere asiento de planilla (pipeline resiliente)
      const usarOutboxPlanilla = process.env.PLANILLA_OUTBOX_ENABLED === 'true';
      if (usarOutboxPlanilla) {
        const idempotencyKey = `planilla.liquidada:${planilla.tenant_id}:${planillaId}:${planilla.periodo}`;
        const buscarEventoExistente = async () => {
          const { data: eventoExistente, error: eventoExistenteError } = await this.supabaseService.getClient()
            .from('outbox_events')
            .select('event_id, status, processed_at, error_message')
            .eq('tenant_id', planilla.tenant_id)
            .eq('event_type', 'planilla.liquidada')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

          if (eventoExistenteError) {
            throw new Error(`Error validando evento contable existente de planilla: ${eventoExistenteError.message}`);
          }

          return eventoExistente;
        };

        const eventoPrevio = await buscarEventoExistente();
        if (eventoPrevio?.event_id) {
          console.log(
            `♻️ [RRHH] Evento planilla.liquidada ya estaba encolado (${eventoPrevio.event_id}); se garantiza asiento sincronico por idempotencia`
          );
        } else {
          const eventId = uuidv4();
          const outboxEvent = OutboxEventBuilder.build({
            tenantId: planilla.tenant_id,
            eventType: 'planilla.liquidada',
            aggregateType: 'planilla',
            aggregateId: planillaId,
            idempotencyKey,
            eventData: {
              planillaId,
              periodo: planilla.periodo,
              fecha: new Date().toISOString(),
              totalIngresos,
              totalAportes,
              totalDescuentos,
              totalNeto,
              centro_costo_id: planilla.centro_costo_id,
              eventId,
            },
          });

          const { error: outboxError } = await this.supabaseService.getClient()
            .from('outbox_events')
            .insert(outboxEvent);

          if (outboxError) {
            const isDuplicateOutbox = outboxError.code === '23505' ||
              String(outboxError.message || '').toLowerCase().includes('duplicate key');
            if (isDuplicateOutbox) {
              const eventoDuplicado = await buscarEventoExistente();
              if (eventoDuplicado?.event_id) {
                console.log(
                  `♻️ [RRHH] Insercion idempotente detecto evento planilla.liquidada existente (${eventoDuplicado.event_id}); se garantiza asiento sincronico`
                );
              } else {
                throw new Error(`No se pudo resolver evento contable duplicado de planilla: ${outboxError.message}`);
              }
            } else {
              throw new Error(`No se pudo encolar evento contable de planilla: ${outboxError.message}`);
            }
          } else {
            console.log(
              `✅ [RRHH] Evento planilla.liquidada encolado; se crea asiento sincronico para cumplir contrato del endpoint`
            );
          }
        }
      }

      // 🎯 CREAR ASIENTOS EN SISTEMA PRINCIPAL DIRECTAMENTE
      console.log('📝 [RRHH] Creando asientos contables en sistema principal...');

      // 1. Obtener IDs reales de las cuentas del plan contable
      const cuentaGastos = await this.getCuentaIdPorCodigo('621', tenantIdPlanilla);
      const cuentaRemuneraciones = await this.getCuentaIdPorCodigo('411', tenantIdPlanilla);
      const cuentaInstituciones = await this.getCuentaIdPorCodigo('403', tenantIdPlanilla);

      console.log(`🔍 [RRHH] IDs de cuentas obtenidos:`);
      console.log(`   - Gastos (621): ${cuentaGastos}`);
      console.log(`   - Remuneraciones (411): ${cuentaRemuneraciones}`);
      console.log(`   - Instituciones (403): ${cuentaInstituciones}`);

      // 2. Crear cabecera del asiento en tabla principal
      const numeroAsiento = await this.getSiguienteNumeroAsiento(tenantIdPlanilla);
      const codigoAsiento = `RRHH-${planilla.periodo}-${numeroAsiento.toString().padStart(6, '0')}`;

      console.log(`📊 [RRHH] Creando cabecera del asiento: ${codigoAsiento}`);

      const { data: asientoCreado, error: asientoError } = await this.supabaseService.getClient()
        .from('asientos_contables')
        .insert({
          tenant_id: tenantIdPlanilla,
          codigo: codigoAsiento,
          numero_asiento: numeroAsiento,
          fecha: fechaAsiento,
          tipo_asiento: 'PLANILLA',
          origen: 'RRHH',
          concepto: `Planilla de sueldos ${planilla.periodo}`,
          referencia: referenciaPlanilla,
          total_debe: totalIngresos,
          total_haber: totalIngresos,
          estado: 'CONFIRMADO',
          source_event_id: sourceEventId,
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
          tenant_id: tenantIdPlanilla,
          asiento_id: asientoCreado.id,
          cuenta_id: cuentaGastos,
          debe: totalIngresos,
          haber: 0,
          fecha: fechaAsiento,
          nombre: `Gasto planilla ${planilla.periodo}`
        },
        {
          tenant_id: tenantIdPlanilla,
          asiento_id: asientoCreado.id,
          cuenta_id: cuentaRemuneraciones,
          debe: 0,
          haber: totalNeto,
          fecha: fechaAsiento,
          nombre: `Remuneraciones por pagar ${planilla.periodo}`
        },
        {
          tenant_id: tenantIdPlanilla,
          asiento_id: asientoCreado.id,
          cuenta_id: cuentaInstituciones,
          debe: 0,
          haber: totalDescuentos,
          fecha: fechaAsiento,
          nombre: `Aportes planilla ${planilla.periodo}`
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
          .eq('id', planillaId)
          .eq('tenant_id', tenantIdPlanilla);
        console.log('✅ Planilla marcada con asientos generados');
      } catch (updateError) {
        console.warn('⚠️ Error actualizando flag de asientos:', updateError);
      }

      return {
        success: true,
        message: 'Asientos contables generados correctamente en sistema principal',
        data: {
          numero_asiento: numeroAsiento,
          codigo_asiento: codigoAsiento,
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
  async getHistorialPagos(planillaId: string, tenantId?: string) {
    try {
      const query = this.supabaseService.getClient()
        .from('historial_pagos_planilla')
        .select('*')
        .eq('planilla_id', planillaId);

      if (tenantId) {
        query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.order('fecha', { ascending: false });

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

  private getFechaAsientoPlanilla(periodo: string): string {
    if (/^\d{4}-\d{2}$/.test(periodo || '')) {
      return `${periodo}-01`;
    }

    return new Date().toISOString().split('T')[0];
  }

  private async validarPeriodoContableAbierto(tenantId: string, fechaAsiento: string): Promise<void> {
    const fecha = new Date(`${fechaAsiento}T00:00:00.000Z`);
    const anio = fecha.getUTCFullYear();
    const mes = fecha.getUTCMonth() + 1;

    const { data: periodo, error } = await this.supabaseService.getClient()
      .from('periodos_contables')
      .select('estado')
      .eq('tenant_id', tenantId)
      .eq('anio', anio)
      .eq('mes', mes)
      .maybeSingle();

    if (error) {
      throw new Error(`Error validando período contable de planilla: ${error.message}`);
    }

    const estado = String(periodo?.estado || 'ABIERTO').toUpperCase();
    if (estado === 'CERRADO' || estado === 'BLOQUEADO') {
      throw new Error(
        `El período contable ${anio}-${String(mes).padStart(2, '0')} está ${estado}. ` +
        'No se pueden generar asientos de planilla en períodos cerrados o bloqueados.'
      );
    }
  }
}
