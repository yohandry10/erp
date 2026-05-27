import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventBusService, ProductoStockBajoEvent, ERPEvent } from '../../shared/events/event-bus.service';
import { NotificationsService } from './notifications.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { NotificationType, NotificationSeverity } from './notification.types';
import { sanitizePostgrestSearch } from '../../common/util/postgrest.util';

/**
 * Listener para alertas de stock bajo
 *
 * Este servicio escucha eventos de ProductoStockBajoEvent y genera notificaciones
 * automáticas para usuarios relevantes (administradores, gerentes de inventario).
 *
 * Características:
 * - Evita notificaciones duplicadas verificando notificaciones recientes (últimas 24 horas)
 * - Notifica a usuarios con permisos de inventario o roles administrativos
 * - Genera notificaciones con severidad WARNING
 */
@Injectable()
export class InventoryStockAlertsListener implements OnModuleInit {
  private readonly logger = new Logger(InventoryStockAlertsListener.name);
  private readonly NOTIFICATION_COOLDOWN_HOURS = 24; // Evitar notificaciones duplicadas por 24 horas

  constructor(
    private readonly eventBus: EventBusService,
    private readonly notificationsService: NotificationsService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Registra el listener cuando el módulo se inicializa
   */
  onModuleInit() {
    this.logger.log('👂 [InventoryStockAlertsListener] Registrando listener para ProductoStockBajoEvent');
    this.eventBus.onProductoStockBajo(this.handleProductoStockBajo.bind(this));
  }

  /**
   * Maneja el evento ProductoStockBajoEvent
   * Genera notificaciones para usuarios relevantes
   */
  private async handleProductoStockBajo(event: ERPEvent): Promise<void> {
    try {
      const data = event.data as ProductoStockBajoEvent;

      this.logger.log(
        `📦 [InventoryStockAlertsListener] Procesando alerta de stock bajo: ${data.nombreProducto} (${data.codigoProducto})`
      );

      // Obtener tenantId del evento o del contexto
      // Si el evento no tiene tenantId, necesitamos obtenerlo del producto
      const tenantId = await this.obtenerTenantIdDelProducto(data.productoId);

      if (!tenantId) {
        this.logger.warn(`⚠️ No se pudo obtener tenantId para producto ${data.productoId}. Saltando notificación.`);
        return;
      }

      // Verificar si ya hay una notificación reciente para este producto (evitar duplicados)
      const tieneNotificacionReciente = await this.verificarNotificacionReciente(
        tenantId,
        data.productoId,
        data.codigoProducto
      );

      if (tieneNotificacionReciente) {
        this.logger.log(
          `⏭️ Ya existe una notificación reciente para producto ${data.codigoProducto}. Saltando...`
        );
        return;
      }

      // Obtener usuarios relevantes para notificar
      const usuariosRelevantes = await this.obtenerUsuariosRelevantes(tenantId);

      if (usuariosRelevantes.length === 0) {
        this.logger.warn(`⚠️ No se encontraron usuarios relevantes para notificar en tenant ${tenantId}`);
        return;
      }

      // Crear notificaciones para cada usuario relevante
      const porcentajeStock = (data.stockActual / data.stockMinimo) * 100;
      const mensaje = `El producto "${data.nombreProducto}" (${data.codigoProducto}) tiene stock bajo. ` +
        `Stock actual: ${data.stockActual}, Mínimo: ${data.stockMinimo} (${porcentajeStock.toFixed(1)}%)`;

      for (const usuarioId of usuariosRelevantes) {
        try {
          await this.notificationsService.createNotification(tenantId, {
            type: NotificationType.STOCK_BAJO,
            severity: NotificationSeverity.WARNING,
            title: `Stock Bajo: ${data.nombreProducto}`,
            message: mensaje,
            action_url: `/dashboard/inventario?producto=${data.productoId}`,
            action_label: 'Ver Producto',
            usuario_id: usuarioId,
          });

          this.logger.log(
            `✅ Notificación de stock bajo creada para usuario ${usuarioId} - Producto: ${data.codigoProducto}`
          );
        } catch (error) {
          this.logger.error(
            `❌ Error creando notificación para usuario ${usuarioId}:`,
            error
          );
          // Continuar con otros usuarios aunque uno falle
        }
      }

      this.logger.log(
        `✅ Alertas de stock bajo enviadas a ${usuariosRelevantes.length} usuarios para producto ${data.codigoProducto}`
      );
    } catch (error) {
      this.logger.error(`❌ Error procesando ProductoStockBajoEvent:`, error);
      // No lanzamos el error para no bloquear otros listeners
    }
  }

  /**
   * Obtiene el tenantId del producto
   */
  private async obtenerTenantIdDelProducto(productoId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('productos')
        .select('tenant_id')
        .eq('id', productoId)
        .single();

      if (error) {
        this.logger.error(`Error obteniendo tenantId del producto:`, error);
        return null;
      }

      return data?.tenant_id || null;
    } catch (error) {
      this.logger.error(`Error en obtenerTenantIdDelProducto:`, error);
      return null;
    }
  }

  /**
   * Verifica si ya existe una notificación reciente para este producto
   * Evita notificaciones duplicadas dentro del período de cooldown
   * Busca por código de producto en el mensaje o action_url
   */
  private async verificarNotificacionReciente(
    tenantId: string,
    productoId: string,
    codigoProducto: string
  ): Promise<boolean> {
    try {
      const fechaLimite = new Date();
      fechaLimite.setHours(fechaLimite.getHours() - this.NOTIFICATION_COOLDOWN_HOURS);

      // Buscar notificaciones recientes que mencionen este producto.
      // HARDENING: sanitizar codigoProducto y productoId antes de interpolarlos
      // en PostgREST .or (evitar filter injection con caracteres especiales).
      const safeCodigo = sanitizePostgrestSearch(codigoProducto, 60);
      const safeProductoId = sanitizePostgrestSearch(productoId, 60);
      if (safeCodigo.length === 0 && safeProductoId.length === 0) {
        return false; // sin identificador útil, no marcamos como duplicado
      }
      const filters: string[] = [];
      if (safeCodigo.length > 0) filters.push(`mensaje.ilike.%${safeCodigo}%`);
      if (safeProductoId.length > 0) filters.push(`action_url.ilike.%producto=${safeProductoId}%`);
      const { data, error } = await this.supabase.getClient()
        .from('notificaciones')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('tipo', NotificationType.STOCK_BAJO)
        .gte('created_at', fechaLimite.toISOString())
        .or(filters.join(','))
        .limit(1);

      if (error) {
        this.logger.warn(`Error verificando notificación reciente:`, error);
        return false; // Si hay error, permitir notificación (fail open)
      }

      return (data?.length || 0) > 0;
    } catch (error) {
      this.logger.error(`Error en verificarNotificacionReciente:`, error);
      return false; // Si hay error, permitir notificación (fail open)
    }
  }

  /**
   * Obtiene usuarios relevantes para recibir alertas de stock bajo
   * Incluye:
   * - Usuarios con permiso 'inventario.read' o 'inventario.manage'
   * - Usuarios con roles administrativos (Administrador, Gerente)
   * - Usuarios activos únicamente
   */
  private async obtenerUsuariosRelevantes(tenantId: string): Promise<string[]> {
    try {
      const supabase = this.supabase.getClient();

      // Primero intentar obtener usuarios con permisos de inventario
      const { data: usuariosConPermiso, error: permisosError } = await supabase
        .from('usuarios_sistema')
        .select(`
          id,
          user_roles!inner(
            roles!inner(
              role_permissions!inner(
                permissions!inner(
                  codigo
                )
              )
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('estado', 'ACTIVO')
        .or('user_roles.roles.role_permissions.permissions.codigo.eq.inventario.read,user_roles.roles.role_permissions.permissions.codigo.eq.inventario.manage');

      const usuariosIds = new Set<string>();

      if (!permisosError && usuariosConPermiso) {
        usuariosConPermiso.forEach((usuario: any) => {
          if (usuario.id) {
            usuariosIds.add(usuario.id);
          }
        });
      }

      // También obtener usuarios con roles administrativos
      const { data: usuariosPorRol, error: rolesError } = await supabase
        .from('usuarios_sistema')
        .select(`
          id,
          user_roles!inner(
            roles!inner(
              nombre
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('estado', 'ACTIVO')
        .in('user_roles.roles.nombre', ['Administrador', 'Gerente', 'Gerente de Inventario']);

      if (!rolesError && usuariosPorRol) {
        usuariosPorRol.forEach((usuario: any) => {
          if (usuario.id) {
            usuariosIds.add(usuario.id);
          }
        });
      }

      // Si no encontramos usuarios específicos, notificar a todos los administradores
      if (usuariosIds.size === 0) {
        this.logger.warn(`⚠️ No se encontraron usuarios con permisos específicos. Buscando administradores...`);

        const { data: administradores, error: adminError } = await supabase
          .from('usuarios_sistema')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('estado', 'ACTIVO')
          .eq('is_super_admin', true)
          .limit(10);

        if (!adminError && administradores) {
          administradores.forEach((admin: any) => {
            if (admin.id) {
              usuariosIds.add(admin.id);
            }
          });
        }
      }

      return Array.from(usuariosIds);
    } catch (error) {
      this.logger.error(`Error obteniendo usuarios relevantes:`, error);
      return [];
    }
  }
}

