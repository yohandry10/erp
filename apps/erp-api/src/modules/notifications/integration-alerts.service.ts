import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { NotificationsService } from './notifications.service';
import {
  NotificationSeverity,
  NotificationType,
} from './notification.types';

type IntegrationStatus = 'SUCCESS' | 'ERROR' | 'PENDING' | 'TIMEOUT';

interface RecordEventOptions {
  tenantId: string;
  servicio: string;
  operacion: string;
  correlacionId?: string | null;
  correlacionTipo?: string | null;
  status: IntegrationStatus;
  durationMs?: number;
  errorMessage?: string;
  statusCode?: number | null;
  requestSummary?: Record<string, unknown> | null;
  responseSummary?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

const DEFAULT_SLOW_THRESHOLD_MS = 7000;

@Injectable()
export class IntegrationAlertsService {
  private readonly logger = new Logger(IntegrationAlertsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  async recordSuccess(options: Omit<RecordEventOptions, 'status'>): Promise<void> {
    await this.recordEvent({ ...options, status: 'SUCCESS' });
  }

  async recordError(options: Omit<RecordEventOptions, 'status'>): Promise<void> {
    await this.recordEvent({ ...options, status: 'ERROR' });
  }

  async recordEvent(options: RecordEventOptions): Promise<void> {
    const {
      tenantId,
      servicio,
      operacion,
      correlacionId,
      correlacionTipo,
      status,
      durationMs,
      errorMessage,
      statusCode,
      requestSummary,
      responseSummary,
      metadata,
    } = options;

    try {
      const { error } = await this.supabase
        .getClient()
        .from('integration_logs')
        .insert({
          tenant_id: tenantId,
          servicio,
          operacion,
          correlacion_id: correlacionId ?? null,
          correlacion_tipo: correlacionTipo ?? null,
          status,
          status_code: statusCode ?? null,
          error_message: errorMessage ?? null,
          duration_ms: durationMs ?? null,
          request_summary: requestSummary ?? null,
          response_summary: responseSummary ?? null,
          metadata: metadata ?? null,
        });

      if (error) {
        this.logger.error(
          `No se pudo registrar el evento de integración ${servicio}/${operacion}: ${error.message}`,
          error,
        );
      }
    } catch (error) {
      this.logger.error(
        `Fallo inesperado registrando integración ${servicio}/${operacion}`,
        error as Error,
      );
    }

    await this.emitAlertIfNeeded(options);
  }

  private async emitAlertIfNeeded(options: RecordEventOptions): Promise<void> {
    const { tenantId, servicio, operacion, status, durationMs, errorMessage, correlacionId } =
      options;

    try {
      if (status === 'ERROR') {
        await this.notifications.createNotification(tenantId, {
          type: NotificationType.INTEGRACION_ERROR,
          severity: NotificationSeverity.ERROR,
          title: `Falla en integración ${servicio}`,
          message: this.composeErrorMessage(servicio, operacion, errorMessage, correlacionId),
          action_url: correlacionId ? `/dashboard/auditoria/integraciones/${correlacionId}` : undefined,
          action_label: correlacionId ? 'Ver detalle' : undefined,
        });
        return;
      }

      if (typeof durationMs === 'number' && durationMs >= DEFAULT_SLOW_THRESHOLD_MS) {
        await this.notifications.createNotification(tenantId, {
          type: NotificationType.INTEGRACION_LENTA,
          severity: NotificationSeverity.WARNING,
          title: `Integración lenta: ${servicio}`,
          message: `La operación ${operacion} tardó ${Math.round(durationMs)} ms en completarse.`,
        });
      }
    } catch (error) {
      this.logger.error(
        `No se pudo emitir la alerta de integración ${servicio}/${operacion}`,
        error as Error,
      );
    }
  }

  private composeErrorMessage(
    servicio: string,
    operacion: string,
    errorMessage?: string | null,
    correlacionId?: string | null,
  ): string {
    const base = `La operación ${operacion} del servicio ${servicio} falló.`;
    const detalle = errorMessage ? ` Detalle: ${errorMessage}` : '';
    const correlacion = correlacionId ? ` Correlación: ${correlacionId}.` : '';
    return `${base}${detalle}${correlacion}`.trim();
  }
}
