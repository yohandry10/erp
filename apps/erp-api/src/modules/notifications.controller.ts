import { Controller, Get, Post, Put, Delete, Body, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { NotificationsService } from './notifications/notifications.service';
import { CreateNotificationDto, NotificationFilters } from './notifications/notification.types';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PermissionService } from './permissions/permission.service';

// Los errores ya no se envuelven en 200 con success:false: el servicio responde
// 404 (ajena o inexistente), 400, 403 o 503 y la campana no confunde un fallo
// con "sin notificaciones" ni con un marcado que no ocurrió.
@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly permissionService: PermissionService,
  ) {}

  // Marcar un aviso compartido lo marca para toda la empresa (estado por aviso):
  // eso sigue reservado a notifications.update. Ante la duda, no se permite.
  private async canMarkShared(user: any, tenantId: string): Promise<boolean> {
    if (user?.is_super_admin) return true;
    try {
      return await this.permissionService.checkUserPermission(user?.id, tenantId, 'notifications', 'update', '__global__');
    } catch {
      return false;
    }
  }

  // Cada usuario lee sólo sus avisos, los globales y los de sus roles (lo filtra
  // el servicio). La campana (/unread) nunca exigió permiso: exigirlo aquí dejaba
  // a vendedores y cajeros con un contador que no podían abrir.
  @Get()
  @ApiOperation({ summary: 'Get all notifications' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  @ApiResponse({ status: 503, description: 'Notifications temporarily unavailable' })
  async getNotifications(@Query() query: any, @CurrentTenant() tenantId: string, @Req() req: Request) {
    const user = req.user as any;

    // Super admins pueden filtrar por cualquier usuario del tenant.
    let effectiveUsuarioId = user?.id;
    if (user?.is_super_admin && query.usuario_id) {
      effectiveUsuarioId = query.usuario_id;
    }

    // HARDENING: tenant derivado del contexto, nunca del request.
    const filters: NotificationFilters = {
      type: query.type,
      severity: query.severity,
      leida: query.leida !== undefined ? query.leida === 'true' : undefined,
      usuario_id: effectiveUsuarioId
    };

    return { success: true, data: await this.notificationsService.getNotifications(tenantId, filters, user) };
  }

  @Get('unread')
  @ApiOperation({ summary: 'Get unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread notifications retrieved successfully' })
  async getUnreadNotifications(@CurrentTenant() tenantId: string, @Req() req: Request) {
    const user = req.user as any;
    return { success: true, data: await this.notificationsService.getNotifications(tenantId, { leida: false }, user) };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notifications count' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  async getUnreadCount(@CurrentTenant() tenantId: string, @Req() req: Request) {
    const user = req.user as any;
    const count = await this.notificationsService.getUnreadCount(tenantId, user?.id, user);
    return { success: true, data: { unread_count: count } };
  }

  @Post()
  @RequirePermission('notifications.create') // HARDENING: creación requiere permiso.
  @ApiOperation({ summary: 'Create new notification' })
  @ApiResponse({ status: 201, description: 'Notification created successfully' })
  async createNotification(
    @Body() notificationData: CreateNotificationDto,
    @CurrentTenant() tenantId: string,
    @Req() req: Request
  ) {
    const user = req.user as any;
    return { success: true, data: await this.notificationsService.createNotification(tenantId, notificationData, user) };
  }

  // Los avisos personales los marca su destinatario sin permiso extra; los
  // compartidos (globales o de rol) exigen notifications.update (403).
  @Put(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found for this user' })
  async markAsRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentTenant() tenantId: string,
    @Req() req: Request
  ) {
    const user = req.user as any;
    const canMarkShared = await this.canMarkShared(user, tenantId);
    return { success: true, data: await this.notificationsService.markAsRead(tenantId, id, user, canMarkShared) };
  }

  @Put('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@CurrentTenant() tenantId: string, @Req() req: Request) {
    const user = req.user as any;
    const count = await this.notificationsService.markAllAsRead(tenantId, user?.id, user, await this.canMarkShared(user, tenantId));
    return { success: true, data: { updated_count: count } };
  }

  @Delete(':id')
  @RequirePermission('notifications.delete') // HARDENING: eliminación protegida.
  @ApiOperation({ summary: 'Delete notification' })
  @ApiResponse({ status: 200, description: 'Notification deleted successfully' })
  @ApiResponse({ status: 404, description: 'Notification not found for this user' })
  async deleteNotification(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentTenant() tenantId: string,
    @Req() req: Request
  ) {
    const user = req.user as any;
    await this.notificationsService.deleteNotification(tenantId, id, user);
    return { success: true, message: 'Notification deleted successfully' };
  }
}
