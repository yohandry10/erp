/**
 * Tests E2E Reales - Outbox (DB + Worker lógico)
 *
 * Objetivo:
 * - Validar el flujo end-to-end mínimo: insertar → obtener pendientes → PROCESSING → COMPLETED
 * - Validar reintento/backoff: insertar → PROCESSING → error → PENDING + retry_count + next_retry_at
 *
 * Requisitos:
 * - Supabase local corriendo: `npx supabase start`
 * - Migraciones aplicadas: `npx supabase db reset`
 * - Variables:
 *   - SUPABASE_URL (default http://localhost:54321)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Ejecutar:
 * - npx ts-node --transpile-only apps/erp-api/tests/e2e/outbox-e2e.test.ts
 */

import assert from 'assert';
import { requireSupabaseAvailable } from './helpers/supabase-test-client';
import { TenantContextService } from '../../src/shared/tenant/tenant-context.service';
import { SupabaseService } from '../../src/shared/supabase/supabase.service';
import { OutboxService } from '../../src/shared/outbox/outbox.service';
import { OutboxWorker } from '../../src/shared/outbox/outbox-worker.service';

type AsyncTest = () => Promise<void>;

interface TestCase {
  name: string;
  fn: AsyncTest;
}

const tests: TestCase[] = [];

function test(name: string, fn: AsyncTest) {
  tests.push({ name, fn });
}

class TestEventBus {
  emit(type: string) {
    if (type === 'test.fail') {
      throw new Error('forced failure');
    }
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env requerida: ${name}`);
  return v;
}

test('E2E Outbox – worker procesa y marca COMPLETED', async () => {
  await requireSupabaseAvailable();
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const tenantContext = new TenantContextService();
  const supabaseService = new SupabaseService(tenantContext);
  const outboxService = new OutboxService(supabaseService);
  const worker = new OutboxWorker(
    supabaseService,
    outboxService,
    new TestEventBus() as any,
    tenantContext,
  );

  const tenantId = crypto.randomUUID();
  const aggregateId = crypto.randomUUID();

  // Seed tenant (best-effort)
  await supabaseService.getPublicClient().from('tenants').insert({
    id: tenantId,
    nombre: 'Tenant Outbox E2E',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  const eventId = tenantContext.run(
    { tenantId, userId: 'e2e', isSuperAdmin: false },
    async () =>
      outboxService.persistEventStandard({
        tenantId,
        eventType: 'test.ok',
        aggregateType: 'test',
        aggregateId,
        eventData: { ok: true },
      }),
  );

  const insertedEventId = await eventId;
  assert.ok(insertedEventId, 'Debe devolver event_id');

  const res = await worker.processPendingEventsManual(10);
  assert.ok(res.processed >= 1, 'Debe procesar al menos 1 evento');
  assert.strictEqual(res.failed, 0, 'No debe fallar');

  // Buscar por event_id (no por PK) para compatibilidad
  const { data: row, error } = await supabaseService
    .getPublicClient()
    .from('outbox_events')
    .select('id,event_id,status,processed_at,retry_count,next_retry_at,error_message')
    .eq('event_id', insertedEventId)
    .single();

  assert.ok(!error, `Debe poder leer el evento insertado: ${error?.message}`);
  assert.strictEqual(row.status, 'COMPLETED', 'Estado debe ser COMPLETED');
  assert.ok(row.processed_at, 'processed_at debe existir');
  assert.strictEqual(row.retry_count ?? 0, 0, 'retry_count debe ser 0');
});

test('E2E Outbox – error marca PENDING + retry_count + next_retry_at', async () => {
  await requireSupabaseAvailable();
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const tenantContext = new TenantContextService();
  const supabaseService = new SupabaseService(tenantContext);
  const outboxService = new OutboxService(supabaseService);
  const worker = new OutboxWorker(
    supabaseService,
    outboxService,
    new TestEventBus() as any,
    tenantContext,
  );

  const tenantId = crypto.randomUUID();
  const aggregateId = crypto.randomUUID();

  await supabaseService.getPublicClient().from('tenants').insert({
    id: tenantId,
    nombre: 'Tenant Outbox E2E (fail)',
    ruc: `20${(Date.now() + 1).toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  const insertedEventId = await tenantContext.run(
    { tenantId, userId: 'e2e', isSuperAdmin: false },
    async () =>
      outboxService.persistEventStandard({
        tenantId,
        eventType: 'test.fail',
        aggregateType: 'test',
        aggregateId,
        eventData: { ok: false },
      }),
  );

  const res = await worker.processPendingEventsManual(10);
  assert.ok(res.failed >= 1, 'Debe marcar al menos 1 como fallido');

  const { data: row, error } = await supabaseService
    .getPublicClient()
    .from('outbox_events')
    .select('id,event_id,status,processed_at,retry_count,next_retry_at,error_message')
    .eq('event_id', insertedEventId)
    .single();

  assert.ok(!error, `Debe poder leer el evento insertado: ${error?.message}`);
  assert.strictEqual(row.status, 'PENDING', 'Debe volver a PENDING para reintento');
  assert.ok(!row.processed_at, 'processed_at debe seguir NULL');
  assert.ok((row.retry_count ?? 0) >= 1, 'retry_count debe incrementarse');
  assert.ok(row.next_retry_at, 'next_retry_at debe programarse');
  assert.ok(row.error_message, 'error_message debe guardarse');
});

async function run() {
  await requireSupabaseAvailable();

  for (const t of tests) {
    try {
      console.log(`\n🧪 ${t.name}`);
      await t.fn();
      console.log(`✅ PASS: ${t.name}`);
    } catch (err: any) {
      console.error(`❌ FAIL: ${t.name}`);
      console.error(err?.stack || err?.message || err);
      process.exitCode = 1;
    }
  }
}

void run();
