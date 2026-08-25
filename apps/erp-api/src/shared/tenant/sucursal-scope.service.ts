import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { AlcanceSucursal } from './sucursal-scope';

/**
 * Resuelve qué sucursales alcanza un usuario. Una vez por petición.
 */
@Injectable()
export class SucursalScopeService {
  private readonly logger = new Logger(SucursalScopeService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * `null` = alcance total. Es el estado de todo usuario sin asignaciones, que
   * hoy son todos: aplicar la 503 no le quitó el acceso a nadie.
   *
   * Es una consulta por índice sobre `usuario_sucursales` que en el caso
   * mayoritario devuelve cero filas. No se cachea a propósito: el mismo motivo
   * por el que las decisiones RBAC de este sistema tampoco usan caché local
   * entre réplicas --una asignación retirada tiene que surtir efecto en la
   * petición siguiente, no cuando venza un TTL--.
   */
  async resolver(tenantId: string | null, usuarioSistemaId: string | null): Promise<AlcanceSucursal> {
    if (!tenantId || !usuarioSistemaId) {
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .getClient({ silent: true })
        .from('usuario_sucursales')
        .select('sucursal_id')
        .eq('tenant_id', tenantId)
        .eq('usuario_sistema_id', usuarioSistemaId);

      if (error) {
        // Se deja pasar sin restringir, y se grita en el log.
        //
        // Fallar cerrado aquí dejaría el ERP entero sin datos ante un problema
        // transitorio de una tabla que la mayoría de contribuyentes ni usa, y lo
        // que este alcance separa son locales de una misma empresa: la frontera
        // que de verdad importa --la del contribuyente-- la sostienen el
        // `tenant_id` de cada consulta y las claves foráneas compuestas, y no se
        // toca aquí.
        this.logger.error(
          `No se pudo resolver el alcance por sucursal de ${usuarioSistemaId}: ${error.message}. ` +
          'La petición continúa con alcance total.',
        );
        return null;
      }

      const ids = ((data as Array<{ sucursal_id: string }> | null) ?? []).map((r) => r.sucursal_id);
      return ids.length > 0 ? ids : null;
    } catch (err) {
      this.logger.error(
        `No se pudo resolver el alcance por sucursal de ${usuarioSistemaId}: ${(err as Error)?.message}. ` +
        'La petición continúa con alcance total.',
      );
      return null;
    }
  }
}
