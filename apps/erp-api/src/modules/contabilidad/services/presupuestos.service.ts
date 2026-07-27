import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreatePresupuestoDto, UpdatePresupuestoDto, EstadoPresupuesto } from '@erp-suite/dtos';

export interface Presupuesto {
  id: string;
  tenant_id: string;
  centro_costo_id: string;
  cuenta_id: string;
  periodo_contable_id: string;
  monto_presupuestado: number;
  monto_ejecutado: number;
  monto_comprometido: number;
  monto_disponible: number;
  porcentaje_ejecutado: number;
  estado: EstadoPresupuesto;
  notas?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

@Injectable()
export class PresupuestosService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Crea un nuevo presupuesto
   * @param tenantId - ID del tenant
   * @param createPresupuestoDto - Datos del presupuesto a crear
   * @param userId - ID del usuario que crea el presupuesto
   * @returns Presupuesto creado
   * @throws BadRequestException si ya existe un presupuesto para el mismo centro, cuenta y período
   */
  async crearPresupuesto(
    tenantId: string,
    createPresupuestoDto: CreatePresupuestoDto,
    userId?: string
  ): Promise<Presupuesto> {
    const { centro_costo_id, cuenta_id, periodo_contable_id, monto_presupuestado, notas, estado } = createPresupuestoDto;

    console.log(`💰 [Presupuestos] Creando presupuesto para tenant ${tenantId}`);
    console.log(`   Centro de costo: ${centro_costo_id}`);
    console.log(`   Cuenta: ${cuenta_id}`);
    console.log(`   Período: ${periodo_contable_id}`);
    console.log(`   Monto: ${monto_presupuestado}`);

    // Validar que el monto sea positivo
    if (monto_presupuestado <= 0) {
      throw new BadRequestException('El monto presupuestado debe ser mayor a cero');
    }

    // Verificar que no exista un presupuesto duplicado
    const { data: existente, error: errorExistente } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('centro_costo_id', centro_costo_id)
      .eq('cuenta_id', cuenta_id)
      .eq('periodo_contable_id', periodo_contable_id)
      .maybeSingle();

    if (errorExistente) {
      console.error('❌ [Presupuestos] Error verificando duplicado:', errorExistente);
      throw new Error(`Error verificando presupuesto existente: ${errorExistente.message}`);
    }

    if (existente) {
      throw new BadRequestException(
        'Ya existe un presupuesto para este centro de costo, cuenta y período. ' +
        'Use el endpoint de actualización para modificarlo.'
      );
    }

    // Verificar que el centro de costo existe y pertenece al tenant
    const { data: centroCosto, error: errorCentro } = await this.supabaseService
      .getClient()
      .from('centros_costo')
      .select('id, nombre')
      .eq('id', centro_costo_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (errorCentro || !centroCosto) {
      throw new BadRequestException('El centro de costo especificado no existe o no pertenece a su organización');
    }

    // Verificar que la cuenta existe y pertenece al tenant
    const { data: cuenta, error: errorCuenta } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('id, codigo, nombre')
      .eq('id', cuenta_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (errorCuenta || !cuenta) {
      throw new BadRequestException('La cuenta contable especificada no existe o no pertenece a su organización');
    }

    // Verificar que el período existe y pertenece al tenant
    const { data: periodo, error: errorPeriodo } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('id, anio, mes, estado')
      .eq('id', periodo_contable_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (errorPeriodo || !periodo) {
      throw new BadRequestException('El período contable especificado no existe o no pertenece a su organización');
    }

    // Validar que el período no esté cerrado
    if (periodo.estado === 'CERRADO') {
      throw new BadRequestException(
        `No se puede crear un presupuesto para el período ${periodo.anio}-${String(periodo.mes).padStart(2, '0')} porque está CERRADO`
      );
    }

    // Crear el presupuesto
    const presupuestoData: any = {
      tenant_id: tenantId,
      centro_costo_id,
      cuenta_id,
      periodo_contable_id,
      monto_presupuestado,
      monto_ejecutado: 0,
      monto_comprometido: 0,
      estado: estado || EstadoPresupuesto.ACTIVO,
      notas: notas || null,
      created_by: userId || null,
      updated_by: userId || null
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .insert(presupuestoData)
      .select()
      .single();

    if (error) {
      console.error('❌ [Presupuestos] Error creando presupuesto:', error);
      throw new Error(`Error creando presupuesto: ${error.message}`);
    }

    console.log(`✅ [Presupuestos] Presupuesto creado exitosamente: ${data.id}`);
    console.log(`   Centro: ${centroCosto.nombre}`);
    console.log(`   Cuenta: ${cuenta.codigo} - ${cuenta.nombre}`);
    console.log(`   Período: ${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`);
    console.log(`   Monto presupuestado: S/ ${monto_presupuestado.toFixed(2)}`);

    return data as Presupuesto;
  }

  /**
   * Obtiene todos los presupuestos de un tenant con filtros opcionales
   * @param tenantId - ID del tenant
   * @param filters - Filtros opcionales (centro_costo_id, cuenta_id, periodo_contable_id, estado)
   * @returns Lista de presupuestos
   */
  async obtenerPresupuestos(
    tenantId: string,
    filters?: {
      centro_costo_id?: string;
      cuenta_id?: string;
      periodo_contable_id?: string;
      estado?: EstadoPresupuesto;
    }
  ): Promise<Presupuesto[]> {
    console.log(`💰 [Presupuestos] Obteniendo presupuestos para tenant ${tenantId}`);

    let query = this.supabaseService
      .getClient()
      .from('presupuestos')
      .select('*')
      .eq('tenant_id', tenantId);

    // Aplicar filtros si existen
    if (filters?.centro_costo_id) {
      query = query.eq('centro_costo_id', filters.centro_costo_id);
    }
    if (filters?.cuenta_id) {
      query = query.eq('cuenta_id', filters.cuenta_id);
    }
    if (filters?.periodo_contable_id) {
      query = query.eq('periodo_contable_id', filters.periodo_contable_id);
    }
    if (filters?.estado) {
      query = query.eq('estado', filters.estado);
    }

    // Ordenar por fecha de creación descendente
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('❌ [Presupuestos] Error obteniendo presupuestos:', error);
      throw new Error(`Error obteniendo presupuestos: ${error.message}`);
    }

    console.log(`✅ [Presupuestos] ${data.length} presupuestos encontrados`);

    return data as Presupuesto[];
  }

  /**
   * Obtiene un presupuesto específico por ID
   * @param tenantId - ID del tenant
   * @param presupuestoId - ID del presupuesto
   * @returns Presupuesto encontrado
   * @throws NotFoundException si el presupuesto no existe
   */
  async obtenerPresupuestoPorId(
    tenantId: string,
    presupuestoId: string
  ): Promise<Presupuesto> {
    console.log(`💰 [Presupuestos] Obteniendo presupuesto ${presupuestoId} para tenant ${tenantId}`);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .select('*')
      .eq('id', presupuestoId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('❌ [Presupuestos] Error obteniendo presupuesto:', error);
      throw new Error(`Error obteniendo presupuesto: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundException(`Presupuesto con ID ${presupuestoId} no encontrado`);
    }

    console.log(`✅ [Presupuestos] Presupuesto encontrado: ${data.id}`);

    return data as Presupuesto;
  }

  /**
   * Actualiza un presupuesto existente
   * @param tenantId - ID del tenant
   * @param presupuestoId - ID del presupuesto a actualizar
   * @param updatePresupuestoDto - Datos a actualizar
   * @param userId - ID del usuario que actualiza el presupuesto
   * @returns Presupuesto actualizado
   * @throws NotFoundException si el presupuesto no existe
   * @throws BadRequestException si el período está cerrado o los datos son inválidos
   */
  async actualizarPresupuesto(
    tenantId: string,
    presupuestoId: string,
    updatePresupuestoDto: UpdatePresupuestoDto,
    userId?: string
  ): Promise<Presupuesto> {
    const { monto_presupuestado, notas, estado } = updatePresupuestoDto;

    console.log(`💰 [Presupuestos] Actualizando presupuesto ${presupuestoId} para tenant ${tenantId}`);

    // Verificar que el presupuesto existe y pertenece al tenant
    const presupuestoExistente = await this.obtenerPresupuestoPorId(tenantId, presupuestoId);

    // Verificar que el período no esté cerrado
    const { data: periodo, error: errorPeriodo } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('id, anio, mes, estado')
      .eq('id', presupuestoExistente.periodo_contable_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (errorPeriodo || !periodo) {
      throw new BadRequestException('El período contable asociado no existe');
    }

    if (periodo.estado === 'CERRADO') {
      throw new BadRequestException(
        `No se puede actualizar el presupuesto porque el período ${periodo.anio}-${String(periodo.mes).padStart(2, '0')} está CERRADO`
      );
    }

    // Validar que el monto sea positivo si se está actualizando
    if (monto_presupuestado !== undefined && monto_presupuestado <= 0) {
      throw new BadRequestException('El monto presupuestado debe ser mayor a cero');
    }

    // Construir objeto de actualización solo con campos proporcionados
    const updateData: any = {
      updated_by: userId || null,
      updated_at: new Date().toISOString()
    };

    if (monto_presupuestado !== undefined) {
      updateData.monto_presupuestado = monto_presupuestado;
    }

    if (notas !== undefined) {
      updateData.notas = notas;
    }

    if (estado !== undefined) {
      updateData.estado = estado;
    }

    // Actualizar el presupuesto
    const { data, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .update(updateData)
      .eq('id', presupuestoId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('❌ [Presupuestos] Error actualizando presupuesto:', error);
      throw new Error(`Error actualizando presupuesto: ${error.message}`);
    }

    console.log(`✅ [Presupuestos] Presupuesto actualizado exitosamente: ${data.id}`);
    if (monto_presupuestado !== undefined) {
      console.log(`   Monto presupuestado: S/ ${presupuestoExistente.monto_presupuestado.toFixed(2)} → S/ ${monto_presupuestado.toFixed(2)}`);
    }
    if (estado !== undefined) {
      console.log(`   Estado: ${presupuestoExistente.estado} → ${estado}`);
    }

    return data as Presupuesto;
  }

  /**
   * Elimina un presupuesto existente
   * @param tenantId - ID del tenant
   * @param presupuestoId - ID del presupuesto a eliminar
   * @returns Presupuesto eliminado
   * @throws NotFoundException si el presupuesto no existe
   * @throws BadRequestException si el período está cerrado
   */
  async eliminarPresupuesto(
    tenantId: string,
    presupuestoId: string
  ): Promise<Presupuesto> {
    console.log(`💰 [Presupuestos] Eliminando presupuesto ${presupuestoId} para tenant ${tenantId}`);

    // Verificar que el presupuesto existe y pertenece al tenant
    const presupuestoExistente = await this.obtenerPresupuestoPorId(tenantId, presupuestoId);

    // Verificar que el período no esté cerrado
    const { data: periodo, error: errorPeriodo } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('id, anio, mes, estado')
      .eq('id', presupuestoExistente.periodo_contable_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (errorPeriodo || !periodo) {
      throw new BadRequestException('El período contable asociado no existe');
    }

    if (periodo.estado === 'CERRADO') {
      throw new BadRequestException(
        `No se puede eliminar el presupuesto porque el período ${periodo.anio}-${String(periodo.mes).padStart(2, '0')} está CERRADO`
      );
    }

    // Eliminar el presupuesto
    const { data, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .delete()
      .eq('id', presupuestoId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('❌ [Presupuestos] Error eliminando presupuesto:', error);
      throw new Error(`Error eliminando presupuesto: ${error.message}`);
    }

    console.log(`✅ [Presupuestos] Presupuesto eliminado exitosamente: ${data.id}`);
    console.log(`   Período: ${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`);
    console.log(`   Monto presupuestado: S/ ${presupuestoExistente.monto_presupuestado.toFixed(2)}`);

    return data as Presupuesto;
  }

  /**
   * Calcula el monto ejecutado de un presupuesto basado en los asientos contables
   * @param tenantId - ID del tenant
   * @param centroCostoId - ID del centro de costo
   * @param cuentaId - ID de la cuenta contable
   * @param periodoContableId - ID del período contable
   * @returns Monto ejecutado
   */
  async calcularMontoEjecutado(
    tenantId: string,
    centroCostoId: string,
    cuentaId: string,
    periodoContableId: string
  ): Promise<number> {
    // Obtener el período para saber el año y mes
    const { data: periodo, error: errorPeriodo } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('anio, mes')
      .eq('id', periodoContableId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (errorPeriodo || !periodo) {
      console.warn(`⚠️ [Presupuestos] Período ${periodoContableId} no encontrado`);
      return 0;
    }

    // Calcular el rango de fechas del período
    const fechaInicio = new Date(periodo.anio, periodo.mes - 1, 1);
    const fechaFin = new Date(periodo.anio, periodo.mes, 0, 23, 59, 59);

    // Sumar todos los movimientos (debe - haber) de la cuenta en el período
    const { data: movimientos, error: errorMovimientos } = await this.supabaseService
      .getClient()
      .from('detalle_asientos')
      .select(`
        debe,
        haber,
        asientos_contables!inner(
          fecha,
          tenant_id
        )
      `)
      .eq('cuenta_id', cuentaId)
      .eq('centro_costo_id', centroCostoId)
      .eq('asientos_contables.tenant_id', tenantId)
      .gte('asientos_contables.fecha', fechaInicio.toISOString())
      .lte('asientos_contables.fecha', fechaFin.toISOString());

    if (errorMovimientos) {
      console.error('❌ [Presupuestos] Error calculando monto ejecutado:', errorMovimientos);
      return 0;
    }

    if (!movimientos || movimientos.length === 0) {
      return 0;
    }

    // Sumar debe y restar haber (para cuentas de gasto, debe es positivo)
    const montoEjecutado = movimientos.reduce((sum, mov) => {
      return sum + (mov.debe || 0) - (mov.haber || 0);
    }, 0);

    return Math.abs(montoEjecutado); // Retornar valor absoluto
  }

  /**
   * Obtiene todos los presupuestos de un centro de costo en un período específico
   * @param tenantId - ID del tenant
   * @param centroCostoId - ID del centro de costo
   * @param periodoContableId - ID del período contable
   * @returns Lista de presupuestos con información detallada
   */
  async obtenerPresupuestosPorCentroYPeriodo(
    tenantId: string,
    centroCostoId: string,
    periodoContableId: string
  ): Promise<any[]> {
    console.log(`💰 [Presupuestos] Obteniendo presupuestos para centro ${centroCostoId} y período ${periodoContableId}`);

    // Obtener presupuestos del centro y período
    const { data: presupuestos, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .select(`
        *,
        centros_costo:centro_costo_id (
          id,
          codigo,
          nombre,
          descripcion
        ),
        plan_cuentas:cuenta_id (
          id,
          codigo,
          nombre,
          tipo_cuenta
        ),
        periodos_contables:periodo_contable_id (
          id,
          anio,
          mes,
          estado
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('centro_costo_id', centroCostoId)
      .eq('periodo_contable_id', periodoContableId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [Presupuestos] Error obteniendo presupuestos:', error);
      throw new Error(`Error obteniendo presupuestos: ${error.message}`);
    }

    if (!presupuestos || presupuestos.length === 0) {
      console.log(`ℹ️ [Presupuestos] No se encontraron presupuestos para centro ${centroCostoId} y período ${periodoContableId}`);
      return [];
    }

    // Calcular monto ejecutado y disponible para cada presupuesto
    const presupuestosConCalculos = await Promise.all(
      presupuestos.map(async (presupuesto) => {
        const montoEjecutado = await this.calcularMontoEjecutado(
          tenantId,
          centroCostoId,
          presupuesto.cuenta_id,
          periodoContableId
        );

        const montoDisponible = presupuesto.monto_presupuestado - montoEjecutado - (presupuesto.monto_comprometido || 0);
        const porcentajeEjecutado = presupuesto.monto_presupuestado > 0
          ? (montoEjecutado / presupuesto.monto_presupuestado) * 100
          : 0;

        return {
          ...presupuesto,
          monto_ejecutado: montoEjecutado,
          monto_disponible: montoDisponible,
          porcentaje_ejecutado: porcentajeEjecutado,
          alerta: porcentajeEjecutado > 100 ? 'SOBREGIRO' : porcentajeEjecutado > 90 ? 'ADVERTENCIA' : 'NORMAL'
        };
      })
    );

    console.log(`✅ [Presupuestos] ${presupuestosConCalculos.length} presupuesto(s) encontrado(s) con cálculos actualizados`);

    return presupuestosConCalculos;
  }

  /**
   * Actualiza el monto ejecutado de un presupuesto específico basado en los asientos contables
   * @param tenantId - ID del tenant
   * @param presupuestoId - ID del presupuesto
   * @returns Presupuesto actualizado con monto ejecutado y porcentaje recalculados
   */
  async actualizarEjecucionPresupuestal(
    tenantId: string,
    presupuestoId: string
  ): Promise<Presupuesto> {
    console.log(`💰 [Presupuestos] Actualizando ejecución presupuestal para presupuesto ${presupuestoId}`);

    // Obtener el presupuesto
    const presupuesto = await this.obtenerPresupuestoPorId(tenantId, presupuestoId);

    // Calcular el monto ejecutado desde los asientos contables
    const montoEjecutado = await this.calcularMontoEjecutado(
      tenantId,
      presupuesto.centro_costo_id,
      presupuesto.cuenta_id,
      presupuesto.periodo_contable_id
    );

    // Actualizar el monto ejecutado en la base de datos
    // El porcentaje_ejecutado y monto_disponible se recalcularán automáticamente (columnas generadas)
    const { data, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .update({
        monto_ejecutado: montoEjecutado,
        updated_at: new Date().toISOString()
      })
      .eq('id', presupuestoId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('❌ [Presupuestos] Error actualizando ejecución presupuestal:', error);
      throw new Error(`Error actualizando ejecución presupuestal: ${error.message}`);
    }

    const presupuestoActualizado = data as Presupuesto;

    console.log(`✅ [Presupuestos] Ejecución presupuestal actualizada:`);
    console.log(`   Monto ejecutado: S/ ${montoEjecutado.toFixed(2)}`);
    console.log(`   Porcentaje ejecutado: ${presupuestoActualizado.porcentaje_ejecutado}%`);
    console.log(`   Monto disponible: S/ ${presupuestoActualizado.monto_disponible.toFixed(2)}`);

    // Determinar nivel de alerta
    const porcentaje = presupuestoActualizado.porcentaje_ejecutado;
    if (porcentaje > 100) {
      console.warn(`🚨 [Presupuestos] SOBREGIRO detectado: ${porcentaje}%`);
    } else if (porcentaje > 90) {
      console.warn(`⚠️ [Presupuestos] ADVERTENCIA: ${porcentaje}% ejecutado`);
    }

    return presupuestoActualizado;
  }

  /**
   * Actualiza la ejecución presupuestal de todos los presupuestos de un período
   * @param tenantId - ID del tenant
   * @param periodoContableId - ID del período contable
   * @returns Número de presupuestos actualizados
   */
  async actualizarEjecucionPresupuestalPorPeriodo(
    tenantId: string,
    periodoContableId: string
  ): Promise<{ actualizados: number; errores: number }> {
    console.log(`💰 [Presupuestos] Actualizando ejecución presupuestal para todos los presupuestos del período ${periodoContableId}`);

    // Obtener todos los presupuestos del período
    const presupuestos = await this.obtenerPresupuestos(tenantId, {
      periodo_contable_id: periodoContableId
    });

    if (presupuestos.length === 0) {
      console.log(`ℹ️ [Presupuestos] No hay presupuestos para actualizar en el período ${periodoContableId}`);
      return { actualizados: 0, errores: 0 };
    }

    let actualizados = 0;
    let errores = 0;

    // Actualizar cada presupuesto
    for (const presupuesto of presupuestos) {
      try {
        await this.actualizarEjecucionPresupuestal(tenantId, presupuesto.id);
        actualizados++;
      } catch (error) {
        console.error(`❌ [Presupuestos] Error actualizando presupuesto ${presupuesto.id}:`, error);
        errores++;
      }
    }

    console.log(`✅ [Presupuestos] Actualización masiva completada:`);
    console.log(`   Actualizados: ${actualizados}`);
    console.log(`   Errores: ${errores}`);

    return { actualizados, errores };
  }

  /**
   * Obtiene comparación de presupuesto vs real para todos los centros de costo en un período
   * @param tenantId - ID del tenant
   * @param periodoContableId - ID del período contable
   * @returns Comparación detallada de presupuesto vs real por centro de costo
   */
  async obtenerComparacionPresupuestoVsReal(
    tenantId: string,
    periodoContableId: string
  ): Promise<any> {
    console.log(`💰 [Presupuestos] Obteniendo comparación presupuesto vs real para período ${periodoContableId}`);

    // Verificar que el período existe y pertenece al tenant
    const { data: periodo, error: errorPeriodo } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('id, anio, mes, estado')
      .eq('id', periodoContableId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (errorPeriodo || !periodo) {
      throw new Error('Período contable no encontrado o no pertenece a su organización');
    }

    // Obtener todos los presupuestos del período con información de centros y cuentas
    const { data: presupuestos, error: errorPresupuestos } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .select(`
        *,
        centros_costo:centro_costo_id (
          id,
          codigo,
          nombre,
          descripcion
        ),
        plan_cuentas:cuenta_id (
          id,
          codigo,
          nombre,
          tipo_cuenta
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('periodo_contable_id', periodoContableId)
      .order('centro_costo_id', { ascending: true });

    if (errorPresupuestos) {
      console.error('❌ [Presupuestos] Error obteniendo presupuestos:', errorPresupuestos);
      throw new Error(`Error obteniendo presupuestos: ${errorPresupuestos.message}`);
    }

    if (!presupuestos || presupuestos.length === 0) {
      console.log(`ℹ️ [Presupuestos] No se encontraron presupuestos para el período ${periodoContableId}`);
      return {
        periodo: periodo,
        centros_costo: [],
        resumen_global: {
          total_presupuestado: 0,
          total_ejecutado: 0,
          total_comprometido: 0,
          total_disponible: 0,
          total_variacion: 0,
          porcentaje_ejecucion: 0,
          variacion_porcentaje: 0,
          total_centros: 0,
          total_cuentas: 0,
          alertas: {
            sobregiros: 0,
            advertencias: 0,
            normales: 0
          }
        }
      };
    }

    presupuestos.sort((a, b) => {
      const centroCompare = String(a.centro_costo_id || '').localeCompare(String(b.centro_costo_id || ''));
      if (centroCompare !== 0) return centroCompare;
      return String(a.plan_cuentas?.codigo || '').localeCompare(String(b.plan_cuentas?.codigo || ''));
    });

    // Calcular monto ejecutado para cada presupuesto
    const presupuestosConCalculos = await Promise.all(
      presupuestos.map(async (presupuesto) => {
        const montoEjecutado = await this.calcularMontoEjecutado(
          tenantId,
          presupuesto.centro_costo_id,
          presupuesto.cuenta_id,
          periodoContableId
        );

        const montoDisponible = presupuesto.monto_presupuestado - montoEjecutado - (presupuesto.monto_comprometido || 0);
        const porcentajeEjecutado = presupuesto.monto_presupuestado > 0
          ? (montoEjecutado / presupuesto.monto_presupuestado) * 100
          : 0;

        const variacion = montoEjecutado - presupuesto.monto_presupuestado;
        const variacionPorcentaje = presupuesto.monto_presupuestado > 0
          ? (variacion / presupuesto.monto_presupuestado) * 100
          : 0;

        return {
          ...presupuesto,
          monto_ejecutado: montoEjecutado,
          monto_disponible: montoDisponible,
          porcentaje_ejecutado: porcentajeEjecutado,
          variacion: variacion,
          variacion_porcentaje: variacionPorcentaje,
          alerta: porcentajeEjecutado > 100 ? 'SOBREGIRO' : porcentajeEjecutado > 90 ? 'ADVERTENCIA' : 'NORMAL'
        };
      })
    );

    // Agrupar por centro de costo
    const presupuestosPorCentro = presupuestosConCalculos.reduce((acc, presupuesto) => {
      const centroCostoId = presupuesto.centro_costo_id;
      if (!acc[centroCostoId]) {
        acc[centroCostoId] = {
          centro_costo: presupuesto.centros_costo,
          cuentas: [],
          totales: {
            presupuestado: 0,
            ejecutado: 0,
            comprometido: 0,
            disponible: 0,
            variacion: 0
          }
        };
      }

      acc[centroCostoId].cuentas.push({
        cuenta: presupuesto.plan_cuentas,
        monto_presupuestado: presupuesto.monto_presupuestado,
        monto_ejecutado: presupuesto.monto_ejecutado,
        monto_comprometido: presupuesto.monto_comprometido || 0,
        monto_disponible: presupuesto.monto_disponible,
        porcentaje_ejecutado: presupuesto.porcentaje_ejecutado,
        variacion: presupuesto.variacion,
        variacion_porcentaje: presupuesto.variacion_porcentaje,
        alerta: presupuesto.alerta,
        estado: presupuesto.estado,
        notas: presupuesto.notas
      });

      // Acumular totales por centro
      acc[centroCostoId].totales.presupuestado += presupuesto.monto_presupuestado;
      acc[centroCostoId].totales.ejecutado += presupuesto.monto_ejecutado;
      acc[centroCostoId].totales.comprometido += presupuesto.monto_comprometido || 0;
      acc[centroCostoId].totales.disponible += presupuesto.monto_disponible;
      acc[centroCostoId].totales.variacion += presupuesto.variacion;

      return acc;
    }, {} as Record<string, any>);

    // Calcular porcentajes de ejecución por centro
    const centrosCosto = Object.values(presupuestosPorCentro).map((centro: any) => {
      const porcentajeEjecucion = centro.totales.presupuestado > 0
        ? (centro.totales.ejecutado / centro.totales.presupuestado) * 100
        : 0;

      const variacionPorcentaje = centro.totales.presupuestado > 0
        ? (centro.totales.variacion / centro.totales.presupuestado) * 100
        : 0;

      return {
        ...centro,
        totales: {
          ...centro.totales,
          porcentaje_ejecucion: porcentajeEjecucion,
          variacion_porcentaje: variacionPorcentaje,
          alerta: porcentajeEjecucion > 100 ? 'SOBREGIRO' : porcentajeEjecucion > 90 ? 'ADVERTENCIA' : 'NORMAL'
        }
      };
    });

    // Calcular resumen global
    const totalPresupuestado = centrosCosto.reduce((sum, c) => sum + c.totales.presupuestado, 0);
    const totalEjecutado = centrosCosto.reduce((sum, c) => sum + c.totales.ejecutado, 0);
    const totalComprometido = centrosCosto.reduce((sum, c) => sum + c.totales.comprometido, 0);
    const totalDisponible = centrosCosto.reduce((sum, c) => sum + c.totales.disponible, 0);
    const totalVariacion = centrosCosto.reduce((sum, c) => sum + c.totales.variacion, 0);

    const porcentajeEjecucionGlobal = totalPresupuestado > 0
      ? (totalEjecutado / totalPresupuestado) * 100
      : 0;

    const variacionPorcentajeGlobal = totalPresupuestado > 0
      ? (totalVariacion / totalPresupuestado) * 100
      : 0;

    const totalCuentas = presupuestosConCalculos.length;
    const totalCentros = centrosCosto.length;

    // Contar alertas
    const alertas = {
      sobregiros: presupuestosConCalculos.filter(p => p.alerta === 'SOBREGIRO').length,
      advertencias: presupuestosConCalculos.filter(p => p.alerta === 'ADVERTENCIA').length,
      normales: presupuestosConCalculos.filter(p => p.alerta === 'NORMAL').length
    };

    console.log(`✅ [Presupuestos] Comparación generada: ${totalCentros} centros, ${totalCuentas} cuentas`);
    console.log(`   Total presupuestado: S/ ${totalPresupuestado.toFixed(2)}`);
    console.log(`   Total ejecutado: S/ ${totalEjecutado.toFixed(2)} (${porcentajeEjecucionGlobal.toFixed(2)}%)`);
    console.log(`   Alertas: ${alertas.sobregiros} sobregiros, ${alertas.advertencias} advertencias`);

    return {
      periodo: {
        id: periodo.id,
        anio: periodo.anio,
        mes: periodo.mes,
        estado: periodo.estado,
        descripcion: `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`
      },
      centros_costo: centrosCosto,
      resumen_global: {
        total_presupuestado: totalPresupuestado,
        total_ejecutado: totalEjecutado,
        total_comprometido: totalComprometido,
        total_disponible: totalDisponible,
        total_variacion: totalVariacion,
        porcentaje_ejecucion: porcentajeEjecucionGlobal,
        variacion_porcentaje: variacionPorcentajeGlobal,
        total_centros: totalCentros,
        total_cuentas: totalCuentas,
        alertas: alertas
      }
    };
  }

  /**
   * Obtiene todas las alertas de sobregiro presupuestal activas
   * @param tenantId - ID del tenant
   * @param periodoContableId - ID del período contable (opcional, si no se proporciona obtiene del período actual)
   * @returns Lista de alertas de presupuestos con advertencias o sobregiros
   */
  async obtenerAlertasSobregiro(
    tenantId: string,
    periodoContableId?: string
  ): Promise<any[]> {
    console.log(`🚨 [Presupuestos] Obteniendo alertas de sobregiro para tenant ${tenantId}`);

    let periodoId = periodoContableId;

    // Si no se proporciona período, obtener el período actual (ABIERTO más reciente)
    if (!periodoId) {
      const { data: periodoActual, error: errorPeriodo } = await this.supabaseService
        .getClient()
        .from('periodos_contables')
        .select('id, anio, mes')
        .eq('tenant_id', tenantId)
        .eq('estado', 'ABIERTO')
        .order('anio', { ascending: false })
        .order('mes', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorPeriodo || !periodoActual) {
        console.log(`ℹ️ [Presupuestos] No hay período abierto para obtener alertas`);
        return [];
      }

      periodoId = periodoActual.id;
      console.log(`   Usando período actual: ${periodoActual.anio}-${String(periodoActual.mes).padStart(2, '0')}`);
    }

    // Obtener todos los presupuestos activos del período
    const { data: presupuestos, error } = await this.supabaseService
      .getClient()
      .from('presupuestos')
      .select(`
        *,
        centros_costo:centro_costo_id (
          id,
          codigo,
          nombre,
          descripcion
        ),
        plan_cuentas:cuenta_id (
          id,
          codigo,
          nombre,
          tipo_cuenta
        ),
        periodos_contables:periodo_contable_id (
          id,
          anio,
          mes,
          estado
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('periodo_contable_id', periodoId)
      .eq('estado', EstadoPresupuesto.ACTIVO)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [Presupuestos] Error obteniendo presupuestos:', error);
      throw new Error(`Error obteniendo presupuestos: ${error.message}`);
    }

    if (!presupuestos || presupuestos.length === 0) {
      console.log(`ℹ️ [Presupuestos] No hay presupuestos activos en el período`);
      return [];
    }

    // Calcular monto ejecutado y determinar alertas
    const alertas: any[] = [];

    for (const presupuesto of presupuestos) {
      const montoEjecutado = await this.calcularMontoEjecutado(
        tenantId,
        presupuesto.centro_costo_id,
        presupuesto.cuenta_id,
        periodoId
      );

      const montoDisponible = presupuesto.monto_presupuestado - montoEjecutado - (presupuesto.monto_comprometido || 0);
      const porcentajeEjecutado = presupuesto.monto_presupuestado > 0
        ? (montoEjecutado / presupuesto.monto_presupuestado) * 100
        : 0;

      // Solo incluir presupuestos con advertencia (>90%) o sobregiro (>100%)
      if (porcentajeEjecutado > 90) {
        const nivelAlerta = porcentajeEjecutado > 100 ? 'SOBREGIRO' : 'ADVERTENCIA';
        const severidad = porcentajeEjecutado > 100 ? 'CRITICO' : 'ALTO';

        alertas.push({
          presupuesto_id: presupuesto.id,
          nivel_alerta: nivelAlerta,
          severidad: severidad,
          porcentaje_ejecutado: Math.round(porcentajeEjecutado * 100) / 100,
          monto_presupuestado: presupuesto.monto_presupuestado,
          monto_ejecutado: montoEjecutado,
          monto_comprometido: presupuesto.monto_comprometido || 0,
          monto_disponible: montoDisponible,
          excedente: montoEjecutado - presupuesto.monto_presupuestado,
          centro_costo: {
            id: presupuesto.centros_costo.id,
            codigo: presupuesto.centros_costo.codigo,
            nombre: presupuesto.centros_costo.nombre
          },
          cuenta: {
            id: presupuesto.plan_cuentas.id,
            codigo: presupuesto.plan_cuentas.codigo,
            nombre: presupuesto.plan_cuentas.nombre
          },
          periodo: {
            id: presupuesto.periodos_contables.id,
            anio: presupuesto.periodos_contables.anio,
            mes: presupuesto.periodos_contables.mes,
            descripcion: `${presupuesto.periodos_contables.anio}-${String(presupuesto.periodos_contables.mes).padStart(2, '0')}`
          },
          mensaje: this.generarMensajeAlerta(
            nivelAlerta,
            presupuesto.centros_costo.nombre,
            presupuesto.plan_cuentas.nombre,
            porcentajeEjecutado,
            montoEjecutado,
            presupuesto.monto_presupuestado
          ),
          fecha_deteccion: new Date().toISOString()
        });
      }
    }

    // Ordenar por severidad (CRITICO primero) y luego por porcentaje ejecutado
    alertas.sort((a, b) => {
      if (a.severidad === 'CRITICO' && b.severidad !== 'CRITICO') return -1;
      if (a.severidad !== 'CRITICO' && b.severidad === 'CRITICO') return 1;
      return b.porcentaje_ejecutado - a.porcentaje_ejecutado;
    });

    console.log(`✅ [Presupuestos] ${alertas.length} alerta(s) detectada(s):`);
    console.log(`   Sobregiros (>100%): ${alertas.filter(a => a.nivel_alerta === 'SOBREGIRO').length}`);
    console.log(`   Advertencias (>90%): ${alertas.filter(a => a.nivel_alerta === 'ADVERTENCIA').length}`);

    return alertas;
  }

  /**
   * Genera un mensaje descriptivo para una alerta de presupuesto
   * @param nivelAlerta - Nivel de la alerta (SOBREGIRO o ADVERTENCIA)
   * @param centroCosto - Nombre del centro de costo
   * @param cuenta - Nombre de la cuenta
   * @param porcentaje - Porcentaje ejecutado
   * @param montoEjecutado - Monto ejecutado
   * @param montoPresupuestado - Monto presupuestado
   * @returns Mensaje descriptivo de la alerta
   */
  private generarMensajeAlerta(
    nivelAlerta: string,
    centroCosto: string,
    cuenta: string,
    porcentaje: number,
    montoEjecutado: number,
    montoPresupuestado: number
  ): string {
    const porcentajeRedondeado = Math.round(porcentaje * 100) / 100;

    if (nivelAlerta === 'SOBREGIRO') {
      const excedente = montoEjecutado - montoPresupuestado;
      return `🚨 SOBREGIRO: El presupuesto del centro de costo "${centroCosto}" para la cuenta "${cuenta}" ha sido excedido en ${porcentajeRedondeado}% (S/ ${excedente.toFixed(2)} sobre el presupuesto de S/ ${montoPresupuestado.toFixed(2)})`;
    } else {
      const disponible = montoPresupuestado - montoEjecutado;
      return `⚠️ ADVERTENCIA: El presupuesto del centro de costo "${centroCosto}" para la cuenta "${cuenta}" está al ${porcentajeRedondeado}% de ejecución (quedan S/ ${disponible.toFixed(2)} de S/ ${montoPresupuestado.toFixed(2)})`;
    }
  }

  /**
   * Obtiene un resumen de alertas agrupadas por nivel de severidad
   * @param tenantId - ID del tenant
   * @param periodoContableId - ID del período contable (opcional)
   * @returns Resumen de alertas por severidad
   */
  async obtenerResumenAlertas(
    tenantId: string,
    periodoContableId?: string
  ): Promise<any> {
    console.log(`📊 [Presupuestos] Obteniendo resumen de alertas para tenant ${tenantId}`);

    const alertas = await this.obtenerAlertasSobregiro(tenantId, periodoContableId);

    const sobregiros = alertas.filter(a => a.nivel_alerta === 'SOBREGIRO');
    const advertencias = alertas.filter(a => a.nivel_alerta === 'ADVERTENCIA');

    const totalExcedente = sobregiros.reduce((sum, a) => sum + Math.max(0, a.excedente), 0);
    const totalEnRiesgo = advertencias.reduce((sum, a) => sum + a.monto_presupuestado, 0);

    const resumen = {
      total_alertas: alertas.length,
      sobregiros: {
        cantidad: sobregiros.length,
        total_excedente: totalExcedente,
        alertas: sobregiros
      },
      advertencias: {
        cantidad: advertencias.length,
        total_en_riesgo: totalEnRiesgo,
        alertas: advertencias
      },
      fecha_generacion: new Date().toISOString()
    };

    console.log(`✅ [Presupuestos] Resumen generado:`);
    console.log(`   Total alertas: ${resumen.total_alertas}`);
    console.log(`   Sobregiros: ${resumen.sobregiros.cantidad} (S/ ${totalExcedente.toFixed(2)} excedidos)`);
    console.log(`   Advertencias: ${resumen.advertencias.cantidad} (S/ ${totalEnRiesgo.toFixed(2)} en riesgo)`);

    return resumen;
  }
}
