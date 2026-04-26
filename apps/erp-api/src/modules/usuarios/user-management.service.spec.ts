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
});
