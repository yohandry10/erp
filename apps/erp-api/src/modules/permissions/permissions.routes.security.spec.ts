import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PermissionController } from './permission.controller';
import { RoleController } from './role.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionService } from './permission.service';
import { RoleService } from './role.service';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

const mockPermissionService = {
  getPermissions: jest.fn(),
  getRolePermissions: jest.fn(),
};

const mockRoleService = {
  getRoles: jest.fn(),
  getRoleById: jest.fn(),
  createRole: jest.fn(),
  updateRole: jest.fn(),
  deleteRole: jest.fn(),
  getRolePermissions: jest.fn(),
  assignPermissionToRole: jest.fn(),
  revokePermissionFromRole: jest.fn(),
  getRoleUsers: jest.fn(),
};

const mockJwtAuthGuard = {
  canActivate: jest.fn(),
};

const mockPermissionDecision = {
  allow: false,
};

const mockPermissionGuard = {
  canActivate: jest.fn(),
};

describe('Permissions module route security (P2.3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PermissionController, RoleController],
      providers: [
        { provide: PermissionService, useValue: mockPermissionService },
        { provide: RoleService, useValue: mockRoleService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(PermissionGuard)
      .useValue(mockPermissionGuard)
      .compile();

    mockJwtAuthGuard.canActivate.mockImplementation((context: any) => {
      const request = context.switchToHttp().getRequest();
      const header = request.headers?.authorization;

      if (header !== 'Bearer valid-test-token') {
        throw new UnauthorizedException('No autenticado');
      }

      request.user = {
        id: 'user-1',
        tenant_id: 'tenant-1',
      };

      return true;
    });

    mockPermissionGuard.canActivate.mockImplementation(() => {
      if (mockPermissionDecision.allow) {
        return true;
      }

      throw new ForbiddenException('Permiso requerido');
    });

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionDecision.allow = false;

    mockPermissionService.getPermissions.mockResolvedValue([]);
    mockRoleService.getRoles.mockResolvedValue([]);
  });

  it('debe exigir PERMISSION_KEY en PermissionController', () => {
    const metadata = Reflect.getMetadata(PERMISSION_KEY, PermissionController.prototype.getPermissions);

    expect(metadata).toBeDefined();
    expect(metadata?.raw).toBe('users.manage');
  });

  it('debe exigir PERMISSION_KEY en RoleController', () => {
    const methods = [
      'getRoles',
      'getRoleById',
      'createRole',
      'updateRole',
      'deleteRole',
      'getRolePermissions',
      'assignPermissionToRole',
      'revokePermissionFromRole',
      'getRoleUsers',
    ];

    methods.forEach((methodName) => {
      const metadata = Reflect.getMetadata(PERMISSION_KEY, (RoleController.prototype as any)[methodName]);
      expect(metadata).toBeDefined();
      expect(metadata?.raw).toBe('users.manage');
    });
  });

  it('debe tener JwtAuthGuard y PermissionGuard en PermissionController', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PermissionController);

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, PermissionGuard]));
  });

  it('debe tener JwtAuthGuard y PermissionGuard en RoleController', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RoleController);

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, PermissionGuard]));
  });

  it('GET /permissions sin token debe responder 401', async () => {
    await request(app.getHttpServer())
      .get('/permissions')
      .expect(401);
  });

  it('GET /permissions sin permiso debe responder 403', async () => {
    mockPermissionDecision.allow = false;

    await request(app.getHttpServer())
      .get('/permissions')
      .set('Authorization', 'Bearer valid-test-token')
      .expect(403);
  });

  it('GET /permissions con permiso debe responder 200', async () => {
    mockPermissionDecision.allow = true;
    mockPermissionService.getPermissions.mockResolvedValue([{ id: 'p1', modulo: 'usuarios', accion: 'manage', recurso: '__global__', tenant_id: 'tenant-1' }]);

    await request(app.getHttpServer())
      .get('/permissions')
      .set('Authorization', 'Bearer valid-test-token')
      .expect(200);
  });

  it('GET /roles sin token debe responder 401', async () => {
    await request(app.getHttpServer())
      .get('/roles')
      .expect(401);
  });

  it('GET /roles sin permiso debe responder 403', async () => {
    mockPermissionDecision.allow = false;

    await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', 'Bearer valid-test-token')
      .expect(403);
  });

  it('GET /roles con permiso debe responder 200', async () => {
    mockPermissionDecision.allow = true;

    await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', 'Bearer valid-test-token')
      .expect(200);
  });
});
