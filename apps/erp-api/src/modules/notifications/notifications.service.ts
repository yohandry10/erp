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
  ) {}

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
      const { data, error } = await this.supabaseService
        .getClient()
        .from('notificaciones')
        .insert({
          tenant_id: tenantId,
          usuario_id: notificationData.usuario_id,
          tipo: notificationData.type,
          severidad: notificationData.severity,
          titulo: notificationData.title,
          mensaje: notificationData.message,
          action_url: notificationData.action_url,
          action_label: notificationData.action_label,
          leida: false,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        this.logger.error(`Error creating notification: ${error.message}`, error);
        throw error;
      }

      this.logger.log(`Notification created: ${notificationData.type} for tenant ${tenantId}`);
      return this.mapToNotification(data);
    });
  }

  async getNotifications(
    tenantId: string,
    filters: NotificationFilters | undefined,
    user?: AuthenticatedUser,
  ): Promise<Notification[]> {
    return this.withTenantContext(tenantId, user, async () => {
      let query = this.supabaseService
        .getClient()
        .from('notificaciones')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (filters?.type) {
        query = query.eq('tipo', filters.type);
      }

      if (filters?.severity) {
        query = query.eq('severidad', filters.severity);
      }

      if (filters?.leida !== undefined) {
        query = query.eq('leida', filters.leida);
      }

      if (filters?.usuario_id) {
        query = query.eq('usuario_id', filters.usuario_id);
      }

      const { data, error } = await query;
      if (error) {
        this.logger.error(`Error fetching notifications: ${error.message}`, error);
        throw error;
      }

      return (data || []).map(item => this.mapToNotification(item));
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
        throw error;
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
      const { data, error } = await this.supabaseService
        .getClient()
        .from('notificaciones')
        .update({
          leida: true,
          leida_at: new Date().toISOString(),
        })
        .eq('id', notificationId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) {
        this.logger.error(`Error marking notification as read: ${error.message}`, error);
        throw error;
      }

      this.logger.log(`Notification ${notificationId} marked as read`);
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
      let query = this.supabaseService
        .getClient()
        .from('notificaciones')
        .update({
          leida: true,
          leida_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('leida', false);

      if (usuarioId) {
        query = query.eq('usuario_id', usuarioId);
      }

      const { data, error } = await query.select();
      if (error) {
        this.logger.error(`Error marking all notifications as read: ${error.message}`, error);
        throw error;
      }

      const count = data?.length || 0;
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
      const { error } = await this.supabaseService
        .getClient()
        .from('notificaciones')
        .delete()
        .eq('id', notificationId)
        .eq('tenant_id', tenantId);

      if (error) {
        this.logger.error(`Error deleting notification: ${error.message}`, error);
        throw error;
      }

      this.logger.log(`Notification ${notificationId} deleted`);
    });
  }

  private mapToNotification(data: any): Notification {
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      usuario_id: data.usuario_id,
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
