import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { NotificationsService } from './notifications/notifications.service';
import { CreateNotificationDto, NotificationFilters } from './notifications/notification.types';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notifications' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  async getNotifications(@Query() query: any, @Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;

      if (!tenantId) {
        return {
          success: false,
          data: [],
          error: 'Tenant ID not found'
        };
      }

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
  @ApiOperation({ summary: 'Get unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread notifications retrieved successfully' })
  async getUnreadNotifications(@Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;

      if (!tenantId) {
        return {
          success: false,
          data: [],
          error: 'Tenant ID not found'
        };
      }

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
  @ApiOperation({ summary: 'Get unread notifications count' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  async getUnreadCount(@Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;

      if (!tenantId) {
        return {
          success: false,
          data: { unread_count: 0 },
          error: 'Tenant ID not found'
        };
      }

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
  @ApiOperation({ summary: 'Create new notification' })
  @ApiResponse({ status: 201, description: 'Notification created successfully' })
  async createNotification(@Body() notificationData: CreateNotificationDto, @Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;

      if (!tenantId) {
        return {
          success: false,
          data: null,
          error: 'Tenant ID not found'
        };
      }

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
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(@Param('id') id: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;

      if (!tenantId) {
        return {
          success: false,
          data: null,
          error: 'Tenant ID not found'
        };
      }

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
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;

      if (!tenantId) {
        return {
          success: false,
          data: { updated_count: 0 },
          error: 'Tenant ID not found'
        };
      }

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
  @ApiOperation({ summary: 'Delete notification' })
  @ApiResponse({ status: 200, description: 'Notification deleted successfully' })
  async deleteNotification(@Param('id') id: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;

      if (!tenantId) {
        return {
          success: false,
          error: 'Tenant ID not found'
        };
      }

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