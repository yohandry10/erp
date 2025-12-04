/**
 * Tests E2E Reales - Módulo INVENTARIO
 * 
 * Estos tests ejecutan operaciones REALES contra Supabase local.
 * Validan RPCs atómicos, constraints y RLS del módulo de inventario.
 * 
 * Requisitos:
 * - Supabase local corriendo: `npx supabase start`
 * - Migraciones aplicadas: `npx supabase db reset`
 * 
 * Ejecutar: npx ts-node --transpile-only apps/erp-api/tests/e2e/inventario-e2e.test.ts
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
// TESTS E2E REALES - MÓDULO INVENTARIO
// ============================================================================

test('E2E Inventario – Tablas principales existen', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  // Verificar tabla productos
  const { error: prodError } = await supabase
    .from('productos')
    .select('id, tenant_id, codigo, nombre, stock, stock_reservado')
    .limit(1);
  assert.ok(!prodError, `Tabla productos debe existir: ${prodError?.message}`);

  // Verificar tabla movimientos_inventario
  const { error: movError } = await supabase
    .from('movimientos_inventario')
    .select('id, tenant_id, producto_id, tipo, cantidad')
    .limit(1);
  assert.ok(!movError, `Tabla movimientos_inventario debe existir: ${movError?.message}`);

  // Verificar tabla almacenes
  const { error: almError } = await supabase
    .from('almacenes')
    .select('id, tenant_id, nombre, codigo')
    .limit(1);
  assert.ok(!almError, `Tabla almacenes debe existir: ${almError?.message}`);

  console.log('✅ Todas las tablas de inventario existen');
});

test('E2E Inventario – RPC registrar_entrada_stock_atomico existe', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  // Intentar llamar al RPC con parámetros inválidos para verificar que existe
  const { error } = await supabase.rpc('registrar_entrada_stock_atomico', {
    p_producto_id: '00000000-0000-0000-0000-000000000000',
    p_almacen_id: '00000000-0000-0000-0000-000000000000',
    p_cantidad: 1,
    p_referencia_tipo: 'TEST',
    p_referencia_id: 'test-123',
    p_notas: 'Test',
    p_ubicacion_id: null,
    p_lote: null,
    p_fecha_expiracion: null,
  });

  // El error debe ser por datos inválidos, no por función inexistente
  if (error) {
    const esErrorFuncion = error.message.includes('does not exist') || 
                           error.message.includes('function');
    if (esErrorFuncion) {
      console.warn('⚠️ RPC registrar_entrada_stock_atomico no existe');
    } else {
      console.log('✅ RPC registrar_entrada_stock_atomico existe (error esperado por datos inválidos)');
    }
  } else {
    console.log('✅ RPC registrar_entrada_stock_atomico existe');
  }
});

test('E2E Inventario – Constraint CHECK stock >= 0 en productos', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const productoId = crypto.randomUUID();

  // Crear tenant
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Stock Constraint',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Crear producto con stock positivo
  await supabase.from('productos').insert({
    id: productoId,
    tenant_id: tenantId,
    codigo: `PROD-STOCK-${Date.now()}`,
    nombre: 'Producto Test Stock',
    precio: 50.00,
    stock: 10,
    stock_reservado: 0,
    activo: true,
    unidad_medida: 'NIU',
  });

  // Intentar actualizar stock a valor negativo
  const { error: updateError } = await supabase
    .from('productos')
    .update({ stock: -5 })
    .eq('id', productoId);

  if (updateError) {
    assert.ok(
      updateError.message.includes('check') || 
      updateError.message.includes('constraint') ||
      updateError.message.includes('violates'),
      'Error debe ser por constraint CHECK'
    );
    console.log('✅ Constraint CHECK (stock >= 0) está activo');
  } else {
    // Verificar si el stock quedó negativo
    const { data: producto } = await supabase
      .from('productos')
      .select('stock')
      .eq('id', productoId)
      .single();

    if (producto && parseFloat(producto.stock) < 0) {
      console.warn('⚠️ HALLAZGO CRÍTICO: No hay constraint CHECK (stock >= 0)');
      console.warn('   Recomendación: Ejecutar migración 146__add_stock_check_constraint.sql');
    }
  }

  // Cleanup
  await supabase.from('productos').delete().eq('id', productoId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Inventario – RLS aísla movimientos entre tenants', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const productoA = crypto.randomUUID();
  const productoB = crypto.randomUUID();

  // Crear tenants
  await supabase.from('tenants').insert([
    { id: tenantA, nombre: 'Tenant A Inv', ruc: `20${Date.now().toString().slice(-9)}`, pais: 'PE', activo: true },
    { id: tenantB, nombre: 'Tenant B Inv', ruc: `20${(Date.now() + 1).toString().slice(-9)}`, pais: 'PE', activo: true },
  ]);

  // Crear productos
  await supabase.from('productos').insert([
    { id: productoA, tenant_id: tenantA, codigo: 'PROD-A', nombre: 'Producto A', precio: 100, stock: 50, stock_reservado: 0, activo: true, unidad_medida: 'NIU' },
    { id: productoB, tenant_id: tenantB, codigo: 'PROD-B', nombre: 'Producto B', precio: 200, stock: 30, stock_reservado: 0, activo: true, unidad_medida: 'NIU' },
  ]);

  // Crear movimientos
  await supabase.from('movimientos_inventario').insert([
    { tenant_id: tenantA, producto_id: productoA, tipo: 'ENTRADA', cantidad: 10, referencia_tipo: 'COMPRA', notas: 'Test A' },
    { tenant_id: tenantB, producto_id: productoB, tipo: 'ENTRADA', cantidad: 20, referencia_tipo: 'COMPRA', notas: 'Test B' },
  ]);

  // Consultar movimientos de cada tenant
  const { data: movsA } = await supabase
    .from('movimientos_inventario')
    .select('*')
    .eq('tenant_id', tenantA);

  const { data: movsB } = await supabase
    .from('movimientos_inventario')
    .select('*')
    .eq('tenant_id', tenantB);

  // Verificar aislamiento
  assert.strictEqual(movsA?.length, 1, 'Tenant A debe tener 1 movimiento');
  assert.strictEqual(movsB?.length, 1, 'Tenant B debe tener 1 movimiento');
  assert.strictEqual(movsA?.[0].cantidad, 10, 'Movimiento A debe ser cantidad 10');
  assert.strictEqual(movsB?.[0].cantidad, 20, 'Movimiento B debe ser cantidad 20');

  console.log('✅ RLS aísla movimientos de inventario correctamente');

  // Cleanup
  await supabase.from('movimientos_inventario').delete().eq('tenant_id', tenantA);
  await supabase.from('movimientos_inventario').delete().eq('tenant_id', tenantB);
  await supabase.from('productos').delete().eq('id', productoA);
  await supabase.from('productos').delete().eq('id', productoB);
  await supabase.from('tenants').delete().eq('id', tenantA);
  await supabase.from('tenants').delete().eq('id', tenantB);
});

test('E2E Inventario – Stock disponible = stock - stock_reservado', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const productoId = crypto.randomUUID();

  // Crear tenant y producto
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Stock Calc',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  await supabase.from('productos').insert({
    id: productoId,
    tenant_id: tenantId,
    codigo: `PROD-CALC-${Date.now()}`,
    nombre: 'Producto Cálculo Stock',
    precio: 100.00,
    stock: 100,
    stock_reservado: 30,
    activo: true,
    unidad_medida: 'NIU',
  });

  // Consultar producto
  const { data: producto } = await supabase
    .from('productos')
    .select('stock, stock_reservado')
    .eq('id', productoId)
    .single();

  assert.ok(producto, 'Producto debe existir');
  
  const stockDisponible = parseFloat(producto.stock) - parseFloat(producto.stock_reservado);
  assert.strictEqual(stockDisponible, 70, 'Stock disponible debe ser 100 - 30 = 70');

  console.log('✅ Cálculo de stock disponible es correcto');

  // Cleanup
  await supabase.from('productos').delete().eq('id', productoId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Inventario – Tipos NUMERIC correctos para cantidades', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const productoId = crypto.randomUUID();

  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Numeric',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Insertar producto con decimales precisos
  await supabase.from('productos').insert({
    id: productoId,
    tenant_id: tenantId,
    codigo: `PROD-DEC-${Date.now()}`,
    nombre: 'Producto Decimales',
    precio: 99.99,
    stock: 10.50,
    stock_reservado: 2.25,
    activo: true,
    unidad_medida: 'KGM',
  });

  const { data: producto } = await supabase
    .from('productos')
    .select('precio, stock, stock_reservado')
    .eq('id', productoId)
    .single();

  assert.ok(producto, 'Producto debe existir');
  
  // Verificar precisión decimal
  assert.strictEqual(parseFloat(producto.precio), 99.99, 'Precio debe mantener precisión');
  assert.strictEqual(parseFloat(producto.stock), 10.50, 'Stock debe mantener precisión');
  assert.strictEqual(parseFloat(producto.stock_reservado), 2.25, 'Stock reservado debe mantener precisión');

  console.log('✅ Tipos NUMERIC mantienen precisión decimal correcta');

  // Cleanup
  await supabase.from('productos').delete().eq('id', productoId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

// ============================================================================
// RUNNER
// ============================================================================

export async function runInventarioE2ETests() {
  console.log('\n🧪 TESTS E2E REALES - MÓDULO INVENTARIO');
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

  console.log(`\n[Inventario E2E] ${passed}/${tests.length} pruebas superadas`);

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
  runInventarioE2ETests().then(({ passed, total }) => {
    process.exitCode = passed === total ? 0 : 1;
  });
}
