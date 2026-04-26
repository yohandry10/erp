import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { OutboxEventBuilder } from '../../../shared/outbox/outbox-event.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Scheduler ligero para encolar eventos de depreciación hacia contabilidad.
 * Si la tabla `depreciaciones_programadas` no existe (entornos sin activos),
 * solo registra una advertencia y se desactiva silenciosamente.
 */
@Injectable()
export class DepreciacionSchedulerService {
  private readonly logger = new Logger(DepreciacionSchedulerService.name);
  private tableMissingLogged = false;

  constructor(private readonly supabase: SupabaseService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async emitirDepreciacionesProgramadas(): Promise<void> {
    try {
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await this.supabase
        .getClient()
        .from('depreciaciones')
        .select('id, tenant_id, activo_id, periodo, monto_depreciacion, centro_costo_id, created_at')
        .gte('created_at', desde)
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
        if (!dep?.tenant_id || !dep?.monto_depreciacion) {
          this.logger.warn(`⚠️ Depreciación ${dep?.id} sin tenant_id o monto_depreciacion, se omite`);
          continue;
        }

        const eventId = uuidv4();
        const event = OutboxEventBuilder.build({
          tenantId: dep.tenant_id,
          eventType: 'depreciacion.generada',
          aggregateType: 'depreciacion',
          aggregateId: dep.activo_id || dep.id || eventId,
          idempotencyKey: `depreciacion.generada:${dep.tenant_id}:${dep.id || dep.activo_id || eventId}`,
          eventData: {
            monto: Number(dep.monto_depreciacion),
            fecha: dep.created_at || new Date().toISOString(),
            referencia: dep.periodo || dep.activo_id || dep.id,
            centro_costo_id: dep.centro_costo_id,
            eventId,
          },
        });

        try {
          await this.supabase.getClient().from('outbox_events').insert(event);
          // Intentar marcar como enviado si existen columnas de control
          await this.supabase
            .getClient()
            .from('depreciaciones')
            .update({ procesado_outbox: true, evento_id: event.event_id })
            .eq('id', dep.id);
          this.logger.log(`✅ Depreciación encolada para activo ${dep.activo_id || dep.id} (${event.event_id})`);
        } catch (err: any) {
          // Si la columna no existe, solo registrar advertencia y continuar
          if (err?.code === '42703') {
            this.logger.warn('⚠️ Columnas de control (procesado_outbox, evento_id) no existen en depreciaciones; considera agregarlas para idempotencia.');
          } else {
            this.logger.error(`❌ Error encolando depreciacion.generada (${dep.id}):`, err);
          }
        }
      }
    } catch (error) {
      this.logger.error('❌ Excepción en scheduler de depreciación:', error);
    }
  }
}
