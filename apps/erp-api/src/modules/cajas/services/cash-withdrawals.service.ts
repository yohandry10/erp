import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import {
  ConciliarRetiroCajaDto,
  SolicitarRetiroCajaDto,
} from '../dto/cash-operations.dto';

export enum MotivoRetiro {
  DEPOSITO_BANCARIO = 'DEPOSITO_BANCARIO',
  COMPRA_EMERGENCIA = 'COMPRA_EMERGENCIA',
  BOVEDA = 'BOVEDA',
  OTRO = 'OTRO',
}
export enum EstadoConciliacion {
  PENDIENTE = 'PENDIENTE',
  CONCILIADO = 'CONCILIADO',
  RECHAZADO = 'RECHAZADO',
}

export interface RetiroMetadata {
  motivo_detalle?: string;
  foto_comprobante?: string;
  cuenta_bancaria_id?: string;
  cuenta_contrapartida_id?: string;
  tipo_cambio?: number;
}

export interface RetiroCaja {
  id: string;
  sesion_caja_id: string;
  movimiento_caja_id?: string;
  movimiento_bancario_id?: string;
  cuenta_bancaria_id?: string;
  cuenta_contrapartida_id?: string;
  monto: number;
  motivo: MotivoRetiro;
  motivo_detalle?: string;
  autorizado_por?: string;
  foto_comprobante?: string;
  estado_conciliacion: EstadoConciliacion;
  fecha_conciliacion?: string;
  banco_destino?: string;
  numero_operacion?: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Adaptador de Caja 474. Las escrituras no se componen en TypeScript: la RPC
 * confirma movimiento, retiro/banco, auditoría, idempotencia y outbox en el
 * mismo commit.
 */
@Injectable()
export class CashWithdrawalsService {
  constructor(private readonly supabase: SupabaseService) {}

  async solicitarRetiro(
    tenantId: string,
    sesionId: string,
    dto: SolicitarRetiroCajaDto,
    userId: string,
    idempotencyKey: string,
  ): Promise<RetiroCaja> {
    const { data, error } = await this.supabase.getClient().rpc(
      'solicitar_retiro_caja_tx',
      {
        p_tenant_id: tenantId,
        p_session_id: sesionId,
        p_payload: dto,
        p_actor_id: userId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (error) {
      throw new BadRequestException(error.message || 'No se pudo registrar el retiro');
    }
    return ((data as any)?.retiro ?? data) as RetiroCaja;
  }

  async conciliarRetiro(
    tenantId: string,
    retiroId: string,
    dto: ConciliarRetiroCajaDto,
    userId: string,
    idempotencyKey: string,
  ): Promise<RetiroCaja> {
    const { data, error } = await this.supabase.getClient().rpc(
      'conciliar_retiro_caja_tx',
      {
        p_tenant_id: tenantId,
        p_retiro_id: retiroId,
        p_payload: dto,
        p_actor_id: userId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (error) {
      throw new BadRequestException(error.message || 'No se pudo conciliar el retiro');
    }
    return ((data as any)?.retiro ?? data) as RetiroCaja;
  }

  /** No hay ruta de rechazo en el contrato 474; evita reintroducir un writer parcial. */
  async rechazarConciliacion(): Promise<never> {
    throw new BadRequestException(
      'El rechazo de conciliación no está habilitado hasta contar con una transición atómica explícita',
    );
  }

  async obtenerRetirosSesion(sesionId: string, tenantId: string): Promise<RetiroCaja[]> {
    const { data, error } = await this.supabase.getClient()
      .from('retiros_caja')
      .select('*')
      .eq('sesion_caja_id', sesionId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      throw new BadRequestException(`Error obteniendo retiros: ${error.message}`);
    }
    return (data || []) as RetiroCaja[];
  }

  async obtenerRetirosPendientes(tenantId: string, limite = 50): Promise<RetiroCaja[]> {
    const { data, error } = await this.supabase.getClient()
      .from('retiros_caja')
      .select('*, sesiones_caja!inner(hora_apertura, usuario_id)')
      .eq('estado_conciliacion', EstadoConciliacion.PENDIENTE)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(limite);
    if (error) {
      throw new BadRequestException(`Error obteniendo retiros pendientes: ${error.message}`);
    }
    return (data || []) as RetiroCaja[];
  }

  async calcularTotalRetiros(sesionId: string, tenantId: string): Promise<number> {
    const retiros = await this.obtenerRetirosSesion(sesionId, tenantId);
    return retiros.reduce((sum, retiro) => sum + Number(retiro.monto || 0), 0);
  }

  async obtenerEstadisticasRetiros(
    fechaDesde: string,
    fechaHasta: string,
    tenantId: string,
  ): Promise<Record<string, { cantidad: number; total: number }>> {
    const { data, error } = await this.supabase.getClient()
      .from('retiros_caja')
      .select('motivo, monto')
      .eq('tenant_id', tenantId)
      .gte('created_at', fechaDesde)
      .lte('created_at', fechaHasta);
    if (error) {
      throw new BadRequestException(`Error obteniendo estadísticas: ${error.message}`);
    }
    return (data || []).reduce((result: Record<string, { cantidad: number; total: number }>, row) => {
      result[row.motivo] ??= { cantidad: 0, total: 0 };
      result[row.motivo].cantidad += 1;
      result[row.motivo].total += Number(row.monto || 0);
      return result;
    }, {});
  }
}
