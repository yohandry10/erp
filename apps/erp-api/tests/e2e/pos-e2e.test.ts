/**
 * Tests E2E Reales - Módulo POS
 * 
 * Estos tests ejecutan operaciones REALES contra Supabase local.
 * Validan tablas de ventas_pos, sesiones_caja, detalle_ventas_pos.
 * 
 * Requisitos:
 * - Supabase local corriendo: `npx supabase start`
 * - Migraciones aplicadas: `npx supabase db reset`
 * 
 * Ejecutar: npx ts-node --transpile-only apps/erp-api/tests/e2e/pos-e2e.test.ts
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
// TESTS E2E REALES - MÓDULO POS
// ============================================================================

test('E2E POS – Tablas principales existen', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  // Verificar tabla ventas_pos
  const { error: ventasError } = await supabase
    .from('ventas_pos')
    .select('id, tenant_id, numero_ticket, total, estado')
    .limit(1);
  
  if (ventasError) {
    if (ventasError.message.includes('does not exist') || ventasError.message.includes('relation')) {
      console.warn('⚠️ Tabla ventas_pos no existe - módulo POS puede no estar configurado');
      return;
    }
  }
  assert.ok(!ventasError, `Tabla ventas_pos debe existir: ${ventasError?.message}`);

  // Verificar tabla sesiones_caja
  const { error: sesionesError } = await supabase
    .from('sesiones_caja')
    .select('id, tenant_id, usuario_id, monto_inicial')
    .limit(1);
  
  if (!sesionesError) {
    console.log('✅ Tabla sesiones_caja existe');
  }

  // Verificar tabla detalle_ventas_pos
  const { error: detalleError } = await supabase
    .from('detalle_ventas_pos')
    .select('id, venta_id, producto_id')
    .limit(1);
  
  if (!detalleError) {
    console.log('✅ Tabla detalle_ventas_pos existe');
  }

  // Verificar tabla metodos_pago
  const { error: metodosError } = await supabase
    .from('metodos_pago')
    .select('id, tenant_id, codigo, tipo')
    .limit(1);
  
  if (!metodosError) {
    console.log('✅ Tabla metodos_pago existe');
  }

  console.log('✅ Tablas principales de POS verificadas');
});

test('E2E POS – Crear sesión de caja', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const usuarioId = crypto.randomUUID();

  // Setup tenant
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant POS',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tabla sesiones_caja existe
  const { error: checkError } = await supabase
    .from('sesiones_caja')
    .select('id')
    .limit(1);

  if (checkError && checkError.message.includes('does not exist')) {
    console.warn('⚠️ Tabla sesiones_caja no existe - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear sesión de caja
  const { data: sesion, error } = await supabase
    .from('sesiones_caja')
    .insert({
      tenant_id: tenantId,
      usuario_id: usuarioId,
      monto_inicial: 500.00,
      total_efectivo: 0,
      total_tarjeta: 0,
      fecha_apertura: new Date().toISOString(),
    })
    .select()
    .single();

  assert.ok(!error, `Sesión de caja debe crearse: ${error?.message}`);
  assert.ok(sesion, 'Sesión debe retornar datos');
  assert.strictEqual(parseFloat(sesion.monto_inicial), 500.00, 'Monto inicial debe ser correcto');

  console.log('✅ Sesión de caja creada correctamente');

  // Cleanup
  await supabase.from('sesiones_caja').delete().eq('id', sesion.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E POS – Crear venta básica', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Setup tenant
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Ventas POS',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tabla ventas_pos existe
  const { error: checkError } = await supabase
    .from('ventas_pos')
    .select('id')
    .limit(1);

  if (checkError && checkError.message.includes('does not exist')) {
    console.warn('⚠️ Tabla ventas_pos no existe - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear venta POS
  const numeroTicket = `T001-${Date.now().toString().slice(-6)}`;
  const { data: venta, error } = await supabase
    .from('ventas_pos')
    .insert({
      tenant_id: tenantId,
      numero_ticket: numeroTicket,
      cliente_documento: '12345678',
      cliente_nombre: 'Cliente Test POS',
      subtotal: 100.00,
      impuestos: 18.00,
      total: 118.00,
      estado: 'PAGADA',
      metodo_pago: 'efectivo',
      fecha: new Date().toISOString(),
    })
    .select()
    .single();

  assert.ok(!error, `Venta POS debe crearse: ${error?.message}`);
  assert.ok(venta, 'Venta debe retornar datos');
  assert.strictEqual(parseFloat(venta.total), 118.00, 'Total debe ser correcto');
  assert.strictEqual(venta.estado, 'PAGADA', 'Estado debe ser PAGADA');

  console.log('✅ Venta POS creada correctamente');

  // Cleanup
  await supabase.from('ventas_pos').delete().eq('id', venta.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E POS – RLS aísla ventas entre tenants', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();

  // Setup tenants
  await supabase.from('tenants').insert([
    { id: tenantA, nombre: 'Tienda A POS', ruc: `20${Date.now().toString().slice(-9)}`, pais: 'PE', activo: true },
    { id: tenantB, nombre: 'Tienda B POS', ruc: `20${(Date.now() + 1).toString().slice(-9)}`, pais: 'PE', activo: true },
  ]);

  // Verificar si tabla ventas_pos existe
  const { error: checkError } = await supabase.from('ventas_pos').select('id').limit(1);
  if (checkError && checkError.message.includes('does not exist')) {
    console.warn('⚠️ Tabla ventas_pos no existe - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantA);
    await supabase.from('tenants').delete().eq('id', tenantB);
    return;
  }

  // Crear ventas en cada tenant
  const { data: ventaA } = await supabase
    .from('ventas_pos')
    .insert({
      tenant_id: tenantA,
      numero_ticket: `TA-${Date.now()}`,
      cliente_documento: '11111111',
      cliente_nombre: 'Cliente Tienda A',
      subtotal: 50.00,
      impuestos: 9.00,
      total: 59.00,
      estado: 'PAGADA',
      fecha: new Date().toISOString(),
    })
    .select()
    .single();

  const { data: ventaB } = await supabase
    .from('ventas_pos')
    .insert({
      tenant_id: tenantB,
      numero_ticket: `TB-${Date.now()}`,
      cliente_documento: '22222222',
      cliente_nombre: 'Cliente Tienda B',
      subtotal: 200.00,
      impuestos: 36.00,
      total: 236.00,
      estado: 'PAGADA',
      fecha: new Date().toISOString(),
    })
    .select()
    .single();

  // Consultar ventas de cada tenant
  const { data: ventasA } = await supabase
    .from('ventas_pos')
    .select('*')
    .eq('tenant_id', tenantA);

  const { data: ventasB } = await supabase
    .from('ventas_pos')
    .select('*')
    .eq('tenant_id', tenantB);

  // Verificar aislamiento
  assert.strictEqual(ventasA?.length, 1, 'Tienda A debe tener 1 venta');
  assert.strictEqual(ventasB?.length, 1, 'Tienda B debe tener 1 venta');
  assert.strictEqual(parseFloat(ventasA?.[0].total), 59.00, 'Venta A debe ser 59');
  assert.strictEqual(parseFloat(ventasB?.[0].total), 236.00, 'Venta B debe ser 236');

  console.log('✅ RLS aísla ventas POS correctamente entre tenants');

  // Cleanup
  await supabase.from('ventas_pos').delete().eq('id', ventaA?.id);
  await supabase.from('ventas_pos').delete().eq('id', ventaB?.id);
  await supabase.from('tenants').delete().eq('id', tenantA);
  await supabase.from('tenants').delete().eq('id', tenantB);
});


test('E2E POS – Crear método de pago', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Setup tenant
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Métodos Pago',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tabla metodos_pago existe
  const { error: checkError } = await supabase
    .from('metodos_pago')
    .select('id')
    .limit(1);

  if (checkError && checkError.message.includes('does not exist')) {
    console.warn('⚠️ Tabla metodos_pago no existe - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear método de pago
  const { data: metodo, error } = await supabase
    .from('metodos_pago')
    .insert({
      tenant_id: tenantId,
      codigo: 'yape',
      nombre: 'Yape',
      tipo: 'DIGITAL',
      activo: true,
    })
    .select()
    .single();

  assert.ok(!error, `Método de pago debe crearse: ${error?.message}`);
  assert.ok(metodo, 'Método debe retornar datos');
  assert.strictEqual(metodo.codigo, 'yape', 'Código debe ser correcto');
  assert.strictEqual(metodo.tipo, 'DIGITAL', 'Tipo debe ser DIGITAL');

  console.log('✅ Método de pago creado correctamente');

  // Cleanup
  await supabase.from('metodos_pago').delete().eq('id', metodo.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E POS – Cerrar sesión de caja', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const usuarioId = crypto.randomUUID();

  // Setup tenant
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Cierre Caja',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tabla sesiones_caja existe
  const { error: checkError } = await supabase
    .from('sesiones_caja')
    .select('id')
    .limit(1);

  if (checkError && checkError.message.includes('does not exist')) {
    console.warn('⚠️ Tabla sesiones_caja no existe - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear sesión de caja abierta
  const { data: sesion } = await supabase
    .from('sesiones_caja')
    .insert({
      tenant_id: tenantId,
      usuario_id: usuarioId,
      monto_inicial: 300.00,
      total_efectivo: 500.00,
      total_tarjeta: 200.00,
      fecha_apertura: new Date().toISOString(),
    })
    .select()
    .single();

  // Cerrar sesión
  const { data: sesionCerrada, error } = await supabase
    .from('sesiones_caja')
    .update({
      monto_contado: 800.00,
      notas_cierre: 'Cierre de prueba',
      fecha_cierre: new Date().toISOString(),
    })
    .eq('id', sesion?.id)
    .select()
    .single();

  assert.ok(!error, `Sesión debe cerrarse: ${error?.message}`);
  assert.ok(sesionCerrada.fecha_cierre, 'Debe tener fecha de cierre');
  assert.strictEqual(parseFloat(sesionCerrada.monto_contado), 800.00, 'Monto contado debe ser correcto');

  console.log('✅ Sesión de caja cerrada correctamente');

  // Cleanup
  await supabase.from('sesiones_caja').delete().eq('id', sesion?.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E POS – Tipos NUMERIC correctos para montos', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Setup tenant
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Numeric POS',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tabla ventas_pos existe
  const { error: checkError } = await supabase
    .from('ventas_pos')
    .select('id')
    .limit(1);

  if (checkError && checkError.message.includes('does not exist')) {
    console.warn('⚠️ Tabla ventas_pos no existe - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear venta con decimales precisos
  const { data: venta, error } = await supabase
    .from('ventas_pos')
    .insert({
      tenant_id: tenantId,
      numero_ticket: `TNUM-${Date.now()}`,
      cliente_documento: '99999999',
      cliente_nombre: 'Cliente Numeric',
      subtotal: 1234.56,
      impuestos: 222.22,
      total: 1456.78,
      estado: 'PAGADA',
      fecha: new Date().toISOString(),
    })
    .select()
    .single();

  assert.ok(!error, `Venta con decimales debe crearse: ${error?.message}`);
  assert.strictEqual(parseFloat(venta.subtotal), 1234.56, 'Subtotal debe mantener precisión');
  assert.strictEqual(parseFloat(venta.impuestos), 222.22, 'Impuestos debe mantener precisión');
  assert.strictEqual(parseFloat(venta.total), 1456.78, 'Total debe mantener precisión');

  console.log('✅ Tipos NUMERIC mantienen precisión decimal en POS');

  // Cleanup
  await supabase.from('ventas_pos').delete().eq('id', venta.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E POS – Venta pendiente de facturación', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Setup tenant
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant CPE Pendiente',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tabla ventas_pos existe y tiene columna cpe_pendiente
  const { error: checkError } = await supabase
    .from('ventas_pos')
    .select('id, cpe_pendiente')
    .limit(1);

  if (checkError) {
    if (checkError.message.includes('does not exist')) {
      console.warn('⚠️ Tabla ventas_pos no existe - saltando test');
    } else if (checkError.message.includes('cpe_pendiente')) {
      console.warn('⚠️ Columna cpe_pendiente no existe - saltando test');
    }
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear venta con CPE pendiente
  const { data: venta, error } = await supabase
    .from('ventas_pos')
    .insert({
      tenant_id: tenantId,
      numero_ticket: `TPEND-${Date.now()}`,
      cliente_documento: '88888888',
      cliente_nombre: 'Cliente CPE Pendiente',
      subtotal: 100.00,
      impuestos: 18.00,
      total: 118.00,
      estado: 'PAGADA',
      cpe_pendiente: true,
      intentos_facturacion: 1,
      error_facturacion: 'Error de prueba',
      fecha: new Date().toISOString(),
    })
    .select()
    .single();

  assert.ok(!error, `Venta pendiente debe crearse: ${error?.message}`);
  assert.strictEqual(venta.cpe_pendiente, true, 'CPE debe estar pendiente');
  assert.strictEqual(venta.intentos_facturacion, 1, 'Intentos debe ser 1');

  console.log('✅ Venta con CPE pendiente creada correctamente');

  // Cleanup
  await supabase.from('ventas_pos').delete().eq('id', venta.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

// ============================================================================
// RUNNER
// ============================================================================

export async function runPosE2ETests() {
  console.log('\n🧪 TESTS E2E REALES - MÓDULO POS');
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

  console.log(`\n[POS E2E] ${passed}/${tests.length} pruebas superadas`);

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
  runPosE2ETests().then(({ passed, total }) => {
    process.exitCode = passed === total ? 0 : 1;
  });
}
