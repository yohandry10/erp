import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Reconciliador de seguridad para depreciaciones históricas.
 *
 * Las depreciaciones nuevas insertan su outbox dentro de
 * `registrar_depreciacion_tx`; este cron sólo repara filas antiguas o una
 * ejecución interrumpida. No usa una ventana temporal: una caída de más de
 * 24 horas no puede volver invisible una cuota pendiente.
 */
@Injectable()
export class DepreciacionSchedulerService {
  private readonly logger = new Logger(DepreciacionSchedulerService.name);
  private tableMissingLogged = false;

  constructor(private readonly supabase: SupabaseService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async emitirDepreciacionesProgramadas(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .getClient()
        .from('depreciaciones')
        .select('id, tenant_id')
        .or('procesado_outbox.eq.false,evento_id.is.null')
        .neq('estado', 'ANULADA')
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        // Tabla no existe o error de esquema
        if (error.code === '42P01') {
          if (!this.tableMissingLogged) {
            this.logger.warn('⚠️ Tabla depreciaciones no existe; scheduler de depreciación inactivo.');
            this.tableMissingLogged = true;
          }
          return;
        }
        this.logger.error('❌ Error consultando depreciaciones programadas:', error);
        return;
      }

      if (!data || data.length === 0) {
        return;
      }

      for (const dep of data) {
        if (!dep?.id || !dep?.tenant_id) {
          this.logger.warn('Depreciación histórica sin id o tenant_id; no puede reconciliarse.');
          continue;
        }

        const { data: reconciliado, error: rpcError } = await this.supabase
          .getClient()
          .rpc('asegurar_depreciacion_outbox_tx', {
            p_tenant_id: dep.tenant_id,
            p_depreciacion_id: dep.id
          });

        if (rpcError) {
          this.logger.error(
            `No se pudo reconciliar depreciación ${dep.id}: ${rpcError.message}`
          );
          continue;
        }

        this.logger.log(
          `Depreciación ${dep.id} reconciliada con evento ${
            reconciliado?.eventId ?? reconciliado?.event_id ?? 'durable'
          }.`
        );
      }
    } catch (error) {
      this.logger.error('❌ Excepción en scheduler de depreciación:', error);
    }
  }
}
