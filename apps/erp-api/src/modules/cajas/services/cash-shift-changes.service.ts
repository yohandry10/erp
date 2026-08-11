import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { Denominaciones } from './cash-reconciliation.service';
import { CompletarCambioTurnoCajaDto } from '../dto/cash-operations.dto';

export enum EstadoCambioTurno {
  EN_PROCESO = 'EN_PROCESO',
  COMPLETADO = 'COMPLETADO',
  CANCELADO = 'CANCELADO',
}
/** Compatibilidad de lectura; las confirmaciones 474 se almacenan sólo como hash. */
export interface FirmasDigitales {
  saliente: string;
  entrante: string;
}

export interface CambioTurno {
  id: string;
  sesion_caja_id: string;
  usuario_saliente_id: string;
  usuario_entrante_id: string;
  saldo_sistema: number;
  saldo_contado: number;
  diferencia: number;
  denominaciones?: Denominaciones;
  foto_arqueo?: string;
  firma_digital_saliente?: string;
  firma_digital_entrante?: string;
  timestamp_inicio: string;
  timestamp_fin?: string;
  estado: EstadoCambioTurno;
  tenant_id: string;
  created_at: string;
}

/**
 * Adaptador de cambio de turno 474. Congelar, arquear, registrar sólo la
 * diferencia, transferir responsabilidad, auditar y publicar outbox ocurre en
 * una RPC; no hay compensaciones manuales ni commits parciales en Node.
 */
@Injectable()
export class CashShiftChangesService {
  constructor(private readonly supabase: SupabaseService) {}

  async iniciarCambioTurno(
    tenantId: string,
    sesionId: string,
    usuarioSalienteId: string,
    usuarioEntranteId: string,
    idempotencyKey: string,
  ): Promise<CambioTurno> {
    const { data, error } = await this.supabase.getClient().rpc(
      'iniciar_cambio_turno_caja_tx',
      {
        p_tenant_id: tenantId,
        p_session_id: sesionId,
        p_incoming_user_id: usuarioEntranteId,
        p_actor_id: usuarioSalienteId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (error) {
      throw new BadRequestException(error.message || 'No se pudo iniciar el cambio de turno');
    }
    return ((data as any)?.cambio ?? data) as CambioTurno;
  }

  async completarCambioTurno(
    tenantId: string,
    cambioId: string,
    dto: CompletarCambioTurnoCajaDto,
    userId: string,
    idempotencyKey: string,
  ): Promise<CambioTurno> {
    const { data, error } = await this.supabase.getClient().rpc(
      'completar_cambio_turno_caja_tx',
      {
        p_tenant_id: tenantId,
        p_change_id: cambioId,
        p_payload: dto,
        p_actor_id: userId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (error) {
      throw new BadRequestException(error.message || 'No se pudo completar el cambio de turno');
    }
    return ((data as any)?.cambio ?? data) as CambioTurno;
  }

  async cancelarCambioTurno(
    tenantId: string,
    cambioId: string,
    razon: string,
    userId: string,
    idempotencyKey: string,
  ): Promise<CambioTurno> {
    const { data, error } = await this.supabase.getClient().rpc(
      'cancelar_cambio_turno_caja_tx',
      {
        p_tenant_id: tenantId,
        p_change_id: cambioId,
        p_reason: razon,
        p_actor_id: userId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (error) {
      throw new BadRequestException(error.message || 'No se pudo cancelar el cambio de turno');
    }
    return ((data as any)?.cambio ?? data) as CambioTurno;
  }

  async obtenerCambiosSesion(sesionId: string, tenantId: string): Promise<CambioTurno[]> {
    const { data, error } = await this.supabase.getClient()
      .from('cambios_turno')
      .select('*')
      .eq('sesion_caja_id', sesionId)
      .eq('tenant_id', tenantId)
      .order('timestamp_inicio', { ascending: false });
    if (error) {
      throw new BadRequestException(`Error obteniendo cambios de turno: ${error.message}`);
    }
    return (data || []) as CambioTurno[];
  }

  async obtenerEstadisticasUsuario(
    userId: string,
    tenantId: string,
    limite = 30,
  ): Promise<{
    total_cambios: number;
    diferencia_promedio: number;
    sobrantes: number;
    faltantes: number;
    cuadrados: number;
  }> {
    const { data, error } = await this.supabase.getClient()
      .from('cambios_turno')
      .select('diferencia, estado, timestamp_inicio, timestamp_fin')
      .or(`usuario_saliente_id.eq.${userId},usuario_entrante_id.eq.${userId}`)
      .eq('tenant_id', tenantId)
      .eq('estado', EstadoCambioTurno.COMPLETADO)
      .order('timestamp_inicio', { ascending: false })
      .limit(limite);
    if (error) {
      throw new BadRequestException(`Error obteniendo estadísticas: ${error.message}`);
    }
    const cambios = data || [];
    const diferencias = cambios.map((c) => Number(c.diferencia || 0));
    return {
      total_cambios: cambios.length,
      diferencia_promedio: diferencias.length
        ? diferencias.reduce((sum, value) => sum + value, 0) / diferencias.length
        : 0,
      sobrantes: diferencias.filter((value) => value > 0.009).length,
      faltantes: diferencias.filter((value) => value < -0.009).length,
      cuadrados: diferencias.filter((value) => Math.abs(value) <= 0.009).length,
    };
  }
}
