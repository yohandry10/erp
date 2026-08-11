import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { TenantManagementService } from './tenant-management.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { UserManagementService } from '../usuarios/user-management.service';

describe('TenantManagementService', () => {
    const actorId = '00000000-0000-0000-0000-000000000464';
    const idempotencyKey = 'tenant-test-464';
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
            rpc: jest.fn(),
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
            createFirstAdmin: jest.fn().mockResolvedValue({
                id: 'user-123',
                nombre: 'Admin',
                email: 'admin@testcompany.com',
                temporaryPassword: 'TempPass123!',
            }),
            rotateDemoCredential: jest.fn().mockResolvedValue({ id: 'user-123' }),
            clearDemoUsers: jest.fn().mockResolvedValue({ usuarios_actualizados: 1 }),
            assignRoles: jest.fn().mockResolvedValue({ roles: ['role-admin'] }),
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

            mockClient.single.mockResolvedValueOnce({ data: mockTenant, error: null });
            mockClient.rpc.mockResolvedValueOnce({
                data: { configuracion: updatedTenant, idempotent: false },
                error: null,
            });

            const result = await service.updateTenant('tenant-123', {
                nombre: 'Updated Company S.A.C.',
            }, actorId, idempotencyKey);

            expect(result).toEqual(updatedTenant);
            expect(mockClient.rpc).toHaveBeenCalledWith('actualizar_empresa_config_tx', {
                p_tenant_id: 'tenant-123',
                p_actor_id: actorId,
                p_idempotency_key: idempotencyKey,
                p_operation: 'TENANT_UPDATE',
                p_patch: { razon_social: 'Updated Company S.A.C.' },
            });
        });

        it('should update an active Colombia tenant country consistently', async () => {
            const updatedTenant = { ...mockTenant, pais_id: 2, pais: 'CO', moneda_defecto: 'COP' };
            mockClient.single
                .mockResolvedValueOnce({ data: mockTenant, error: null })
                .mockResolvedValueOnce({ data: { id: 2, codigo_iso: 'CO' }, error: null });
            mockClient.rpc.mockResolvedValueOnce({
                data: { configuracion: updatedTenant, idempotent: false },
                error: null,
            });

            const result = await service.updateTenant('tenant-123', {
                pais_id: 2,
                pais: 'CO',
            }, actorId, idempotencyKey);

            expect(result).toEqual(updatedTenant);
            expect(mockClient.rpc).toHaveBeenCalledWith(
                'actualizar_empresa_config_tx',
                expect.objectContaining({
                    p_patch: expect.objectContaining({ pais_id: 2, pais: 'CO' }),
                }),
            );
        });

        it('should reject a country outside the active PE/AR/CO catalog', async () => {
            mockClient.single.mockResolvedValueOnce({ data: mockTenant, error: null });

            await expect(service.updateTenant('tenant-123', {
                pais_id: 99,
                pais: 'XX',
            } as any, actorId, idempotencyKey)).rejects.toThrow(BadRequestException);
        });

        it('should throw NotFoundException when tenant not found', async () => {
            mockClient.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

            await expect(service.updateTenant(
                'non-existent',
                { nombre: 'Test' },
                actorId,
                idempotencyKey,
            ))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ==================== ACTIVATE TENANT ====================
    describe('activateTenant', () => {
        it('should activate tenant successfully', async () => {
            const inactiveTenant = { ...mockTenant, estado: 'INACTIVO' };
            const activatedTenant = { ...mockTenant, estado: 'ACTIVO' };

            mockClient.rpc.mockResolvedValueOnce({
                data: { tenant: activatedTenant, idempotent: false },
                error: null,
            });

            const result = await service.activateTenant('tenant-123', actorId, idempotencyKey);

            expect(result).toEqual(activatedTenant);
            expect(mockClient.rpc).toHaveBeenCalledWith('cambiar_estado_tenant_tx', {
                p_tenant_id: 'tenant-123',
                p_actor_id: actorId,
                p_idempotency_key: idempotencyKey,
                p_estado: 'ACTIVO',
            });
        });

        it('should throw NotFoundException when tenant not found', async () => {
            mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'TENANT_STATE_NOT_FOUND' } });

            await expect(service.activateTenant('non-existent', actorId, idempotencyKey))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ==================== DEACTIVATE TENANT ====================
    describe('deactivateTenant', () => {
        it('should propagate the atomic active-admin invariant', async () => {
            mockClient.rpc.mockResolvedValueOnce({
                data: null,
                error: { message: 'TENANT_STATE_ACTIVE_ADMIN_REQUIRED' },
            });

            await expect(service.deactivateTenant('tenant-123', actorId, idempotencyKey))
                .rejects.toThrow(BadRequestException);
        });

        it('should have deactivateTenant method defined', () => {
            expect(service.deactivateTenant).toBeDefined();
        });
    });

    describe('demo tenant lifecycle', () => {
        it('activates demo flags, credential and ADMIN role in one atomic RPC', async () => {
            mockClient.rpc.mockResolvedValueOnce({
                data: {
                    tenant_id: 'tenant-123',
                    demo_expires_at: '2026-08-25T00:00:00.000Z',
                    user: { id: 'demo-user-464' },
                    idempotent: false,
                },
                error: null,
            });

            const result = await service.activateDemoTenant(
                'tenant-123',
                { email: 'demo@example.test', password: 'StrongDemoPass464!', dias_duracion: 15 },
                { id: actorId },
                'tenant-demo-activate-464',
            );

            expect(result).toEqual(expect.objectContaining({
                success: true,
                tenant_id: 'tenant-123',
                user: expect.objectContaining({ id: 'demo-user-464' }),
            }));
            expect(mockClient.rpc).toHaveBeenCalledWith(
                'configurar_demo_tenant_tx',
                expect.objectContaining({
                    p_tenant_id: 'tenant-123',
                    p_actor_id: actorId,
                    p_idempotency_key: 'tenant-demo-activate-464',
                    p_activo: true,
                    p_password_hash: expect.any(String),
                    p_password_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
                }),
            );
        });

        it('deactivates flags and demo users through the same transaction boundary', async () => {
            mockClient.rpc.mockResolvedValueOnce({
                data: { tenant_id: 'tenant-123', is_demo: false, idempotent: false },
                error: null,
            });

            const result = await service.deactivateDemoTenant(
                'tenant-123',
                { sub: actorId },
                'tenant-demo-deactivate-464',
            );

            expect(result.success).toBe(true);
            expect(mockClient.rpc).toHaveBeenCalledWith('configurar_demo_tenant_tx', {
                p_tenant_id: 'tenant-123',
                p_actor_id: actorId,
                p_idempotency_key: 'tenant-demo-deactivate-464',
                p_activo: false,
                p_dias_duracion: null,
                p_email: null,
                p_password_hash: null,
                p_password_fingerprint: null,
                p_perfil: {},
            });
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

            mockClient.rpc.mockResolvedValueOnce({
                data: null,
                error: { code: '23505', message: 'TENANT_CREATE_ID_TAX_OR_EMAIL_CONFLICT' },
            });

            await expect(service.createTenant(createDto as any, actorId, idempotencyKey))
                .rejects.toThrow(ConflictException);
        });

        it('should create a Colombia tenant with COP and operational RBAC', async () => {
            const createDto = {
                razon_social: 'Colombia Company',
                ruc: '900123456-8',
                email: 'co@company.com',
                pais_id: 2,
                pais: 'CO',
            };

            const colombiaTenant = {
                ...mockTenant,
                tenant_id: 'tenant-co',
                razon_social: createDto.razon_social,
                ruc: createDto.ruc,
                pais: 'CO',
                pais_id: 2,
                moneda_defecto: 'COP',
            };

            mockClient.single
                .mockResolvedValueOnce({ data: { id: 2, codigo_iso: 'CO', moneda_codigo: 'COP' }, error: null });
            mockClient.rpc.mockResolvedValueOnce({
                data: {
                    tenant: colombiaTenant,
                    adminUser: { id: 'user-123', email: createDto.email },
                    idempotent: false,
                },
                error: null,
            });

            const result = await service.createTenant(createDto as any, actorId, idempotencyKey);

            expect(result.success).toBe(true);
            expect(result.data.tenant).toEqual(colombiaTenant);
            expect(mockClient.from).toHaveBeenCalledWith('paises');
            expect(mockClient.rpc).toHaveBeenCalledWith(
                'crear_tenant_empresa_admin_tx',
                expect.objectContaining({
                    p_actor_id: actorId,
                    p_idempotency_key: idempotencyKey,
                    p_empresa: expect.objectContaining({ pais: 'CO', moneda_defecto: 'COP' }),
                }),
            );
        });

        it('should reject a country outside the active PE/AR/CO catalog', async () => {
            const createDto = {
                razon_social: 'Unsupported Company',
                ruc: '123456789',
                email: 'xx@company.com',
                pais_id: 99,
                pais: 'XX',
            };

            await expect(service.createTenant(createDto as any, actorId, idempotencyKey))
                .rejects.toThrow(BadRequestException);
            expect(mockClient.from).not.toHaveBeenCalledWith('paises');
        });

        it('should create canonical tenant, RBAC and first admin in one RPC', async () => {
            const createDto = {
                razon_social: 'New Company S.A.C.',
                ruc: '20987654321',
                email: 'new@company.com',
                direccion: 'Av. Nueva 123',
                pais_id: 1,
                admin_email: 'admin@newcompany.com',
                admin_password: 'StrongPass123!',
            };

            mockClient.single
                .mockResolvedValueOnce({ data: { id: 1, codigo_iso: 'PE', moneda_codigo: 'PEN' }, error: null });
            mockClient.rpc.mockResolvedValueOnce({
                data: {
                    tenant: mockTenant,
                    adminUser: { id: 'user-123', email: createDto.admin_email },
                    idempotent: false,
                },
                error: null,
            });

            const result = await service.createTenant(createDto as any, actorId, idempotencyKey);

            expect(result.success).toBe(true);
            expect(mockClient.from).not.toHaveBeenCalledWith('tenants');
            expect(mockClient.rpc).toHaveBeenCalledWith(
                'crear_tenant_empresa_admin_tx',
                expect.objectContaining({
                    p_actor_id: actorId,
                    p_idempotency_key: idempotencyKey,
                }),
            );
        });
    });
});
