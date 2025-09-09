import { SupabaseService } from '../shared/supabase/supabase.service';
import { Request } from 'express';
export declare class NotificationsController {
    private readonly supabaseService;
    constructor(supabaseService: SupabaseService);
    getNotifications(filters: any, req: Request): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    getUnreadCount(req: Request): Promise<{
        success: boolean;
        data: {
            unread_count: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        data: {
            unread_count: number;
        };
        error: any;
    }>;
    createNotification(notificationData: any, req: Request): Promise<{
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    markAsRead(id: string, req: Request): Promise<{
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    markAllAsRead(req: Request): Promise<{
        success: boolean;
        data: {
            updated_count: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        data: {
            updated_count: number;
        };
        error: any;
    }>;
    deleteNotification(id: string, req: Request): Promise<{
        success: boolean;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
    }>;
}
