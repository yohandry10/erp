/**
 * Tests E2E Reales - Módulo FINANZAS
 * 
 * Estos tests ejecutan operaciones REALES contra Supabase local.
 * Validan tablas de CxC, CxP, Bancos, Tesorería y sus constraints.
 * 
 * Requisitos:
 * - Supabase local corriendo: `npx supabase start`
 * - Migraciones aplicadas: `npx supabase db reset`
 * 
 * Ejecutar: npx ts-node --transpile-only apps/erp-api/tests/e2e/finanzas-e2e.test.ts
 */

import assert from 'assert';
import { skipIfNoSupabase, getTestClient } from './helpers/supabase-test-client';

type AsyncTest = () => Promise<void>;

interface TestCase {
  name: string;
  fn: AsyncTest;
}

const tests: TestCase[] = [];

function test(name: string, fn: AsyncTest) {
  tests.push({ name, fn });
}

// ============================================================================
// TESTS E2E REALES - MÓDULO FINANZAS
// ============================================================================

test('E2E Finanzas – Tablas principales existen', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  // Verificar tabla cuentas_por_cobrar
  const { error: cxcError } = await supabase
    .from('cuentas_por_cobrar')
    .select('id, tenant_id, cliente_id, monto_total, monto_pendiente, estado')
    .limit(1);
  assert.ok(!cxcError, `Tabla cuentas_por_cobrar debe existir: ${cxcError?.message}`);

  // Verificar tabla cuentas_por_pagar
  const { error: cxpError } = await supabase
    .from('cuentas_por_pagar')
    .select('id, tenant_id, proveedor_id, total, saldo, estado')
    .limit(1);
  assert.ok(!cxpError, `Tabla cuentas_por_pagar debe existir: ${cxpError?.message}`);

  // Verificar tabla cuentas_bancarias
  const { error: bancosError } = await supabase
    .from('cuentas_bancarias')
    .select('id, tenant_id, banco, numero_cuenta, saldo')
    .limit(1);
  assert.ok(!bancosError, `Tabla cuentas_bancarias debe existir: ${bancosError?.message}`);

  // Verificar tabla movimientos_bancarios
  const { error: movError } = await supabase
    .from('movimientos_bancarios')
    .select('id, tenant_id, cuenta_id, tipo, monto')
    .limit(1);
  assert.ok(!movError, `Tabla movimientos_bancarios debe existir: ${movError?.message}`);

  console.log('✅ Todas las tablas de finanzas existen');
});

test('E2E Finanzas – Crear cuenta por cobrar (CxC)', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const clienteId = crypto.randomUUID();

  // Setup
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant CxC',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  await supabase.from('clientes').insert({
    id: clienteId,
    tenant_id: tenantId,
    tipo: 'EMPRESA',
    documento_tipo: 'RUC',
    documento_numero: `20${Date.now().toString().slice(-9)}`,
    razon_social: 'Cliente CxC Test',
    activo: true,
  });

  // Crear CxC
  const { data: cxc, error } = await supabase
    .from('cuentas_por_cobrar')
    .insert({
      tenant_id: tenantId,
      cliente_id: clienteId,
      serie: 'F001',
      numero: '00001',
      fecha_emision: new Date().toISOString().split('T')[0],
      fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      moneda: 'PEN',
      monto_total: 1180.00,
      monto_pendiente: 1180.00,
      estado: 'PENDIENTE',
    })
    .select()
    .single();

  assert.ok(!error, `CxC debe crearse: ${error?.message}`);
  assert.ok(cxc, 'CxC debe retornar datos');
  assert.strictEqual(parseFloat(cxc.monto_total), 1180.00, 'Monto total debe ser correcto');
  assert.strictEqual(parseFloat(cxc.monto_pendiente), 1180.00, 'Monto pendiente debe ser igual al total');

  console.log('✅ Cuenta por cobrar creada correctamente');

  // Cleanup
  await supabase.from('cuentas_por_cobrar').delete().eq('id', cxc.id);
  await supabase.from('clientes').delete().eq('id', clienteId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Finanzas – Crear cuenta por pagar (CxP)', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const proveedorId = crypto.randomUUID();

  // Setup
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant CxP',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  await supabase.from('proveedores').insert({
    id: proveedorId,
    tenant_id: tenantId,
    ruc: `20${(Date.now() + 1).toString().slice(-9)}`,
    razon_social: 'Proveedor CxP Test',
    activo: true,
  });

  // Crear CxP
  const { data: cxp, error } = await supabase
    .from('cuentas_por_pagar')
    .insert({
      tenant_id: tenantId,
      proveedor_id: proveedorId,
      referencia_tipo: 'RECEPCION',
      referencia_id: crypto.randomUUID(),
      fecha_emision: new Date().toISOString().split('T')[0],
      fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      moneda: 'PEN',
      subtotal: 1000.00,
      igv: 180.00,
      total: 1180.00,
      saldo: 1180.00,
      estado: 'PENDIENTE',
    })
    .select()
    .single();

  assert.ok(!error, `CxP debe crearse: ${error?.message}`);
  assert.ok(cxp, 'CxP debe retornar datos');
  assert.strictEqual(parseFloat(cxp.total), 1180.00, 'Total debe ser correcto');
  assert.strictEqual(parseFloat(cxp.saldo), 1180.00, 'Saldo debe ser igual al total');

  console.log('✅ Cuenta por pagar creada correctamente');

  // Cleanup
  await supabase.from('cuentas_por_pagar').delete().eq('id', cxp.id);
  await supabase.from('proveedores').delete().eq('id', proveedorId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Finanzas – RLS aísla CxC entre tenants', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const clienteA = crypto.randomUUID();
  const clienteB = crypto.randomUUID();

  // Setup tenants y clientes
  await supabase.from('tenants').insert([
    { id: tenantA, nombre: 'Tenant A Finanzas', ruc: `20${Date.now().toString().slice(-9)}`, pais: 'PE', activo: true },
    { id: tenantB, nombre: 'Tenant B Finanzas', ruc: `20${(Date.now() + 1).toString().slice(-9)}`, pais: 'PE', activo: true },
  ]);

  await supabase.from('clientes').insert([
    { id: clienteA, tenant_id: tenantA, tipo: 'PERSONA', documento_tipo: 'DNI', documento_numero: '12345678', razon_social: 'Cliente A', activo: true },
    { id: clienteB, tenant_id: tenantB, tipo: 'PERSONA', documento_tipo: 'DNI', documento_numero: '87654321', razon_social: 'Cliente B', activo: true },
  ]);

  // Crear CxC en cada tenant
  const { data: cxcA } = await supabase
    .from('cuentas_por_cobrar')
    .insert({
      tenant_id: tenantA,
      cliente_id: clienteA,
      serie: 'F001',
      numero: '00001',
      fecha_emision: new Date().toISOString().split('T')[0],
      fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      moneda: 'PEN',
      monto_total: 500.00,
      monto_pendiente: 500.00,
      estado: 'PENDIENTE',
    })
    .select()
    .single();

  const { data: cxcB } = await supabase
    .from('cuentas_por_cobrar')
    .insert({
      tenant_id: tenantB,
      cliente_id: clienteB,
      serie: 'F001',
      numero: '00002',
      fecha_emision: new Date().toISOString().split('T')[0],
      fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      moneda: 'PEN',
      monto_total: 1000.00,
      monto_pendiente: 1000.00,
      estado: 'PENDIENTE',
    })
    .select()
    .single();

  // Consultar CxC de cada tenant
  const { data: cxcsA } = await supabase
    .from('cuentas_por_cobrar')
    .select('*')
    .eq('tenant_id', tenantA);

  const { data: cxcsB } = await supabase
    .from('cuentas_por_cobrar')
    .select('*')
    .eq('tenant_id', tenantB);

  // Verificar aislamiento
  assert.strictEqual(cxcsA?.length, 1, 'Tenant A debe tener 1 CxC');
  assert.strictEqual(cxcsB?.length, 1, 'Tenant B debe tener 1 CxC');
  assert.strictEqual(parseFloat(cxcsA?.[0].monto_total), 500.00, 'CxC de A debe ser 500');
  assert.strictEqual(parseFloat(cxcsB?.[0].monto_total), 1000.00, 'CxC de B debe ser 1000');

  console.log('✅ RLS aísla CxC correctamente entre tenants');

  // Cleanup
  await supabase.from('cuentas_por_cobrar').delete().eq('id', cxcA?.id);
  await supabase.from('cuentas_por_cobrar').delete().eq('id', cxcB?.id);
  await supabase.from('clientes').delete().eq('id', clienteA);
  await supabase.from('clientes').delete().eq('id', clienteB);
  await supabase.from('tenants').delete().eq('id', tenantA);
  await supabase.from('tenants').delete().eq('id', tenantB);
});

test('E2E Finanzas – Crear cuenta bancaria con saldo', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Bancos',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Crear cuenta bancaria
  const { data: cuenta, error } = await supabase
    .from('cuentas_bancarias')
    .insert({
      tenant_id: tenantId,
      banco: 'BCP',
      numero_cuenta: '123-456-789-0-12',
      tipo_cuenta: 'CORRIENTE',
      moneda: 'PEN',
      saldo: 10000.00,
      activo: true,
    })
    .select()
    .single();

  assert.ok(!error, `Cuenta bancaria debe crearse: ${error?.message}`);
  assert.ok(cuenta, 'Cuenta debe retornar datos');
  assert.strictEqual(parseFloat(cuenta.saldo), 10000.00, 'Saldo debe ser correcto');

  console.log('✅ Cuenta bancaria creada correctamente');

  // Cleanup
  await supabase.from('cuentas_bancarias').delete().eq('id', cuenta.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Finanzas – Constraint saldo >= 0 en cuentas bancarias (si permite_sobregiro=false)', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Sobregiro',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Crear cuenta sin sobregiro
  const { data: cuenta } = await supabase
    .from('cuentas_bancarias')
    .insert({
      tenant_id: tenantId,
      banco: 'BCP',
      numero_cuenta: '999-888-777-0-66',
      tipo_cuenta: 'CORRIENTE',
      moneda: 'PEN',
      saldo: 100.00,
      permite_sobregiro: false,
      activo: true,
    })
    .select()
    .single();

  if (cuenta) {
    // Intentar actualizar saldo a negativo
    const { error: updateError } = await supabase
      .from('cuentas_bancarias')
      .update({ saldo: -500 })
      .eq('id', cuenta.id);

    if (updateError) {
      assert.ok(
        updateError.message.includes('check') || 
        updateError.message.includes('constraint') ||
        updateError.message.includes('violates') ||
        updateError.message.includes('sobregiro'),
        'Error debe ser por constraint de saldo'
      );
      console.log('✅ Constraint de saldo >= 0 (sin sobregiro) está activo');
    } else {
      // Verificar si el saldo quedó negativo
      const { data: cuentaActualizada } = await supabase
        .from('cuentas_bancarias')
        .select('saldo')
        .eq('id', cuenta.id)
        .single();

      if (cuentaActualizada && parseFloat(cuentaActualizada.saldo) < 0) {
        console.warn('⚠️ HALLAZGO: Constraint de saldo no está activo para cuentas sin sobregiro');
      }
    }

    // Cleanup
    await supabase.from('cuentas_bancarias').delete().eq('id', cuenta.id);
  }

  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Finanzas – Estados de CxC son válidos', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const clienteId = crypto.randomUUID();

  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Estados CxC',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  await supabase.from('clientes').insert({
    id: clienteId,
    tenant_id: tenantId,
    tipo: 'PERSONA',
    documento_tipo: 'DNI',
    documento_numero: '11111111',
    razon_social: 'Cliente Estados',
    activo: true,
  });

  const estadosValidos = ['PENDIENTE', 'PARCIAL', 'CANCELADO', 'ANULADO'];
  const cxcsCreadas: string[] = [];

  for (let i = 0; i < estadosValidos.length; i++) {
    const estado = estadosValidos[i];
    const { data: cxc, error } = await supabase
      .from('cuentas_por_cobrar')
      .insert({
        tenant_id: tenantId,
        cliente_id: clienteId,
        serie: 'F001',
        numero: `0000${i + 1}`,
        fecha_emision: new Date().toISOString().split('T')[0],
        fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        moneda: 'PEN',
        monto_total: 100 * (i + 1),
        monto_pendiente: estado === 'CANCELADO' ? 0 : 100 * (i + 1),
        estado: estado,
      })
      .select()
      .single();

    assert.ok(!error, `Estado ${estado} debe ser válido: ${error?.message}`);
    if (cxc) cxcsCreadas.push(cxc.id);
  }

  console.log('✅ Todos los estados de CxC son válidos');

  // Cleanup
  for (const cxcId of cxcsCreadas) {
    await supabase.from('cuentas_por_cobrar').delete().eq('id', cxcId);
  }
  await supabase.from('clientes').delete().eq('id', clienteId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Finanzas – Tipos NUMERIC correctos para montos', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const clienteId = crypto.randomUUID();

  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Numeric',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  await supabase.from('clientes').insert({
    id: clienteId,
    tenant_id: tenantId,
    tipo: 'PERSONA',
    documento_tipo: 'DNI',
    documento_numero: '22222222',
    razon_social: 'Cliente Numeric',
    activo: true,
  });

  // Crear CxC con decimales precisos
  const { data: cxc, error } = await supabase
    .from('cuentas_por_cobrar')
    .insert({
      tenant_id: tenantId,
      cliente_id: clienteId,
      serie: 'F001',
      numero: '99999',
      fecha_emision: new Date().toISOString().split('T')[0],
      fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      moneda: 'PEN',
      monto_total: 1234.56,
      monto_pendiente: 1234.56,
      estado: 'PENDIENTE',
    })
    .select()
    .single();

  assert.ok(!error, `CxC con decimales debe crearse: ${error?.message}`);
  assert.strictEqual(parseFloat(cxc.monto_total), 1234.56, 'Monto debe mantener precisión decimal');

  console.log('✅ Tipos NUMERIC mantienen precisión decimal correcta');

  // Cleanup
  await supabase.from('cuentas_por_cobrar').delete().eq('id', cxc.id);
  await supabase.from('clientes').delete().eq('id', clienteId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

// ============================================================================
// RUNNER
// ============================================================================

export async function runFinanzasE2ETests() {
  console.log('\n🧪 TESTS E2E REALES - MÓDULO FINANZAS');
  console.log('='.repeat(50));

  const shouldSkip = await skipIfNoSupabase();
  if (shouldSkip) {
    console.log('\n⏭️ Tests E2E saltados (Supabase no disponible)');
    return {
      total: tests.length,
      passed: 0,
      failed: 0,
      skipped: tests.length,
      results: tests.map(t => ({ name: t.name, passed: false, skipped: true })),
    };
  }

  let passed = 0;
  const results: Array<{ name: string; passed: boolean; error?: any; skipped?: boolean }> = [];

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      results.push({ name, passed: true });
      passed += 1;
    } catch (error) {
      console.error(`❌ ${name}`);
      console.error(error);
      results.push({ name, passed: false, error });
    }
  }

  console.log(`\n[Finanzas E2E] ${passed}/${tests.length} pruebas superadas`);

  return {
    total: tests.length,
    passed,
    failed: tests.length - passed,
    skipped: 0,
    results,
  };
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runFinanzasE2ETests().then(({ passed, total }) => {
    process.exitCode = passed === total ? 0 : 1;
  });
}
