import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlantillasAsientosService } from './plantillas-asientos.service';

/**
 * Genera los asientos de las plantillas recurrentes cuya fecha ya venció.
 *
 * El asiento nace en el estado que declara la plantilla, que por omisión es
 * BORRADOR: un asiento creado de madrugada sin que nadie lo mire no debería
 * entrar solo a los libros.
 *
 * La idempotencia real la da el índice único (tenant, plantilla, período) del
 * historial, no este scheduler: si el proceso corre dos veces, la segunda
 * generación se rechaza en la base.
 */
@Injectable()
export class PlantillasSchedulerService {
  private readonly logger = new Logger(PlantillasSchedulerService.name);

  constructor(private readonly plantillas: PlantillasAsientosService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async generarPlantillasVencidas(): Promise<void> {
    // El cron corre a las 02:00 del servidor, que está en UTC: son las 21:00 del
    // día anterior en Lima. Tomar la fecha del reloj aquí adelantaba un día tanto
    // el disparo de la plantilla como la fecha del asiento generado. Como el
    // alcance operativo va de UTC-5 a UTC-3, la fecha UTC nunca se queda corta:
    // sirve como corte amplio para la consulta y luego cada plantilla se filtra
    // con el calendario de su propio tenant.
    const corteAmplio = new Date().toISOString().slice(0, 10);

    let vencidas: Array<{ id: string; tenant_id: string; proxima_ejecucion: string }>;
    try {
      vencidas = await this.plantillas.obtenerVencidas(corteAmplio);
    } catch (error: any) {
      this.logger.error(`No se pudieron obtener las plantillas vencidas: ${error.message}`);
      return;
    }

    if (vencidas.length === 0) {
      return;
    }

    this.logger.log(`🧾 Procesando ${vencidas.length} plantilla(s) recurrente(s) vencida(s)`);

    for (const plantilla of vencidas) {
      // Una plantilla que falla no debe impedir que se generen las demás: cada
      // una es independiente y pertenece potencialmente a otro tenant.
      // Fuera del try: el catch de abajo también necesita esta fecha, y
      // `fechaHoyDelTenant` no lanza —ante cualquier fallo cae a la zona de Lima—.
      const hoyTenant = await this.plantillas.fechaHoyDe(plantilla.tenant_id);
      if (plantilla.proxima_ejecucion > hoyTenant) {
        // Vencida según el reloj del servidor, pero todavía no en el calendario
        // del contribuyente. Se deja para la próxima madrugada.
        continue;
      }

      try {
        await this.plantillas.generar(
          plantilla.tenant_id,
          'system',
          plantilla.id,
          { fecha: hoyTenant },
          true
        );
        await this.plantillas.avanzarAgenda(plantilla.tenant_id, plantilla.id, new Date(hoyTenant));
      } catch (error: any) {
        // Si una persona ya generó manualmente el asiento del período, o el
        // proceso cayó después de crear el asiento pero antes de mover la
        // agenda, la idempotencia hizo su trabajo. Avanzar evita que la misma
        // plantilla quede vencida y falle cada madrugada para siempre.
        if (/ya generó un asiento para el período/i.test(error?.message ?? '')) {
          try {
            await this.plantillas.avanzarAgenda(
              plantilla.tenant_id,
              plantilla.id,
              new Date(hoyTenant)
            );
            this.logger.warn(
              `Plantilla ${plantilla.id}: período ya generado; agenda recuperada.`
            );
            continue;
          } catch (agendaError: any) {
            this.logger.error(
              `Plantilla ${plantilla.id}: no se pudo recuperar la agenda: ${agendaError.message}`
            );
            continue;
          }
        }
        this.logger.error(
          `Plantilla ${plantilla.id} (tenant ${plantilla.tenant_id}) no pudo generarse: ${error.message}`
        );
      }
    }
  }
}
