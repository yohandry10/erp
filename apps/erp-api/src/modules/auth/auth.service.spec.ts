import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService, LoginDto } from './auth.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EmailService } from '../../shared/email/email.service';
import { PermissionService } from '../permissions/permission.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
    let service: AuthService;
    let jwtService: JwtService;
    let emailService: EmailService;
    let permissionService: PermissionService;
    let supabaseService: SupabaseService;
    let testingModule: TestingModule;

    const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: '',
        tenant_id: 'tenant-123',
        nombre: 'Test',
        apellido: 'User',
        nombre_usuario: 'testuser',
        estado: 'ACTIVO',
        activo: true,
        is_super_admin: false,
        failed_login_attempts: 0,
        locked_until: null,
        password_reset_token: null,
        password_reset_expires: null,
        user_roles: [],
    };

    // Create fresh mock for each test
    const createMockClient = () => {
        const mockChain: any = {};

        // All chainable methods return the mock itself
        ['from', 'select', 'eq', 'lt', 'gte', 'lte', 'is', 'in', 'order', 'limit', 'range', 'insert', 'update', 'delete'].forEach(method => {
            mockChain[method] = jest.fn(() => mockChain);
        });
        mockChain.rpc = jest.fn().mockResolvedValue({ data: [], error: null });

        // Terminal methods return promises
        mockChain.single = jest.fn();
        mockChain.maybeSingle = jest.fn();

        return mockChain;
    };

    beforeEach(async () => {
        // Silence NestJS logger for this specific test suite to avoid expected error logs
        Logger.overrideLogger(false);
        const mockClient = createMockClient();

        const mockSupabase = {
            getClient: jest.fn(() => mockClient),
            getServiceClient: jest.fn(() => mockClient),
            getAdminClient: jest.fn(() => mockClient),
            getPublicClient: jest.fn(() => mockClient),
        };

        const mockJwt = {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
            verify: jest.fn().mockReturnValue({ sub: 'user-123', email: 'test@example.com', tenant_id: 'tenant-123' }),
        };

        const mockEmail = {
            isConfigured: jest.fn().mockReturnValue(true),
            sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
            sendPasswordResetConfirmationEmail: jest.fn().mockResolvedValue(true),
        };

        const mockPermission = {
            getUserPermissions: jest.fn().mockResolvedValue([]),
            invalidateUserPermissions: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: SupabaseService, useValue: mockSupabase },
                { provide: JwtService, useValue: mockJwt },
                { provide: EmailService, useValue: mockEmail },
                { provide: PermissionService, useValue: mockPermission },
            ],
        }).compile();

        const noopLogger = {
            log: () => { },
            error: () => { },
            warn: () => { },
            debug: () => { },
            verbose: () => { },
            setContext: () => { },
        };
        module.useLogger(noopLogger as any);

        testingModule = module;
        service = module.get<AuthService>(AuthService);
        jwtService = module.get<JwtService>(JwtService);
        emailService = module.get<EmailService>(EmailService);
        permissionService = module.get<PermissionService>(PermissionService);
        supabaseService = module.get<SupabaseService>(SupabaseService);
    });

    afterEach(async () => {
        if (testingModule) {
            await testingModule.close();
        }
        jest.clearAllMocks();
    });

    // ==================== BASIC INSTANTIATION ====================
    describe('Service instantiation', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should have all required methods', () => {
            expect(service.validateUser).toBeDefined();
            expect(service.login).toBeDefined();
            expect(service.validateToken).toBeDefined();
            expect(service.findUserById).toBeDefined();
            expect(service.refreshToken).toBeDefined();
            expect(service.generatePasswordResetToken).toBeDefined();
            expect(service.validatePasswordResetToken).toBeDefined();
            expect(service.resetPassword).toBeDefined();
            expect(service.switchTenant).toBeDefined();
            expect(service.validateSession).toBeDefined();
            expect(service.revokeSession).toBeDefined();
            expect(service.revokeUserSessions).toBeDefined();
            expect(service.cleanupExpiredSessions).toBeDefined();
        });
    });

    // ==================== VALIDATE USER ====================
    describe('validateUser', () => {
        it('should return user data when credentials are valid', async () => {
            const password = 'password123';
            const hashedPassword = await bcrypt.hash(password, 10);
            const userWithHash = { ...mockUser, password_hash: hashedPassword };

            const mockClient = supabaseService.getPublicClient() as any;

            // findUserByEmail does TWO queries:
            // 1. client.from('usuarios_sistema').select('*').eq('email', email).single()
            // 2. client.from('user_roles').select(...).eq('usuario_sistema_id', user.id)

            // For the first query (get user), single() returns user
            mockClient.single.mockResolvedValueOnce({ data: userWithHash, error: null });

            // For the second query (get roles), the chain ends at eq() which returns the roles
            // We need to set up the mock so that the SECOND call to eq() returns the roles
            let eqCallCount = 0;
            mockClient.eq.mockImplementation(() => {
                eqCallCount++;
                if (eqCallCount === 1) {
                    // First eq is for email filter, returns chain for single()
                    return mockClient;
                } else if (eqCallCount === 2) {
                    // Second eq is for user_roles, returns promise with roles
                    return Promise.resolve({ data: [], error: null });
                }
                // Any subsequent calls (resetFailedLoginAttempts) just return the chain
                return mockClient;
            });

            const result = await service.validateUser('test@example.com', password);

            expect(result).not.toBeNull();
            expect(result.email).toBe('test@example.com');
            expect(result).not.toHaveProperty('password_hash');
        });

        it('should return null when user not found', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

            const result = await service.validateUser('nonexistent@example.com', 'password');

            expect(result).toBeNull();
        });

        it('should return null when password is incorrect', async () => {
            const hashedPassword = await bcrypt.hash('correctpassword', 10);
            const userWithHash = { ...mockUser, password_hash: hashedPassword };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single
                .mockResolvedValueOnce({ data: userWithHash, error: null })  // findUserByEmail
                .mockResolvedValueOnce({ data: userWithHash, error: null }); // findUserById for incrementFailedLoginAttempts

            const result = await service.validateUser('test@example.com', 'wrongpassword');

            expect(result).toBeNull();
        });

        it('should throw UnauthorizedException when account is locked', async () => {
            const lockedUntil = new Date(Date.now() + 60000).toISOString();
            const lockedUser = { ...mockUser, locked_until: lockedUntil };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: lockedUser, error: null });

            await expect(service.validateUser('test@example.com', 'password123'))
                .rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when user is inactive', async () => {
            const password = 'password123';
            const hashedPassword = await bcrypt.hash(password, 10);
            const inactiveUser = { ...mockUser, password_hash: hashedPassword, estado: 'INACTIVO' };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single
                .mockResolvedValueOnce({ data: inactiveUser, error: null })
                .mockResolvedValueOnce({ data: [], error: null });

            await expect(service.validateUser('test@example.com', password))
                .rejects.toThrow(UnauthorizedException);
        });
    });

    // ==================== VALIDATE TOKEN ====================
    describe('validateToken', () => {
        it('should return user for valid token', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: { ...mockUser, activo: true }, error: null });

            const result = await service.validateToken('valid-token');

            expect(result).toBeDefined();
            expect(result.email).toBe('test@example.com');
            expect(result).not.toHaveProperty('password_hash');
            expect(result).not.toHaveProperty('password_reset_token');
            expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
        });

        it('should throw UnauthorizedException for invalid token', async () => {
            (jwtService.verify as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Invalid token');
            });

            await expect(service.validateToken('invalid-token'))
                .rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when user not found', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: null, error: null });

            await expect(service.validateToken('valid-token'))
                .rejects.toThrow(UnauthorizedException);
        });
    });

    // ==================== FIND USER BY ID ====================
    describe('findUserById', () => {
        it('should return user when found', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: mockUser, error: null });

            const result = await service.findUserById('user-123');

            expect(result).toBeDefined();
            expect(result.id).toBe('user-123');
        });

        it('should return null when user not found', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

            const result = await service.findUserById('non-existent');

            expect(result).toBeNull();
        });

        it('should return null on error', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: null, error: { message: 'Database error' } });

            const result = await service.findUserById('user-123');

            expect(result).toBeNull();
        });
    });

    // ==================== REFRESH TOKEN ====================
    describe('refreshToken', () => {
        it('should return new access token with correct payload', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single
                .mockResolvedValueOnce({
                    data: {
                        session_token: 'session-123',
                        expires_at: new Date(Date.now() + 3600000).toISOString(),
                    },
                    error: null,
                })
                .mockResolvedValueOnce({ data: mockUser, error: null });

            const result = await service.refreshToken({ ...mockUser, session_token: 'session-123' });

            expect(result).toHaveProperty('access_token');
            expect(result.access_token).toBe('mock-jwt-token');
            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({
                    sub: mockUser.id,
                    email: mockUser.email,
                    tenant_id: mockUser.tenant_id,
                    session_token: 'session-123',
                })
            );
        });

        it('should include is_super_admin in payload', async () => {
            const superAdmin = { ...mockUser, is_super_admin: true };
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single
                .mockResolvedValueOnce({
                    data: {
                        session_token: 'session-123',
                        expires_at: new Date(Date.now() + 3600000).toISOString(),
                    },
                    error: null,
                })
                .mockResolvedValueOnce({ data: superAdmin, error: null });

            await service.refreshToken({ ...superAdmin, session_token: 'session-123' });

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({
                    is_super_admin: true,
                })
            );
        });
    });

    // ==================== GENERATE PASSWORD RESET TOKEN ====================
    describe('generatePasswordResetToken', () => {
        it('should generate token and send email', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: mockUser, error: null });

            const result = await service.generatePasswordResetToken('test@example.com', '127.0.0.1');

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64);
            expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
        });

        it('should throw UnauthorizedException when user not found', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: null, error: null });

            await expect(service.generatePasswordResetToken('nonexistent@example.com'))
                .rejects.toThrow(UnauthorizedException);
        });

        it('should throw InternalServerErrorException when email not configured', async () => {
            (emailService.isConfigured as jest.Mock).mockReturnValueOnce(false);

            await expect(service.generatePasswordResetToken('test@example.com'))
                .rejects.toThrow(InternalServerErrorException);
        });
    });

    // ==================== VALIDATE PASSWORD RESET TOKEN ====================
    describe('validatePasswordResetToken', () => {
        it('should return true for valid token', async () => {
            const token = 'valid-reset-token';
            const hashedToken = await bcrypt.hash(token, 10);
            const expiresAt = new Date(Date.now() + 3600000).toISOString();

            const userWithToken = {
                ...mockUser,
                password_reset_token: hashedToken,
                password_reset_expires: expiresAt,
            };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: userWithToken, error: null });

            const result = await service.validatePasswordResetToken('test@example.com', token);

            expect(result).toBe(true);
        });

        it('should return false when token is expired', async () => {
            const token = 'expired-token';
            const hashedToken = await bcrypt.hash(token, 10);
            const expiresAt = new Date(Date.now() - 3600000).toISOString();

            const userWithExpiredToken = {
                ...mockUser,
                password_reset_token: hashedToken,
                password_reset_expires: expiresAt,
            };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: userWithExpiredToken, error: null });

            const result = await service.validatePasswordResetToken('test@example.com', token);

            expect(result).toBe(false);
        });

        it('should return false when token is invalid', async () => {
            const hashedToken = await bcrypt.hash('correct-token', 10);
            const expiresAt = new Date(Date.now() + 3600000).toISOString();

            const userWithToken = {
                ...mockUser,
                password_reset_token: hashedToken,
                password_reset_expires: expiresAt,
            };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: userWithToken, error: null });

            const result = await service.validatePasswordResetToken('test@example.com', 'wrong-token');

            expect(result).toBe(false);
        });

        it('should return false when user has no reset token', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: mockUser, error: null });

            const result = await service.validatePasswordResetToken('test@example.com', 'any-token');

            expect(result).toBe(false);
        });
    });

    // ==================== RESET PASSWORD ====================
    describe('resetPassword', () => {
        it('should reset password successfully', async () => {
            const token = 'valid-reset-token';
            const hashedToken = await bcrypt.hash(token, 10);
            const expiresAt = new Date(Date.now() + 3600000).toISOString();

            const userWithToken = {
                ...mockUser,
                password_reset_token: hashedToken,
                password_reset_expires: expiresAt,
            };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single
                .mockResolvedValueOnce({ data: userWithToken, error: null })  // validatePasswordResetToken->findUserByEmail
                .mockResolvedValueOnce({ data: userWithToken, error: null }); // resetPassword->findUserByEmail

            await expect(service.resetPassword('test@example.com', token, 'newPassword123!'))
                .resolves.not.toThrow();

            expect(emailService.sendPasswordResetConfirmationEmail).toHaveBeenCalled();
        });

        it('should throw UnauthorizedException for invalid token', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: mockUser, error: null });

            await expect(service.resetPassword('test@example.com', 'invalid-token', 'newPassword'))
                .rejects.toThrow(UnauthorizedException);
        });
    });

    // ==================== SWITCH TENANT ====================
    describe('switchTenant', () => {
        it('should switch tenant for super admin', async () => {
            const superAdmin = { ...mockUser, is_super_admin: true };
            const targetTenant = { id: 'new-tenant-123', nombre: 'New Tenant', estado: 'ACTIVO' };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single
                .mockResolvedValueOnce({ data: superAdmin, error: null })     // findUserById
                .mockResolvedValueOnce({ data: targetTenant, error: null });  // getTenant

            const result = await service.switchTenant('user-123', 'new-tenant-123');

            expect(result).toHaveProperty('access_token');
            expect(result).toHaveProperty('tenant');
            expect(result.tenant.id).toBe('new-tenant-123');
            expect(permissionService.invalidateUserPermissions).toHaveBeenCalledWith('user-123');
        });

        it('should throw UnauthorizedException for non super admin', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: mockUser, error: null });

            await expect(service.switchTenant('user-123', 'new-tenant-123'))
                .rejects.toThrow('Solo super-admins pueden cambiar de tenant');
        });

        it('should throw UnauthorizedException when user not found', async () => {
            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single.mockResolvedValueOnce({ data: null, error: null });

            await expect(service.switchTenant('user-123', 'new-tenant-123'))
                .rejects.toThrow('Usuario no encontrado');
        });

        it('should throw UnauthorizedException when target tenant not found', async () => {
            const superAdmin = { ...mockUser, is_super_admin: true };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single
                .mockResolvedValueOnce({ data: superAdmin, error: null })
                .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

            await expect(service.switchTenant('user-123', 'non-existent'))
                .rejects.toThrow('Tenant no encontrado');
        });

        it('should throw UnauthorizedException when tenant is inactive', async () => {
            const superAdmin = { ...mockUser, is_super_admin: true };
            const inactiveTenant = { id: 'inactive-tenant', nombre: 'Inactive', estado: 'INACTIVO' };

            const mockClient = supabaseService.getPublicClient() as any;
            mockClient.single
                .mockResolvedValueOnce({ data: superAdmin, error: null })
                .mockResolvedValueOnce({ data: inactiveTenant, error: null });

            await expect(service.switchTenant('user-123', 'inactive-tenant'))
                .rejects.toThrow('Tenant no está activo');
        });
    });

    // ==================== SESSION MANAGEMENT ====================
    describe('Session Management', () => {
        describe('validateSession', () => {
            it('should return true for valid session', async () => {
                const validSession = {
                    session_token: 'valid-session',
                    expires_at: new Date(Date.now() + 3600000).toISOString(),
                };

                const mockClient = supabaseService.getPublicClient() as any;
                mockClient.single.mockResolvedValueOnce({ data: validSession, error: null });

                const result = await service.validateSession('valid-session');

                expect(result).toBe(true);
            });

            it('should return false for expired session', async () => {
                const expiredSession = {
                    session_token: 'expired-session',
                    expires_at: new Date(Date.now() - 3600000).toISOString(),
                };

                const mockClient = supabaseService.getPublicClient() as any;
                mockClient.single.mockResolvedValueOnce({ data: expiredSession, error: null });

                const result = await service.validateSession('expired-session');

                expect(result).toBe(false);
            });

            it('should return false for non-existent session', async () => {
                const mockClient = supabaseService.getPublicClient() as any;
                mockClient.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

                const result = await service.validateSession('non-existent');

                expect(result).toBe(false);
            });
        });

        describe('revokeSession', () => {
            it('should revoke session without throwing', async () => {
                await expect(service.revokeSession('session-token'))
                    .resolves.not.toThrow();
            });
        });

        describe('revokeUserSessions', () => {
            it('should revoke all user sessions without throwing', async () => {
                await expect(service.revokeUserSessions('user-123'))
                    .resolves.not.toThrow();
            });
        });

        describe('cleanupExpiredSessions', () => {
            it('should cleanup expired sessions without throwing', async () => {
                await expect(service.cleanupExpiredSessions())
                    .resolves.not.toThrow();
            });
        });
    });
});
