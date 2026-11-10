import fs from 'node:fs';import path from 'node:path';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';import { JwtService } from '@nestjs/jwt';import request from 'supertest';
import { RecepcionesController } from '../controllers/recepciones.controller';
import { RecepcionesService } from './recepciones.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { AuditService } from '../../audit/audit.service';
import { CacheInvalidationService } from '../../../shared/cache/cache-invalidation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

// Real Nest routing, ValidationPipe and PermissionGuard; authentication and
// Supabase transport are substituted. SQL behavior has separate local evidence.
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'receipt-reversal.fixture.json'), 'utf8'));
const physical = () => JSON.parse(JSON.stringify(vectors.find(v => v.name === 'physical')));
const envelope = (v: any) => ({ expected_scope: { tenant_id: v.context.tenantId, actor_id: v.context.actorId, source_operation_id: v.context.receiptId },
  original: { ...v.context.body, idempotency_key: v.context.key } });
const base = (v: any) => `/api/compras/recepciones/${v.context.receiptId}`;
const other = '61600000-0000-4000-8000-000000000099';

describe('Anulación de recepción: frontera HTTP local', () => {
  let app: INestApplication, identity: any, allowed = true;
  const rpc = jest.fn(), from = jest.fn(() => { throw new Error('No direct table access'); });
  const invalidate = jest.fn().mockResolvedValue(undefined);
  const permissions = { checkUserPermission: jest.fn(async (_actor, _tenant, module, action, resource) =>
    allowed && module === 'compras' && action === 'cerrar' && resource === 'recepciones') };
  beforeAll(async () => {
    const guard = new PermissionGuard(new Reflector(), permissions as any, new JwtService(), new ConfigService(), new TenantContextService());
    const module = await Test.createTestingModule({ controllers: [RecepcionesController], providers: [RecepcionesService,
      { provide: SupabaseService, useValue: { getClient: () => ({ rpc, from }) } },
      { provide: AuditService, useValue: {} },
      { provide: CacheInvalidationService, useValue: { onInventarioUpdated: invalidate } },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      if (req.headers.authorization !== 'Bearer fixture616') throw new UnauthorizedException();
      req.user = { id: identity.actorId, tenant_id: identity.tenantId };return true;
    } }).overrideGuard(PermissionGuard).useValue(guard).compile();
    app = module.createNestApplication();app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => { identity = physical().context;allowed = true;rpc.mockReset();from.mockClear();invalidate.mockClear();permissions.checkUserPermission.mockClear(); });
  afterAll(async () => { await app?.close(); });
  const post = (v: any, suffix = '/anular', body = envelope(v)) => request(app.getHttpServer()).post(base(v) + suffix).set('Authorization', 'Bearer fixture616').send(body);

  it.each(vectors.filter(v => v.receipt))('anula $name sólo tras cotejar ledger e inventario completo', async v => {
    identity = v.context;rpc.mockResolvedValueOnce({ data: v.receipt, error: null }).mockResolvedValueOnce({ data: v.detail, error: null });
    const response = await post(v).expect(200).expect('Cache-Control', 'no-store');
    expect(response.body.data.operation_identity).toMatchObject({ type: 'RECEPCION_REVERSA', tenant_id: v.context.tenantId, actor_id: v.context.actorId,
      source_operation_id: v.context.receiptId, idempotency_key: v.context.key });
    expect(response.body.data.contabilidad.estado).toBe('PENDIENTE');
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['revertir_recepcion_inventario_615', 'consultar_reversa_recepcion_616']);
    expect(rpc.mock.calls[0][1]).toEqual({ p_tenant_id: v.context.tenantId, p_actor_id: v.context.actorId, p_recepcion_id: v.context.receiptId,
      p_idempotency_key: v.context.key, p_payload: v.context.body });
    expect(invalidate).toHaveBeenCalledWith(v.context.tenantId);expect(from).not.toHaveBeenCalled();
  });
  it('recupera una respuesta perdida sin repetir el writer ni cerrar la clave', async () => {
    const v = physical();rpc.mockRejectedValueOnce(new Error('Controlled transport loss'));
    await post(v).expect(503);expect(rpc).toHaveBeenCalledTimes(1);expect(invalidate).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: v.detail, error: null });
    const response = await post(v, '/anular/recibo').expect(200).expect('Cache-Control', 'no-store');
    expect(response.body.data.idempotent).toBe(true);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['revertir_recepcion_inventario_615', 'consultar_reversa_recepcion_616']);
  });
  it('mantiene desconocido el commit si falla su lectura posterior', async () => {
    const v = physical();rpc.mockResolvedValueOnce({ data: v.receipt, error: null }).mockRejectedValueOnce(new Error('Read transport loss'));
    await post(v).expect(503);expect(rpc).toHaveBeenCalledTimes(2);expect(invalidate).not.toHaveBeenCalled();
  });
  it.each([null, {}, { reversa: null }])('una lectura incompleta no autoriza abandono: %#', async detail => {
    const v = physical();rpc.mockResolvedValueOnce({ data: detail, error: null });await post(v, '/anular/recibo').expect(503);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['consultar_reversa_recepcion_616']);
  });
  it.each(vectors)('resuelve $name con el resultado durable original', async v => {
    identity = v.context;rpc.mockResolvedValueOnce({ data: v.resolution, error: null });
    const response = await post(v, '/anular/resolver').expect(200).expect('Cache-Control', 'no-store');
    expect(response.body.data.status).toBe(v.resolution.status);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['resolver_reversa_recepcion_616']);
    expect(from).not.toHaveBeenCalled();
  });
  it.each(['/anular', '/anular/recibo', '/anular/resolver'])('deniega %s sin permiso vigente', async suffix => {
    allowed = false;await post(physical(), suffix).expect(403);expect(rpc).not.toHaveBeenCalled();
  });
  it('exige autenticación antes de consultar el pendiente', async () => {
    const v = physical();await request(app.getHttpServer()).post(base(v) + '/anular/recibo').send(envelope(v)).expect(401);expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['tenant_id', 'actor_id', 'source_operation_id'])('rechaza scope distinto: %s', async field => {
    const v = physical(), body = envelope(v);body.expected_scope[field] = other;
    await post(v, '/anular', body).expect(409);expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['campo adicional', b => { b.original.cantidad = 1; }], ['fecha inválida', b => { b.original.fecha_contable = '2026-02-30'; }],
    ['sin fecha', b => { delete b.original.fecha_contable; }], ['sin motivo', b => { delete b.original.motivo; }],
    ['sin clave', b => { delete b.original.idempotency_key; }], ['clave corta', b => { b.original.idempotency_key = 'short'; }],
    ['sin scope', b => { delete b.expected_scope; }], ['scope adicional', b => { b.expected_scope.admin = true; }],
  ] as Array<[string, (b: any) => void]>)('valida %s sin llamar SQL', async (_name, mutate) => {
    const v = physical(), body = envelope(v);mutate(body);await post(v, '/anular', body).expect(400);expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['23514', 'RECEIPT_REVERSAL_INVOICE_EXISTS', 400], ['23514', 'RECEIPT_REVERSAL_SUPPLIER_RETURN_EXISTS', 400],
    ['55000', 'ACCOUNTING_PERIOD_NOT_OPEN:2026-11:CERRADO', 400], ['23514', 'INVENTORY_REVERSAL_WAREHOUSE_VALUATION_REQUIRED', 400],
    ['42501', 'REFUND_REVERSAL_ACTOR_NOT_ACTIVE_IN_TENANT', 403], ['P0002', 'RECEIPT_REVERSAL_NOT_FOUND', 404],
    ['23505', 'RECEIPT_ALREADY_REVERSED', 409], ['40001', 'INVENTORY_REVERSAL_ABANDONED', 409], ['XX000', 'Controlled database failure', 503],
  ])('conserva el fallo SQL %s/%s', async (code, message, status) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code, message } });await post(physical()).expect(Number(status));
    expect(rpc).toHaveBeenCalledTimes(1);expect(invalidate).not.toHaveBeenCalled();
  });
  it('rechaza movimientos opuestos incompletos aunque el ACK afirme éxito', async () => {
    const v = physical();v.detail.movimientos_reversa.pop();rpc.mockResolvedValueOnce({ data: v.receipt, error: null }).mockResolvedValueOnce({ data: v.detail, error: null });
    await post(v).expect(503);expect(rpc).toHaveBeenCalledTimes(2);expect(invalidate).not.toHaveBeenCalled();
  });
});
