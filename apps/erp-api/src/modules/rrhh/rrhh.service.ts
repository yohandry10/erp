import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import PDFDocument from 'pdfkit';

// Respaldo si normativa_peru_periodos no tiene fila para el periodo consultado.
const RMV_PERU_FALLBACK = 1130;

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
        departamentos!empleados_id_departamento_fkey_runtime(nombre),
        contratos!contratos_id_empleado_fkey_runtime(*),
        empleado_horarios!empleado_horarios_id_empleado_fkey(
          id,
          horarios_trabajo!empleado_horarios_id_horario_fkey(*)
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

  // ✅ FIX: Lista de campos permitidos para prevenir inyección de datos
  private readonly CAMPOS_EMPLEADO_PERMITIDOS = [
    'nombres', 'apellidos', 'tipo_documento', 'numero_documento',
    'email', 'telefono', 'direccion', 'fecha_nacimiento', 'fecha_ingreso',
    'id_departamento', 'puesto', 'estado', 'genero', 'estado_civil',
    'nacionalidad', 'ubigeo', 'tiene_hijos', 'cantidad_hijos',
    'asignacion_familiar', 'cuenta_bancaria', 'banco', 'tipo_cuenta',
    'contacto_emergencia', 'telefono_emergencia', 'foto_url',
  ];

  private limpiarEmpleadoData(empleadoData: any) {
    return Object.fromEntries(
      Object.entries(empleadoData || {})
        .filter(([key]) => this.CAMPOS_EMPLEADO_PERMITIDOS.includes(key))
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
        .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    );
  }

  private validarEmpleadoData(datos: Record<string, any>, partial = false) {
    const requeridos = ['nombres', 'apellidos', 'numero_documento'];
    if (!partial) {
      const faltantes = requeridos.filter((campo) => !datos[campo]);
      if (faltantes.length > 0) {
        throw new BadRequestException(`Campos requeridos faltantes: ${faltantes.join(', ')}`);
      }
    }

    if (datos.tipo_documento && !['DNI', 'CE', 'Pasaporte'].includes(datos.tipo_documento)) {
      throw new BadRequestException('Tipo de documento inválido');
    }

    if (datos.tipo_documento === 'DNI' && datos.numero_documento && !/^\d{8}$/.test(String(datos.numero_documento))) {
      throw new BadRequestException('El DNI debe tener 8 dígitos');
    }

    if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(datos.email))) {
      throw new BadRequestException('Email inválido');
    }

    if (datos.cantidad_hijos !== undefined && Number(datos.cantidad_hijos) < 0) {
      throw new BadRequestException('La cantidad de hijos no puede ser negativa');
    }
  }

  private async validarDocumentoUnico(tenantId: string, numeroDocumento: string, empleadoId?: string) {
    let query = this.supabaseService
      .getClient()
      .from('empleados')
      .select('id, estado')
      .eq('tenant_id', tenantId)
      .eq('numero_documento', numeroDocumento)
      .limit(1);

    if (empleadoId) {
      query = query.neq('id', empleadoId);
    }

    const { data, error } = await query;
    if (error) throw error;
    if ((data || []).length > 0) {
      throw new ConflictException('Ya existe un empleado con el mismo documento de identidad');
    }
  }

  private estadoActivoPatch(estado: unknown) {
    if (typeof estado !== 'string') return {};
    const normalizado = estado.trim().toLowerCase();
    if (normalizado === 'activo') return { estado: 'activo', activo: true };
    if (normalizado === 'inactivo') return { estado: 'inactivo', activo: false };
    throw new BadRequestException('Estado de empleado inválido');
  }

  async createEmpleado(empleadoData: any, tenantId?: string) {
    // ✅ MULTI-TENANT: Agregar tenant_id al crear
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const datosLimpios = this.limpiarEmpleadoData(empleadoData);
    this.validarEmpleadoData(datosLimpios);
    await this.validarDocumentoUnico(currentTenantId, String(datosLimpios.numero_documento));

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleados')
      .insert({
        ...datosLimpios,
        tipo_documento: datosLimpios.tipo_documento || 'DNI',
        ...this.estadoActivoPatch(datosLimpios.estado || 'activo'),
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

    const datosLimpios = this.limpiarEmpleadoData(empleadoData);
    this.validarEmpleadoData(datosLimpios, true);
    if (datosLimpios.numero_documento) {
      await this.validarDocumentoUnico(currentTenantId, String(datosLimpios.numero_documento), id);
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleados')
      .update({
        ...datosLimpios,
        ...this.estadoActivoPatch(datosLimpios.estado),
      })
      .eq('id', id)
      .eq('tenant_id', currentTenantId) // ✅ Validar tenant
      .select();

    if (error) throw error;
    if (!data?.[0]) {
      throw new NotFoundException('Empleado no encontrado');
    }
    return data[0];
  }

  async deleteEmpleado(id: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Validar tenant al eliminar
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('empleados')
      .update({ estado: 'inactivo', activo: false })
      .eq('id', id)
      .eq('tenant_id', currentTenantId)
      .select('id, estado')
      .single();

    if (error) throw error;
    if (!data?.id) {
      throw new NotFoundException('Empleado no encontrado');
    }
    return { success: true, message: 'Empleado inactivado exitosamente', data };
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
        candidatos!candidatos_id_vacante_fkey(count)
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
    // Validación mínima (el endpoint recibe `any`): evita vacantes vacías/basura.
    const titulo = (vacanteData?.titulo ?? '').toString().trim();
    const puesto = (vacanteData?.puesto_solicitado ?? '').toString().trim();
    if (!titulo || !puesto) {
      throw new BadRequestException('La vacante requiere al menos un título y el puesto solicitado');
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
        vacantes!candidatos_id_vacante_fkey(titulo, puesto_solicitado)
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
    // El endpoint recibe `any` (sin DTO), así que la validación mínima de identidad
    // vive aquí para no insertar candidatos vacíos/basura en la tabla.
    const nombres = (candidatoData?.nombres ?? '').toString().trim();
    const apellidos = (candidatoData?.apellidos ?? '').toString().trim();
    if (!nombres || !apellidos) {
      throw new BadRequestException('El candidato requiere al menos nombres y apellidos');
    }
    const currentTenantId = tenantId;

    // Postgres rechaza '' en columnas date/numeric. El modal envía '' en campos
    // opcionales (fecha_nacimiento, etc.) → se normalizan a null antes de insertar,
    // evitando el 500 "invalid input syntax for type date".
    const sanitized = Object.fromEntries(
      Object.entries(candidatoData ?? {}).map(([k, v]) => [k, v === '' ? null : v]),
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('candidatos')
      .insert({ ...sanitized, tenant_id: currentTenantId })
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

    // Verificar que el empleado pertenece al tenant
    const { data: empleado, error: empError } = await this.supabaseService
      .getClient()
      .from('empleados')
      .select('id')
      .eq('id', empleadoId)
      .eq('tenant_id', currentTenantId)
      .single();

    if (empError || !empleado) {
      throw new NotFoundException('Empleado no encontrado en este tenant');
    }

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
        throw new ConflictException('Ya se registró entrada para este día');
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

      // 🎯 EMITIR EVENTO DE ASISTENCIA (si eventBus está disponible)
      if (this.eventBus) {
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
      }

      return { success: true, data: data?.[0], message: 'Entrada registrada' };
    } else {
      if (!registroExistente || registroExistente.hora_salida) {
        throw new BadRequestException(
          'No se puede registrar salida sin entrada o ya se registró salida',
        );
      }

      // Calcular horas trabajadas
      const entrada = new Date(`${hoy}T${registroExistente.hora_entrada}`);
      const salida = new Date(`${hoy}T${horaActual}`);
      
      // ✅ FIX: Validar que hora de salida sea posterior a hora de entrada
      if (salida.getTime() <= entrada.getTime()) {
        throw new BadRequestException(
          `La hora de salida (${horaActual}) debe ser posterior a la hora de entrada (${registroExistente.hora_entrada})`,
        );
      }
      
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

      // 🎯 EMITIR EVENTO DE ASISTENCIA COMPLETADA (si eventBus está disponible)
      const horasExtras = Math.max(0, horasTrabajadas - 8); // Considerar extras si excede 8 horas

      if (this.eventBus) {
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
          `✅ [RRHH] Evento de salida emitido - ${horasTrabajadas.toFixed(2)} horas trabajadas`,
        );
      }

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
    // CTS según D.S. 001-97-TR: base = sueldo + 1/6 de última gratificación
    const gratificacion = sueldoMensual; // Gratificación = 1 sueldo
    const remuneracionComputableCts = sueldoMensual + (gratificacion / 6);
    const montoCts = (remuneracionComputableCts / 360) * diasCts;

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
    // ✅ FIX: Cálculo de CTS según ley peruana (D.S. 001-97-TR)
    // CTS se deposita en mayo y noviembre (semestral)
    // Se calcula: (Sueldo + 1/6 Gratificación) / 12 * meses trabajados
    // Simplificado: 1 sueldo por cada año completo de servicios
    
    const mesesTrabajados =
      (fechaTerminacion.getFullYear() - fechaIngreso.getFullYear()) * 12 +
      (fechaTerminacion.getMonth() - fechaIngreso.getMonth());
    
    // Días de CTS = meses trabajados (se paga 1/12 del sueldo por mes)
    // En la práctica, se acumula 1 sueldo por año = 30 días por año
    const diasCts = Math.floor(mesesTrabajados * (30 / 12)); // 2.5 días por mes
    
    return diasCts;
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

  async generarComprobantePago(pagoId: string, tenantId?: string): Promise<Buffer> {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }

    const client = this.supabaseService.getClient();
    const { data: pago, error: pagoError } = await client
      .from('rrhh_pagos')
      .select('*')
      .eq('id', pagoId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (pagoError) {
      throw new BadRequestException(`No se pudo leer el pago: ${pagoError.message}`);
    }
    if (!pago) {
      throw new NotFoundException('Pago de RRHH no encontrado');
    }

    let empleado: any = null;
    if (pago.empleado_id) {
      const { data } = await client
        .from('empleados')
        .select('*')
        .eq('id', pago.empleado_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      empleado = data;
    }

    return this.createRrhhPdf((doc) => {
      const empleadoNombre = [empleado?.nombres, empleado?.apellidos].filter(Boolean).join(' ') || 'No consignado';
      const documento = empleado?.numero_documento || empleado?.documento_numero || 'No consignado';
      const montoNeto = Number(pago.monto_neto ?? pago.monto ?? pago.total_neto ?? 0);

      doc.fontSize(20).text('COMPROBANTE DE PAGO RRHH', { align: 'center' });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Comprobante: ${pago.id}`);
      doc.text(`Empleado: ${empleadoNombre}`);
      doc.text(`Documento: ${documento}`);
      doc.text(`Periodo: ${pago.periodo || 'No consignado'}`);
      doc.text(`Fecha de pago: ${pago.fecha_pago || pago.created_at || 'No consignada'}`);
      doc.text(`Método: ${pago.metodo_pago || pago.metodo || 'No consignado'}`);
      doc.text(`Estado: ${pago.estado || 'No consignado'}`);
      doc.moveDown();
      doc.fontSize(14).text(`Monto neto: S/ ${montoNeto.toFixed(2)}`, { align: 'right' });
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#555555').text(
        'Documento generado por el ERP a partir del registro persistido del pago.',
      );
    });
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
                <h3>Resumen Total</h3>
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

  // RMV vigente para el periodo del contrato. Prioriza la fila del tenant sobre la global.
  private async obtenerRmvVigente(periodo: string, tenantId: string): Promise<number> {
    const client = this.supabaseService.getClient();
    const base = () =>
      client
        .from('normativa_peru_periodos')
        .select('rmv')
        .eq('pais_codigo', 'PE')
        .eq('activo', true)
        .lte('periodo', periodo)
        .order('periodo', { ascending: false })
        .limit(1);

    const { data: propia } = await base().eq('tenant_id', tenantId).maybeSingle();
    if (propia?.rmv) return Number(propia.rmv);

    const { data: global } = await base().is('tenant_id', null).maybeSingle();
    return Number(global?.rmv) || RMV_PERU_FALLBACK;
  }

  // Valida el contrato contra la normativa laboral peruana (D.S. 003-97-TR).
  private async validarContratoPeru(contratoData: any, tenantId: string): Promise<void> {
    const tipo = String(contratoData?.tipo_contrato ?? '').trim().toLowerCase();
    const jornada = String(contratoData?.jornada_laboral ?? '').trim().toLowerCase();
    const sueldo = Number(contratoData?.sueldo_bruto ?? contratoData?.salario ?? 0);
    const fechaInicio = String(contratoData?.fecha_inicio ?? '').slice(0, 10);
    const fechaFin = String(contratoData?.fecha_fin ?? '').slice(0, 10);

    // Periodo de prueba: 3 meses de regla general, ampliable a 6 (calificados o de
    // confianza) y 12 (personal de direccion). LPCL art. 10.
    const periodoPrueba = Number(contratoData?.periodo_prueba_meses ?? 0);
    if (Number.isFinite(periodoPrueba) && periodoPrueba > 12) {
      throw new BadRequestException(
        'El periodo de prueba no puede superar 12 meses (máximo legal para personal de dirección).',
      );
    }

    // Contratos sujetos a modalidad: duracion maxima de 5 anios. LPCL art. 74.
    if (tipo === 'temporal' && fechaInicio && fechaFin) {
      const inicio = new Date(`${fechaInicio}T00:00:00`);
      const topeLegal = new Date(inicio);
      topeLegal.setFullYear(topeLegal.getFullYear() + 5);
      if (new Date(`${fechaFin}T00:00:00`) > topeLegal) {
        throw new BadRequestException(
          'Un contrato sujeto a modalidad no puede exceder 5 años de duración (D.S. 003-97-TR art. 74).',
        );
      }
    }

    // RMV: exigible en contratos laborales dependientes a jornada completa. No aplica a
    // part time ni a locacion de servicios (contrato civil, no laboral).
    const esContratoLaboral = tipo === 'indefinido' || tipo === 'temporal';
    const esJornadaCompleta = jornada === '' || jornada === 'tiempo_completo';
    if (esContratoLaboral && esJornadaCompleta && sueldo > 0) {
      const periodo = (fechaInicio || new Date().toISOString().slice(0, 10)).slice(0, 7);
      const rmv = await this.obtenerRmvVigente(periodo, tenantId);
      if (sueldo < rmv) {
        throw new BadRequestException(
          `La remuneración de un contrato a jornada completa no puede ser menor a la RMV vigente (S/ ${rmv.toFixed(2)}).`,
        );
      }
    }
  }

  async createContrato(contratoData: any, tenantId?: string) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;
    const empleadoId = contratoData?.id_empleado || contratoData?.empleado_id;
    if (!empleadoId) {
      throw new BadRequestException('Debe enviar empleado_id para crear contrato');
    }

    await this.validarContratoPeru(contratoData, currentTenantId);

    const metadataBase =
      contratoData?.metadata && typeof contratoData.metadata === 'object' && !Array.isArray(contratoData.metadata)
        ? contratoData.metadata
        : {};
    const metadata = {
      ...metadataBase,
      ...(contratoData?.cargo ? { cargo: String(contratoData.cargo).trim() } : {}),
    };
    const camposPermitidos = [
      'id',
      'id_empleado',
      'empleado_id',
      'tipo_contrato',
      'fecha_inicio',
      'fecha_fin',
      'sueldo_bruto',
      'salario',
      'moneda',
      'beneficios',
      'regimen_pensionario',
      'jornada_laboral',
      'periodo_prueba_meses',
      'fecha_firma',
      'estado',
      'activo',
      'metadata',
    ];
    const datosLimpios = Object.fromEntries(
      Object.entries({
        ...contratoData,
        id_empleado: empleadoId,
        empleado_id: empleadoId,
        sueldo_bruto: contratoData?.sueldo_bruto ?? contratoData?.salario,
        salario: contratoData?.salario ?? contratoData?.sueldo_bruto,
      })
        .filter(([key]) => camposPermitidos.includes(key))
        .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    );
    if (Object.keys(metadata).length > 0) {
      datosLimpios.metadata = metadata;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('contratos')
      .insert({
        ...datosLimpios,
        tenant_id: currentTenantId,
      })
      .select();

    if (error) {
      const isDuplicate = error.code === '23505' ||
        String(error.message || '').toLowerCase().includes('duplicate key');
      if (isDuplicate) {
        throw new ConflictException('Ya existe un contrato activo para el empleado, fecha y tipo indicados');
      }
      throw error;
    }
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

  async generarContratoPDF(contratoId: string, tenantId?: string): Promise<Buffer> {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }

    const client = this.supabaseService.getClient();
    const { data: contrato, error: contratoError } = await client
      .from('contratos')
      .select('*')
      .eq('id', contratoId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (contratoError) {
      throw new BadRequestException(`No se pudo leer el contrato: ${contratoError.message}`);
    }
    if (!contrato) {
      throw new NotFoundException('Contrato laboral no encontrado');
    }

    const empleadoId = contrato.empleado_id || contrato.id_empleado;
    let empleado: any = null;
    if (empleadoId) {
      const { data } = await client
        .from('empleados')
        .select('*')
        .eq('id', empleadoId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      empleado = data;
    }

    return this.createRrhhPdf((doc) => {
      const empleadoNombre = [empleado?.nombres, empleado?.apellidos].filter(Boolean).join(' ') || 'No consignado';
      const documento = empleado?.numero_documento || empleado?.documento_numero || 'No consignado';
      const salario = Number(
        contrato.sueldo_bruto ?? contrato.salario ?? contrato.sueldo ?? contrato.remuneracion ?? 0,
      );

      doc.fontSize(20).text('CONTRATO LABORAL', { align: 'center' });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Contrato: ${contrato.id}`);
      doc.text(`Empleado: ${empleadoNombre}`);
      doc.text(`Documento: ${documento}`);
      doc.text(`Puesto: ${empleado?.puesto || contrato.puesto || 'No consignado'}`);
      doc.text(`Tipo: ${contrato.tipo_contrato || contrato.tipo || 'No consignado'}`);
      doc.text(`Inicio: ${contrato.fecha_inicio || 'No consignado'}`);
      doc.text(`Fin: ${contrato.fecha_fin || 'Indefinido'}`);
      doc.text(`Estado: ${contrato.estado || 'No consignado'}`);
      doc.text(`Remuneración: S/ ${salario.toFixed(2)}`);
      if (contrato.observaciones) {
        doc.moveDown();
        doc.text(`Observaciones: ${contrato.observaciones}`);
      }
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#555555').text(
        'Representación generada desde el contrato persistido. La validez legal y firma corresponden al proceso laboral aplicable.',
      );
    });
  }

  private createRrhhPdf(render: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Creator: 'ERP RRHH' } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      render(doc);
      doc.end();
    });
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
        throw new ConflictException('Ya se registró entrada para este día');
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
      
      // ✅ FIX: Validar que hora de salida sea posterior a hora de entrada
      if (salida.getTime() <= entrada.getTime()) {
        throw new BadRequestException(
          `La hora de salida (${hora}) debe ser posterior a la hora de entrada (${registroExistente.hora_entrada})`,
        );
      }
      
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
