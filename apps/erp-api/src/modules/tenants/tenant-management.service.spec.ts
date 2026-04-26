import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { TenantManagementService } from './tenant-management.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { UserManagementService } from '../usuarios/user-management.service';

describe('TenantManagementService', () => {
    let service: TenantManagementService;
    let mockClient: any;

    const mockTenant = {
        id: 'config-123',
        tenant_id: 'tenant-123',
        razon_social: 'Test Company S.A.C.',
        nombre_comercial: 'Test Company',
        ruc: '20123456789',
        direccion_fiscal: 'Av. Test 123',
        telefono: '987654321',
        email: 'test@company.com',
        pais: 'PE',
        pais_id: 1,
        moneda_defecto: 'PEN',
        estado: 'ACTIVO',
        plan: 'BASICO',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    beforeEach(async () => {
        // Create shared mock client
        mockClient = {
            from: jest.fn(),
            select: jest.fn(),
            eq: jest.fn(),
            neq: jest.fn(),
            lt: jest.fn(),
            gte: jest.fn(),
            lte: jest.fn(),
            is: jest.fn(),
            in: jest.fn(),
            or: jest.fn(),
            ilike: jest.fn(),
            order: jest.fn(),
            limit: jest.fn(),
            range: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            single: jest.fn(),
            maybeSingle: jest.fn(),
        };

        // Make all chainable methods return the mock client
        Object.keys(mockClient).forEach(key => {
            if (key !== 'single' && key !== 'maybeSingle') {
                mockClient[key].mockReturnValue(mockClient);
            }
        });

        const mockSupabase = {
            getClient: jest.fn().mockReturnValue(mockClient),
            getServiceClient: jest.fn().mockReturnValue(mockClient),
            getPublicClient: jest.fn().mockReturnValue(mockClient),
            prepareTenantContext: jest.fn().mockResolvedValue(undefined),
        };

        const mockUserManagement = {
            createUser: jest.fn().mockResolvedValue({
                id: 'user-123',
                nombre: 'Admin',
                email: 'admin@testcompany.com',
                temporaryPassword: 'TempPass123!',
            }),
            revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
        };

        const mockTenantContext = {
            run: jest.fn().mockImplementation((context, fn) => fn()),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TenantManagementService,
                { provide: SupabaseService, useValue: mockSupabase },
                { provide: UserManagementService, useValue: mockUserManagement },
                { provide: TenantContextService, useValue: mockTenantContext },
            ],
        }).compile();

        service = module.get<TenantManagementService>(TenantManagementService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ==================== BASIC INSTANTIATION ====================
    describe('Service instantiation', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should have all required methods', () => {
            expect(service.createTenant).toBeDefined();
            expect(service.updateTenant).toBeDefined();
            expect(service.getTenants).toBeDefined();
            expect(service.getTenantById).toBeDefined();
            expect(service.activateTenant).toBeDefined();
            expect(service.deactivateTenant).toBeDefined();
            expect(service.getTenantStats).toBeDefined();
            expect(service.getTenantUsers).toBeDefined();
        });
    });

    // ==================== GET TENANT BY ID ====================
    describe('getTenantById', () => {
        it('should have getTenantById method defined', () => {
            expect(service.getTenantById).toBeDefined();
        });

        it('should throw NotFoundException when tenant not found', async () => {
            // Both regular and service client return null
            mockClient.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            await expect(service.getTenantById('non-existent'))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ==================== GET TENANTS ====================
    describe('getTenants', () => {
        it('should have getTenants method defined', () => {
            expect(service.getTenants).toBeDefined();
        });
    });

    // ==================== UPDATE TENANT ====================
    describe('updateTenant', () => {
        it('should update tenant successfully', async () => {
            const updatedTenant = { ...mockTenant, razon_social: 'Updated Company S.A.C.' };

            mockClient.single
                .mockResolvedValueOnce({ data: mockTenant, error: null })  // Check tenant exists
                .mockResolvedValueOnce({ data: updatedTenant, error: null }); // Update result

            const result = await service.updateTenant('tenant-123', {
                razon_social: 'Updated Company S.A.C.',
            } as any);

            expect(result).toBeDefined();
        });

        it('should throw NotFoundException when tenant not found', async () => {
            mockClient.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            await expect(service.updateTenant('non-existent', { razon_social: 'Test' } as any))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ==================== ACTIVATE TENANT ====================
    describe('activateTenant', () => {
        it('should activate tenant successfully', async () => {
            const inactiveTenant = { ...mockTenant, estado: 'INACTIVO' };
            const activatedTenant = { ...mockTenant, estado: 'ACTIVO' };

            mockClient.single
                .mockResolvedValueOnce({ data: inactiveTenant, error: null })  // Get tenant
                .mockResolvedValueOnce({ data: activatedTenant, error: null }); // Update result

            const result = await service.activateTenant('tenant-123');

            expect(result).toBeDefined();
        });

        it('should throw NotFoundException when tenant not found', async () => {
            mockClient.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            await expect(service.activateTenant('non-existent'))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ==================== DEACTIVATE TENANT ====================
    describe('deactivateTenant', () => {
        it('should throw BadRequestException when ADMIN role not found', async () => {
            // getTenantById returns tenant
            mockClient.single
                .mockResolvedValueOnce({ data: mockTenant, error: null })  // getTenantById
                .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); // ADMIN role not found

            await expect(service.deactivateTenant('tenant-123'))
                .rejects.toThrow(BadRequestException);
        });

        it('should have deactivateTenant method defined', () => {
            expect(service.deactivateTenant).toBeDefined();
        });
    });

    // ==================== GET TENANT STATS ====================
    describe('getTenantStats', () => {
        it('should have getTenantStats method defined', () => {
            expect(service.getTenantStats).toBeDefined();
        });
    });

    // ==================== GET TENANT USERS ====================
    describe('getTenantUsers', () => {
        it('should return tenant users list', async () => {
            const mockUsers = [
                { id: 'user-1', nombre: 'User 1', email: 'user1@test.com' },
                { id: 'user-2', nombre: 'User 2', email: 'user2@test.com' },
            ];

            mockClient.single.mockResolvedValueOnce({ data: mockTenant, error: null }); // getTenantById
            mockClient.order.mockResolvedValue({ data: mockUsers, error: null }); // getUsers

            const result = await service.getTenantUsers('tenant-123');

            expect(result).toBeDefined();
        });

        it('should throw NotFoundException when tenant not found', async () => {
            mockClient.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            await expect(service.getTenantUsers('non-existent'))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ==================== CREATE TENANT ====================
    describe('createTenant', () => {
        it('should have createTenant method defined', () => {
            expect(service.createTenant).toBeDefined();
        });

        it('should throw ConflictException when RUC already exists', async () => {
            const createDto = {
                razon_social: 'Duplicate Company',
                ruc: '20123456789',
                email: 'dup@company.com',
                pais_id: 1,
            };

            // País válido
            mockClient.single.mockResolvedValueOnce({
                data: { id: 1, codigo_iso: 'PE', moneda_codigo: 'PEN' },
                error: null
            });

            // RUC exists
            mockClient.maybeSingle.mockResolvedValueOnce({
                data: { tenant_id: 'existing', razon_social: 'Existing Company' },
                error: null
            });

            await expect(service.createTenant(createDto as any))
                .rejects.toThrow(ConflictException);
        });
    });
});
