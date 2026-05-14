import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * SECURITY: Sanitiza mensajes de error para no exponer información sensible
   */
  private sanitizeErrorMessage(error: Error): string {
    const message = error.message || 'Error desconocido';
    
    // Errores conocidos que podemos mostrar al usuario
    if (message.includes('No tiene permiso')) {
      return message;
    }
    if (message.includes('no encontrada')) {
      return message;
    }
    if (message.includes('Tenant no identificado')) {
      return 'Sesión inválida. Por favor, inicie sesión nuevamente.';
    }
    
    // Errores de base de datos - NO exponer detalles
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      this.logger.error('DB Error - duplicate key:', error);
      return 'La notificación ya existe';
    }
    if (message.includes('foreign key') || message.includes('violates')) {
      this.logger.error('DB Error - constraint violation:', error);
      return 'Error de integridad de datos';
    }
    if (message.includes('connection') || message.includes('timeout')) {
      this.logger.error('DB Error - connection:', error);
      return 'Error de conexión. Intente nuevamente.';
    }
    
    // Error genérico - log interno, mensaje genérico al usuario
    this.logger.error('Unhandled error:', error);
    return 'Error al procesar la solicitud';
  }

  @Get()
  @RequirePermission('notifications.read') // HARDENING: lectura de notificaciones requiere permiso.
  @ApiOperation({ summary: 'Get all notifications' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  async getNotifications(@Query() query: any, @CurrentTenant() tenantId: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      
      // SECURITY: Un usuario solo puede ver sus propias notificaciones o las globales (sin usuario_id)
      // Super admins pueden ver todas las notificaciones del tenant
      let effectiveUsuarioId = user?.id;
      if (user?.is_super_admin && query.usuario_id) {
        // Super admin puede filtrar por cualquier usuario
        effectiveUsuarioId = query.usuario_id;
      }
      
      // HARDENING: usamos tenant derivado del contexto, nunca del request body.
      const filters: NotificationFilters = {
        type: query.type,
        severity: query.severity,
        leida: query.leida !== undefined ? query.leida === 'true' : undefined,
        usuario_id: effectiveUsuarioId
      };

      const notifications = await this.notificationsService.getNotifications(tenantId, filters, user);

      return {
        success: true,
        data: notifications
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: this.sanitizeErrorMessage(error)
      };
    }
  }

  @Get('unread')
  @ApiOperation({ summary: 'Get unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread notifications retrieved successfully' })
  async getUnreadNotifications(@CurrentTenant() tenantId: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      const notifications = await this.notificationsService.getNotifications(tenantId, { leida: false }, user);

      return {
        success: true,
        data: notifications
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: this.sanitizeErrorMessage(error)
      };
    }
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notifications count' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  async getUnreadCount(@CurrentTenant() tenantId: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      const count = await this.notificationsService.getUnreadCount(tenantId, user?.id, user);

      return {
        success: true,
        data: { unread_count: count }
      };
    } catch (error) {
      return {
        success: false,
        data: { unread_count: 0 },
        error: this.sanitizeErrorMessage(error)
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
      const notification = await this.notificationsService.createNotification(tenantId, notificationData, user);

      return {
        success: true,
        data: notification
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: this.sanitizeErrorMessage(error)
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
      const notification = await this.notificationsService.markAsRead(tenantId, id, user);

      return {
        success: true,
        data: notification
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: this.sanitizeErrorMessage(error)
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
      const count = await this.notificationsService.markAllAsRead(tenantId, user?.id, user);

      return {
        success: true,
        data: { updated_count: count }
      };
    } catch (error) {
      return {
        success: false,
        data: { updated_count: 0 },
        error: this.sanitizeErrorMessage(error)
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
      await this.notificationsService.deleteNotification(tenantId, id, user);

      return {
        success: true,
        message: 'Notification deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: this.sanitizeErrorMessage(error)
      };
    }
  }
}
