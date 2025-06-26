import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';

@Injectable()
export class RrhhService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService
  ) {}

  // ===== EMPLEADOS BÁSICOS =====
  async getEmpleados() {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleados')
      .select(`
        *,
        departamentos(nombre),
        contratos(*),
        empleado_horarios(
          id,
          horarios_trabajo(*)
        )
      `);
    if (error) throw error;
    return {
      success: true,
      data: data || []
    };
  }

  async getDepartamentos() {
    const { data, error } = await this.supabaseService.getClient()
      .from('departamentos')
      .select('*');
    if (error) throw error;
    return data;
  }

  async createEmpleado(empleadoData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleados')
      .insert(empleadoData)
      .select();
    if (error) throw error;
    return data[0];
  }

  async updateEmpleado(id: string, empleadoData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleados')
      .update(empleadoData)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data[0];
  }

  async deleteEmpleado(id: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleados')
      .delete()
      .eq('id', id)
      .select();
    if (error) throw error;
    return { success: true, message: 'Empleado eliminado exitosamente' };
  }

  async createDepartamento(departamentoData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('departamentos')
      .insert(departamentoData)
      .select();
    if (error) throw error;
    return data[0];
  }

  // ===== RECLUTAMIENTO Y VACANTES =====
  async getVacantes() {
    const { data, error } = await this.supabaseService.getClient()
      .from('vacantes')
      .select(`
        *,
        departamentos(nombre),
        candidatos(count)
      `)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async createVacante(vacanteData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('vacantes')
      .insert(vacanteData)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  async getCandidatos(vacanteId?: string) {
    let query = this.supabaseService.getClient()
      .from('candidatos')
      .select(`
        *,
        vacantes(titulo, puesto_solicitado)
      `)
      .order('fecha_postulacion', { ascending: false });
    
    if (vacanteId) {
      query = query.eq('id_vacante', vacanteId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async createCandidato(candidatoData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('candidatos')
      .insert(candidatoData)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  async updateEstadoCandidato(candidatoId: string, estado: string, observaciones?: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('candidatos')
      .update({ estado, observaciones })
      .eq('id', candidatoId)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  // ===== ASISTENCIA Y TIEMPO =====
  async registrarAsistencia(empleadoId: string, tipo: 'entrada' | 'salida') {
    const hoy = new Date().toISOString().split('T')[0];
    const horaActual = new Date().toTimeString().split(' ')[0];

    // Buscar registro existente del día
    const { data: registroExistente } = await this.supabaseService.getClient()
      .from('asistencia')
      .select('*')
      .eq('id_empleado', empleadoId)
      .eq('fecha', hoy)
      .single();

    if (tipo === 'entrada') {
      if (registroExistente) {
        throw new Error('Ya se registró entrada para este día');
      }
      
      const { data, error } = await this.supabaseService.getClient()
        .from('asistencia')
        .insert({
          id_empleado: empleadoId,
          fecha: hoy,
          hora_entrada: horaActual,
          estado: 'presente'
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
        requierePlanilla: true
      });
      console.log('✅ [RRHH] Evento de entrada de empleado emitido');

      return { success: true, data: data[0], message: 'Entrada registrada' };
    } else {
      if (!registroExistente || registroExistente.hora_salida) {
        throw new Error('No se puede registrar salida sin entrada o ya se registró salida');
      }

      // Calcular horas trabajadas
      const entrada = new Date(`${hoy}T${registroExistente.hora_entrada}`);
      const salida = new Date(`${hoy}T${horaActual}`);
      const horasTrabajadas = (salida.getTime() - entrada.getTime()) / (1000 * 60 * 60);

      const { data, error } = await this.supabaseService.getClient()
        .from('asistencia')
        .update({
          hora_salida: horaActual,
          horas_trabajadas: horasTrabajadas
        })
        .eq('id', registroExistente.id)
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
        requierePlanilla: true
      });
      console.log(`✅ [RRHH] Evento de salida emitido - ${horasTrabajadas.toFixed(2)} horas trabajadas`);

      return { success: true, data: data[0], message: 'Salida registrada' };
    }
  }

  async getAsistencia(empleadoId?: string, fechaDesde?: string, fechaHasta?: string) {
    let query = this.supabaseService.getClient()
      .from('asistencia')
      .select(`
        *,
        empleados(nombres, apellidos, numero_documento)
      `)
      .order('fecha', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);
    if (fechaDesde) query = query.gte('fecha', fechaDesde);
    if (fechaHasta) query = query.lte('fecha', fechaHasta);

    const { data, error } = await query.limit(100);
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  // ===== SOLICITUDES (Vacaciones, Licencias) =====
  async getSolicitudes(empleadoId?: string, estado?: string) {
    let query = this.supabaseService.getClient()
      .from('solicitudes')
      .select(`
        *,
        empleados(nombres, apellidos, numero_documento)
      `)
      .order('created_at', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);
    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async createSolicitud(solicitudData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('solicitudes')
      .insert(solicitudData)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  async aprobarSolicitud(solicitudId: string, aprobadoPor: string, observaciones?: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('solicitudes')
      .update({
        estado: 'aprobada',
        aprobado_por: aprobadoPor,
        fecha_aprobacion: new Date().toISOString(),
        observaciones_aprobacion: observaciones
      })
      .eq('id', solicitudId)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  async rechazarSolicitud(solicitudId: string, aprobadoPor: string, observaciones: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('solicitudes')
      .update({
        estado: 'rechazada',
        aprobado_por: aprobadoPor,
        fecha_aprobacion: new Date().toISOString(),
        observaciones_aprobacion: observaciones
      })
      .eq('id', solicitudId)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  // ===== BENEFICIOS =====
  async getBeneficios() {
    const { data, error } = await this.supabaseService.getClient()
      .from('beneficios')
      .select('*')
      .eq('activo', true)
      .order('nombre');
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async getBeneficiosEmpleado(empleadoId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleado_beneficios')
      .select(`
        *,
        beneficios(*)
      `)
      .eq('id_empleado', empleadoId)
      .eq('estado', 'activo');
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async asignarBeneficio(empleadoId: string, beneficioId: string, fechaInicio: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleado_beneficios')
      .insert({
        id_empleado: empleadoId,
        id_beneficio: beneficioId,
        fecha_inicio: fechaInicio,
        estado: 'activo'
      })
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  // ===== EVALUACIONES DE DESEMPEÑO =====
  async getEvaluaciones(empleadoId?: string) {
    let query = this.supabaseService.getClient()
      .from('evaluaciones')
      .select(`
        *,
        empleados(nombres, apellidos, numero_documento, puesto)
      `)
      .order('fecha_evaluacion', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async createEvaluacion(evaluacionData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('evaluaciones')
      .insert(evaluacionData)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  async updateEvaluacion(id: string, evaluacionData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('evaluaciones')
      .update(evaluacionData)
      .eq('id', id)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  // ===== CAPACITACIONES =====
  async getCapacitaciones() {
    const { data, error } = await this.supabaseService.getClient()
      .from('capacitaciones')
      .select('*')
      .eq('activo', true)
      .order('fecha_inicio', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async getCapacitacionesEmpleado(empleadoId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleado_capacitaciones')
      .select(`
        *,
        capacitaciones(*)
      `)
      .eq('id_empleado', empleadoId)
      .order('fecha_inscripcion', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async inscribirCapacitacion(empleadoId: string, capacitacionId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleado_capacitaciones')
      .insert({
        id_empleado: empleadoId,
        id_capacitacion: capacitacionId,
        estado: 'inscrito'
      })
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  // ===== LIQUIDACIONES =====
  async calcularLiquidacion(empleadoId: string, motivoTerminacion: string, fechaTerminacion: string) {
    // Obtener datos del empleado y contrato
    const { data: empleado, error: empError } = await this.supabaseService.getClient()
      .from('empleados')
      .select(`
        *,
        contratos!inner(*)
      `)
      .eq('id', empleadoId)
      .eq('contratos.estado', 'vigente')
      .single();
    
    if (empError || !empleado) throw new Error('Empleado no encontrado');
    
    const contrato = empleado.contratos[0];
    const sueldoMensual = parseFloat(contrato.sueldo_bruto);
    
    // Calcular días trabajados en el año
    const fechaIngreso = new Date(empleado.fecha_ingreso);
    const fechaTerminacionDate = new Date(fechaTerminacion);
    const diasTrabajados = Math.floor((fechaTerminacionDate.getTime() - fechaIngreso.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calcular beneficios
    const vacacionesPendientes = Math.max(0, 30 - this.calcularVacacionesUsadas(empleadoId, fechaTerminacionDate.getFullYear()));
    const diasCts = this.calcularDiasCts(fechaIngreso, fechaTerminacionDate);
    const montoCts = (sueldoMensual / 30) * diasCts;
    
    let indemnizacion = 0;
    if (motivoTerminacion === 'despido') {
      // 1.5 sueldos por año trabajado
      const añosTrabajados = diasTrabajados / 365;
      indemnizacion = sueldoMensual * 1.5 * añosTrabajados;
    }
    
    const totalLiquidacion = montoCts + indemnizacion + (sueldoMensual / 30 * vacacionesPendientes);
    
    const { data, error } = await this.supabaseService.getClient()
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
        estado: 'calculada'
      })
      .select();
    
    if (error) throw error;
    
    // Actualizar estado del empleado
    await this.supabaseService.getClient()
      .from('empleados')
      .update({ estado: 'inactivo' })
      .eq('id', empleadoId);
    
    // Terminar contrato
    await this.supabaseService.getClient()
      .from('contratos')
      .update({ estado: 'terminado', fecha_fin: fechaTerminacion })
      .eq('id_empleado', empleadoId)
      .eq('estado', 'vigente');
    
    return { success: true, data: data[0] };
  }

  private calcularVacacionesUsadas(empleadoId: string, año: number): number {
    // TODO: Implementar cálculo real basado en solicitudes aprobadas
    return 15; // Mock por ahora
  }

  private calcularDiasCts(fechaIngreso: Date, fechaTerminacion: Date): number {
    const mesesTrabajados = (fechaTerminacion.getFullYear() - fechaIngreso.getFullYear()) * 12 + 
                          (fechaTerminacion.getMonth() - fechaIngreso.getMonth());
    return Math.floor(mesesTrabajados * 2.5); // 30 días por año = 2.5 días por mes
  }

  // ===== HORARIOS =====
  async getHorarios() {
    const { data, error } = await this.supabaseService.getClient()
      .from('horarios_trabajo')
      .select('*')
      .eq('activo', true)
      .order('nombre');
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async asignarHorario(empleadoId: string, horarioId: string, fechaInicio: string) {
    // Desactivar horario anterior
    await this.supabaseService.getClient()
      .from('empleado_horarios')
      .update({ activo: false, fecha_fin: fechaInicio })
      .eq('id_empleado', empleadoId)
      .eq('activo', true);

    // Asignar nuevo horario
    const { data, error } = await this.supabaseService.getClient()
      .from('empleado_horarios')
      .insert({
        id_empleado: empleadoId,
        id_horario: horarioId,
        fecha_inicio: fechaInicio,
        activo: true
      })
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  // ===== EXPEDIENTE =====
  async getExpediente(empleadoId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('expediente_documentos')
      .select('*')
      .eq('id_empleado', empleadoId)
      .eq('activo', true)
      .order('fecha_subida', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async subirDocumento(empleadoId: string, tipoDocumento: string, nombreArchivo: string, archivoUrl: string, subidoPor: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('expediente_documentos')
      .insert({
        id_empleado: empleadoId,
        tipo_documento: tipoDocumento,
        nombre_archivo: nombreArchivo,
        archivo_url: archivoUrl,
        subido_por: subidoPor
      })
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  // ===== DASHBOARD Y REPORTES =====
  async getDashboardRrhh() {
    const client = this.supabaseService.getClient();
    
    // Empleados activos
    const { data: empleadosActivos } = await client
      .from('empleados')
      .select('count', { count: 'exact' })
      .eq('estado', 'activo');

    // Solicitudes pendientes
    const { data: solicitudesPendientes } = await client
      .from('solicitudes')
      .select('count', { count: 'exact' })
      .eq('estado', 'pendiente');

    // Evaluaciones pendientes
    const { data: evaluacionesPendientes } = await client
      .from('evaluaciones')
      .select('count', { count: 'exact' })
      .eq('estado', 'borrador');

    // Próximos cumpleaños
    const { data: cumpleanos } = await client
      .from('empleados')
      .select('nombres, apellidos, fecha_nacimiento')
      .eq('estado', 'activo')
      .limit(5);

    return {
      success: true,
      data: {
        empleadosActivos: empleadosActivos?.[0]?.count || 0,
        solicitudesPendientes: solicitudesPendientes?.[0]?.count || 0,
        evaluacionesPendientes: evaluacionesPendientes?.[0]?.count || 0,
        proximosCumpleanos: cumpleanos || []
      }
    };
  }

  // ===== PAGOS Y COMPROBANTES =====
  async getPagos(periodo?: string, empleadoId?: string) {
    try {
      console.log('🔍 [RRHH] Obteniendo pagos desde rrhh_pagos...', { periodo, empleadoId });
      
      let query = this.supabaseService.getClient()
        .from('rrhh_pagos')
        .select('*')
        .order('created_at', { ascending: false });

      if (periodo) query = query.eq('periodo', periodo);
      if (empleadoId) query = query.eq('empleado_id', empleadoId);

      const { data, error } = await query;
      if (error) {
        console.error('❌ Error en getPagos:', error);
        throw error;
      }

      console.log(`💰 [RRHH] Encontrados ${data?.length || 0} pagos en rrhh_pagos`);
      
      if (!data || data.length === 0) {
        console.warn('⚠️ No hay pagos en rrhh_pagos - tabla vacía');
        return { success: true, data: [] };
      }

      // Obtener datos de empleados por separado
      const pagosConEmpleados = await Promise.all(data.map(async (pago) => {
        const { data: empleado } = await this.supabaseService.getClient()
          .from('empleados')
          .select('nombres, apellidos, numero_documento')
          .eq('id', pago.empleado_id)
          .single();
        
        const resultado = {
          ...pago,
          empleado: empleado || { nombres: 'N/A', apellidos: 'N/A', numero_documento: 'N/A' }
        };
        
        console.log(`👤 Pago procesado:`, {
          id: pago.id,
          empleado_id: pago.empleado_id,
          periodo: pago.periodo,
          monto_neto: pago.monto_neto,
          estado: pago.estado,
          empleado_nombre: empleado ? `${empleado.nombres} ${empleado.apellidos}` : 'N/A'
        });
        
        return resultado;
      }));

      console.log(`✅ [RRHH] Devolviendo ${pagosConEmpleados.length} pagos con datos de empleados`);
      return { success: true, data: pagosConEmpleados };
    } catch (error) {
      console.error('❌ Error completo en getPagos:', error);
      return { success: true, data: [] };
    }
  }

  async procesarPago(pagoId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('rrhh_pagos')
      .update({ 
        estado: 'procesado',
        fecha_pago: new Date().toISOString().split('T')[0]
      })
      .eq('id', pagoId)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  async generarComprobantePago(pagoId: string) {
    // Aquí iría la lógica para generar PDF del comprobante
    // Por ahora retornamos un placeholder
    return { 
      success: true, 
      message: 'Generando comprobante...', 
      download_url: `/downloads/comprobante-${pagoId}.pdf` 
    };
  }

  async generarBoletaPago(empleadoId: string, mes: string) {
    try {
      console.log(`📄 [RRHH] Generando boleta de pago para empleado ${empleadoId}, mes ${mes}`);
      
      // Obtener datos del empleado
      const { data: empleado, error: empleadoError } = await this.supabaseService.getClient()
        .from('empleados')
        .select('*')
        .eq('id', empleadoId)
        .single();
        
      if (empleadoError || !empleado) {
        throw new Error('Empleado no encontrado');
      }
      
      // Obtener pagos del mes
      const { data: pagos, error: pagosError } = await this.supabaseService.getClient()
        .from('rrhh_pagos')
        .select('*')
        .eq('empleado_id', empleadoId)
        .like('periodo', `${mes}%`)
        .order('created_at', { ascending: false });
        
      if (pagosError) {
        throw new Error('Error obteniendo pagos del empleado');
      }
      
      if (!pagos || pagos.length === 0) {
        return {
          success: false,
          message: `No se encontraron pagos para el empleado en ${mes}`
        };
      }
      
      // Calcular totales
      const totalBruto = pagos.reduce((sum, p) => sum + (parseFloat(p.monto_bruto) || 0), 0);
      const totalDescuentos = pagos.reduce((sum, p) => sum + (parseFloat(p.descuentos) || 0), 0);
      const totalNeto = pagos.reduce((sum, p) => sum + (parseFloat(p.monto_neto) || 0), 0);
      
      // Generar HTML de la boleta
      const boletaHTML = this.generarBoletaHTML(empleado, pagos, {
        totalBruto,
        totalDescuentos,
        totalNeto,
        mes
      });
      
      return {
        success: true,
        data: {
          empleado: `${empleado.nombres} ${empleado.apellidos}`,
          mes: mes,
          totalPagos: pagos.length,
          totalNeto: totalNeto,
          boleta_html: boletaHTML
        },
        message: 'Boleta de pago generada exitosamente'
      };
      
    } catch (error) {
      console.error('❌ Error generando boleta de pago:', error);
      return {
        success: false,
        message: 'Error generando boleta de pago: ' + error.message
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
                <div class="company">CABIMAS ERP</div>
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
                        ${pagos.map(pago => `
                            <tr>
                                <td>${new Date(pago.fecha_pago).toLocaleDateString('es-PE')}</td>
                                <td>${pago.metodo_pago === 'efectivo' ? '💵 Efectivo' : '🏦 Transferencia'}</td>
                                <td class="numero">S/ ${parseFloat(pago.monto_bruto || 0).toFixed(2)}</td>
                                <td class="numero">S/ ${parseFloat(pago.descuentos || 0).toFixed(2)}</td>
                                <td class="numero">S/ ${parseFloat(pago.monto_neto || 0).toFixed(2)}</td>
                                <td>${pago.estado}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="resumen">
                <h3 style="margin-top: 0; text-align: center; color: #374151;">Resumen Total</h3>
                <div class="resumen-grid">
                    <div class="resumen-item">
                        <div class="resumen-label">Total Bruto</div>
                        <div class="resumen-valor bruto">S/ ${totales.totalBruto.toFixed(2)}</div>
                    </div>
                    <div class="resumen-item">
                        <div class="resumen-label">Total Descuentos</div>
                        <div class="resumen-valor descuentos">S/ ${totales.totalDescuentos.toFixed(2)}</div>
                    </div>
                    <div class="resumen-item">
                        <div class="resumen-label">Total Neto</div>
                        <div class="resumen-valor neto">S/ ${totales.totalNeto.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <div class="footer">
                <p>Este documento certifica los pagos realizados al empleado durante el período ${totales.mes}</p>
                <p>Sistema ERP - Generado automáticamente el ${new Date().toLocaleDateString('es-PE')}</p>
            </div>
        </div>
    </body>
    </html>`;
  }

  // ===== CONTRATOS =====
  async getContratos(empleadoId?: string) {
    let query = this.supabaseService.getClient()
      .from('contratos')
      .select(`
        *,
        empleados(nombres, apellidos, numero_documento)
      `)
      .order('fecha_inicio', { ascending: false });

    if (empleadoId) query = query.eq('empleado_id', empleadoId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async createContrato(contratoData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('contratos')
      .insert(contratoData)
      .select();
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  async renovarContrato(contratoId: string, meses: number) {
    // Obtener contrato actual
    const { data: contrato } = await this.supabaseService.getClient()
      .from('contratos')
      .select('*')
      .eq('id', contratoId)
      .single();

    if (!contrato) throw new Error('Contrato no encontrado');

    // Calcular nueva fecha de fin
    const fechaFin = new Date(contrato.fecha_fin || contrato.fecha_inicio);
    fechaFin.setMonth(fechaFin.getMonth() + meses);

    const { data, error } = await this.supabaseService.getClient()
      .from('contratos')
      .update({ 
        fecha_fin: fechaFin.toISOString().split('T')[0],
        estado: 'renovado',
        observaciones: `Renovado por ${meses} meses el ${new Date().toLocaleDateString()}`
      })
      .eq('id', contratoId)
      .select();
    
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  async finalizarContrato(contratoId: string, motivoFinalizacion: string, fechaFinalizacion: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('contratos')
      .update({ 
        estado: 'finalizado',
        fecha_fin: fechaFinalizacion,
        motivo_finalizacion: motivoFinalizacion
      })
      .eq('id', contratoId)
      .select();
    
    if (error) throw error;
    return { success: true, data: data[0] };
  }

  async generarContratoPDF(contratoId: string) {
    // Aquí iría la lógica para generar PDF del contrato
    // Por ahora retornamos un placeholder
    return { 
      success: true, 
      message: 'Generando contrato...', 
      download_url: `/downloads/contrato-${contratoId}.pdf` 
    };
  }

  // ===== ASISTENCIAS MEJORADAS =====
  async getAsistenciasPorFecha(fecha: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('asistencia')
      .select(`
        *,
        empleados(nombres, apellidos, numero_documento, departamentos(nombre))
      `)
      .eq('fecha', fecha)
      .order('hora_entrada', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async marcarAsistencia(empleadoId: string, fecha: string, tipo: 'entrada' | 'salida', hora: string) {
    // Buscar registro existente del día
    const { data: registroExistente } = await this.supabaseService.getClient()
      .from('asistencia')
      .select('*')
      .eq('empleado_id', empleadoId)
      .eq('fecha', fecha)
      .single();

    if (tipo === 'entrada') {
      if (registroExistente) {
        throw new Error('Ya se registró entrada para este día');
      }
      
      const { data, error } = await this.supabaseService.getClient()
        .from('asistencia')
        .insert({
          empleado_id: empleadoId,
          fecha: fecha,
          hora_entrada: hora,
          estado: 'presente'
        })
        .select();
      if (error) throw error;
      return { success: true, data: data[0], message: 'Entrada registrada' };
    } else {
      if (!registroExistente || registroExistente.hora_salida) {
        throw new Error('No se puede registrar salida sin entrada o ya se registró salida');
      }

      // Calcular horas trabajadas
      const entrada = new Date(`${fecha}T${registroExistente.hora_entrada}`);
      const salida = new Date(`${fecha}T${hora}`);
      const horasTrabajadas = (salida.getTime() - entrada.getTime()) / (1000 * 60 * 60);

      const { data, error } = await this.supabaseService.getClient()
        .from('asistencia')
        .update({
          hora_salida: hora,
          horas_trabajadas: horasTrabajadas
        })
        .eq('id', registroExistente.id)
        .select();
      if (error) throw error;
      return { success: true, data: data[0], message: 'Salida registrada' };
    }
  }

  async debugEmpleadosContratos() {
    const client = this.supabaseService.getClient();
    
    console.log('🔍 DEBUG: Verificando empleados y contratos...');
    
    // Obtener empleados
    const { data: empleados, error: empleadosError } = await client
      .from('empleados')
      .select('*')
      .eq('estado', 'activo');
    
    console.log('👥 Empleados activos:', empleados?.length || 0);
    if (empleados) {
      empleados.forEach(emp => {
        console.log(`  - ${emp.nombres} ${emp.apellidos} (${emp.numero_documento})`);
      });
    }
    
    // Obtener contratos
    const { data: contratos, error: contratosError } = await client
      .from('contratos')
      .select('*')
      .eq('estado', 'vigente');
    
    console.log('📄 Contratos vigentes:', contratos?.length || 0);
    if (contratos) {
      contratos.forEach(cont => {
        console.log(`  - Empleado ID: ${cont.id_empleado}, Sueldo: ${cont.sueldo_bruto}`);
      });
    }
    
    // Obtener empleados CON contratos
    const { data: empleadosConContratos, error: joinError } = await client
      .from('empleados')
      .select('*, contratos(*)')
      .eq('estado', 'activo');
    
    console.log('👥 Empleados con contratos:', empleadosConContratos?.length || 0);
    if (empleadosConContratos) {
      empleadosConContratos.forEach(emp => {
        const contratoVigente = emp.contratos?.find(c => c.estado === 'vigente');
        console.log(`  - ${emp.nombres}: ${contratoVigente ? 'SÍ TIENE CONTRATO' : 'NO TIENE CONTRATO'}`);
      });
    }
    
    return {
      totalEmpleados: empleados?.length || 0,
      totalContratos: contratos?.length || 0,
      empleadosConContratosCount: empleadosConContratos?.length || 0,
      empleados,
      contratos,
      empleadosConContratos
    };
  }
} 