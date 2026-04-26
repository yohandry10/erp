/**
 * Tests E2E Reales - RLS/GRANTS para rol anon
 *
 * Requisitos:
 * - Supabase local corriendo: `npx supabase start`
 * - Migraciones aplicadas: `npx supabase db reset`
 * - Variables:
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SUPABASE_ANON_KEY
 *
 * Ejecutar:
 * - npx ts-node --transpile-only apps/erp-api/tests/e2e/rls-anon-e2e.test.ts
 */

import assert from 'assert';
import { createClient } from '@supabase/supabase-js';
import { getTestClient, skipIfNoSupabase } from './helpers/supabase-test-client';

type AsyncTest = () => Promise<void>;

interface TestCase {
  name: string;
  fn: AsyncTest;
}

const tests: TestCase[] = [];

function test(name: string, fn: AsyncTest) {
  tests.push({ name, fn });
}

test('E2E RLS/GRANTS – anon no debe poder leer tablas de auth/roles', async () => {
  if (await skipIfNoSupabase()) return;

  const supabaseServiceRole = getTestClient().getClient();
  const url = process.env.SUPABASE_URL || 'http://localhost:54321';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  if (!anonKey) {
    console.warn('⚠️ SUPABASE_ANON_KEY no configurada. Saltando test de anon.');
    return;
  }

  const supabaseAnon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tenantId = crypto.randomUUID();
  const roleId = crypto.randomUUID();
  const userEmail = `anon-test-${Date.now()}@example.com`;

  // 1) Seed mínimo con service_role
  await supabaseServiceRole.from('tenants').insert({
    id: tenantId,
    nombre: 'Tenant RLS anon',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  const { error: roleError } = await supabaseServiceRole.from('roles').insert({
    id: roleId,
    tenant_id: tenantId,
    nombre: 'ROL_TEST_ANON',
    descripcion: 'Role seed para test anon',
    is_system_role: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (roleError) {
    console.warn('⚠️ No se pudo insertar role seed (puede ser por schema/RLS):', roleError.message);
  }

  // Crear usuario de auth + fila en usuarios_sistema + user_roles
  const { data: authUser, error: authCreateError } = await supabaseServiceRole.auth.admin.createUser({
    email: userEmail,
    password: 'Password-12345',
    email_confirm: true,
    user_metadata: { tenant_id: tenantId, nombre: 'User Anon Seed' },
  });

  if (authCreateError || !authUser?.user?.id) {
    console.warn('⚠️ No se pudo crear usuario auth (saltando seed usuarios_sistema):', authCreateError?.message);
  } else {
    const userId = authUser.user.id;
    await supabaseServiceRole.from('usuarios_sistema').insert({
      id: userId,
      tenant_id: tenantId,
      nombre: 'User Anon Seed',
      email: userEmail,
      telefono: null,
      estado: 'ACTIVO',
      activo: true,
      fecha_ultimo_acceso: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await supabaseServiceRole.from('user_roles').insert({
      usuario_sistema_id: userId,
      role_id: roleId,
      created_at: new Date().toISOString(),
    });
  }

  // 2) Verificar que anon NO lee filas (error o 0 rows)
  const targets = [
    { table: 'usuarios_sistema', select: 'id,tenant_id,email' },
    { table: 'user_roles', select: 'usuario_sistema_id,role_id' },
    { table: 'roles', select: 'id,tenant_id,nombre' },
  ] as const;

  for (const t of targets) {
    const { data, error } = await supabaseAnon.from(t.table).select(t.select).limit(5);

    if (error) {
      console.log(`✅ anon no puede leer ${t.table}:`, error.message);
      continue;
    }

    const rows = Array.isArray(data) ? data.length : 0;
    assert.strictEqual(rows, 0, `anon pudo leer ${rows} filas de ${t.table}`);
  }

  // Cleanup best-effort
  try {
    if (authUser?.user?.id) {
      await supabaseServiceRole.from('user_roles').delete().eq('usuario_sistema_id', authUser.user.id);
      await supabaseServiceRole.from('usuarios_sistema').delete().eq('id', authUser.user.id);
      await supabaseServiceRole.auth.admin.deleteUser(authUser.user.id);
    }
  } catch {}

  try {
    await supabaseServiceRole.from('roles').delete().eq('id', roleId);
    await supabaseServiceRole.from('tenants').delete().eq('id', tenantId);
  } catch {}
});

async function run() {
  if (await skipIfNoSupabase()) return;
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

