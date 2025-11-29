import { Injectable, Logger, Optional } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';

@Injectable()
export class RrhhService {
  private readonly logger = new Logger(RrhhService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    @Optional() private readonly eventBus?: EventBusService,
  ) { }

  // ===== EMPLEADOS =====
  async getEmpleados(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleados')
      .select(`
        *,
        departamentos(nombre),
        contratos(*),
        empleado_horarios(
          id,
          horarios_trabajo(*)
        )
      `)
      .eq('tenant_id', currentTenantId); // ✅ Filtro de tenant

    if (error) throw error;

    return {
      success: true,
      data: data || [],
    };
  }

  async getDepartamentos(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('departamentos')
      .select('*')
      .eq('tenant_id', currentTenantId); // ✅ Filtro de tenant

    if (error) throw error;
    return data;
  }

  async createEmpleado(empleadoData: any, tenantId?: string) {
    // ✅ MULTI-TENANT: Agregar tenant_id al crear
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleados')
      .insert({
        ...empleadoData,
        tenant_id: currentTenantId, // ✅ Incluir tenant
      })
      .select();

    if (error) throw error;
    return data?.[0];
  }

  async updateEmpleado(id: string, empleadoData: any, tenantId?: string) {
    // ✅ MULTI-TENANT: Validar tenant al actualizar
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleados')
      .update(empleadoData)
      .eq('id', id)
      .eq('tenant_id', currentTenantId) // ✅ Validar tenant
      .select();

    if (error) throw error;
    return data?.[0];
  }

  async deleteEmpleado(id: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Validar tenant al eliminar
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { error } = await this.supabaseService
      .getClient()
      .from('empleados')
      .delete()
      .eq('id', id)
      .eq('tenant_id', currentTenantId); // ✅ Validar tenant

    if (error) throw error;
    return { success: true, message: 'Empleado eliminado exitosamente' };
  }

  async createDepartamento(departamentoData: any, tenantId?: string) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('departamentos')
      .insert({ ...departamentoData, tenant_id: currentTenantId })
      .select();

    if (error) throw error;
    return data?.[0];
  }

  // ===== RECLUTAMIENTO Y VACANTES =====
  async getVacantes(tenantId?: string) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('vacantes')
      .select(`
        *,
        departamentos(nombre),
        candidatos(count)
      `)
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async createVacante(vacanteData: any, tenantId?: string) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('vacantes')
      .insert({ ...vacanteData, tenant_id: currentTenantId })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  async getCandidatos(vacanteId?: string, tenantId?: string) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    let query = this.supabaseService
      .getClient()
      .from('candidatos')
      .select(`
        *,
        vacantes(titulo, puesto_solicitado)
      `)
      .eq('tenant_id', currentTenantId)
      .order('fecha_postulacion', { ascending: false });

    if (vacanteId) {
      query = query.eq('id_vacante', vacanteId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, data: data || [] };
  }

  async createCandidato(candidatoData: any, tenantId?: string) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('candidatos')
      .insert({ ...candidatoData, tenant_id: currentTenantId })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  async updateEstadoCandidato(
    candidatoId: string,
    estado: string,
    observaciones?: string,
    tenantId?: string,
  ) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('candidatos')
      .update({ estado, observaciones })
      .eq('id', candidatoId)
      .eq('tenant_id', currentTenantId)
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  // ===== ASISTENCIA Y TIEMPO =====
  async registrarAsistencia(
    empleadoId: string,
    tipo: 'entrada' | 'salida',
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const hoy = new Date().toISOString().split('T')[0];
    const horaActual = new Date().toTimeString().split(' ')[0];

    // Buscar registro existente del día
    const { data: registroExistente } = await this.supabaseService
      .getClient()
      .from('asistencia')
      .select('*')
      .eq('id_empleado', empleadoId)
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .eq('fecha', hoy)
      .single();

    if (tipo === 'entrada') {
      if (registroExistente) {
        throw new Error('Ya se registró entrada para este día');
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .from('asistencia')
        .insert({
          id_empleado: empleadoId,
          tenant_id: currentTenantId, // ✅ Incluir tenant
          fecha: hoy,
          hora_entrada: horaActual,
          estado: 'presente',
        })
        .select();

      if (error) throw error;

      // 🎯 EMITIR EVENTO DE ASISTENCIA
      this.eventBus.emitEmpleadoAsistencia({
        empleadoId: empleadoId,
        fecha: hoy,
        horaEntrada: horaActual,
        horasExtras: 0,
        tipoTurno: 'REGULAR',
        estado: 'PRESENTE',
        requierePlanilla: true,
      });

      this.logger.log('✅ [RRHH] Evento de entrada de empleado emitido');

      return { success: true, data: data?.[0], message: 'Entrada registrada' };
    } else {
      if (!registroExistente || registroExistente.hora_salida) {
        throw new Error(
          'No se puede registrar salida sin entrada o ya se registró salida',
        );
      }

      // Calcular horas trabajadas
      const entrada = new Date(`${hoy}T${registroExistente.hora_entrada}`);
      const salida = new Date(`${hoy}T${horaActual}`);
      const horasTrabajadas =
        (salida.getTime() - entrada.getTime()) / (1000 * 60 * 60);

      const { data, error } = await this.supabaseService
        .getClient()
        .from('asistencia')
        .update({
          hora_salida: horaActual,
          horas_trabajadas: horasTrabajadas,
        })
        .eq('id', registroExistente.id)
        .eq('tenant_id', currentTenantId) // ✅ Validar tenant
        .select();

      if (error) throw error;

      // 🎯 EMITIR EVENTO DE ASISTENCIA COMPLETADA
      const horasExtras = Math.max(0, horasTrabajadas - 8); // Considerar extras si excede 8 horas

      this.eventBus.emitEmpleadoAsistencia({
        empleadoId: empleadoId,
        fecha: hoy,
        horaEntrada: registroExistente.hora_entrada,
        horaSalida: horaActual,
        horasExtras: horasExtras,
        tipoTurno: 'REGULAR',
        estado: 'PRESENTE',
        requierePlanilla: true,
      });

      this.logger.log(
        `✅ [RRHH] Evento de salida emitido - ${horasTrabajadas.toFixed(
          2,
        )} horas trabajadas`,
      );

      return { success: true, data: data?.[0], message: 'Salida registrada' };
    }
  }

  async getAsistencia(
    empleadoId?: string,
    fechaDesde?: string,
    fechaHasta?: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    let query = this.supabaseService
      .getClient()
      .from('asistencia')
      .select(
        `
        *,
        empleados(nombres, apellidos, numero_documento)
      `,
      )
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .order('fecha', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);
    if (fechaDesde) query = query.gte('fecha', fechaDesde);
    if (fechaHasta) query = query.lte('fecha', fechaHasta);

    const { data, error } = await query.limit(100);
    if (error) throw error;

    return { success: true, data: data || [] };
  }

  // ===== SOLICITUDES (Vacaciones, Licencias) =====
  async getSolicitudes(
    empleadoId?: string,
    estado?: string,
    tenantId?: string,
  ) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    let query = this.supabaseService
      .getClient()
      .from('solicitudes')
      .select(
        `
        *,
        empleados(nombres, apellidos, numero_documento)
      `,
      )
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);
    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, data: data || [] };
  }

  async createSolicitud(solicitudData: any, tenantId?: string) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('solicitudes')
      .insert({
        ...solicitudData,
        tenant_id: currentTenantId, // ✅ Incluir tenant
      })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  async aprobarSolicitud(
    solicitudId: string,
    aprobadoPor: string,
    observaciones?: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('solicitudes')
      .update({
        estado: 'aprobada',
        aprobado_por: aprobadoPor,
        fecha_aprobacion: new Date().toISOString(),
        observaciones_aprobacion: observaciones,
      })
      .eq('id', solicitudId)
      .eq('tenant_id', currentTenantId) // ✅ Validar tenant
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  async rechazarSolicitud(
    solicitudId: string,
    aprobadoPor: string,
    observaciones: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('solicitudes')
      .update({
        estado: 'rechazada',
        aprobado_por: aprobadoPor,
        fecha_aprobacion: new Date().toISOString(),
        observaciones_aprobacion: observaciones,
      })
      .eq('id', solicitudId)
      .eq('tenant_id', currentTenantId) // ✅ Validar tenant
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  // ===== BENEFICIOS =====
  async getBeneficios(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('beneficios')
      .select('*')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .eq('activo', true)
      .order('nombre');

    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async getBeneficiosEmpleado(empleadoId: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleado_beneficios')
      .select(
        `
        *,
        beneficios(*)
      `,
      )
      .eq('id_empleado', empleadoId)
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .eq('estado', 'activo');

    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async asignarBeneficio(
    empleadoId: string,
    beneficioId: string,
    fechaInicio: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleado_beneficios')
      .insert({
        id_empleado: empleadoId,
        id_beneficio: beneficioId,
        fecha_inicio: fechaInicio,
        tenant_id: currentTenantId, // ✅ Incluir tenant
        estado: 'activo',
      })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  // ===== EVALUACIONES DE DESEMPEÑO =====
  async getEvaluaciones(empleadoId?: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    let query = this.supabaseService
      .getClient()
      .from('evaluaciones')
      .select(
        `
        *,
        empleados(nombres, apellidos, numero_documento, puesto)
      `,
      )
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .order('fecha_evaluacion', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, data: data || [] };
  }

  async createEvaluacion(evaluacionData: any, tenantId?: string) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('evaluaciones')
      .insert({
        ...evaluacionData,
        tenant_id: currentTenantId, // ✅ Incluir tenant
      })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  async updateEvaluacion(
    id: string,
    evaluacionData: any,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('evaluaciones')
      .update(evaluacionData)
      .eq('id', id)
      .eq('tenant_id', currentTenantId) // ✅ Validar tenant
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  // ===== CAPACITACIONES =====
  async getCapacitaciones(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('capacitaciones')
      .select('*')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .eq('activo', true)
      .order('fecha_inicio', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async getCapacitacionesEmpleado(empleadoId: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleado_capacitaciones')
      .select(
        `
        *,
        capacitaciones(*)
      `,
      )
      .eq('id_empleado', empleadoId)
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .order('fecha_inscripcion', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async inscribirCapacitacion(
    empleadoId: string,
    capacitacionId: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleado_capacitaciones')
      .insert({
        id_empleado: empleadoId,
        id_capacitacion: capacitacionId,
        tenant_id: currentTenantId, // ✅ Incluir tenant
        estado: 'inscrito',
      })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  // ===== LIQUIDACIONES =====
  async calcularLiquidacion(
    empleadoId: string,
    motivoTerminacion: string,
    fechaTerminacion: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    // Obtener datos del empleado y contrato
    const { data: empleado, error: empError } =
      await this.supabaseService.getClient()
        .from('empleados')
        .select(
          `
        *,
        contratos!inner(*)
      `,
        )
        .eq('id', empleadoId)
        .eq('tenant_id', currentTenantId)
        .eq('contratos.estado', 'vigente')
        .single();

    if (empError || !empleado) {
      throw new Error('Empleado no encontrado');
    }

    const contrato = empleado.contratos[0];
    const sueldoMensual = parseFloat(contrato.sueldo_bruto);

    // Calcular días trabajados en el año
    const fechaIngreso = new Date(empleado.fecha_ingreso);
    const fechaTerminacionDate = new Date(fechaTerminacion);
    const diasTrabajados = Math.floor(
      (fechaTerminacionDate.getTime() - fechaIngreso.getTime()) /
      (1000 * 60 * 60 * 24),
    );

    // Calcular beneficios
    const vacacionesUsadas = await this.calcularVacacionesUsadas(
      empleadoId,
      fechaTerminacionDate.getFullYear(),
      currentTenantId,
    );

    const vacacionesPendientes = Math.max(0, 30 - vacacionesUsadas);
    const diasCts = this.calcularDiasCts(fechaIngreso, fechaTerminacionDate);
    const montoCts = (sueldoMensual / 30) * diasCts;

    let indemnizacion = 0;
    if (motivoTerminacion === 'despido') {
      // 1.5 sueldos por año trabajado
      const añosTrabajados = diasTrabajados / 365;
      indemnizacion = sueldoMensual * 1.5 * añosTrabajados;
    }

    const totalLiquidacion =
      montoCts + indemnizacion + (sueldoMensual / 30) * vacacionesPendientes;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('liquidaciones')
      .insert({
        id_empleado: empleadoId,
        motivo_terminacion: motivoTerminacion,
        fecha_terminacion: fechaTerminacion,
        ultimo_dia_trabajado: fechaTerminacion,
        vacaciones_pendientes: vacacionesPendientes,
        dias_cts: diasCts,
        monto_cts: montoCts,
        indemnizacion: indemnizacion,
        total_liquidacion: totalLiquidacion,
        estado: 'calculada',
        tenant_id: currentTenantId, // ✅ Incluir tenant
      })
      .select();

    if (error) throw error;

    // Actualizar estado del empleado
    await this.supabaseService
      .getClient()
      .from('empleados')
      .update({ estado: 'inactivo' })
      .eq('id', empleadoId)
      .eq('tenant_id', currentTenantId);

    // Terminar contrato
    await this.supabaseService
      .getClient()
      .from('contratos')
      .update({ estado: 'terminado', fecha_fin: fechaTerminacion })
      .eq('id_empleado', empleadoId)
      .eq('tenant_id', currentTenantId)
      .eq('estado', 'vigente');

    return { success: true, data: data?.[0] };
  }

  private async calcularVacacionesUsadas(
    empleadoId: string,
    año: number,
    tenantId: string,
  ): Promise<number> {
    // Calcular vacaciones aprobadas en el año (solicitudes estado=aprobado)
    const startDate = `${año}-01-01`;
    const endDate = `${año}-12-31`;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('solicitudes')
      .select('dias')
      .eq('id_empleado', empleadoId)
      .eq('estado', 'aprobada')
      .gte('fecha_inicio', startDate)
      .lte('fecha_fin', endDate)
      .eq('tenant_id', tenantId);

    if (error) {
      this.logger.warn(
        `Error calculando vacaciones usadas: ${error.message}`,
      );
      return 0;
    }

    return (data || []).reduce(
      (sum: number, s: any) => sum + Number(s.dias || 0),
      0,
    );
  }

  private calcularDiasCts(
    fechaIngreso: Date,
    fechaTerminacion: Date,
  ): number {
    const mesesTrabajados =
      (fechaTerminacion.getFullYear() - fechaIngreso.getFullYear()) * 12 +
      (fechaTerminacion.getMonth() - fechaIngreso.getMonth());

    return Math.floor(mesesTrabajados * 2.5); // 30 días por año = 2.5 días por mes
  }

  // ===== HORARIOS =====
  async getHorarios(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('horarios_trabajo')
      .select('*')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .eq('activo', true)
      .order('nombre');

    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async asignarHorario(
    empleadoId: string,
    horarioId: string,
    fechaInicio: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    // Desactivar horario anterior
    await this.supabaseService
      .getClient()
      .from('empleado_horarios')
      .update({ activo: false, fecha_fin: fechaInicio })
      .eq('id_empleado', empleadoId)
      .eq('tenant_id', currentTenantId) // ✅ Validar tenant
      .eq('activo', true);

    // Asignar nuevo horario
    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleado_horarios')
      .insert({
        id_empleado: empleadoId,
        id_horario: horarioId,
        fecha_inicio: fechaInicio,
        tenant_id: currentTenantId, // ✅ Incluir tenant
        activo: true,
      })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  // ===== EXPEDIENTE =====
  async getExpediente(empleadoId: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('expediente_documentos')
      .select('*')
      .eq('id_empleado', empleadoId)
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .eq('activo', true)
      .order('fecha_subida', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async subirDocumento(
    empleadoId: string,
    tipoDocumento: string,
    nombreArchivo: string,
    archivoUrl: string,
    subidoPor: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('expediente_documentos')
      .insert({
        id_empleado: empleadoId,
        tipo_documento: tipoDocumento,
        nombre_archivo: nombreArchivo,
        archivo_url: archivoUrl,
        subido_por: subidoPor,
        tenant_id: currentTenantId, // ✅ Incluir tenant
      })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  // ===== DASHBOARD Y REPORTES =====
  async getDashboardRrhh(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;
    const client = this.supabaseService.getClient();

    // Empleados activos
    const { count: empleadosActivosCount } = await client
      .from('empleados')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', currentTenantId)
      .eq('estado', 'activo');

    // Solicitudes pendientes
    const { count: solicitudesPendientesCount } = await client
      .from('solicitudes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', currentTenantId)
      .eq('estado', 'pendiente');

    // Evaluaciones pendientes
    const { count: evaluacionesPendientesCount } = await client
      .from('evaluaciones')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', currentTenantId)
      .eq('estado', 'borrador');

    // Próximos cumpleaños
    const { data: cumpleanos } = await client
      .from('empleados')
      .select('nombres, apellidos, fecha_nacimiento')
      .eq('tenant_id', currentTenantId)
      .eq('estado', 'activo')
      .limit(5);

    return {
      success: true,
      data: {
        empleadosActivos: empleadosActivosCount || 0,
        solicitudesPendientes: solicitudesPendientesCount || 0,
        evaluacionesPendientes: evaluacionesPendientesCount || 0,
        proximosCumpleanos: cumpleanos || [],
      },
    };
  }

  // ===== PAGOS Y COMPROBANTES =====
  async getPagos(
    periodo?: string,
    empleadoId?: string,
    tenantId?: string,
  ) {
    try {
      if (!tenantId) {
        throw new Error('Tenant requerido para RRHH');
      }
      const currentTenantId = tenantId;

      this.logger.log('🔍 [RRHH] Obteniendo pagos desde rrhh_pagos...', {
        periodo,
        empleadoId,
        tenantId: currentTenantId,
      });

      let query = this.supabaseService
        .getClient()
        .from('rrhh_pagos')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .order('created_at', { ascending: false });

      if (periodo) query = query.eq('periodo', periodo);
      if (empleadoId) query = query.eq('empleado_id', empleadoId);

      const { data, error } = await query;
      if (error) {
        this.logger.error('❌ Error en getPagos:', error);
        throw error;
      }

      this.logger.log(
        `💰 [RRHH] Encontrados ${data?.length || 0} pagos en rrhh_pagos`,
      );

      if (!data || data.length === 0) {
        this.logger.warn('⚠️ No hay pagos en rrhh_pagos - tabla vacía');
        return { success: true, data: [] };
      }

      // Obtener datos de empleados por separado
      const pagosConEmpleados = await Promise.all(
        data.map(async (pago) => {
          const { data: empleado } = await this.supabaseService
            .getClient()
            .from('empleados')
            .select('nombres, apellidos, numero_documento')
            .eq('id', pago.empleado_id)
            .eq('tenant_id', currentTenantId)
            .single();

          const resultado = {
            ...pago,
            empleado: empleado || {
              nombres: 'N/A',
              apellidos: 'N/A',
              numero_documento: 'N/A',
            },
          };

          this.logger.log('👤 Pago procesado:', {
            id: pago.id,
            empleado_id: pago.empleado_id,
            periodo: pago.periodo,
            monto_neto: pago.monto_neto,
            estado: pago.estado,
            empleado_nombre: empleado
              ? `${empleado.nombres} ${empleado.apellidos}`
              : 'N/A',
          });

          return resultado;
        }),
      );

      this.logger.log(
        `✅ [RRHH] Devolviendo ${pagosConEmpleados.length} pagos con datos de empleados`,
      );

      return { success: true, data: pagosConEmpleados };
    } catch (error: any) {
      this.logger.error('❌ Error completo en getPagos:', error);
      return {
        success: false,
        data: [],
        error: error?.message || 'Error obteniendo pagos',
      };
    }
  }

  async procesarPago(pagoId: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('rrhh_pagos')
      .update({
        estado: 'procesado',
        fecha_pago: new Date().toISOString().split('T')[0],
      })
      .eq('id', pagoId)
      .eq('tenant_id', currentTenantId)
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  async generarComprobantePago(pagoId: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Validar tenant (aunque aquí no se usa aún)
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }

    // Aquí iría la lógica para generar PDF del comprobante
    // Por ahora retornamos un placeholder
    return {
      success: true,
      message: 'Generando comprobante...',
      download_url: `/downloads/comprobante-${pagoId}.pdf`,
    };
  }

  async generarBoletaPago(empleadoId: string, mes: string, tenantId?: string) {
    try {
      if (!tenantId) {
        throw new Error('Tenant requerido para RRHH');
      }
      const currentTenantId = tenantId;

      this.logger.log(
        `📄 [RRHH] Generando boleta de pago para empleado ${empleadoId}, mes ${mes}, tenant: ${currentTenantId}`,
      );

      // Obtener datos del empleado
      const { data: empleado, error: empleadoError } =
        await this.supabaseService
          .getClient()
          .from('empleados')
          .select('*')
          .eq('id', empleadoId)
          .eq('tenant_id', currentTenantId)
          .single();

      if (empleadoError || !empleado) {
        throw new Error('Empleado no encontrado');
      }

      // Obtener pagos del mes
      const { data: pagos, error: pagosError } =
        await this.supabaseService
          .getClient()
          .from('rrhh_pagos')
          .select('*')
          .eq('empleado_id', empleadoId)
          .eq('tenant_id', currentTenantId)
          .like('periodo', `${mes}%`)
          .order('created_at', { ascending: false });

      if (pagosError) {
        throw new Error('Error obteniendo pagos del empleado');
      }

      if (!pagos || pagos.length === 0) {
        return {
          success: false,
          message: `No se encontraron pagos para el empleado en ${mes}`,
        };
      }

      // Calcular totales
      const totalBruto = pagos.reduce(
        (sum: number, p: any) => sum + (parseFloat(p.monto_bruto) || 0),
        0,
      );
      const totalDescuentos = pagos.reduce(
        (sum: number, p: any) => sum + (parseFloat(p.descuentos) || 0),
        0,
      );
      const totalNeto = pagos.reduce(
        (sum: number, p: any) => sum + (parseFloat(p.monto_neto) || 0),
        0,
      );

      // Generar HTML de la boleta
      const boletaHTML = this.generarBoletaHTML(empleado, pagos, {
        totalBruto,
        totalDescuentos,
        totalNeto,
        mes,
      });

      return {
        success: true,
        data: {
          empleado: `${empleado.nombres} ${empleado.apellidos}`,
          mes: mes,
          totalPagos: pagos.length,
          totalNeto: totalNeto,
          boleta_html: boletaHTML,
        },
        message: 'Boleta de pago generada exitosamente',
      };
    } catch (error: any) {
      this.logger.error('❌ Error generando boleta de pago:', error);
      return {
        success: false,
        message: 'Error generando boleta de pago: ' + error.message,
      };
    }
  }

  private generarBoletaHTML(empleado: any, pagos: any[], totales: any) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Boleta de Pago - ${empleado.nombres} ${empleado.apellidos}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .boleta { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
            .company { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 5px; }
            .title { font-size: 18px; color: #374151; margin-bottom: 10px; }
            .periodo { font-size: 16px; color: #6b7280; }
            
            .empleado-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .info-section { background: #f8fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #2563eb; }
            .info-label { font-weight: 600; color: #374151; margin-bottom: 5px; }
            .info-value { color: #6b7280; }
            
            .pagos-detalle { margin-bottom: 30px; }
            .pagos-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .pagos-table th, .pagos-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
            .pagos-table th { background-color: #f3f4f6; font-weight: 600; color: #374151; }
            .pagos-table tr:hover { background-color: #f9fafb; }
            
            .resumen { background: #ecfdf5; padding: 20px; border-radius: 8px; border: 1px solid #d1fae5; }
            .resumen-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
            .resumen-item { text-align: center; }
            .resumen-label { font-size: 14px; color: #374151; margin-bottom: 5px; }
            .resumen-valor { font-size: 20px; font-weight: bold; }
            .bruto { color: #059669; }
            .descuentos { color: #dc2626; }
            .neto { color: #2563eb; }
            
            .footer { margin-top: 30px; text-align: center; color: #6b7280; font-size: 12px; }
            .numero { text-align: right; }
        </style>
    </head>
    <body>
        <div class="boleta">
            <div class="header">
                <div class="company">NEON SYSTEM</div>
                <div class="title">Boleta de Pago</div>
                <div class="periodo">Período: ${totales.mes}</div>
            </div>

            <div class="empleado-info">
                <div class="info-section">
                    <div class="info-label">Empleado:</div>
                    <div class="info-value">${empleado.nombres} ${empleado.apellidos}</div>
                    <div class="info-label">Documento:</div>
                    <div class="info-value">${empleado.numero_documento || 'N/A'}</div>
                    <div class="info-label">Email:</div>
                    <div class="info-value">${empleado.email || 'N/A'}</div>
                </div>
                <div class="info-section">
                    <div class="info-label">Puesto:</div>
                    <div class="info-value">${empleado.puesto || 'N/A'}</div>
                    <div class="info-label">Departamento:</div>
                    <div class="info-value">${empleado.departamento || 'N/A'}</div>
                    <div class="info-label">Fecha de Ingreso:</div>
                    <div class="info-value">${empleado.fecha_ingreso ? new Date(empleado.fecha_ingreso).toLocaleDateString('es-PE') : 'N/A'}</div>
                </div>
            </div>

            <div class="pagos-detalle">
                <h3>Detalle de Pagos</h3>
                <table class="pagos-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Método</th>
                            <th class="numero">Sueldo Bruto</th>
                            <th class="numero">Descuentos</th>
                            <th class="numero">Neto Pagado</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pagos
        .map((pago) => {
          const fechaPago = pago.fecha_pago
            ? new Date(pago.fecha_pago).toLocaleDateString(
              'es-PE',
            )
            : 'N/A';
          return `
                            <tr>
                                <td>${fechaPago}</td>
                                <td>${pago.metodo_pago === 'efectivo'
              ? '💵 Efectivo'
              : '🏦 Transferencia'
            }</td>
                                <td class="numero">S/ ${parseFloat(
              pago.monto_bruto || 0,
            ).toFixed(2)}</td>
                                <td class="numero">S/ ${parseFloat(
              pago.descuentos || 0,
            ).toFixed(2)}</td>
                                <td class="numero">S/ ${parseFloat(
              pago.monto_neto || 0,
            ).toFixed(2)}</td>
                                <td>${pago.estado}</td>
                            </tr>
                        `;
        })
        .join('')}
                    </tbody>
                </table>
            </div>

            <div class="resumen">
                <h3 style="margin-top: 0; text-align: center; color: #374151;">Resumen Total</h3>
                <div class="resumen-grid">
                    <div class="resumen-item">
                        <div class="resumen-label">Total Bruto</div>
                        <div class="resumen-valor bruto">S/ ${totales.totalBruto.toFixed(
          2,
        )}</div>
                    </div>
                    <div class="resumen-item">
                        <div class="resumen-label">Total Descuentos</div>
                        <div class="resumen-valor descuentos">S/ ${totales.totalDescuentos.toFixed(
          2,
        )}</div>
                    </div>
                    <div class="resumen-item">
                        <div class="resumen-label">Total Neto</div>
                        <div class="resumen-valor neto">S/ ${totales.totalNeto.toFixed(
          2,
        )}</div>
                    </div>
                </div>
            </div>

            <div class="footer">
                <p>Este documento certifica los pagos realizados al empleado durante el período ${totales.mes
      }</p>
                <p>Sistema ERP - Generado automáticamente el ${new Date().toLocaleDateString(
        'es-PE',
      )}</p>
            </div>
        </div>
    </body>
    </html>`;
  }

  // ===== CONTRATOS =====
  async getContratos(empleadoId?: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    let query = this.supabaseService
      .getClient()
      .from('contratos')
      .select(
        `
        *,
        empleados(nombres, apellidos, numero_documento)
      `,
      )
      .eq('tenant_id', currentTenantId)
      .order('fecha_inicio', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  }

  async createContrato(contratoData: any, tenantId?: string) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('contratos')
      .insert({
        ...contratoData,
        tenant_id: currentTenantId,
      })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  async renovarContrato(contratoId: string, meses: number, tenantId?: string) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    // Obtener contrato actual
    const { data: contrato } = await this.supabaseService
      .getClient()
      .from('contratos')
      .select('*')
      .eq('id', contratoId)
      .eq('tenant_id', currentTenantId)
      .single();

    if (!contrato) throw new Error('Contrato no encontrado');

    // Calcular nueva fecha de fin
    const fechaFin = new Date(contrato.fecha_fin || contrato.fecha_inicio);
    fechaFin.setMonth(fechaFin.getMonth() + meses);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('contratos')
      .update({
        fecha_fin: fechaFin.toISOString().split('T')[0],
        estado: 'renovado',
        observaciones: `Renovado por ${meses} meses el ${new Date().toLocaleDateString()}`,
      })
      .eq('id', contratoId)
      .eq('tenant_id', currentTenantId)
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  async finalizarContrato(
    contratoId: string,
    motivoFinalizacion: string,
    fechaFinalizacion: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('contratos')
      .update({
        estado: 'finalizado',
        fecha_fin: fechaFinalizacion,
        motivo_finalizacion: motivoFinalizacion,
      })
      .eq('id', contratoId)
      .eq('tenant_id', currentTenantId)
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  }

  async generarContratoPDF(contratoId: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Validar tenant (aunque aquí no se usa aún)
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }

    // Aquí iría la lógica para generar PDF del contrato
    // Por ahora retornamos un placeholder
    return {
      success: true,
      message: 'Generando contrato...',
      download_url: `/downloads/contrato-${contratoId}.pdf`,
    };
  }

  // ===== ASISTENCIAS MEJORADAS =====
  async getAsistenciasPorFecha(fecha: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('asistencia')
      .select(
        `
        *,
        empleados(
          nombres,
          apellidos,
          numero_documento,
          departamentos(nombre)
        )
      `,
      )
      .eq('tenant_id', currentTenantId)
      .eq('fecha', fecha)
      .order('hora_entrada', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async marcarAsistencia(
    empleadoId: string,
    fecha: string,
    tipo: 'entrada' | 'salida',
    hora: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    // Buscar registro existente del día
    const { data: registroExistente } = await this.supabaseService
      .getClient()
      .from('asistencia')
      .select('*')
      .eq('id_empleado', empleadoId)
      .eq('tenant_id', currentTenantId)
      .eq('fecha', fecha)
      .single();

    if (tipo === 'entrada') {
      if (registroExistente) {
        throw new Error('Ya se registró entrada para este día');
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .from('asistencia')
        .insert({
          id_empleado: empleadoId,
          fecha: fecha,
          hora_entrada: hora,
          estado: 'presente',
          tenant_id: currentTenantId,
        })
        .select();

      if (error) throw error;
      return { success: true, data: data?.[0], message: 'Entrada registrada' };
    } else {
      if (!registroExistente || registroExistente.hora_salida) {
        throw new Error(
          'No se puede registrar salida sin entrada o ya se registró salida',
        );
      }

      // Calcular horas trabajadas
      const entrada = new Date(`${fecha}T${registroExistente.hora_entrada}`);
      const salida = new Date(`${fecha}T${hora}`);
      const horasTrabajadas =
        (salida.getTime() - entrada.getTime()) / (1000 * 60 * 60);

      const { data, error } = await this.supabaseService
        .getClient()
        .from('asistencia')
        .update({
          hora_salida: hora,
          horas_trabajadas: horasTrabajadas,
        })
        .eq('id', registroExistente.id)
        .eq('tenant_id', currentTenantId)
        .select();

      if (error) throw error;
      return { success: true, data: data?.[0], message: 'Salida registrada' };
    }
  }
}
