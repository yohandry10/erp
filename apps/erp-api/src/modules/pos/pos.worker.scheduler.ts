import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PosService } from './pos.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

@Injectable()
export class PosWorkerScheduler {
  private readonly logger = new Logger(PosWorkerScheduler.name);

  constructor(
    private readonly posService: PosService,
    private readonly supabase: SupabaseService,
  ) {}

  private async fetchTenants(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase.getPublicClient()
        .from('tenants')
        .select('id');

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

    const tenants = await this.fetchTenants();
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
  }
}
