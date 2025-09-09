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
exports.RrhhService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../../shared/supabase/supabase.service");
const event_bus_service_1 = require("../../shared/events/event-bus.service");
let RrhhService = class RrhhService {
    constructor(supabaseService, eventBus) {
        this.supabaseService = supabaseService;
        this.eventBus = eventBus;
    }
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
        if (error)
            throw error;
        return {
            success: true,
            data: data || []
        };
    }
    async getDepartamentos() {
        const { data, error } = await this.supabaseService.getClient()
            .from('departamentos')
            .select('*');
        if (error)
            throw error;
        return data;
    }
    async createEmpleado(empleadoData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('empleados')
            .insert(empleadoData)
            .select();
        if (error)
            throw error;
        return data[0];
    }
    async updateEmpleado(id, empleadoData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('empleados')
            .update(empleadoData)
            .eq('id', id)
            .select();
        if (error)
            throw error;
        return data[0];
    }
    async deleteEmpleado(id) {
        const { data, error } = await this.supabaseService.getClient()
            .from('empleados')
            .delete()
            .eq('id', id)
            .select();
        if (error)
            throw error;
        return { success: true, message: 'Empleado eliminado exitosamente' };
    }
    async createDepartamento(departamentoData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('departamentos')
            .insert(departamentoData)
            .select();
        if (error)
            throw error;
        return data[0];
    }
    async getVacantes() {
        const { data, error } = await this.supabaseService.getClient()
            .from('vacantes')
            .select(`
        *,
        departamentos(nombre),
        candidatos(count)
      `)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async createVacante(vacanteData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('vacantes')
            .insert(vacanteData)
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async getCandidatos(vacanteId) {
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
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async createCandidato(candidatoData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('candidatos')
            .insert(candidatoData)
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async updateEstadoCandidato(candidatoId, estado, observaciones) {
        const { data, error } = await this.supabaseService.getClient()
            .from('candidatos')
            .update({ estado, observaciones })
            .eq('id', candidatoId)
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async registrarAsistencia(empleadoId, tipo) {
        const hoy = new Date().toISOString().split('T')[0];
        const horaActual = new Date().toTimeString().split(' ')[0];
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
            if (error)
                throw error;
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
        }
        else {
            if (!registroExistente || registroExistente.hora_salida) {
                throw new Error('No se puede registrar salida sin entrada o ya se registró salida');
            }
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
            if (error)
                throw error;
            const horasExtras = Math.max(0, horasTrabajadas - 8);
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
    async getAsistencia(empleadoId, fechaDesde, fechaHasta) {
        let query = this.supabaseService.getClient()
            .from('asistencia')
            .select(`
        *,
        empleados(nombres, apellidos, numero_documento)
      `)
            .order('fecha', { ascending: false });
        if (empleadoId)
            query = query.eq('id_empleado', empleadoId);
        if (fechaDesde)
            query = query.gte('fecha', fechaDesde);
        if (fechaHasta)
            query = query.lte('fecha', fechaHasta);
        const { data, error } = await query.limit(100);
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async getSolicitudes(empleadoId, estado) {
        let query = this.supabaseService.getClient()
            .from('solicitudes')
            .select(`
        *,
        empleados(nombres, apellidos, numero_documento)
      `)
            .order('created_at', { ascending: false });
        if (empleadoId)
            query = query.eq('id_empleado', empleadoId);
        if (estado)
            query = query.eq('estado', estado);
        const { data, error } = await query;
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async createSolicitud(solicitudData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('solicitudes')
            .insert(solicitudData)
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async aprobarSolicitud(solicitudId, aprobadoPor, observaciones) {
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
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async rechazarSolicitud(solicitudId, aprobadoPor, observaciones) {
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
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async getBeneficios() {
        const { data, error } = await this.supabaseService.getClient()
            .from('beneficios')
            .select('*')
            .eq('activo', true)
            .order('nombre');
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async getBeneficiosEmpleado(empleadoId) {
        const { data, error } = await this.supabaseService.getClient()
            .from('empleado_beneficios')
            .select(`
        *,
        beneficios(*)
      `)
            .eq('id_empleado', empleadoId)
            .eq('estado', 'activo');
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async asignarBeneficio(empleadoId, beneficioId, fechaInicio) {
        const { data, error } = await this.supabaseService.getClient()
            .from('empleado_beneficios')
            .insert({
            id_empleado: empleadoId,
            id_beneficio: beneficioId,
            fecha_inicio: fechaInicio,
            estado: 'activo'
        })
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async getEvaluaciones(empleadoId) {
        let query = this.supabaseService.getClient()
            .from('evaluaciones')
            .select(`
        *,
        empleados(nombres, apellidos, numero_documento, puesto)
      `)
            .order('fecha_evaluacion', { ascending: false });
        if (empleadoId)
            query = query.eq('id_empleado', empleadoId);
        const { data, error } = await query;
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async createEvaluacion(evaluacionData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('evaluaciones')
            .insert(evaluacionData)
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async updateEvaluacion(id, evaluacionData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('evaluaciones')
            .update(evaluacionData)
            .eq('id', id)
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async getCapacitaciones() {
        const { data, error } = await this.supabaseService.getClient()
            .from('capacitaciones')
            .select('*')
            .eq('activo', true)
            .order('fecha_inicio', { ascending: false });
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async getCapacitacionesEmpleado(empleadoId) {
        const { data, error } = await this.supabaseService.getClient()
            .from('empleado_capacitaciones')
            .select(`
        *,
        capacitaciones(*)
      `)
            .eq('id_empleado', empleadoId)
            .order('fecha_inscripcion', { ascending: false });
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async inscribirCapacitacion(empleadoId, capacitacionId) {
        const { data, error } = await this.supabaseService.getClient()
            .from('empleado_capacitaciones')
            .insert({
            id_empleado: empleadoId,
            id_capacitacion: capacitacionId,
            estado: 'inscrito'
        })
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async calcularLiquidacion(empleadoId, motivoTerminacion, fechaTerminacion) {
        const { data: empleado, error: empError } = await this.supabaseService.getClient()
            .from('empleados')
            .select(`
        *,
        contratos!inner(*)
      `)
            .eq('id', empleadoId)
            .eq('contratos.estado', 'vigente')
            .single();
        if (empError || !empleado)
            throw new Error('Empleado no encontrado');
        const contrato = empleado.contratos[0];
        const sueldoMensual = parseFloat(contrato.sueldo_bruto);
        const fechaIngreso = new Date(empleado.fecha_ingreso);
        const fechaTerminacionDate = new Date(fechaTerminacion);
        const diasTrabajados = Math.floor((fechaTerminacionDate.getTime() - fechaIngreso.getTime()) / (1000 * 60 * 60 * 24));
        const vacacionesPendientes = Math.max(0, 30 - this.calcularVacacionesUsadas(empleadoId, fechaTerminacionDate.getFullYear()));
        const diasCts = this.calcularDiasCts(fechaIngreso, fechaTerminacionDate);
        const montoCts = (sueldoMensual / 30) * diasCts;
        let indemnizacion = 0;
        if (motivoTerminacion === 'despido') {
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
        if (error)
            throw error;
        await this.supabaseService.getClient()
            .from('empleados')
            .update({ estado: 'inactivo' })
            .eq('id', empleadoId);
        await this.supabaseService.getClient()
            .from('contratos')
            .update({ estado: 'terminado', fecha_fin: fechaTerminacion })
            .eq('id_empleado', empleadoId)
            .eq('estado', 'vigente');
        return { success: true, data: data[0] };
    }
    calcularVacacionesUsadas(empleadoId, año) {
        return 15;
    }
    calcularDiasCts(fechaIngreso, fechaTerminacion) {
        const mesesTrabajados = (fechaTerminacion.getFullYear() - fechaIngreso.getFullYear()) * 12 +
            (fechaTerminacion.getMonth() - fechaIngreso.getMonth());
        return Math.floor(mesesTrabajados * 2.5);
    }
    async getHorarios() {
        const { data, error } = await this.supabaseService.getClient()
            .from('horarios_trabajo')
            .select('*')
            .eq('activo', true)
            .order('nombre');
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async asignarHorario(empleadoId, horarioId, fechaInicio) {
        await this.supabaseService.getClient()
            .from('empleado_horarios')
            .update({ activo: false, fecha_fin: fechaInicio })
            .eq('id_empleado', empleadoId)
            .eq('activo', true);
        const { data, error } = await this.supabaseService.getClient()
            .from('empleado_horarios')
            .insert({
            id_empleado: empleadoId,
            id_horario: horarioId,
            fecha_inicio: fechaInicio,
            activo: true
        })
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async getExpediente(empleadoId) {
        const { data, error } = await this.supabaseService.getClient()
            .from('expediente_documentos')
            .select('*')
            .eq('id_empleado', empleadoId)
            .eq('activo', true)
            .order('fecha_subida', { ascending: false });
        if (error)
            throw error;
        return { success: true, data: data || [] };
    }
    async subirDocumento(empleadoId, tipoDocumento, nombreArchivo, archivoUrl, subidoPor) {
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
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async getDashboardRrhh() {
        const client = this.supabaseService.getClient();
        const { data: empleadosActivos } = await client
            .from('empleados')
            .select('count', { count: 'exact' })
            .eq('estado', 'activo');
        const { data: solicitudesPendientes } = await client
            .from('solicitudes')
            .select('count', { count: 'exact' })
            .eq('estado', 'pendiente');
        const { data: evaluacionesPendientes } = await client
            .from('evaluaciones')
            .select('count', { count: 'exact' })
            .eq('estado', 'borrador');
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
    async getPagos(periodo, empleadoId) {
        try {
            let query = this.supabaseService.getClient()
                .from('rrhh_pagos')
                .select('*')
                .order('created_at', { ascending: false });
            if (periodo)
                query = query.eq('periodo', periodo);
            if (empleadoId)
                query = query.eq('empleado_id', empleadoId);
            const { data, error } = await query;
            if (error) {
                console.error('❌ Error en getPagos:', error);
                throw error;
            }
            const pagosConEmpleados = await Promise.all((data || []).map(async (pago) => {
                const { data: empleado } = await this.supabaseService.getClient()
                    .from('empleados')
                    .select('nombres, apellidos, numero_documento')
                    .eq('id', pago.empleado_id)
                    .single();
                return {
                    ...pago,
                    empleado: empleado || { nombres: 'N/A', apellidos: 'N/A', numero_documento: 'N/A' }
                };
            }));
            return { success: true, data: pagosConEmpleados };
        }
        catch (error) {
            console.error('❌ Error completo en getPagos:', error);
            return { success: true, data: [] };
        }
    }
    async procesarPago(pagoId) {
        const { data, error } = await this.supabaseService.getClient()
            .from('rrhh_pagos')
            .update({
            estado: 'procesado',
            fecha_pago: new Date().toISOString().split('T')[0]
        })
            .eq('id', pagoId)
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async generarComprobantePago(pagoId) {
        return {
            success: true,
            message: 'Generando comprobante...',
            download_url: `/downloads/comprobante-${pagoId}.pdf`
        };
    }
    async getContratos(empleadoId) {
        let query = this.supabaseService.getClient()
            .from('contratos')
            .select(`
        *,
        empleados(nombres, apellidos, numero_documento)
      `)
            .order('fecha_inicio', { ascending: false });
        if (empleadoId)
            query = query.eq('empleado_id', empleadoId);
        const { data, error } = await query;
        if (error)
            throw error;
        return data || [];
    }
    async createContrato(contratoData) {
        const { data, error } = await this.supabaseService.getClient()
            .from('contratos')
            .insert(contratoData)
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async renovarContrato(contratoId, meses) {
        const { data: contrato } = await this.supabaseService.getClient()
            .from('contratos')
            .select('*')
            .eq('id', contratoId)
            .single();
        if (!contrato)
            throw new Error('Contrato no encontrado');
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
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async finalizarContrato(contratoId, motivoFinalizacion, fechaFinalizacion) {
        const { data, error } = await this.supabaseService.getClient()
            .from('contratos')
            .update({
            estado: 'finalizado',
            fecha_fin: fechaFinalizacion,
            motivo_finalizacion: motivoFinalizacion
        })
            .eq('id', contratoId)
            .select();
        if (error)
            throw error;
        return { success: true, data: data[0] };
    }
    async generarContratoPDF(contratoId) {
        return {
            success: true,
            message: 'Generando contrato...',
            download_url: `/downloads/contrato-${contratoId}.pdf`
        };
    }
    async getAsistenciasPorFecha(fecha) {
        const { data, error } = await this.supabaseService.getClient()
            .from('asistencia')
            .select(`
        *,
        empleados(nombres, apellidos, numero_documento, departamentos(nombre))
      `)
            .eq('fecha', fecha)
            .order('hora_entrada', { ascending: true });
        if (error)
            throw error;
        return data || [];
    }
    async marcarAsistencia(empleadoId, fecha, tipo, hora) {
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
            if (error)
                throw error;
            return { success: true, data: data[0], message: 'Entrada registrada' };
        }
        else {
            if (!registroExistente || registroExistente.hora_salida) {
                throw new Error('No se puede registrar salida sin entrada o ya se registró salida');
            }
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
            if (error)
                throw error;
            return { success: true, data: data[0], message: 'Salida registrada' };
        }
    }
    async debugEmpleadosContratos() {
        const client = this.supabaseService.getClient();
        console.log('🔍 DEBUG: Verificando empleados y contratos...');
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
};
exports.RrhhService = RrhhService;
exports.RrhhService = RrhhService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], RrhhService);
