import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import {
  Notification,
  CreateNotificationDto,
  NotificationFilters,
  NotificationType,
  NotificationSeverity,
} from './notification.types';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';

type AuthenticatedUser = { id?: string; is_super_admin?: boolean };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly tenantContext: TenantContextService,
  ) { }

  private async withTenantContext<T>(
    tenantId: string,
    user: AuthenticatedUser | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!tenantId) {
      throw new Error('Tenant no identificado para notificaciones');
    }

    const existing = this.tenantContext.getContext();
    if (existing?.tenantId === tenantId) {
      await this.supabaseService.prepareTenantContext();
      return operation();
    }

    return this.tenantContext.run(
      {
        tenantId,
        userId: user?.id ?? null,
        supabaseAccessToken: null,
        isSuperAdmin: user?.is_super_admin ?? false,
      },
      async () => {
        await this.supabaseService.prepareTenantContext();
        return operation();
      },
    );
  }

  async createNotification(
    tenantId: string,
    notificationData: CreateNotificationDto,
    user?: AuthenticatedUser,
  ): Promise<Notification> {
    return this.withTenantContext(tenantId, user, async () => {
      const insertData: any = {
        usuario_id: notificationData.usuario_id,
        tipo: notificationData.type,
        severidad: notificationData.severity,
        titulo: notificationData.title,
        mensaje: notificationData.message,
        action_url: notificationData.action_url,
        action_label: notificationData.action_label,
      };

      // Agregar roles_destinatarios si se especificaron
      if (notificationData.roles_destinatarios && notificationData.roles_destinatarios.length > 0) {
        insertData.roles_destinatarios = notificationData.roles_destinatarios;
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('gestionar_notificacion_tx', {
          p_tenant_id: tenantId,
          p_actor_id: user?.id ?? null,
          p_operacion: 'CREATE',
          p_payload: insertData,
        });

      if (error) {
        this.logger.error(`Error creating notification: ${error.message}`, error);
        throw new Error(error.message);
      }

      const rolesInfo = notificationData.roles_destinatarios?.length
        ? ` for roles: ${notificationData.roles_destinatarios.join(', ')}`
        : notificationData.usuario_id
          ? ` for user: ${notificationData.usuario_id}`
          : ' (global)';

      this.logger.log(`Notification created: ${notificationData.type}${rolesInfo} in tenant ${tenantId}`);
      return this.mapToNotification(data);
    });
  }

  /**
   * Verifica si un usuario puede modificar una notificación
   */
  private async canUserModifyNotification(
    tenantId: string,
    userId: string | undefined,
    notification: { usuario_id?: string; roles_destinatarios?: string[] },
  ): Promise<boolean> {
    if (!userId) return false;

    // Caso 1: Notificación para este usuario específico
    if (notification.usuario_id === userId) {
      return true;
    }

    // Caso 2: Notificación de otro usuario específico - NO puede modificar
    if (notification.usuario_id && notification.usuario_id !== userId) {
      return false;
    }

    // Caso 3: Notificación global (sin usuario ni roles) - cualquiera puede modificar
    if (!notification.usuario_id && (!notification.roles_destinatarios || notification.roles_destinatarios.length === 0)) {
      return true;
    }

    // Caso 4: Notificación por roles - verificar si el usuario tiene alguno de esos roles
    if (notification.roles_destinatarios && notification.roles_destinatarios.length > 0) {
      const userRoleIds = await this.getUserRoleIds(tenantId, userId);
      return notification.roles_destinatarios.some(roleId => userRoleIds.includes(roleId));
    }

    return false;
  }

  /**
   * Obtiene los role_ids de un usuario
   */
  async getUserRoleIds(tenantId: string, usuarioId: string): Promise<string[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_roles')
      .select('role_id')
      .eq('usuario_sistema_id', usuarioId)
      // El tenant llegaba como parámetro y no se usaba. `user_roles` tiene
      // columna de tenant, y un mismo usuario puede pertenecer a varios: el
      // TenantSwitcher del frontend existe justo para eso. Sin este filtro, los
      // roles de un tenant decidían el acceso a notificaciones de otro.
      .eq('tenant_id', tenantId);

    if (error) {
      this.logger.error(`Error fetching user roles: ${error.message}`, error);
      return [];
    }

    return (data || []).map(r => r.role_id);
  }

  /**
   * Obtiene los role_ids por nombres de rol para un tenant
   */
  async getRoleIdsByNames(tenantId: string, roleNames: string[]): Promise<string[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('nombre', roleNames);

    if (error) {
      this.logger.error(`Error fetching role ids: ${error.message}`, error);
      return [];
    }

    return (data || []).map(r => r.id);
  }

  async getNotifications(
    tenantId: string,
    filters: NotificationFilters | undefined,
    user?: AuthenticatedUser,
  ): Promise<Notification[]> {
    return this.withTenantContext(tenantId, user, async () => {
      // Super admins ven todas las notificaciones del tenant
      if (user?.is_super_admin) {
        let query = this.supabaseService
          .getClient()
          .from('notificaciones')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });

        if (filters?.type) query = query.eq('tipo', filters.type);
        if (filters?.severity) query = query.eq('severidad', filters.severity);
        if (filters?.leida !== undefined) query = query.eq('leida', filters.leida);
        if (filters?.usuario_id) query = query.eq('usuario_id', filters.usuario_id);

        const { data, error } = await query;
        if (error) {
          this.logger.error(`Error fetching notifications: ${error.message}`, error);
          throw new Error(error.message);
        }
        return (data || []).map(item => this.mapToNotification(item));
      }

      // Para usuarios normales: filtrar por usuario_id, roles, o globales
      const userId = filters?.usuario_id || user?.id;
      if (!userId) {
        return [];
      }

      // Obtener los roles del usuario
      const userRoleIds = await this.getUserRoleIds(tenantId, userId);

      // Obtener todas las notificaciones del tenant y filtrar en memoria
      // (Supabase no soporta bien el filtrado de arrays con OR complejo)
      let query = this.supabaseService
        .getClient()
        .from('notificaciones')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (filters?.type) query = query.eq('tipo', filters.type);
      if (filters?.severity) query = query.eq('severidad', filters.severity);
      if (filters?.leida !== undefined) query = query.eq('leida', filters.leida);

      const { data, error } = await query;
      if (error) {
        this.logger.error(`Error fetching notifications: ${error.message}`, error);
        throw error;
      }

      // Filtrar notificaciones que el usuario puede ver:
      // 1. Notificaciones dirigidas a este usuario específico
      // 2. Notificaciones globales (sin usuario_id ni roles_destinatarios)
      // 3. Notificaciones dirigidas a alguno de los roles del usuario
      const filteredData = (data || []).filter(notif => {
        // Caso 1: Notificación para este usuario específico
        if (notif.usuario_id === userId) {
          return true;
        }

        // Caso 2: Notificación de otro usuario específico - NO mostrar
        if (notif.usuario_id && notif.usuario_id !== userId) {
          return false;
        }

        // Caso 3: Notificación global (sin usuario ni roles)
        if (!notif.usuario_id && (!notif.roles_destinatarios || notif.roles_destinatarios.length === 0)) {
          return true;
        }

        // Caso 4: Notificación por roles - verificar si el usuario tiene alguno de esos roles
        if (notif.roles_destinatarios && notif.roles_destinatarios.length > 0) {
          return notif.roles_destinatarios.some((roleId: string) => userRoleIds.includes(roleId));
        }

        return false;
      });

      return filteredData.map(item => this.mapToNotification(item));
    });
  }

  async getUnreadCount(
    tenantId: string,
    usuarioId?: string,
    user?: AuthenticatedUser,
  ): Promise<number> {
    return this.withTenantContext(tenantId, user, async () => {
      let query = this.supabaseService
        .getClient()
        .from('notificaciones')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('leida', false);

      if (usuarioId) {
        query = query.eq('usuario_id', usuarioId);
      }

      const { count, error } = await query;
      if (error) {
        this.logger.error(`Error fetching unread count: ${error.message}`, error);
        throw new Error(error.message);
      }

      return count || 0;
    });
  }

  async markAsRead(
    tenantId: string,
    notificationId: string,
    user?: AuthenticatedUser,
  ): Promise<Notification> {
    return this.withTenantContext(tenantId, user, async () => {
      // SECURITY FIX: Verificar que la notificación pertenece al usuario, a sus roles, o es super admin
      const { data: notification, error: fetchError } = await this.supabaseService
        .getClient()
        .from('notificaciones')
        .select('usuario_id, roles_destinatarios')
        .eq('id', notificationId)
        .eq('tenant_id', tenantId)
        .single();

      if (fetchError) {
        this.logger.error(`Error fetching notification for markAsRead: ${fetchError.message}`, fetchError);
        throw new Error('Notificación no encontrada');
      }

      // Validar permisos:
      // - Super admin puede modificar cualquier notificación
      // - Si la notificación tiene usuario_id, solo ese usuario puede modificarla
      // - Si la notificación tiene roles_destinatarios, solo usuarios con esos roles pueden modificarla
      // - Si la notificación NO tiene usuario_id ni roles (global), cualquier usuario del tenant puede marcarla
      if (!user?.is_super_admin) {
        const canModify = await this.canUserModifyNotification(tenantId, user?.id, notification);
        if (!canModify) {
          this.logger.warn(
            `[SECURITY] User ${user?.id} attempted to mark notification ${notificationId} as read, owned by ${notification.usuario_id} or roles ${notification.roles_destinatarios} in tenant ${tenantId}`,
          );
          throw new Error('No tiene permiso para modificar esta notificación');
        }
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('gestionar_notificacion_tx', {
          p_tenant_id: tenantId,
          p_actor_id: user?.id ?? null,
          p_operacion: 'MARK_READ',
          p_payload: { notification_id: notificationId },
        });

      if (error) {
        this.logger.error(`Error marking notification as read: ${error.message}`, error);
        throw new Error(error.message);
      }

      this.logger.log(`Notification ${notificationId} marked as read by user ${user?.id}`);
      return this.mapToNotification(data);
    });
  }

  async markAllAsRead(
    tenantId: string,
    usuarioId?: string,
    user?: AuthenticatedUser,
  ): Promise<number> {
    const effectiveUser = user ?? { id: usuarioId };
    return this.withTenantContext(tenantId, effectiveUser, async () => {
      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('gestionar_notificacion_tx', {
          p_tenant_id: tenantId,
          p_actor_id: effectiveUser?.id ?? null,
          p_operacion: 'MARK_ALL_READ',
          p_payload: { usuario_id: usuarioId ?? null },
        });
      if (error) {
        this.logger.error(`Error marking all notifications as read: ${error.message}`, error);
        throw new Error(error.message);
      }

      const count = Number((data as { updated_count?: number } | null)?.updated_count ?? 0);
      this.logger.log(`${count} notifications marked as read for tenant ${tenantId}`);
      return count;
    });
  }

  async deleteNotification(
    tenantId: string,
    notificationId: string,
    user?: AuthenticatedUser,
  ): Promise<void> {
    return this.withTenantContext(tenantId, user, async () => {
      // SECURITY FIX: Verificar que la notificación pertenece al usuario, a sus roles, o es super admin
      const { data: notification, error: fetchError } = await this.supabaseService
        .getClient()
        .from('notificaciones')
        .select('usuario_id, roles_destinatarios')
        .eq('id', notificationId)
        .eq('tenant_id', tenantId)
        .single();

      if (fetchError) {
        this.logger.error(`Error fetching notification for delete: ${fetchError.message}`, fetchError);
        throw new Error('Notificación no encontrada');
      }

      // Validar permisos:
      // - Super admin puede eliminar cualquier notificación
      // - Si la notificación tiene usuario_id, solo ese usuario puede eliminarla
      // - Si la notificación tiene roles_destinatarios, solo usuarios con esos roles pueden eliminarla
      // - Si la notificación NO tiene usuario_id ni roles (global), cualquier usuario del tenant puede eliminarla
      if (!user?.is_super_admin) {
        const canModify = await this.canUserModifyNotification(tenantId, user?.id, notification);
        if (!canModify) {
          this.logger.warn(
            `[SECURITY] User ${user?.id} attempted to delete notification ${notificationId} owned by ${notification.usuario_id} or roles ${notification.roles_destinatarios} in tenant ${tenantId}`,
          );
          throw new Error('No tiene permiso para eliminar esta notificación');
        }
      }

      const { error } = await this.supabaseService
        .getClient()
        .rpc('gestionar_notificacion_tx', {
          p_tenant_id: tenantId,
          p_actor_id: user?.id ?? null,
          p_operacion: 'DELETE',
          p_payload: { notification_id: notificationId },
        });

      if (error) {
        this.logger.error(`Error deleting notification: ${error.message}`, error);
        throw new Error(error.message);
      }

      this.logger.log(`Notification ${notificationId} deleted by user ${user?.id}`);
    });
  }

  private mapToNotification(data: any): Notification {
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      usuario_id: data.usuario_id,
      roles_destinatarios: data.roles_destinatarios,
      type: data.tipo as NotificationType,
      severity: data.severidad as NotificationSeverity,
      title: data.titulo,
      message: data.mensaje,
      action_url: data.action_url,
      action_label: data.action_label,
      leida: data.leida,
      created_at: new Date(data.created_at),
      leida_at: data.leida_at ? new Date(data.leida_at) : undefined,
    };
  }
}
