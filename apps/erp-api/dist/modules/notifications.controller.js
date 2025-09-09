"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("../shared/supabase/supabase.service");
const express_1 = require("express");
let NotificationsController = class NotificationsController {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
    }
    async getNotifications(filters, req) {
        try {
            const user = req.user;
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
            if (error)
                throw error;
            return {
                success: true,
                data: data || []
            };
        }
        catch (error) {
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    }
    async getUnreadCount(req) {
        try {
            const user = req.user;
            const tenantId = user?.tenant_id;
            const { count, error } = await this.supabaseService.getClient()
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .eq('read', false);
            if (error)
                throw error;
            return {
                success: true,
                data: { unread_count: count || 0 }
            };
        }
        catch (error) {
            return {
                success: false,
                data: { unread_count: 0 },
                error: error.message
            };
        }
    }
    async createNotification(notificationData, req) {
        try {
            const user = req.user;
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
            if (error)
                throw error;
            return {
                success: true,
                data
            };
        }
        catch (error) {
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async markAsRead(id, req) {
        try {
            const user = req.user;
            const tenantId = user?.tenant_id;
            const { data, error } = await this.supabaseService.getClient()
                .from('notifications')
                .update({ read: true, read_at: new Date().toISOString() })
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .select()
                .single();
            if (error)
                throw error;
            return {
                success: true,
                data
            };
        }
        catch (error) {
            return {
                success: false,
                data: null,
                error: error.message
            };
        }
    }
    async markAllAsRead(req) {
        try {
            const user = req.user;
            const tenantId = user?.tenant_id;
            const { data, error } = await this.supabaseService.getClient()
                .from('notifications')
                .update({ read: true, read_at: new Date().toISOString() })
                .eq('tenant_id', tenantId)
                .eq('read', false)
                .select();
            if (error)
                throw error;
            return {
                success: true,
                data: { updated_count: data?.length || 0 }
            };
        }
        catch (error) {
            return {
                success: false,
                data: { updated_count: 0 },
                error: error.message
            };
        }
    }
    async deleteNotification(id, req) {
        try {
            const user = req.user;
            const tenantId = user?.tenant_id;
            const { error } = await this.supabaseService.getClient()
                .from('notifications')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tenantId);
            if (error)
                throw error;
            return {
                success: true,
                message: 'Notification deleted successfully'
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all notifications' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Notifications retrieved successfully' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getNotifications", null);
__decorate([
    (0, common_1.Get)('unread-count'),
    (0, swagger_1.ApiOperation)({ summary: 'Get unread notifications count' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Unread count retrieved successfully' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getUnreadCount", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create new notification' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Notification created successfully' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "createNotification", null);
__decorate([
    (0, common_1.Put)(':id/mark-read'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark notification as read' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Notification marked as read' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAsRead", null);
__decorate([
    (0, common_1.Put)('mark-all-read'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark all notifications as read' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'All notifications marked as read' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAllAsRead", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete notification' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Notification deleted successfully' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "deleteNotification", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, swagger_1.ApiTags)('Notifications'),
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map