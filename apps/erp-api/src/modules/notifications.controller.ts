import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { Request } from 'express';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notifications' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  async getNotifications(@Query() filters: any, @Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;
      
      let query = this.supabaseService.getClient()
        .from('notifications')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (filters.read !== undefined) {
        query = query.eq('read', filters.read === 'true');
      }

      if (filters.type) {
        query = query.eq('type', filters.type);
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        success: true,
        data: data || []
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
      
      const { count, error } = await this.supabaseService.getClient()
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('read', false);

      if (error) throw error;

      return {
        success: true,
        data: { unread_count: count || 0 }
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
  async createNotification(@Body() notificationData: any, @Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;
      
      const { data, error } = await this.supabaseService.getClient()
        .from('notifications')
        .insert({
          ...notificationData,
          tenant_id: tenantId,
          created_at: new Date().toISOString(),
          read: false
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Put(':id/mark-read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(@Param('id') id: string, @Req() req: Request) {
    try {
      const user = req.user as any;
      const tenantId = user?.tenant_id;
      
      const { data, error } = await this.supabaseService.getClient()
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data
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
      
      const { data, error } = await this.supabaseService.getClient()
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('read', false)
        .select();

      if (error) throw error;

      return {
        success: true,
        data: { updated_count: data?.length || 0 }
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
      
      const { error } = await this.supabaseService.getClient()
        .from('notifications')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;

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