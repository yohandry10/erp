import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { TipoCambioSunatService } from './tipo-cambio-sunat.service';

/**
 * Trae el tipo de cambio del día para cada contribuyente activo.
 *
 * Corre a las 03:00 UTC, que son las 22:00 de Lima del día anterior, y por eso
 * importa **la fecha de Lima y no la del reloj**: la SBS publica la cotización
 * de un día hábil y tomar la fecha UTC pediría la del día siguiente, que aún no
 * existe. Es el mismo desfase que ya mordió al planificador de plantillas.
 *
 * Que un contribuyente falle no detiene a los demás, y que la fuente esté caída
 * no rompe nada: el tipo de cambio se puede seguir tecleando a mano, que es como
 * se hacía hasta ahora.
 */
@Injectable()
export class TipoCambioSchedulerService {
  private readonly logger = new Logger(TipoCambioSchedulerService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly tipoCambio: TipoCambioSunatService,
  ) {}

  /** Fecha de Lima (UTC-5), que es la que publica la SBS. */
  private fechaDeLima(): string {
    const ahora = new Date();
    return new Date(ahora.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async importarTipoCambioDelDia(): Promise<void> {
    const fecha = this.fechaDeLima();

    let tenants: Array<{ id: string }> = [];
    try {
      const { data, error } = await this.supabase
        .getClient({ silent: true })
        .from('tenants')
        .select('id')
        .eq('activo', true);
      if (error) throw new Error(error.message);
      tenants = (data as Array<{ id: string }>) ?? [];
    } catch (error: any) {
      this.logger.error(`No se pudo listar contribuyentes activos: ${error?.message}`);
      return;
    }

    let guardados = 0;
    let omitidos = 0;

    for (const tenant of tenants) {
      try {
        // Cada contribuyente en su propio contexto: `getClient()` lo exige y
        // además es lo que aplica el aislamiento correcto.
        const resultado = await this.tenantContext.run(
          { tenantId: tenant.id, isSuperAdmin: true },
          () => this.tipoCambio.importarFecha(tenant.id, fecha),
        );

        if (resultado.guardado) {
          guardados += 1;
        } else {
          omitidos += 1;
          if (resultado.cotizacion) {
            // Sólo se registra cuando hubo cotización y aun así no se guardó:
            // ahí es donde hay algo que mirar.
            this.logger.warn(
              `Tipo de cambio ${fecha} no guardado para ${tenant.id}: ${resultado.motivo}`,
            );
          }
        }
      } catch (error: any) {
        omitidos += 1;
        this.logger.error(
          `Tipo de cambio ${fecha} fallo para ${tenant.id}: ${error?.message}`,
        );
      }
    }

    this.logger.log(
      `Tipo de cambio ${fecha}: ${guardados} guardados, ${omitidos} omitidos de ${tenants.length} contribuyentes`,
    );
  }
}
