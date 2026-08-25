import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { TipoCambioSunatService } from './tipo-cambio-sunat.service';
import { fechaHoyDelTenant, paisDelTenant } from '../../../shared/utils/fecha-tenant.util';

/**
 * Trae el tipo de cambio del día para cada contribuyente activo.
 *
 * Corre a las 03:00 UTC, que ya es el día siguiente en el reloj pero todavía la
 * tarde anterior en América, y por eso la fecha que se pide es **la del
 * calendario de cada contribuyente**, no la del reloj del servidor: pedir la
 * fecha UTC reclamaría una cotización que aún no existe. Es el mismo desfase que
 * ya mordió al planificador de plantillas.
 *
 * Sólo se importa para contribuyentes de Perú. La cotización es la que determina
 * la SBS y publica SUNAT; traérsela a una empresa de otro país sería guardarle un
 * tipo de cambio que no es el suyo.
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

  /**
   * A nombre de quién se importa en un contribuyente.
   *
   * No vale un usuario inventado: `assert_financial_master_actor_477` exige que
   * el autor sea un usuario activo del propio contribuyente, y hace bien --la
   * traza de un maestro contable tiene que apuntar a alguien de la empresa--.
   * Se prefiere al contador, que es de quien es el dato, y si no lo hay al
   * administrador. Si no hay ninguno de los dos no se importa: anotarlo a nombre
   * de un cajero sería atribuirle algo que no hizo.
   */
  private async responsableDe(tenantId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from('user_roles')
      .select(
        // `user_roles` tiene dos claves ajenas a `usuarios_sistema`
        // --`usuario_sistema_id` y `assigned_by`--, asi que el embed hay que
        // decirlo por el nombre de la clave o PostgREST no sabe cual es.
        'usuario_sistema_id, roles!inner(nombre), usuarios_sistema!user_roles_usuario_sistema_id_fkey!inner(activo)',
      )
      .eq('tenant_id', tenantId)
      .in('roles.nombre', ['CONTADOR', 'ADMIN'])
      .eq('usuarios_sistema.activo', true);

    if (error) {
      this.logger.error(`No se pudo resolver el responsable de ${tenantId}: ${error.message}`);
      return null;
    }

    const filas = (data as Array<{ usuario_sistema_id: string; roles: any }>) ?? [];
    const contador = filas.find((f) => (f.roles?.nombre ?? f.roles?.[0]?.nombre) === 'CONTADOR');
    return (contador ?? filas[0])?.usuario_sistema_id ?? null;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async importarTipoCambioDelDia(): Promise<void> {
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
    let ajenos = 0;

    for (const tenant of tenants) {
      let fecha = '(sin fecha)';
      try {
        // Cada contribuyente en su propio contexto: `getClient()` lo exige y
        // además es lo que aplica el aislamiento correcto.
        const resultado = await this.tenantContext.run(
          { tenantId: tenant.id, isSuperAdmin: true },
          async () => {
            const cliente = this.supabase.getClient();

            if ((await paisDelTenant(cliente, tenant.id)) !== 'PE') {
              return { ajeno: true } as const;
            }

            fecha = await fechaHoyDelTenant(cliente, tenant.id);

            const actorId = await this.responsableDe(tenant.id);
            if (!actorId) {
              return {
                fecha,
                guardado: false,
                motivo: 'no tiene un contador ni un administrador activo a cuyo nombre importar',
              };
            }
            return this.tipoCambio.importarFecha(tenant.id, fecha, actorId);
          },
        );

        if ('ajeno' in resultado) {
          ajenos += 1;
        } else if (resultado.guardado) {
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
      `Tipo de cambio: ${guardados} guardados, ${omitidos} omitidos y ${ajenos} de fuera de Perú, ` +
        `de ${tenants.length} contribuyentes`,
    );
  }
}
