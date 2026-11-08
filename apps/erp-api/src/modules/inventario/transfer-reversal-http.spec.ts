import fs from 'node:fs';
import path from 'node:path';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { AlmacenesService } from './almacenes/almacenes.service';
import { ProductImagesService } from './product-images.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TaxCalculatorService } from '../../shared/utils/tax-calculator';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';

// Actual SQL receipts, synthetic local identities; Supabase and authentication
// are substituted. Real Nest routing/validation, permission and feature guards.
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'transfer-reversal.fixture.json'), 'utf8'));
const resolutions = JSON.parse(fs.readFileSync(path.join(__dirname, 'transfer-reversal-resolution.fixture.json'), 'utf8'));
const clone = (v: any) => JSON.parse(JSON.stringify(v));
const envelope = (f: any) => ({ expected_scope: { tenant_id: f.context.tenantId, actor_id: f.context.actorId,
  source_operation_id: f.context.operationId }, original: { ...f.context.body, idempotency_key: f.context.key } });
const base = (f: any) => `/api/inventario/transferencias/${f.context.operationId}`;
const other = '613abcde-0000-4000-8000-000000000099';

describe('Reversa de transferencia: frontera HTTP local', () => {
  let app: INestApplication;
  const rpc = jest.fn();
  const from = jest.fn(() => { throw new Error('No direct table access is allowed in this test'); });
  let identity: any, readAllowed = true, createAllowed = true;
  const permissions = { checkUserPermission: jest.fn(async (_actor, _tenant, module, action, resource) =>
    module === 'inventario' && ['movimientos', '__global__'].includes(resource) && (action === 'read' ? readAllowed : action === 'create' && createAllowed)) };
  const previousFlag = process.env.FEATURE_INVENTARIO_ENABLED;
  beforeAll(async () => {
    const reflector = new Reflector();
    const permissionGuard = new PermissionGuard(reflector, permissions as any, new JwtService(), new ConfigService(), new TenantContextService());
    const module = await Test.createTestingModule({
      controllers: [InventarioController], providers: [InventarioService,
        { provide: SupabaseService, useValue: { getClient: () => ({ rpc, from }) } },
        ...[AuditService, EventBusService, AlmacenesService, TaxCalculatorService, ProductImagesService].map(provide => ({ provide, useValue: {} })),
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      if (req.headers.authorization !== 'Bearer fixture613') throw new UnauthorizedException();
      req.user = { id: identity.actorId, tenant_id: identity.tenantId };
      return true;
    } }).overrideGuard(PermissionGuard).useValue(permissionGuard)
      .overrideGuard(FeatureFlagGuard).useValue(new FeatureFlagGuard(reflector)).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true } }));
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    identity = fixtures[0].context; readAllowed = true; createAllowed = true;
    rpc.mockReset(); from.mockClear(); permissions.checkUserPermission.mockClear();
    process.env.FEATURE_INVENTARIO_ENABLED = 'true';
  });
  afterAll(async () => {
    if (previousFlag === undefined) delete process.env.FEATURE_INVENTARIO_ENABLED;
    else process.env.FEATURE_INVENTARIO_ENABLED = previousFlag;
    await app?.close();
  });
  const post = (f: any, suffix = '/anular', body: any = envelope(f)) => request(app.getHttpServer()).post(base(f) + suffix)
    .set('Authorization', 'Bearer fixture613').send(body);
  const get = (f: any) => request(app.getHttpServer()).get(base(f)).set('Authorization', 'Bearer fixture613');

  it.each(fixtures)('confirma $name sólo con el recibo completo y la lectura atómica', async f => {
    identity = f.context;
    rpc.mockResolvedValueOnce({ data: f.rpc, error: null }).mockResolvedValueOnce({ data: f.detail, error: null });
    const response = await post(f).expect(200).expect('Cache-Control', 'no-store');
    expect(response.body.data.cantidad).toBe(f.rpc.cantidad);
    expect(response.body.data.operation_identity).toMatchObject({ tenant_id: f.context.tenantId, actor_id: f.context.actorId,
      source_operation_id: f.context.operationId, idempotency_key: f.context.key });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['revertir_transferencia_inventario_613', 'consultar_transferencia_inventario_613']);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_tenant_id: f.context.tenantId, p_actor_id: f.context.actorId,
      p_operacion_id: f.context.operationId, p_idempotency_key: f.context.key,
      p_payload: { motivo: f.detail.reversa.payload.motivo, guia_remision_id: f.detail.reversa.payload.guia_remision_id } });
    expect(from).not.toHaveBeenCalled();
  });
  it('recupera después de una respuesta perdida sin volver a llamar al writer', async () => {
    const f = fixtures[0]; rpc.mockRejectedValueOnce(new Error('Controlled transport loss'));
    await post(f).expect(503); expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValueOnce({ data: f.detail, error: null });
    const response = await post(f, '/anular/recibo').expect(200).expect('Cache-Control', 'no-store');
    expect(response.body.data.idempotent).toBe(true);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['revertir_transferencia_inventario_613', 'consultar_transferencia_inventario_613']);
  });
  it('no confirma un ACK si la lectura posterior falla, y no reenvía automáticamente', async () => {
    const f = fixtures[0]; rpc.mockResolvedValueOnce({ data: f.rpc, error: null }).mockRejectedValueOnce(new Error('Read failed'));
    const response = await post(f).expect(503);
    expect(response.body.success).not.toBe(true); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each([null, {}, { reversa: null }])('la ausencia o lectura parcial no prueba abandono: %#', async detail => {
    rpc.mockResolvedValue({ data: detail, error: null });
    await post(fixtures[0], '/anular/recibo').expect(503);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['consultar_transferencia_inventario_613']);
  });
  it.each(resolutions)('resuelve $name con una sola RPC y sin writer de stock', async f => {
    identity = f.context; rpc.mockResolvedValue({ data: f.resolution, error: null });
    const response = await post(f, '/anular/resolver').expect(200).expect('Cache-Control', 'no-store');
    expect(response.body.data.status).toBe(f.resolution.status);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['resolver_reversa_transferencia_613']);
    expect(from).not.toHaveBeenCalled();
  });
  it('una resolución parcial o contradictoria conserva la incertidumbre', async () => {
    const f = resolutions.find((r: any) => r.name === 'abandoned'); identity = f.context;
    rpc.mockResolvedValue({ data: { ...f.resolution, receipt: {} }, error: null });
    await post(f, '/anular/resolver').expect(503); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['', '/recibo', '/resolver'])('rechaza el cambio de empresa, actor o fuente antes de anular%s', async suffix => {
    const f = fixtures[0];
    for (const field of ['tenant_id', 'actor_id', 'source_operation_id']) {
      const body: any = envelope(f); body.expected_scope[field] = other;
      await post(f, '/anular' + suffix, body).expect(409);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('una sesión distinta rechaza la intención anterior antes de tocar la base', async () => {
    const f = fixtures[0]; identity = { ...f.context, actorId: other };
    await post(f).expect(409); expect(rpc).not.toHaveBeenCalled();
  });
  it('lector puede ver el traslado y no puede anular, recuperar ni resolver', async () => {
    const f = fixtures[0]; createAllowed = false; rpc.mockResolvedValue({ data: f.detail, error: null });
    await get(f).expect(200).expect('Cache-Control', 'no-store');
    for (const suffix of ['/anular', '/anular/recibo', '/anular/resolver']) await post(f, suffix).expect(403);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('crear permite recuperar el recibo propio sin conceder lectura general', async () => {
    const f = fixtures[0]; readAllowed = false; rpc.mockResolvedValue({ data: f.detail, error: null });
    await get(f).expect(403); await post(f, '/anular/recibo').expect(200);
    expect(rpc.mock.calls[0]).toEqual(['consultar_transferencia_inventario_613', {
      p_tenant_id: f.context.tenantId, p_actor_id: f.context.actorId, p_operacion_id: f.context.operationId, p_idempotency_key: f.context.key,
    }]);
  });
  it('consulta el origen con permiso de lectura y sin clave de anulación', async () => {
    const f = fixtures[0]; rpc.mockResolvedValue({ data: f.detail, error: null });
    const response = await get(f).expect(200);
    expect(response.body.data.reversal_check).toEqual({ valuation_confirmed: true, already_reversed: true, blocked_reason: null });
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBeNull();
    expect(permissions.checkUserPermission).toHaveBeenCalledWith(f.context.actorId, f.context.tenantId, 'inventario', 'read', 'movimientos');
  });
  it.each([null, 'PENDIENTE_COSTO', 'PENDIENTE_MONEDA', 'PENDIENTE_MONEDA_BASE', 'PENDIENTE_TIPO_CAMBIO'])('muestra origen bloqueado con valuación %s sin inventar importes', async state => {
    const f = fixtures[0], detail = clone(f.detail); detail.reversa = null;
    for (const leg of ['movimiento_salida', 'movimiento_entrada']) {
      detail[leg].valuacion_estado = state; detail[leg].costo_unitario = null; detail[leg].valor_total = null;
    }
    rpc.mockResolvedValue({ data: detail, error: null });
    const response = await get(f).expect(200);
    expect(response.body.data.reversal_check.valuation_confirmed).toBe(false);
    expect(response.body.data.reversal_check.blocked_reason).toMatch(/pendiente/);
    expect(response.body.data.movimiento_salida).not.toHaveProperty('costo_unitario');
    expect(response.body.data.movimiento_entrada).not.toHaveProperty('valor_total');
  });
  it('la vista previa tampoco acepta una pierna ausente o cacheada', async () => {
    const f = fixtures[0], detail = clone(f.detail); detail.movimiento_entrada.cached = true;
    rpc.mockResolvedValue({ data: detail, error: null }); await get(f).expect(503);
  });
  it.each([
    ['42501', 'controlled', 403], ['P0002', 'INVENTORY_TRANSFER_NOT_FOUND', 404],
    ['23505', 'INVENTORY_TRANSFER_ALREADY_REVERSED', 409], ['40001', 'INVENTORY_REVERSAL_ABANDONED', 409],
    ['23514', 'INVENTORY_TRANSFER_REVERSE_GRE_REQUIRED', 400], ['23514', 'INVENTORY_REVERSAL_WAREHOUSE_VALUATION_REQUIRED', 400],
    ['23514', 'Unknown invariant', 503], ['PGRST202', 'Function unavailable', 503], ['XX000', 'Server failed', 503],
  ])('clasifica SQL%s sin exponer el mensaje interno: %s', async (code, message, status) => {
    rpc.mockResolvedValue({ data: null, error: { code, message } });
    const response = await post(fixtures[0]).expect(status as number);
    expect(rpc).toHaveBeenCalledTimes(1); expect(response.body.message).not.toContain(message);
    if (status === 400) expect(response.body.error).toBe('INVENTORY_NOT_APPLIED');
  });
  it('no presenta un error de lectura como prueba de que el writer no aplicó', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'INVENTORY_REVERSAL_WAREHOUSE_VALUATION_REQUIRED' } });
    const response = await post(fixtures[0], '/anular/recibo').expect(503);
    expect(response.body.error).not.toBe('INVENTORY_NOT_APPLIED');
  });
  it('rechaza UUID, campos extra y motivo inválidos antes de la RPC', async () => {
    const f = fixtures[0];
    await request(app.getHttpServer()).post('/api/inventario/transferencias/no-uuid/anular').set('Authorization', 'Bearer fixture613').send(envelope(f)).expect(400);
    await post(f, '/anular', { ...envelope(f), extra: true }).expect(400);
    const bad = envelope(f); bad.original.motivo = ' ';
    await post(f, '/anular', bad).expect(400); expect(rpc).not.toHaveBeenCalled();
  });
  it('conserva el guard de autenticación y el kill switch del módulo', async () => {
    const f = fixtures[0];
    await request(app.getHttpServer()).post(base(f) + '/anular').send(envelope(f)).expect(401);
    process.env.FEATURE_INVENTARIO_ENABLED = 'false';
    await get(f).expect(503); await post(f).expect(503); expect(rpc).not.toHaveBeenCalled();
  });
});
