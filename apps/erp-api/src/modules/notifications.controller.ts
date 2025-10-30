import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { NotificationsService } from './notifications/notifications.service';
import { CreateNotificationDto, NotificationFilters } from './notifications/notification.types';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermission('notifications.read') // HARDENING: lectura de notificaciones requiere permiso.
  @ApiOperation({ summary: 'Get all notifications' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  async getNotifications(@Query() query: any, @CurrentTenant() tenantId: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      // HARDENING: usamos tenant derivado del contexto, nunca del request body.
      const filters: NotificationFilters = {
        type: query.type,
        severity: query.severity,
        leida: query.leida !== undefined ? query.leida === 'true' : undefined,
        usuario_id: query.usuario_id
      };

      const notifications = await this.notificationsService.getNotifications(tenantId, filters);

      return {
        success: true,
        data: notifications
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  @Get('unread')
  @RequirePermission('notifications.read') // HARDENING: lectura restringida.
  @ApiOperation({ summary: 'Get unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread notifications retrieved successfully' })
  async getUnreadNotifications(@CurrentTenant() tenantId: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      const notifications = await this.notificationsService.getNotifications(tenantId, { leida: false });

      return {
        success: true,
        data: notifications
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  @Get('unread-count')
  @RequirePermission('notifications.read') // HARDENING: conteo protegido.
  @ApiOperation({ summary: 'Get unread notifications count' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  async getUnreadCount(@CurrentTenant() tenantId: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      const count = await this.notificationsService.getUnreadCount(tenantId, user?.id);

      return {
        success: true,
        data: { unread_count: count }
      };
    } catch (error) {
      return {
        success: false,
        data: { unread_count: 0 },
        error: error.message
      };
    }
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
    try {
      const user = req.user as any;
      const notification = await this.notificationsService.createNotification(tenantId, notificationData);

      return {
        success: true,
        data: notification
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Put(':id/read')
  @RequirePermission('notifications.update') // HARDENING: actualización requiere permiso.
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Req() req: Request
  ) {
    try {
      const user = req.user as any;
      const notification = await this.notificationsService.markAsRead(tenantId, id);

      return {
        success: true,
        data: notification
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Put('mark-all-read')
  @RequirePermission('notifications.update') // HARDENING: actualización masiva requiere permiso.
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@CurrentTenant() tenantId: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      const count = await this.notificationsService.markAllAsRead(tenantId, user?.id);

      return {
        success: true,
        data: { updated_count: count }
      };
    } catch (error) {
      return {
        success: false,
        data: { updated_count: 0 },
        error: error.message
      };
    }
  }

  @Delete(':id')
  @RequirePermission('notifications.delete') // HARDENING: eliminación protegida.
  @ApiOperation({ summary: 'Delete notification' })
  @ApiResponse({ status: 200, description: 'Notification deleted successfully' })
  async deleteNotification(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Req() req: Request
  ) {
    try {
      const user = req.user as any;
      await this.notificationsService.deleteNotification(tenantId, id);

      return {
        success: true,
        message: 'Notification deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
