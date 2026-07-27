import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

describe('PermissionService', () => {
    let service: PermissionService;
    let mockClient: any;

    const mockPermission = {
        id: 'perm-123',
        tenant_id: 'tenant-123',
        modulo: 'ventas',
        accion: 'read',
        recurso: 'pedidos',
        descripcion: 'Ver pedidos',
        activo: true,
    };

    beforeEach(async () => {
        // Create a SHARED mock client that will be reused across all getClient() calls
        mockClient = {
            from: jest.fn(),
            select: jest.fn(),
            eq: jest.fn(),
            single: jest.fn(),
            maybeSingle: jest.fn(),
            insert: jest.fn(),
            delete: jest.fn(),
            in: jest.fn(),
            order: jest.fn(),
            limit: jest.fn(),
            or: jest.fn(),
        };

        // Make all chainable methods return the mock client itself
        mockClient.from.mockReturnValue(mockClient);
        mockClient.select.mockReturnValue(mockClient);
        mockClient.eq.mockReturnValue(mockClient);
        mockClient.in.mockReturnValue(mockClient);
        mockClient.order.mockReturnValue(mockClient);
        mockClient.limit.mockReturnValue(mockClient);
        mockClient.insert.mockReturnValue(mockClient);
        mockClient.delete.mockReturnValue(mockClient);
        mockClient.or.mockReturnValue(mockClient);

        const mockSupabase = {
            getClient: jest.fn().mockReturnValue(mockClient),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PermissionService,
                { provide: SupabaseService, useValue: mockSupabase },
            ],
        }).compile();

        service = module.get<PermissionService>(PermissionService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Service instantiation', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should have all required methods', () => {
            expect(service.getPermissions).toBeDefined();
            expect(service.getRolePermissions).toBeDefined();
            expect(service.checkUserPermission).toBeDefined();
            expect(service.invalidateUserPermissions).toBeDefined();
        });
    });

    describe('getPermissions', () => {
        it('should return all permissions for a tenant', async () => {
            // Last order() in chain returns the final promise
            mockClient.order
                .mockReturnValueOnce(mockClient)  // first .order()
                .mockReturnValueOnce(mockClient)  // second .order()
                .mockResolvedValueOnce({ data: [mockPermission], error: null }); // third .order()

            const result = await service.getPermissions('tenant-123');
            expect(result).toHaveLength(1);
            expect(result[0].modulo).toBe('ventas');
        });

        it('should throw BadRequestException on error', async () => {
            mockClient.order
                .mockReturnValueOnce(mockClient)
                .mockReturnValueOnce(mockClient)
                .mockResolvedValueOnce({ data: null, error: { message: 'Database error' } });

            await expect(service.getPermissions('tenant-123'))
                .rejects.toThrow(BadRequestException);
        });
    });

    describe('getRolePermissions', () => {
        it('should return permissions for a role', async () => {
            // First query: check role exists - uses from().select().eq().eq().single()
            mockClient.single.mockResolvedValueOnce({
                data: { id: 'role-123', nombre: 'ADMIN' },
                error: null,
            });
            // Second query: get role permissions - last eq() returns promise
            mockClient.eq
                .mockReturnValueOnce(mockClient) // role check - first eq
                .mockReturnValueOnce(mockClient) // role check - second eq
                .mockReturnValueOnce(mockClient) // permissions - first eq
                .mockResolvedValueOnce({         // permissions - second eq (returns result)
                    data: [{ permiso_id: 'perm-123', concedido: true, permisos: mockPermission }],
                    error: null,
                });

            const result = await service.getRolePermissions('tenant-123', 'role-123');
            expect(result).toBeDefined();
        });

        it('should throw NotFoundException when role not found', async () => {
            mockClient.single.mockResolvedValueOnce({
                data: null,
                error: { code: 'PGRST116' },
            });

            await expect(service.getRolePermissions('tenant-123', 'non-existent'))
                .rejects.toThrow(NotFoundException);
        });
    });

    describe('checkUserPermission', () => {
        it('should return true for super admin', async () => {
            mockClient.maybeSingle.mockResolvedValueOnce({
                data: { is_super_admin: true },
                error: null,
            });

            const result = await service.checkUserPermission('user-1', 'tenant-1', 'ventas', 'read', 'pedidos');
            expect(result).toBe(true);
        });

        it('should return false when user not found', async () => {
            mockClient.maybeSingle.mockResolvedValueOnce({
                data: null,
                error: null,
            });

            const result = await service.checkUserPermission('user-1', 'tenant-1', 'ventas', 'read', 'pedidos');
            expect(result).toBe(false);
        });

        it('should return false when user has no roles', async () => {
            // First query: check if super admin - uses .from().select().eq().maybeSingle()
            // eq needs to return mockClient so maybeSingle can be called
            mockClient.eq.mockReturnValueOnce(mockClient);
            mockClient.maybeSingle.mockResolvedValueOnce({
                data: { is_super_admin: false },
                error: null,
            });
            // Second query: get user roles (eq returns promise with empty array)
            mockClient.eq
                .mockReturnValueOnce(mockClient)  // first eq in user_roles query
                .mockResolvedValueOnce({ data: [], error: null }); // second eq returns result

            const result = await service.checkUserPermission('user-1', 'tenant-1', 'ventas', 'read', 'pedidos');
            expect(result).toBe(false);
        });
    });

    describe('invalidateUserPermissions', () => {
        it('should not throw when invalidating permissions', () => {
            expect(() => service.invalidateUserPermissions('user-123')).not.toThrow();
        });

        it('should clear cache for specific user', () => {
            const cache = (service as any).permissionCache as Map<string, any>;
            cache.set('user-123:tenant-1:ventas:read:pedidos', { permissions: ['x'], timestamp: Date.now() });
            cache.set('other-user:tenant-1:ventas:read:pedidos', { permissions: ['x'], timestamp: Date.now() });

            service.invalidateUserPermissions('user-123');

            expect(cache.has('user-123:tenant-1:ventas:read:pedidos')).toBe(false);
            expect(cache.has('other-user:tenant-1:ventas:read:pedidos')).toBe(true);
        });
    });
});
