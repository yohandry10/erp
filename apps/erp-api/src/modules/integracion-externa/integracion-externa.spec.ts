import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { PosController } from '../pos/pos.controller';
import { IntegracionExternaAuthService } from './integracion-externa-auth.service';
import { IntegracionExternaService } from './integracion-externa.service';
import {
  CABECERA_ACTOR_ID,
  CABECERA_ACTOR_NOMBRE,
  CABECERA_CREDENCIAL,
  PERMISOS_INTEGRACION,
  RUTA_INTEGRACION_KEY,
  generarCredencial,
  hashCredencial,
  parsearCredencial,
} from './integracion-externa.contract';

const TENANT = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const OTRO = '33333333-3333-4333-8333-333333333333';
const { token: TOKEN } = generarCredencial();

const contexto = (request: any, handler: any = () => undefined): ExecutionContext => ({
  switchToHttp: () => ({ getRequest: () => request }),
  getHandler: () => handler,
  getClass: () => class Prueba {},
} as unknown as ExecutionContext);

const okRpc = {
  ok: true,
  credencial_id: 'cred-1',
  tenant_id: TENANT,
  sucursal_id: SUCURSAL,
  cuenta_tecnica_id: 'cuenta-1',
  nombre: 'Integración – Sede Centro',
  sistema: 'Sistema externo',
  secreto_id: 'sec-1',
};

const autenticador = (respuesta: any = { data: okRpc, error: null }) => {
  const rpc = jest.fn().mockResolvedValue(respuesta);
  const supabase: any = { getPublicClient: () => ({ rpc }) };
  return { service: new IntegracionExternaAuthService(supabase), rpc };
};

const requestIntegracion = (extra: Record<string, any> = {}) => ({
  method: 'POST',
  path: '/api/pos/venta',
  ip: '10.0.0.1',
  headers: {
    [CABECERA_CREDENCIAL]: TOKEN,
    [CABECERA_ACTOR_ID]: 'EXT-7',
    [CABECERA_ACTOR_NOMBRE]: encodeURIComponent('Recepción 7'),
    ...(extra.headers ?? {}),
  },
  body: extra.body ?? {},
  query: extra.query ?? {},
});

describe('Credencial de integración externa (621)', () => {
  describe('formato del secreto', () => {
    it('se genera con prefijo público y sólo su hash viaja a la base', () => {
      const generada = generarCredencial();
      expect(generada.token).toMatch(/^erpint_[a-z0-9]{12}_[A-Za-z0-9_-]{43}$/);
      expect(generada.hash).toBe(hashCredencial(generada.token));
      expect(generada.hash).not.toContain(generada.token.slice(-43));
      expect(parsearCredencial(generada.token)).toEqual({ prefijo: generada.prefijo, hash: generada.hash });
      expect(parsearCredencial('Bearer abc')).toBeNull();
    });
  });

  describe('autenticación', () => {
    it('envía a la base el hash, la ruta, la persona externa y lo que el request declara de alcance', async () => {
      const { service, rpc } = autenticador();
      const principal = await service.autenticar(
        requestIntegracion({ body: { tenant_id: TENANT, sucursal_id: SUCURSAL }, query: { tenantId: OTRO } }),
        { actorExterno: 'requerido' },
      );

      const [fn, params] = rpc.mock.calls[0];
      expect(fn).toBe('autenticar_integracion_externa_621');
      expect(params.p_hash).toBe(hashCredencial(TOKEN));
      expect(JSON.stringify(params)).not.toContain(TOKEN);
      expect(params.p_contexto).toEqual(expect.objectContaining({
        metodo: 'POST',
        ruta: '/api/pos/venta',
        ruta_permitida: true,
        actor_externo_requerido: true,
        actor_externo_id: 'EXT-7',
        actor_externo_nombre: 'Recepción 7',
        tenant_solicitado: [TENANT, OTRO],
        sucursal_solicitada: [SUCURSAL],
      }));
      expect(principal).toEqual(expect.objectContaining({
        tenant_id: TENANT,
        sucursal_id: SUCURSAL,
        cuenta_tecnica_id: 'cuenta-1',
        actor_externo: { id: 'EXT-7', nombre: 'Recepción 7' },
      }));
    });

    it.each([
      ['INTEGRACION_CREDENCIAL_VENCIDA', 401],
      ['INTEGRACION_CREDENCIAL_REVOCADA', 401],
      ['INTEGRACION_SECRETO_RETIRADO', 401],
      ['INTEGRACION_CREDENCIAL_INVALIDA', 401],
      ['INTEGRACION_ALCANCE_TENANT', 403],
      ['INTEGRACION_ALCANCE_SUCURSAL', 403],
      ['INTEGRACION_RUTA_NO_PERMITIDA', 403],
      ['INTEGRACION_ACTOR_EXTERNO_REQUERIDO', 400],
    ])('el rechazo %s de la base responde %i con su código', async (codigo, estado) => {
      const { service } = autenticador({ data: { ok: false, codigo }, error: null });
      await expect(service.autenticar(requestIntegracion(), { actorExterno: 'opcional' }))
        .rejects.toMatchObject({ status: estado, message: codigo });
    });

    it('una credencial malformada no llega a la base', async () => {
      const { service, rpc } = autenticador();
      const request = requestIntegracion({ headers: { [CABECERA_CREDENCIAL]: 'erpint_corto' } });
      await expect(service.autenticar(request, { actorExterno: 'opcional' })).rejects.toMatchObject({ status: 401 });
      expect(rpc).not.toHaveBeenCalled();
    });

    it('una persona externa malformada es 400 y no llega a la base', async () => {
      const { service, rpc } = autenticador();
      const request = requestIntegracion({ headers: { [CABECERA_ACTOR_ID]: 'con espacios' } });
      await expect(service.autenticar(request, { actorExterno: 'requerido' }))
        .rejects.toMatchObject({ status: 400, message: 'INTEGRACION_ACTOR_EXTERNO_INVALIDO' });
      expect(rpc).not.toHaveBeenCalled();
    });

    it('si la base no responde, falla cerrado con 503', async () => {
      const { service } = autenticador({ data: null, error: { code: '08006', message: 'down' } });
      await expect(service.autenticar(requestIntegracion(), { actorExterno: 'opcional' }))
        .rejects.toMatchObject({ status: 503 });
    });
  });

  describe('JwtAuthGuard', () => {
    const reflector = (ruta?: any) => ({
      getAllAndOverride: jest.fn().mockReturnValue(false),
      get: jest.fn((key: string) => (key === RUTA_INTEGRACION_KEY ? ruta : undefined)),
    }) as unknown as Reflector;

    it('instala la identidad de la credencial y no repite el uso en el guard del controlador', async () => {
      const { service, rpc } = autenticador();
      const guard = new JwtAuthGuard(undefined, reflector({ actorExterno: 'requerido' }), service);
      const request: any = requestIntegracion();

      await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
      await expect(guard.canActivate(contexto(request))).resolves.toBe(true);

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(request.tenantId).toBe(TENANT);
      expect(request.user).toEqual(expect.objectContaining({
        id: 'cuenta-1',
        tenant_id: TENANT,
        is_super_admin: false,
        auth_type: 'integracion_externa',
        integracion: expect.objectContaining({ credencial_id: 'cred-1', sucursal_id: SUCURSAL }),
        actor_externo: { id: 'EXT-7', nombre: 'Recepción 7' },
      }));
    });

    it('una ruta sin @PermiteIntegracionExterna se lo dice a la base, que la rechaza y audita', async () => {
      const { service, rpc } = autenticador({ data: { ok: false, codigo: 'INTEGRACION_RUTA_NO_PERMITIDA' }, error: null });
      const guard = new JwtAuthGuard(undefined, reflector(undefined), service);

      await expect(guard.canActivate(contexto(requestIntegracion())))
        .rejects.toMatchObject({ status: 403, message: 'INTEGRACION_RUTA_NO_PERMITIDA' });
      expect(rpc.mock.calls[0][1].p_contexto.ruta_permitida).toBe(false);
    });

    it.each([
      ['Authorization', { authorization: 'Bearer x.y.z' }],
      ['cookie de sesión', { cookie: 'theme=dark; access_token=abc' }],
    ])('rechaza la credencial combinada con %s', async (_nombre, headers) => {
      const { service, rpc } = autenticador();
      const guard = new JwtAuthGuard(undefined, reflector({ actorExterno: 'opcional' }), service);

      await expect(guard.canActivate(contexto(requestIntegracion({ headers }))))
        .rejects.toMatchObject({ status: 401, message: 'INTEGRACION_CREDENCIAL_AMBIGUA' });
      expect(rpc).not.toHaveBeenCalled();
    });

    it('rechaza la persona externa con una sesión normal, antes de validar el JWT', async () => {
      const guard = new JwtAuthGuard(undefined, reflector({ actorExterno: 'requerido' }), autenticador().service);
      const base = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
      const request = {
        method: 'POST',
        path: '/api/pos/venta',
        headers: { authorization: 'Bearer x.y.z', [CABECERA_ACTOR_ID]: 'EXT-7', [CABECERA_ACTOR_NOMBRE]: 'Alguien' },
      };

      await expect(guard.canActivate(contexto(request)))
        .rejects.toMatchObject({ status: 403, message: 'INTEGRACION_ACTOR_EXTERNO_NO_PERMITIDO' });
      expect(base).not.toHaveBeenCalled();
      base.mockRestore();
    });

    it('sin autenticador disponible no cae a la sesión de usuario', async () => {
      const guard = new JwtAuthGuard(undefined, reflector({ actorExterno: 'opcional' }), undefined);
      await expect(guard.canActivate(contexto(requestIntegracion()))).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('permisos acotados', () => {
    const guardCon = (raw: string | undefined, checkUserPermission = jest.fn().mockResolvedValue(true)) => {
      const [module, ...rest] = (raw ?? '').split('.');
      const action = rest.pop();
      const permiso = raw ? { module, action, resource: rest.join('.') || '__global__', raw } : undefined;
      const reflector = { getAllAndOverride: jest.fn((key: string) => (key === PERMISSION_KEY ? permiso : undefined)) } as any;
      const tenantContext: any = { getContext: () => undefined, setContext: jest.fn(), run: (_: any, cb: any) => cb() };
      return {
        guard: new PermissionGuard(reflector, { checkUserPermission } as any, {} as any, {} as any, tenantContext),
        checkUserPermission,
      };
    };
    const request = () => ({
      user: { id: 'cuenta-1', tenant_id: TENANT, auth_type: 'integracion_externa' },
      tenantId: TENANT,
    });

    it.each(['users.manage', 'ventas.anular', 'pos.configuracion.write', 'cpe.comprobantes.enviar'])(
      'rechaza %s aunque el rol técnico lo tuviera', async (raw) => {
        const { guard, checkUserPermission } = guardCon(raw);
        await expect(guard.canActivate(contexto(request())))
          .rejects.toMatchObject({ status: 403, message: 'INTEGRACION_PERMISO_NO_PERMITIDO' });
        expect(checkUserPermission).not.toHaveBeenCalled();
      },
    );

    it('rechaza una ruta que no declara permiso', async () => {
      const { guard } = guardCon(undefined);
      await expect(guard.canActivate(contexto(request()))).rejects.toMatchObject({ status: 403 });
    });

    it.each([...PERMISOS_INTEGRACION])('%s sigue exigiendo el permiso real del rol técnico', async (raw) => {
      const { guard, checkUserPermission } = guardCon(raw, jest.fn().mockResolvedValue(false));
      await expect(guard.canActivate(contexto(request()))).rejects.toMatchObject({ status: 403 });
      expect(checkUserPermission).toHaveBeenCalledWith('cuenta-1', TENANT, expect.any(String), expect.any(String), expect.any(String));
    });
  });

  describe('alcance por sucursal', () => {
    it('la sucursal de la credencial fija el filtro de toda consulta, sin leer asignaciones', async () => {
      const store: any = { tenantId: null };
      const tenantContext: any = {
        getContext: () => store,
        setContext: jest.fn((patch: any) => Object.assign(store, patch)),
      };
      const sucursalScope: any = { resolver: jest.fn() };
      const interceptor = new TenantContextInterceptor(tenantContext, sucursalScope);
      const request: any = {
        path: '/api/pos/facturacion/x',
        headers: {},
        user: { id: 'cuenta-1', tenant_id: TENANT, auth_type: 'integracion_externa' },
        integracionExterna: { sucursal_id: SUCURSAL },
      };

      await lastValueFrom(interceptor.intercept(contexto(request), { handle: () => of('ok') }));

      expect(store.sucursalIds).toEqual([SUCURSAL]);
      expect(sucursalScope.resolver).not.toHaveBeenCalled();
    });
  });

  describe('rutas que aceptan la credencial', () => {
    it('son exactamente las nueve del contrato', () => {
      const raiz = join(__dirname, '..', '..', '..');
      const archivos = execFileSync('git', ['ls-files', 'src'], { cwd: raiz, encoding: 'utf8' })
        .split('\n')
        .filter((f) => f.endsWith('.controller.ts'));
      const rutas: string[] = [];
      for (const rel of archivos) {
        const texto = readFileSync(join(raiz, rel), 'utf8');
        const base = /@Controller\(\s*['"]([^'"]*)['"]/.exec(texto)?.[1] ?? '';
        const lineas = texto.split(/\r?\n/);
        lineas.forEach((linea, i) => {
          if (!linea.includes('@PermiteIntegracionExterna(')) return;
          const decorador = lineas.slice(Math.max(0, i - 3), i).reverse()
            .map((l) => /@(Get|Post|Put|Patch|Delete)\(\s*['"]([^'"]*)['"]/.exec(l)).find(Boolean);
          rutas.push(`${decorador?.[1].toUpperCase()} /api/${base}/${decorador?.[2]}`);
        });
      }
      expect(rutas.sort()).toEqual([
        'GET /api/cpe/comprobantes/:id/pdf',
        'GET /api/inventario/productos/:id',
        'GET /api/pos/facturacion/:ventaId',
        'GET /api/pos/metodos-pago',
        'GET /api/pos/sesion-caja',
        'POST /api/pos/caja/abrir',
        'POST /api/pos/caja/cerrar',
        'POST /api/pos/reintentar-facturacion/:ventaId',
        'POST /api/pos/venta',
      ]);
    });

    it('cobrar, mover caja y reintentar exigen la persona externa', () => {
      const texto = readFileSync(join(__dirname, '..', 'pos', 'pos.controller.ts'), 'utf8');
      for (const ruta of ['venta', 'caja/abrir', 'caja/cerrar', 'reintentar-facturacion/:ventaId']) {
        expect(texto).toMatch(new RegExp(`@Post\\('${ruta.replace('/', '\\/')}'\\)\\s*\\n\\s*@PermiteIntegracionExterna\\(\\{ actorExterno: 'requerido' \\}\\)`));
      }
    });
  });

  describe('HTTP de la venta', () => {
    const estado = (error: any) => (PosController as any).estadoHttpDeFalloVenta({ success: false, error });

    it('el mismo idempotency_key con otra referencia es 409', () => {
      expect(estado({ tipo: 'DATABASE_ERROR', codigo: '23505', mensaje: 'POS_IDEMPOTENCY_PAYLOAD_MISMATCH' })).toBe(HttpStatus.CONFLICT);
    });

    it('un enlace fuera de la sucursal de la credencial es 403, no una caída', () => {
      expect(estado({ tipo: 'DATABASE_ERROR', codigo: '42501', mensaje: 'POS_INTEGRATION_BRANCH_MISMATCH' })).toBe(HttpStatus.FORBIDDEN);
      expect(estado({ tipo: 'DATABASE_ERROR', codigo: '42501', mensaje: 'POS_EXTERNAL_ACTOR_REQUIRES_INTEGRATION' })).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('administración', () => {
    const servicio = (respuesta: any = { data: { id: 'cred-1' }, error: null }) => {
      const rpc = jest.fn().mockResolvedValue(respuesta);
      return { service: new IntegracionExternaService({ getClient: () => ({ rpc }) } as any), rpc };
    };

    it('el alta muestra el secreto una sola vez y a la base sólo llega su hash', async () => {
      const { service, rpc } = servicio();
      const resultado = await service.crear(TENANT, 'admin-1', {
        nombre: 'Integración – Sede Centro',
        sistema: 'Sistema externo',
        sucursal_id: SUCURSAL,
        expira_en: '2027-06-01T00:00:00Z',
        idempotency_key: 'alta-sede-centro-1',
      });
      const params = rpc.mock.calls[0][1];

      expect(rpc.mock.calls[0][0]).toBe('crear_integracion_externa_621');
      expect(params.p_hash).toBe(hashCredencial(resultado.credencial));
      expect(JSON.stringify(params)).not.toContain(resultado.credencial);
      expect(params.p_prefijo).toBe(parsearCredencial(resultado.credencial)?.prefijo);
    });

    it('la rotación emite otro secreto con su gracia', async () => {
      const { service, rpc } = servicio({ data: { gracia_hasta: 'x' }, error: null });
      const resultado = await service.rotar(TENANT, 'admin-1', 'cred-1', { gracia_horas: 48 });

      expect(rpc).toHaveBeenCalledWith('rotar_integracion_externa_621', expect.objectContaining({
        p_credencial_id: 'cred-1',
        p_gracia_horas: 48,
        p_hash: hashCredencial(resultado.credencial),
      }));
    });

    it.each([
      [{ code: '42501', message: 'ADMIN_ACTOR_REQUIRES_USERS_MANAGE' }, 403, 'ADMIN_ACTOR_REQUIRES_USERS_MANAGE'],
      [{ code: '23505', message: 'INTEGRATION_CREDENTIAL_ALREADY_CREATED:abc' }, 409, 'INTEGRATION_CREDENTIAL_ALREADY_CREATED'],
      [{ code: '55000', message: 'INTEGRATION_ROTATION_IN_PROGRESS' }, 409, 'INTEGRATION_ROTATION_IN_PROGRESS'],
      [{ code: 'P0002', message: 'INTEGRATION_CREDENTIAL_NOT_FOUND' }, 404, 'INTEGRATION_CREDENTIAL_NOT_FOUND'],
      [{ code: '22023', message: 'INTEGRATION_EXPIRY_OUT_OF_RANGE' }, 400, 'INTEGRATION_EXPIRY_OUT_OF_RANGE'],
      [{ code: 'XX000', message: 'detalle interno' }, 503, 'INTEGRACION_ADMINISTRACION_NO_DISPONIBLE'],
    ])('traduce %o a %i sin exponer detalles', async (error, status, message) => {
      const { service } = servicio({ data: null, error });
      await expect(service.revocar(TENANT, 'admin-1', 'cred-1', { motivo: 'Cambio de proveedor' }))
        .rejects.toMatchObject({ status, message });
    });
  });
});
