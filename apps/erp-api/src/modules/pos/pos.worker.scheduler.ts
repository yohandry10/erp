import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PosService } from './pos.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

@Injectable()
export class PosWorkerScheduler {
  private readonly logger = new Logger(PosWorkerScheduler.name);
  private readonly cronLockKey = 'worker:pos:pendientes';
  private readonly cronLockTtlSeconds = 600;

  constructor(
    private readonly posService: PosService,
    private readonly supabase: SupabaseService,
  ) {}

  private async fetchTenants(): Promise<string[]> {
    try {
      // Los tenants demo se crean con estado PRUEBA; sin incluirlos, sus ventas
      // POS quedaban con cpe_pendiente=true para siempre (0 intentos).
      const { data, error } = await this.supabase.getPublicClient()
        .from('tenants')
        .select('id')
        .in('estado', ['ACTIVO', 'PRUEBA']);

      if (error) {
        this.logger.error(`❌ [POS Worker] Error obteniendo tenants: ${error.message}`);
        return [];
      }

      return (data || []).map((t: any) => t.id).filter(Boolean);
    } catch (err: any) {
      this.logger.error(`❌ [POS Worker] Excepción obteniendo tenants: ${err?.message || err}`);
      return [];
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'pos-worker-pendientes' })
  async handleCron() {
    const enabled = process.env.POS_WORKER_CRON_ENABLED;
    if (enabled === 'false') {
      return;
    }

    this.logger.log('🔄 [POS Worker] Inicio de procesamiento automático de ventas pendientes');

    const lockAcquired = await this.tryAcquireJobLock();
    if (!lockAcquired) {
      this.logger.debug('⏭️ [POS Worker] Otro nodo tiene el lock distribuido, saltando...');
      return;
    }

    const tenants = await this.fetchTenants();
    try {
      if (!tenants.length) {
        this.logger.warn('⚠️ [POS Worker] No se encontraron tenants para procesar');
        return;
      }

      let totalProcesadas = 0;
      let totalErrores = 0;

      for (const tenantId of tenants) {
        try {
          const result = await this.posService.procesarVentasPendientesFacturacion(tenantId, 50);
          totalProcesadas += result?.procesadas || 0;
          totalErrores += result?.errores || 0;
          this.logger.log(
            `✅ [POS Worker] Tenant ${tenantId}: procesadas=${result?.procesadas || 0}, errores=${result?.errores || 0}`,
          );
        } catch (err: any) {
          totalErrores += 1;
          this.logger.error(
            `❌ [POS Worker] Error procesando tenant ${tenantId}: ${err?.message || err}`,
          );
        }
      }

      this.logger.log(
        `🏁 [POS Worker] Finalizado. Tenants=${tenants.length}, procesadas=${totalProcesadas}, errores=${totalErrores}`,
      );
    } finally {
      await this.releaseJobLock();
    }
  }

  private async tryAcquireJobLock(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.getPublicClient().rpc('acquire_job_lock', {
        p_lock_key: this.cronLockKey,
        p_lock_ttl_seconds: this.cronLockTtlSeconds,
      });

      if (error) {
        this.logger.warn(`⚠️ [POS Worker] No se pudo adquirir lock distribuido: ${error.message}`);
        return this.shouldContinueWithoutDistributedLock(error);
      }

      return data === true || data === 'true';
    } catch (err: any) {
      this.logger.warn(`⚠️ [POS Worker] Error adquiriendo lock distribuido: ${err?.message || err}`);
      return this.shouldContinueWithoutDistributedLock(err);
    }
  }

  private shouldContinueWithoutDistributedLock(error: any): boolean {
    const message = String(error?.message || error || '').toLowerCase();
    const lockUnavailable =
      message.includes('permission denied') ||
      message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('schema cache') ||
      message.includes('blocked for rpc');

    if (lockUnavailable) {
      this.logger.warn(
        '⚠️ [POS Worker] Lock distribuido no disponible; se continua con procesamiento idempotente.',
      );
      return true;
    }

    return false;
  }

  private async releaseJobLock(): Promise<void> {
    try {
      await this.supabase.getPublicClient().rpc('release_job_lock', {
        p_lock_key: this.cronLockKey,
      });
    } catch (err: any) {
      this.logger.warn(`⚠️ [POS Worker] Error liberando lock distribuido: ${err?.message || err}`);
    }
  }
}
