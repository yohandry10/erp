import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { buildDeterministicUuid } from '../../../common/util/deterministic-uuid.util';

export enum EstadoPeriodo {
  ABIERTO = 'ABIERTO',
  CERRADO = 'CERRADO',
  BLOQUEADO = 'BLOQUEADO'
}

export interface PeriodoContable {
  id: string;
  tenant_id: string;
  anio: number;
  mes: number;
  estado: EstadoPeriodo;
  fecha_cierre?: string;
  cerrado_por?: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PeriodosService {
  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => 'EstadosFinancierosService'))
    private readonly estadosFinancierosService?: any
  ) {}

  /**
   * Valida que el período contable esté abierto para la fecha especificada
   * @param tenantId - ID del tenant
   * @param fecha - Fecha de la transacción
   * @throws BadRequestException si el período está cerrado o bloqueado
   */
  async validarPeriodoAbierto(tenantId: string, fecha: Date): Promise<void> {
    const anio = fecha.getFullYear();
    const mes = fecha.getMonth() + 1; // JavaScript months are 0-indexed

    const periodo = await this.obtenerPeriodo(tenantId, anio, mes);

    if (!periodo) {
      // Si no existe el período, se asume que está abierto (auto-creación implícita)
      console.log(`📅 [Periodos] Período ${anio}-${mes} no existe para tenant ${tenantId}, se permite operación`);
      return;
    }

    if (periodo.estado === EstadoPeriodo.CERRADO) {
      throw new BadRequestException(
        `El período contable ${anio}-${String(mes).padStart(2, '0')} está CERRADO. ` +
        `No se pueden registrar movimientos en períodos cerrados.`
      );
    }

    if (periodo.estado === EstadoPeriodo.BLOQUEADO) {
      throw new BadRequestException(
        `El período contable ${anio}-${String(mes).padStart(2, '0')} está BLOQUEADO. ` +
        `No se pueden registrar movimientos en períodos bloqueados.`
      );
    }

    console.log(`✅ [Periodos] Período ${anio}-${mes} está ABIERTO para tenant ${tenantId}`);
  }

  /**
   * Obtiene un período contable específico
   * @param tenantId - ID del tenant
   * @param anio - Año del período
   * @param mes - Mes del período (1-12)
   * @returns Período contable o null si no existe
   */
  async obtenerPeriodo(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<PeriodoContable | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('anio', anio)
      .eq('mes', mes)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - período no existe
        return null;
      }
      console.error('❌ [Periodos] Error obteniendo período:', error);
      throw new Error(`Error obteniendo período contable: ${error.message}`);
    }

    return data as PeriodoContable;
  }

  /**
   * Obtiene un período por ID validando tenant
   */
  async obtenerPeriodoPorId(
    tenantId: string,
    periodoId: string
  ): Promise<PeriodoContable | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', periodoId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('❌ [Periodos] Error obteniendo período por ID:', error);
      throw new Error(`Error obteniendo período contable: ${error.message}`);
    }

    return data as PeriodoContable;
  }

  /**
   * Obtiene todos los períodos contables de un tenant
   * @param tenantId - ID del tenant
   * @returns Lista de períodos contables
   */
  async obtenerPeriodos(tenantId: string): Promise<PeriodoContable[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false });

    if (error) {
      console.error('❌ [Periodos] Error obteniendo períodos:', error);
      throw new Error(`Error obteniendo períodos contables: ${error.message}`);
    }

    return (data || []) as PeriodoContable[];
  }

  /**
   * Crea un nuevo período contable
   * @param tenantId - ID del tenant
   * @param anio - Año del período
   * @param mes - Mes del período (1-12)
   * @returns Período contable creado
   */
  async crearPeriodo(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<PeriodoContable> {
    // Validar que el mes esté en rango válido
    if (mes < 1 || mes > 12) {
      throw new BadRequestException('El mes debe estar entre 1 y 12');
    }

    // Verificar que no exista ya
    const periodoExistente = await this.obtenerPeriodo(tenantId, anio, mes);
    if (periodoExistente) {
      throw new BadRequestException(
        `El período ${anio}-${String(mes).padStart(2, '0')} ya existe`
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .insert({
        tenant_id: tenantId,
        anio,
        mes,
        estado: EstadoPeriodo.ABIERTO
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [Periodos] Error creando período:', error);
      throw new Error(`Error creando período contable: ${error.message}`);
    }

    console.log(`✅ [Periodos] Período ${anio}-${mes} creado para tenant ${tenantId}`);
    return data as PeriodoContable;
  }

  /**
   * Valida que todos los asientos del período cuadren (debe = haber)
   * @param tenantId - ID del tenant
   * @param anio - Año del período
   * @param mes - Mes del período (1-12)
   * @returns true si todos los asientos cuadran, false en caso contrario
   */
  async validarAsientosCuadran(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<{ valido: boolean; asientosDescuadrados: any[] }> {
    // Construir rango de fechas para el período
    const fechaInicio = new Date(anio, mes - 1, 1).toISOString();
    const fechaFin = new Date(anio, mes, 0, 23, 59, 59).toISOString();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('id, numero_asiento, fecha, total_debe, total_haber')
      .eq('tenant_id', tenantId)
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin);

    if (error) {
      console.error('❌ [Periodos] Error validando asientos:', error);
      throw new Error(`Error validando asientos: ${error.message}`);
    }

    const asientosDescuadrados = (data || []).filter(asiento => {
      const diferencia = Math.abs(asiento.total_debe - asiento.total_haber);
      return diferencia > 0.01; // Tolerancia de 1 centavo
    });

    return {
      valido: asientosDescuadrados.length === 0,
      asientosDescuadrados
    };
  }

  /**
   * Cuenta los asientos en BORRADOR dentro del período. Cerrar con borradores
   * pendientes dejaría movimientos fuera de los libros sin posibilidad de
   * confirmarlos después, porque el período ya no admitiría escrituras.
   * @param tenantId - ID del tenant
   * @param anio - Año del período
   * @param mes - Mes del período (1-12)
   */
  async contarAsientosBorrador(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<number> {
    const fechaInicio = new Date(anio, mes - 1, 1).toISOString();
    const fechaFin = new Date(anio, mes, 0, 23, 59, 59).toISOString();

    const { count, error } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('estado', 'BORRADOR')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin);

    if (error) {
      console.error('❌ [Periodos] Error contando asientos en borrador:', error);
      throw new Error(`Error contando asientos en borrador: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Valida que no haya eventos pendientes para el período
   * @param tenantId - ID del tenant
   * @param anio - Año del período
   * @param mes - Mes del período (1-12)
   * @returns true si no hay eventos pendientes, false en caso contrario
   */
  async validarEventosPendientes(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<{ valido: boolean; eventosPendientes: number }> {
    // Construir rango de fechas para el período
    const fechaInicio = new Date(anio, mes - 1, 1).toISOString();
    const fechaFin = new Date(anio, mes, 0, 23, 59, 59).toISOString();

    const { count, error } = await this.supabaseService
      .getClient()
      .from('outbox_events')
      .select('*', { count: 'exact', head: true })
      .is('processed_at', null)
      .gte('occurred_at', fechaInicio)
      .lte('occurred_at', fechaFin);

    if (error) {
      console.error('❌ [Periodos] Error validando eventos pendientes:', error);
      throw new Error(`Error validando eventos pendientes: ${error.message}`);
    }

    return {
      valido: (count || 0) === 0,
      eventosPendientes: count || 0
    };
  }

  /**
   * Cierra un período contable con validaciones
   * @param tenantId - ID del tenant
   * @param anio - Año del período
   * @param mes - Mes del período (1-12)
   * @param usuarioId - ID del usuario que cierra el período
   * @returns Período contable cerrado
   */
  async cerrarPeriodo(
    tenantId: string,
    anio: number,
    mes: number,
    usuarioId: string
  ): Promise<PeriodoContable> {
    const periodo = await this.obtenerPeriodo(tenantId, anio, mes);

    if (!periodo) {
      throw new BadRequestException(
        `El período ${anio}-${String(mes).padStart(2, '0')} no existe`
      );
    }

    if (periodo.estado === EstadoPeriodo.CERRADO) {
      throw new BadRequestException(
        `El período ${anio}-${String(mes).padStart(2, '0')} ya está cerrado`
      );
    }

    // Validar que todos los asientos cuadren
    const validacionAsientos = await this.validarAsientosCuadran(tenantId, anio, mes);
    if (!validacionAsientos.valido) {
      throw new BadRequestException(
        `No se puede cerrar el período. Hay ${validacionAsientos.asientosDescuadrados.length} asiento(s) descuadrado(s). ` +
        `Asientos: ${validacionAsientos.asientosDescuadrados.map(a => a.numero_asiento).join(', ')}`
      );
    }

    // Validar que no haya eventos pendientes
    const validacionEventos = await this.validarEventosPendientes(tenantId, anio, mes);
    if (!validacionEventos.valido) {
      throw new BadRequestException(
        `No se puede cerrar el período. Hay ${validacionEventos.eventosPendientes} evento(s) pendiente(s) de procesar.`
      );
    }

    // Validar que no queden asientos en borrador sin confirmar
    const borradores = await this.contarAsientosBorrador(tenantId, anio, mes);
    if (borradores > 0) {
      throw new BadRequestException(
        `No se puede cerrar el período. Hay ${borradores} asiento(s) en BORRADOR sin confirmar. ` +
        `Confírmelos o anúlelos antes de cerrar.`
      );
    }

    // Generar asientos de cierre si es fin de año (diciembre)
    if (mes === 12) {
      console.log(`📊 [Periodos] Generando asientos de cierre de año ${anio} para tenant ${tenantId}`);
      // Si esto falla, el ejercicio quedaría cerrado sin asiento de cierre de
      // resultados y la única señal sería una línea de log. El cierre debe
      // fallar entero para que se pueda reintentar tras corregir la causa.
      await this.generarAsientosCierreAnual(tenantId, anio, usuarioId);
    }

    // Cerrar el período
    const { data, error } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .update({
        estado: EstadoPeriodo.CERRADO,
        fecha_cierre: new Date().toISOString(),
        cerrado_por: usuarioId
      })
      .eq('id', periodo.id)
      .select()
      .single();

    if (error) {
      console.error('❌ [Periodos] Error cerrando período:', error);
      throw new Error(`Error cerrando período contable: ${error.message}`);
    }

    // Refrescar vistas materializadas de estados financieros
    console.log(`🔄 [Periodos] Refrescando vistas materializadas para ${anio}-${mes}`);
    try {
      if (this.estadosFinancierosService) {
        await this.estadosFinancierosService.refrescarEstadosFinancieros(tenantId, anio, mes);
      }
    } catch (error) {
      console.error('❌ [Periodos] Error refrescando vistas materializadas:', error);
      // No bloqueamos el cierre si falla el refresh
      console.warn('⚠️ [Periodos] Período cerrado pero las vistas materializadas no se actualizaron');
    }

    console.log(`🔒 [Periodos] Período ${anio}-${mes} cerrado por usuario ${usuarioId}`);
    return data as PeriodoContable;
  }

  /**
   * Genera asientos de cierre anual (cierre de cuentas de resultados)
   * @param tenantId - ID del tenant
   * @param anio - Año a cerrar
   * @param usuarioId - ID del usuario que cierra
   */
  private async generarAsientosCierreAnual(
    tenantId: string,
    anio: number,
    usuarioId: string
  ): Promise<void> {
    console.log(`📊 [Periodos] Iniciando generación de asientos de cierre anual ${anio}`);

    // Obtener el resultado del ejercicio (ingresos - gastos)
    const { data: resultadoData, error: resultadoError } = await this.supabaseService
      .getClient()
      .rpc('calcular_resultado_ejercicio', {
        p_tenant_id: tenantId,
        p_anio: anio
      });

    if (resultadoError) {
      console.error('❌ [Periodos] Error calculando resultado del ejercicio:', resultadoError);
      throw new Error(`Error calculando resultado del ejercicio: ${resultadoError.message}`);
    }

    const resultadoEjercicio = resultadoData || 0;
    console.log(`💰 [Periodos] Resultado del ejercicio ${anio}: ${resultadoEjercicio}`);

    // Si no hay resultado, no generamos asientos de cierre
    if (Math.abs(resultadoEjercicio) < 0.01) {
      console.log(`ℹ️ [Periodos] No hay resultado del ejercicio, omitiendo asientos de cierre`);
      return;
    }

    // Obtener cuentas de cierre PCGE: 59 Resultados acumulados y 89 Determinacion del resultado.
    const { data: cuentasCierre, error: cuentaError } = await this.supabaseService
      .getClient()
      .from('plan_cuentas')
      .select('id, codigo')
      .eq('tenant_id', tenantId)
      .in('codigo', ['59', '89']);

    if (cuentaError) {
      throw new Error(`Error obteniendo cuentas de cierre PCGE: ${cuentaError.message}`);
    }

    const cuentaResultados = (cuentasCierre || []).find((cuenta: any) => cuenta.codigo === '59');
    const cuentaDeterminacion = (cuentasCierre || []).find((cuenta: any) => cuenta.codigo === '89');
    if (!cuentaResultados || !cuentaDeterminacion) {
      throw new Error(
        'No se puede cerrar el ejercicio: faltan las cuentas PCGE 59 y/o 89.'
      );
    }

    // Crear asiento de cierre
    const fechaCierre = new Date(anio, 11, 31); // 31 de diciembre
    // source_event_id es uuid con índice único por tenant: la clave lógica del
    // cierre debe derivarse a un uuid estable, no pasarse como texto.
    const sourceEventId = buildDeterministicUuid(`cierre-anual:${tenantId}:${anio}`);

    const { data: asientoExistente, error: asientoExistenteError } = await this.supabaseService
      .getClient()
      .from('asientos_contables')
      .select('id, numero_asiento, codigo')
      .eq('tenant_id', tenantId)
      .eq('source_event_id', sourceEventId)
      .maybeSingle();

    if (asientoExistenteError) {
      throw new Error(`Error validando asiento de cierre existente: ${asientoExistenteError.message}`);
    }

    if (asientoExistente?.id) {
      console.log(`ℹ️ [Periodos] Asiento de cierre anual ${anio} ya existe (${asientoExistente.codigo ?? asientoExistente.numero_asiento ?? asientoExistente.id})`);
      return;
    }

    const detalles = resultadoEjercicio > 0
      ? [
          {
            cuenta_id: cuentaDeterminacion.id,
            debe: resultadoEjercicio,
            haber: 0,
            concepto: `Determinacion del resultado ${anio}`
          },
          {
            cuenta_id: cuentaResultados.id,
            debe: 0,
            haber: resultadoEjercicio,
            concepto: `Utilidad del ejercicio ${anio}`
          }
        ]
      : [
          {
            cuenta_id: cuentaResultados.id,
            debe: Math.abs(resultadoEjercicio),
            haber: 0,
            concepto: `Perdida del ejercicio ${anio}`
          },
          {
            cuenta_id: cuentaDeterminacion.id,
            debe: 0,
            haber: Math.abs(resultadoEjercicio),
            concepto: `Determinacion del resultado ${anio}`
          }
        ];

    const { error: asientoError } = await this.supabaseService
      .getClient()
      .rpc('crear_asiento_con_detalles_tx', {
        p_tenant_id: tenantId,
        p_asiento: {
          fecha: fechaCierre.toISOString(),
          concepto: `Asiento de cierre del ejercicio ${anio}`,
          descripcion: `Asiento de cierre del ejercicio ${anio}`,
        tipo_asiento: 'CIERRE',
        origen: 'CIERRE_ANUAL',
          referencia: `CIERRE-${anio}`,
          source_event_id: sourceEventId,
          estado: 'CONFIRMADO',
          created_by: usuarioId,
          confirmado_por: usuarioId,
          confirmado_en: new Date().toISOString()
        },
        p_detalles: detalles
      });

    if (asientoError) {
      console.error('❌ [Periodos] Error creando asiento de cierre:', asientoError);
      throw new Error(`Error creando asiento de cierre: ${asientoError?.message}`);
    }

    console.log(`✅ [Periodos] Asiento de cierre anual ${anio} generado exitosamente`);
  }

  /**
   * Reabre un período contable (solo superadmin)
   * @param tenantId - ID del tenant
   * @param anio - Año del período
   * @param mes - Mes del período (1-12)
   * @returns Período contable reabierto
   */
  async reabrirPeriodo(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<PeriodoContable> {
    const periodo = await this.obtenerPeriodo(tenantId, anio, mes);

    if (!periodo) {
      throw new BadRequestException(
        `El período ${anio}-${String(mes).padStart(2, '0')} no existe`
      );
    }

    if (periodo.estado === EstadoPeriodo.ABIERTO) {
      throw new BadRequestException(
        `El período ${anio}-${String(mes).padStart(2, '0')} ya está abierto`
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .update({
        estado: EstadoPeriodo.ABIERTO,
        fecha_cierre: null,
        cerrado_por: null
      })
      .eq('id', periodo.id)
      .select()
      .single();

    if (error) {
      console.error('❌ [Periodos] Error reabriendo período:', error);
      throw new Error(`Error reabriendo período contable: ${error.message}`);
    }

    console.log(`🔓 [Periodos] Período ${anio}-${mes} reabierto`);
    return data as PeriodoContable;
  }

  /**
   * Bloquea un período contable
   * @param tenantId - ID del tenant
   * @param anio - Año del período
   * @param mes - Mes del período (1-12)
   * @returns Período contable bloqueado
   */
  async bloquearPeriodo(
    tenantId: string,
    anio: number,
    mes: number
  ): Promise<PeriodoContable> {
    const periodo = await this.obtenerPeriodo(tenantId, anio, mes);

    if (!periodo) {
      throw new BadRequestException(
        `El período ${anio}-${String(mes).padStart(2, '0')} no existe`
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('periodos_contables')
      .update({
        estado: EstadoPeriodo.BLOQUEADO
      })
      .eq('id', periodo.id)
      .select()
      .single();

    if (error) {
      console.error('❌ [Periodos] Error bloqueando período:', error);
      throw new Error(`Error bloqueando período contable: ${error.message}`);
    }

    console.log(`🚫 [Periodos] Período ${anio}-${mes} bloqueado`);
    return data as PeriodoContable;
  }
}
