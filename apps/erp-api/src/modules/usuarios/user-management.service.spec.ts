import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../../shared/email/email.service';
import { PermissionService } from '../permissions/permission.service';

describe('UserManagementService', () => {
    let service: UserManagementService;

    const mockUser = {
        id: 'user-123',
        tenant_id: 'tenant-123',
        nombre: 'Test User',
        apellido: 'Apellido',
        email: 'test@example.com',
        password_hash: '$2b$10$hashedpassword',
        estado: 'ACTIVO',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const createChainableMock = () => {
        const mock: any = {};
        const methods = ['from', 'select', 'eq', 'single', 'insert', 'update', 'delete', 'or', 'in', 'range', 'order', 'maybeSingle'];
        methods.forEach(method => {
            mock[method] = jest.fn().mockReturnValue(mock);
        });
        mock.single = jest.fn().mockResolvedValue({ data: null, error: null });
        return mock;
    };

    let mockSupabaseClient: any;

    beforeEach(async () => {
        mockSupabaseClient = createChainableMock();

        const mockSupabase = {
            getClient: jest.fn().mockReturnValue(mockSupabaseClient),
        };

        const mockAudit = {
            registrarCambio: jest.fn().mockResolvedValue(undefined),
        };

        const mockEmail = {
            sendUserActivationEmail: jest.fn().mockResolvedValue(undefined),
            sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
        };

        const mockPermission = {
            invalidateUserPermissions: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UserManagementService,
                { provide: SupabaseService, useValue: mockSupabase },
                { provide: AuditService, useValue: mockAudit },
                { provide: EmailService, useValue: mockEmail },
                { provide: PermissionService, useValue: mockPermission },
            ],
        }).compile();

        service = module.get<UserManagementService>(UserManagementService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should have createUser method', () => {
        expect(service.createUser).toBeDefined();
    });

    it('should have updateUser method', () => {
        expect(service.updateUser).toBeDefined();
    });

    it('should have deleteUser method', () => {
        expect(service.deleteUser).toBeDefined();
    });

    it('should have getUsers method', () => {
        expect(service.getUsers).toBeDefined();
    });

    it('should have getUserById method', () => {
        expect(service.getUserById).toBeDefined();
    });

    it('should have assignRoles method', () => {
        expect(service.assignRoles).toBeDefined();
    });

    it('should have removeRoles method', () => {
        expect(service.removeRoles).toBeDefined();
    });

    it('should have activateUser method', () => {
        expect(service.activateUser).toBeDefined();
    });

    it('should have deactivateUser method', () => {
        expect(service.deactivateUser).toBeDefined();
    });

    it('should have resetPassword method', () => {
        expect(service.resetPassword).toBeDefined();
    });

    describe('Aislamiento multi-tenant (P2.2)', () => {
        it('getUserById debe filtrar por tenant y no devolver datos de otro tenant', async () => {
            const tenantA = 'tenant-a';
            const tenantB = 'tenant-b';
            const userId = 'user-b';

            mockSupabaseClient.single.mockResolvedValue({
                data: null,
                error: { message: 'No encontrado' },
            });

            await expect(service.getUserById(tenantA, userId)).rejects.toThrow(NotFoundException);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('usuarios_sistema');
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
            expect(mockSupabaseClient.eq).not.toHaveBeenCalledWith('tenant_id', tenantB);
        });

        it('updateUser no debe actualizar usuario fuera de su tenant', async () => {
            const tenantA = 'tenant-a';
            const tenantB = 'tenant-b';
            const userId = 'user-cross-tenant';

            mockSupabaseClient.single.mockResolvedValue({
                data: null,
                error: { message: 'No encontrado' },
            });

            await expect(
                service.updateUser(tenantA, userId, {
                    nombre: 'Nombre',
                }),
            ).rejects.toThrow(NotFoundException);

            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
            expect(mockSupabaseClient.eq).not.toHaveBeenCalledWith('tenant_id', tenantB);
        });

        it('createUser debe insertar con el tenant del contexto y no con valores externos', async () => {
            const tenantA = 'tenant-a';
            const dto = {
                nombre: 'Usuario Test',
                apellido: 'Apellido',
                email: 'tenant-a@example.com',
                telefono: '+51999999999',
                cargo: 'Analista',
                departamento: 'IT',
                roles: [],
            };

            mockSupabaseClient.single
                .mockResolvedValueOnce({ data: null, error: null }) // No existe duplicado
                .mockResolvedValueOnce({ // Registro insertado
                    data: {
                        id: 'user-created',
                        tenant_id: tenantA,
                        nombre: dto.nombre,
                        apellido: dto.apellido,
                        email: dto.email,
                    },
                    error: null,
                });

            await service.createUser(tenantA, dto);

            const insertedPayload = mockSupabaseClient.insert.mock.calls[0][0];
            expect(insertedPayload).toMatchObject({
                tenant_id: tenantA,
            });
            expect(insertedPayload).not.toHaveProperty('tenant_id', 'tenant-b');
        });
    });
});
