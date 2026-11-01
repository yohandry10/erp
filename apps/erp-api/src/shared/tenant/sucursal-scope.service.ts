import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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

    let data: unknown;
    try {
      const respuesta = await this.supabase
        .getClient({ silent: true })
        .from('usuario_sucursales')
        .select('sucursal_id')
        .eq('tenant_id', tenantId)
        .eq('usuario_sistema_id', usuarioSistemaId);

      if (respuesta.error) throw respuesta.error;
      data = respuesta.data;
    } catch (err) {
      // Falla cerrado: un fallo de lectura no puede ensanchar lo que el usuario ve.
      // Una asignación que no se pudo leer sigue vigente, y `null` la borraría.
      this.logger.error(
        `No se pudo resolver el alcance por sucursal de ${usuarioSistemaId}: ${(err as Error)?.message}.`,
      );
      throw new ServiceUnavailableException('No se pudo verificar el alcance del usuario. Intente nuevamente.');
    }

    const ids = ((data as Array<{ sucursal_id: string }> | null) ?? []).map((r) => r.sucursal_id);
    return ids.length > 0 ? ids : null;
  }
}
