import { Injectable, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { lecturaContableFallida } from '../contabilidad-errors';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { createHash } from 'crypto';
import { periodoContableDelTenant } from '../../../shared/utils/fecha-tenant.util';

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
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Valida que el período contable esté abierto para la fecha especificada
   * @param tenantId - ID del tenant
   * @param fecha - Fecha de la transacción
   * @throws BadRequestException si el período está cerrado o bloqueado
   */
  async validarPeriodoAbierto(tenantId: string, fecha: Date): Promise<void> {
    // El periodo se resuelve en la zona del contribuyente, no en la del servidor.
    // `getFullYear()/getMonth()` sobre un `timestamptz` en un servidor UTC mete un
    // comprobante de las 19:30 de Lima en el día —y en el cambio de mes, en el mes—
    // siguiente. Las fechas de calendario, que llegan a medianoche UTC exacta, se
    // dejan como están: convertirlas las retrasaría un día sin motivo.
    const { anio, mes } = await periodoContableDelTenant(
      this.supabaseService.getClient(),
      tenantId,
      fecha,
    );

    const periodo = await this.obtenerPeriodo(tenantId, anio, mes);

    if (!periodo) {
      throw new BadRequestException(
        `El período contable ${anio}-${String(mes).padStart(2,'0')} no existe. Debe crearse explícitamente antes de registrar movimientos.`,
      );
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
      throw lecturaContableFallida(error, 'los períodos contables');
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
    mes:number,
    userId?:string,
    idempotencyKey?:string,
  ): Promise<PeriodoContable> {
    if(!userId) throw new BadRequestException('Se requiere un usuario autenticado');
    const payload={anio,mes}; const key=idempotencyKey?.trim()||`period-create:${createHash('sha256').update(JSON.stringify({tenantId,userId,payload})).digest('hex')}`;
    const {data:rpcData,error:rpcError}=await this.supabaseService.getClient().rpc('gestionar_maestro_contable_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_entity:'PERIOD',p_action:'CREATE',p_record_id:null,p_payload:payload,p_idempotency_key:key,
    });
    if(rpcError) throw new BadRequestException(rpcError.message||'No se pudo crear el período contable');
    const result:any=Array.isArray(rpcData)?rpcData[0]:rpcData; return result.record as PeriodoContable;
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
      .eq('tenant_id', tenantId)
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
  /**
   * Estimación de cuentas de cobranza dudosa del periodo.
   *
   * El criterio de antigüedad es un parámetro y no una constante: el reglamento
   * del Impuesto a la Renta admite provisionar antes de los doce meses cuando
   * hay protesto o gestiones de cobro documentadas, y eso el sistema no puede
   * saberlo. 360 días es el umbral que no necesita otra prueba.
   */
  async provisionarCobranzaDudosa(
    tenantId: string, periodo: string, usuarioId: string, diasVencido = 360,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    if (!/^(20[0-9]{2}|21[0-9]{2}|2200)-(0[1-9]|1[0-2])$/.test(periodo) ||
        !Number.isInteger(diasVencido) || diasVencido < 1 || diasVencido > 2147483647) {
      throw new BadRequestException('El período y la antigüedad de la estimación son inválidos.');
    }
    const key = idempotencyKey === undefined
      ? `period-provision:${createHash('sha256').update(JSON.stringify({ tenantId, usuarioId, periodo, diasVencido })).digest('hex')}`
      : idempotencyKey.trim().toLowerCase();
    if (key.length < 8 || key.length > 200) throw new BadRequestException('La clave de confirmación es inválida.');
    const { data, error } = await this.supabaseService.getClient().rpc('provisionar_cobranza_dudosa_tx_570', {
      p_tenant_id: tenantId, p_periodo: periodo, p_actor_id: usuarioId,
      p_dias_vencido: diasVencido, p_idempotency_key: key,
    });
    if (error) {
      if (['22023', '23514', '42501'].includes(error.code)) {
        throw new BadRequestException('No se pudo confirmar la estimación. Revisa el período, permisos, moneda y criterio conservado.');
      }
      throw new ServiceUnavailableException('No se pudo confirmar la estimación. Reintenta con los mismos datos y conexión.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ServiceUnavailableException('La estimación no devolvió un resultado verificable.');
    }
    return data as Record<string, unknown>;
  }

  async validarCierre(tenantId: string, periodoId: string, actorId: string) {
    const { data, error } = await this.supabaseService.getClient().rpc(
      'validar_cierre_periodo_contable_570',
      { p_tenant_id: tenantId, p_periodo_id: periodoId, p_actor_id: actorId },
    );
    if (error) throw new ServiceUnavailableException('No se pudieron verificar las condiciones de cierre. Vuelva a intentar.');
    if (!data) throw new NotFoundException('Período no encontrado');
    return data;
  }

  async cerrarPeriodo(
    tenantId: string,
    anio: number,
    mes: number,
    usuarioId: string
  ): Promise<PeriodoContable> {
    const { data, error } = await this.supabaseService.getClient().rpc(
      'cerrar_periodo_contable_tx',
      {
        p_tenant_id: tenantId,
        p_anio: anio,
        p_mes: mes,
        p_actor_id: usuarioId,
      },
    );

    if (error || !data?.periodo) {
      throw new BadRequestException(
        error?.message || `No se pudo cerrar el período ${anio}-${String(mes).padStart(2, '0')}`,
      );
    }

    return data.periodo as PeriodoContable;
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
    mes: number,
    usuarioId: string,
  ): Promise<PeriodoContable> {
    const { data, error } = await this.supabaseService.getClient().rpc(
      'reabrir_periodo_contable_admin_tx',
      {
        p_tenant_id: tenantId,
        p_anio: anio,
        p_mes: mes,
        p_actor_id: usuarioId,
      },
    );

    if (error || !data?.periodo) {
      throw new BadRequestException(
        error?.message || `No se pudo reabrir el período ${anio}-${String(mes).padStart(2, '0')}`,
      );
    }

    return data.periodo as PeriodoContable;
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
    mes: number,
    usuarioId: string,
  ): Promise<PeriodoContable> {
    const { data, error } = await this.supabaseService.getClient().rpc(
      'bloquear_periodo_contable_tx',
      {
        p_tenant_id: tenantId,
        p_anio: anio,
        p_mes: mes,
        p_actor_id: usuarioId,
      },
    );

    if (error || !data?.periodo) {
      throw new BadRequestException(
        error?.message || `No se pudo bloquear el período ${anio}-${String(mes).padStart(2, '0')}`,
      );
    }

    return data.periodo as PeriodoContable;
  }
}
