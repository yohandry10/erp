import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { NotificationType, NotificationSeverity, CreateNotificationDto } from './notification.types';

describe('NotificationsService', () => {
    let service: NotificationsService;
    let mockClient: any;
    let mockDbResponse: any;
    let testingModule: TestingModule;

    const mockNotificationData = {
        id: 'notif-123',
        tenant_id: 'tenant-123',
        usuario_id: 'user-123',
        tipo: NotificationType.STOCK_BAJO,
        severidad: NotificationSeverity.WARNING,
        titulo: 'Stock Bajo',
        mensaje: 'El producto X tiene stock bajo',
        leida: false,
        created_at: new Date().toISOString(),
    };

    beforeEach(async () => {
        // Default DB response
        mockDbResponse = { data: [], error: null, count: null };

        // Create shared mock client that behaves like a PostgrestBuilder (chainable and thenable)
        mockClient = {
            from: jest.fn(),
            select: jest.fn(),
            eq: jest.fn(),
            in: jest.fn(),
            order: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            single: jest.fn(),
            // The then method makes this object 'awaitable'
            then: jest.fn().mockImplementation((resolve, reject) => {
                // console.log('MockClient.then resolving:', JSON.stringify(mockDbResponse)); 
                return Promise.resolve(mockDbResponse).then(resolve, reject);
            }),
        };

        // Make all chainable methods return the mock client itself
        mockClient.from.mockReturnValue(mockClient);
        mockClient.select.mockReturnValue(mockClient);
        mockClient.eq.mockReturnValue(mockClient);
        mockClient.in.mockReturnValue(mockClient);
        mockClient.order.mockReturnValue(mockClient);
        mockClient.insert.mockReturnValue(mockClient);
        mockClient.update.mockReturnValue(mockClient);
        mockClient.delete.mockReturnValue(mockClient);

        // single() usually ends the chain and returns a Promise, NOT the builder
        mockClient.single.mockImplementation(() => {
            // console.log('MockClient.single resolving:', JSON.stringify(mockDbResponse));
            return Promise.resolve(mockDbResponse);
        });

        const mockSupabase = {
            getClient: jest.fn().mockReturnValue(mockClient),
            prepareTenantContext: jest.fn().mockResolvedValue(undefined),
        };

        const mockTenantContext = {
            run: jest.fn().mockImplementation((_, fn) => fn()),
            getContext: jest.fn().mockReturnValue({ tenantId: 'tenant-123' }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NotificationsService,
                { provide: SupabaseService, useValue: mockSupabase },
                { provide: TenantContextService, useValue: mockTenantContext },
            ],
        }).compile();

        testingModule = module;

        const noopLogger = {
            log: () => { },
            error: () => { },
            warn: () => { },
            debug: () => { },
            verbose: () => { },
            setContext: () => { },
        };
        module.useLogger(noopLogger as any);

        service = module.get<NotificationsService>(NotificationsService);
    });

    afterEach(async () => {
        if (testingModule) {
            await testingModule.close();
        }
        jest.clearAllMocks();
    });

    // ==================== SERVICE INSTANTIATION ====================
    describe('Service instantiation', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should have all CRUD methods defined', () => {
            expect(service.createNotification).toBeDefined();
            expect(service.getNotifications).toBeDefined();
            expect(service.getUnreadCount).toBeDefined();
            expect(service.markAsRead).toBeDefined();
            expect(service.markAllAsRead).toBeDefined();
            expect(service.deleteNotification).toBeDefined();
        });

        it('should have helper methods defined', () => {
            expect(service.getUserRoleIds).toBeDefined();
            expect(service.getRoleIdsByNames).toBeDefined();
        });
    });

    // ==================== CREATE NOTIFICATION ====================
    describe('createNotification', () => {
        const createDto: CreateNotificationDto = {
            type: NotificationType.STOCK_BAJO,
            severity: NotificationSeverity.WARNING,
            title: 'Stock Bajo',
            message: 'El producto X tiene stock bajo',
            usuario_id: 'user-123',
        };

        it('should create a notification for a specific user', async () => {
            mockClient.single.mockResolvedValueOnce({
                data: mockNotificationData,
                error: null,
            });

            const result = await service.createNotification('tenant-123', createDto);

            expect(result).toBeDefined();
            expect(result.id).toBe('notif-123');
            expect(result.type).toBe(NotificationType.STOCK_BAJO);
            expect(mockClient.insert).toHaveBeenCalled();
        });

        it('should create a notification with roles_destinatarios', async () => {
            const dtoWithRoles: CreateNotificationDto = {
                ...createDto,
                usuario_id: undefined,
                roles_destinatarios: ['role-admin', 'role-manager'],
            };

            mockClient.single.mockResolvedValueOnce({
                data: { ...mockNotificationData, roles_destinatarios: ['role-admin', 'role-manager'] },
                error: null,
            });

            const result = await service.createNotification('tenant-123', dtoWithRoles);

            expect(result).toBeDefined();
            expect(mockClient.insert).toHaveBeenCalled();
        });

        it('should throw error when insert fails', async () => {
            mockDbResponse = { data: null, error: { message: 'Database error' } };
            // single checks usage of mockDbResponse default OR we override it?
            // Test override via mockResolvedValueOnce on single fn
            mockClient.single.mockResolvedValueOnce({
                data: null,
                error: { message: 'Database error' },
            });

            await expect(service.createNotification('tenant-123', createDto))
                .rejects.toThrow();
        });

        it('should throw error when tenantId is not provided', async () => {
            await expect(service.createNotification('', createDto))
                .rejects.toThrow('Tenant no identificado para notificaciones');
        });
    });

    // ==================== GET NOTIFICATIONS ====================
    describe('getNotifications', () => {
        it('should return notifications for super admin', async () => {
            mockDbResponse = { data: [mockNotificationData], error: null };

            const result = await service.getNotifications(
                'tenant-123',
                {},
                { id: 'admin-1', is_super_admin: true }
            );

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe(NotificationType.STOCK_BAJO);
        });

        it('should filter notifications by type', async () => {
            mockDbResponse = { data: [mockNotificationData], error: null };

            await service.getNotifications(
                'tenant-123',
                { type: NotificationType.STOCK_BAJO },
                { id: 'admin-1', is_super_admin: true }
            );

            expect(mockClient.eq).toHaveBeenCalledWith('tipo', NotificationType.STOCK_BAJO);
        });

        it('should return empty array for user with no roles and no matching notifications', async () => {
            mockClient.then.mockImplementationOnce((resolve) =>
                resolve({ data: [], error: null })
            ); // Role Ids

            mockClient.then.mockImplementationOnce((resolve) =>
                resolve({ data: [{ ...mockNotificationData, usuario_id: 'other-user' }], error: null })
            ); // Main Query

            const result = await service.getNotifications(
                'tenant-123',
                {},
                { id: 'user-no-roles' }
            );

            expect(result).toEqual([]);
        });

        it('should return user-specific notifications', async () => {
            mockClient.then.mockImplementationOnce((resolve) =>
                resolve({ data: [], error: null })
            ); // roles

            mockClient.then.mockImplementationOnce((resolve) =>
                resolve({ data: [mockNotificationData], error: null })
            ); // main

            const result = await service.getNotifications(
                'tenant-123',
                { usuario_id: 'user-123' },
                { id: 'user-123' }
            );

            expect(result).toHaveLength(1);
        });

        it('should throw error on database error', async () => {
            mockDbResponse = { data: null, error: { message: 'Database error' } };
            // Ensure then implementation uses this new value object reference

            await expect(service.getNotifications(
                'tenant-123',
                {},
                { id: 'admin-1', is_super_admin: true }
            )).rejects.toThrow();
        });
    });

    // ==================== GET UNREAD COUNT ====================
    describe('getUnreadCount', () => {
        it('should return unread count', async () => {
            mockDbResponse = { count: 5, error: null };

            const result = await service.getUnreadCount('tenant-123');

            expect(result).toBe(5);
        });

        it('should return unread count for specific user', async () => {
            mockDbResponse = { count: 3, error: null };

            const result = await service.getUnreadCount('tenant-123', 'user-123');

            expect(result).toBe(3);
        });

        it('should return 0 when count is null', async () => {
            mockDbResponse = { count: null, error: null };

            const result = await service.getUnreadCount('tenant-123');

            expect(result).toBe(0);
        });

        it('should throw error on database error', async () => {
            mockDbResponse = { count: null, error: { message: 'Database error' } };

            await expect(service.getUnreadCount('tenant-123'))
                .rejects.toThrow();
        });
    });

    // ==================== MARK AS READ ====================
    describe('markAsRead', () => {
        it('should mark notification as read for owner', async () => {
            mockClient.single
                .mockResolvedValueOnce({
                    data: { usuario_id: 'user-123', roles_destinatarios: null },
                    error: null,
                })
                .mockResolvedValueOnce({
                    data: { ...mockNotificationData, leida: true },
                    error: null,
                });

            const result = await service.markAsRead(
                'tenant-123',
                'notif-123',
                { id: 'user-123' }
            );

            expect(result.leida).toBe(true);
        });

        it('should allow super admin to mark any notification as read', async () => {
            mockClient.single
                .mockResolvedValueOnce({
                    data: { usuario_id: 'other-user', roles_destinatarios: null },
                    error: null,
                })
                .mockResolvedValueOnce({
                    data: { ...mockNotificationData, leida: true },
                    error: null,
                });

            const result = await service.markAsRead(
                'tenant-123',
                'notif-123',
                { id: 'admin-1', is_super_admin: true }
            );

            expect(result.leida).toBe(true);
        });

        it('should throw error when notification not found', async () => {
            mockClient.single.mockResolvedValueOnce({
                data: null,
                error: { code: 'PGRST116' },
            });

            await expect(service.markAsRead('tenant-123', 'non-existent', { id: 'user-123' }))
                .rejects.toThrow('Notificación no encontrada');
        });

        it('should deny access for non-owner user', async () => {
            mockClient.single.mockResolvedValueOnce({
                data: { usuario_id: 'other-user', roles_destinatarios: null },
                error: null,
            });

            await expect(service.markAsRead(
                'tenant-123',
                'notif-123',
                { id: 'user-123' }
            )).rejects.toThrow('No tiene permiso para modificar esta notificación');
        });
    });

    // ==================== MARK ALL AS READ ====================
    describe('markAllAsRead', () => {
        it('should mark all notifications as read for user', async () => {
            mockDbResponse = { data: [{ id: 'notif-1' }, { id: 'notif-2' }], error: null };

            const result = await service.markAllAsRead('tenant-123', 'user-123');

            expect(result).toBe(2);
            expect(mockClient.update).toHaveBeenCalled();
        });

        it('should return 0 when no notifications to mark', async () => {
            mockDbResponse = { data: [], error: null };

            const result = await service.markAllAsRead('tenant-123', 'user-123');

            expect(result).toBe(0);
        });

        it('should throw error on database error', async () => {
            mockDbResponse = { data: null, error: { message: 'Database error' } };

            await expect(service.markAllAsRead('tenant-123', 'user-123'))
                .rejects.toThrow();
        });
    });

    // ==================== DELETE NOTIFICATION ====================
    describe('deleteNotification', () => {
        it('should delete notification for owner', async () => {
            mockClient.single.mockResolvedValueOnce({
                data: { usuario_id: 'user-123', roles_destinatarios: null },
                error: null,
            });

            mockDbResponse = { error: null };

            await expect(service.deleteNotification(
                'tenant-123',
                'notif-123',
                { id: 'user-123' }
            )).resolves.not.toThrow();
        });

        it('should allow super admin to delete any notification', async () => {
            mockClient.single.mockResolvedValueOnce({
                data: { usuario_id: 'other-user', roles_destinatarios: null },
                error: null,
            });

            mockDbResponse = { error: null };

            await expect(service.deleteNotification(
                'tenant-123',
                'notif-123',
                { id: 'admin-1', is_super_admin: true }
            )).resolves.not.toThrow();
        });

        it('should throw error when notification not found', async () => {
            mockClient.single.mockResolvedValueOnce({
                data: null,
                error: { code: 'PGRST116' },
            });

            await expect(service.deleteNotification(
                'tenant-123',
                'non-existent',
                { id: 'user-123' }
            )).rejects.toThrow('Notificación no encontrada');
        });

        it('should deny deletion for non-owner user', async () => {
            mockClient.single.mockResolvedValueOnce({
                data: { usuario_id: 'other-user', roles_destinatarios: null },
                error: null,
            });

            await expect(service.deleteNotification(
                'tenant-123',
                'notif-123',
                { id: 'user-123' }
            )).rejects.toThrow('No tiene permiso para eliminar esta notificación');
        });
    });

    // ==================== GET USER ROLE IDS ====================
    describe('getUserRoleIds', () => {
        it('should return user role ids', async () => {
            mockDbResponse = { data: [{ role_id: 'role-1' }, { role_id: 'role-2' }], error: null };

            const result = await service.getUserRoleIds('tenant-123', 'user-123');

            expect(result).toEqual(['role-1', 'role-2']);
        });

        it('should return empty array when user has no roles', async () => {
            mockDbResponse = { data: [], error: null };

            const result = await service.getUserRoleIds('tenant-123', 'user-123');

            expect(result).toEqual([]);
        });

        it('should return empty array on error', async () => {
            mockDbResponse = { data: null, error: { message: 'Database error' } };

            const result = await service.getUserRoleIds('tenant-123', 'user-123');

            expect(result).toEqual([]);
        });
    });

    // ==================== GET ROLE IDS BY NAMES ====================
    describe('getRoleIdsByNames', () => {
        it('should return role ids for given role names', async () => {
            mockDbResponse = { data: [{ id: 'role-1' }, { id: 'role-2' }], error: null };

            const result = await service.getRoleIdsByNames('tenant-123', ['Admin', 'Manager']);

            expect(result).toEqual(['role-1', 'role-2']);
        });

        it('should return empty array when roles not found', async () => {
            mockDbResponse = { data: [], error: null };

            const result = await service.getRoleIdsByNames('tenant-123', ['NonExistent']);

            expect(result).toEqual([]);
        });

        it('should return empty array on error', async () => {
            mockDbResponse = { data: null, error: { message: 'Database error' } };

            const result = await service.getRoleIdsByNames('tenant-123', ['Admin']);

            expect(result).toEqual([]);
        });
    });
});
