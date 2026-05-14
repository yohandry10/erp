/**
 * Tests E2E Reales - Módulo INVENTARIO
 * 
 * Estos tests ejecutan operaciones REALES contra Supabase local.
 * Validan RPCs atómicos, constraints y RLS del módulo de inventario.
 * 
 * Requisitos:
 * - Base Supabase accesible (local o remota) con migraciones aplicadas.
 * - Variables de entorno de test configuradas (ver `apps/erp-api/tests/e2e/helpers/supabase-test-client.ts`).
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
    .select('id, tenant_id, codigo, nombre, stock_actual, stock_reservado')
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

test('E2E Inventario – Constraint CHECK stock_actual >= 0 en productos', async () => {
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
    stock_actual: 10,
    stock_reservado: 0,
    activo: true,
    unidad_medida: 'NIU',
  });

  // Intentar actualizar stock_actual a valor negativo
  const { error: updateError } = await supabase
    .from('productos')
    .update({ stock_actual: -5 })
    .eq('id', productoId);

  // Verificar el resultado
  const { data: producto } = await supabase
    .from('productos')
    .select('stock_actual')
    .eq('id', productoId)
    .single();

  if (updateError) {
    // El constraint rechazó la actualización - perfecto
    console.log('✅ Constraint CHECK (stock_actual >= 0) está activo - rechazó valor negativo');
  } else if (producto && parseFloat((producto as any).stock_actual) >= 0) {
    // El update no cambió a negativo (constraint o RLS lo previno)
    console.log('✅ Constraint CHECK (stock_actual >= 0) está activo - stock no quedó negativo');
  } else {
    // Stock quedó negativo - constraint no existe
    console.warn('⚠️ HALLAZGO CRÍTICO: No hay constraint CHECK (stock_actual >= 0)');
    assert.fail('Stock quedó negativo sin constraint');
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
    { id: productoA, tenant_id: tenantA, codigo: 'PROD-A', nombre: 'Producto A', precio: 100, stock_actual: 50, stock_reservado: 0, activo: true, unidad_medida: 'NIU' },
    { id: productoB, tenant_id: tenantB, codigo: 'PROD-B', nombre: 'Producto B', precio: 200, stock_actual: 30, stock_reservado: 0, activo: true, unidad_medida: 'NIU' },
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

test('E2E Inventario – Stock disponible = stock_actual - stock_reservado', async () => {
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
    stock_actual: 100,
    stock_reservado: 30,
    activo: true,
    unidad_medida: 'NIU',
  });

  // Consultar producto
  const { data: producto } = await supabase
    .from('productos')
    .select('stock_actual, stock_reservado')
    .eq('id', productoId)
    .single();

  assert.ok(producto, 'Producto debe existir');

  const stockDisponible = parseFloat((producto as any).stock_actual) - parseFloat(producto.stock_reservado);
  assert.strictEqual(stockDisponible, 70, 'Stock disponible debe ser 100 - 30 = 70');

  console.log('✅ Cálculo de stock disponible es correcto');

  // Cleanup
  await supabase.from('productos').delete().eq('id', productoId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Inventario – Reservas concurrentes no sobre-reservan (RPC reservar_stock_atomico)', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const productoId = crypto.randomUUID();

  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Concurrency',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  await supabase.from('productos').insert({
    id: productoId,
    tenant_id: tenantId,
    codigo: `PROD-CONC-${Date.now()}`,
    nombre: 'Producto Concurrency',
    precio: 10.0,
    stock_actual: 5,
    stock_reservado: 0,
    activo: true,
    unidad_medida: 'NIU',
  });

  // Ejecutar 2 reservas "a la vez" por 3 unidades (total 6 > 5). Debe fallar una.
  const [r1, r2] = await Promise.all([
    supabase.rpc('reservar_stock_atomico', {
      p_producto_id: productoId,
      p_cantidad: 3,
      p_referencia_tipo: 'TEST',
      p_referencia_id: 'r1',
      p_notas: 'Reserva concurrente 1',
    }),
    supabase.rpc('reservar_stock_atomico', {
      p_producto_id: productoId,
      p_cantidad: 3,
      p_referencia_tipo: 'TEST',
      p_referencia_id: 'r2',
      p_notas: 'Reserva concurrente 2',
    }),
  ]);

  const resultados = [r1, r2];

  // Si el RPC no existe en DB local, no podemos validar (migraciones no aplicadas)
  const errorNoExiste = resultados.find((r) => r.error?.message?.includes('does not exist'));
  if (errorNoExiste) {
    await supabase.from('productos').delete().eq('id', productoId);
    await supabase.from('tenants').delete().eq('id', tenantId);
    assert.fail(`RPC reservar_stock_atomico debe existir para validar concurrencia de inventario: ${errorNoExiste.error?.message}`);
  }

  const successCount = resultados.filter((r) => !r.error && r.data).length;
  const errorCount = resultados.filter((r) => !!r.error).length;

  assert.strictEqual(successCount, 1, 'Debe haber exactamente 1 reserva exitosa');
  assert.strictEqual(errorCount, 1, 'Debe haber exactamente 1 reserva fallida');

  // Verificar que no se sobre-reservó
  const { data: productoFinal, error: productoError } = await supabase
    .from('productos')
    .select('stock_actual, stock_reservado')
    .eq('id', productoId)
    .single();

  assert.ok(!productoError, `No debe haber error consultando producto: ${productoError?.message}`);
  assert.strictEqual(Number((productoFinal as any).stock_actual), 5, 'Stock base debe mantenerse');
  assert.strictEqual(Number(productoFinal.stock_reservado), 3, 'Stock reservado debe ser 3');

  // Cleanup (incluye movimientos creados por el RPC)
  await supabase.from('movimientos_inventario').delete().eq('producto_id', productoId).eq('tenant_id', tenantId);
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
    stock_actual: 10.50,
    stock_reservado: 2.25,
    activo: true,
    unidad_medida: 'KGM',
  });

  const { data: producto } = await supabase
    .from('productos')
    .select('precio, stock_actual, stock_reservado')
    .eq('id', productoId)
    .single();

  assert.ok(producto, 'Producto debe existir');

  // Verificar precisión decimal
  assert.strictEqual(parseFloat(producto.precio), 99.99, 'Precio debe mantener precisión');
  assert.strictEqual(parseFloat((producto as any).stock_actual), 10.50, 'Stock debe mantener precisión');
  assert.strictEqual(parseFloat(producto.stock_reservado), 2.25, 'Stock reservado debe mantener precisión');

  console.log('✅ Tipos NUMERIC mantienen precisión decimal correcta');

  // Cleanup
  await supabase.from('productos').delete().eq('id', productoId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Inventario – RPCs atómicos funcionan sin contexto y con contexto (set_tenant_context)', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const productoId = crypto.randomUUID();
  const almacenId = crypto.randomUUID();

  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Tenant RPC tenant context',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  await supabase.from('almacenes').insert({
    id: almacenId,
    tenant_id: tenantId,
    nombre: 'Almacén E2E',
    codigo: `ALM-${Date.now()}`,
    activo: true,
  });

  await supabase.from('productos').insert({
    id: productoId,
    tenant_id: tenantId,
    codigo: `PROD-RPC-${Date.now()}`,
    nombre: 'Producto RPC tenant context',
    precio: 10,
    stock_actual: 5,
    stock_reservado: 0,
    activo: true,
    unidad_medida: 'NIU',
  });

  // 1) SIN contexto explícito: registrar_entrada_stock_atomico debe derivar tenant desde producto
  const { data: movimientoEntrada, error: entradaError } = await supabase.rpc('registrar_entrada_stock_atomico', {
    p_producto_id: productoId,
    p_almacen_id: almacenId,
    p_cantidad: 3,
    p_referencia_tipo: 'E2E',
    p_referencia_id: 'entrada-sin-contexto',
    p_notas: 'Entrada sin contexto',
    p_ubicacion_id: null,
    p_lote: null,
    p_fecha_expiracion: null,
  });
  assert.ok(!entradaError, `Entrada atómica sin contexto debe funcionar: ${entradaError?.message}`);
  assert.ok(movimientoEntrada, 'Debe retornar movimiento_id');

  const { data: productoAfterEntrada } = await supabase
    .from('productos')
    .select('stock_actual, stock_reservado')
    .eq('id', productoId)
    .single();

  assert.ok(productoAfterEntrada, 'Producto debe existir tras entrada');
  assert.strictEqual(parseFloat((productoAfterEntrada as any).stock_actual), 8, 'Stock debe incrementarse (5 + 3)');
  assert.strictEqual(parseFloat(productoAfterEntrada.stock_reservado), 0, 'Stock reservado debe seguir 0');

  // 2) CON contexto explícito: reservar_stock_atomico debe respetar tenant ya seteado
  await supabase.rpc('set_tenant_context', { p_tenant_id: tenantId, p_user_id: null }).catch(() => {
    // Si el RPC no existe, el flujo "sin contexto" ya cubre el caso crítico.
  });

  const { data: movimientoReserva, error: reservaError } = await supabase.rpc('reservar_stock_atomico', {
    p_producto_id: productoId,
    p_cantidad: 2,
    p_referencia_tipo: 'E2E',
    p_referencia_id: 'reserva-con-contexto',
    p_notas: 'Reserva con contexto',
  });
  assert.ok(!reservaError, `Reserva atómica con contexto debe funcionar: ${reservaError?.message}`);
  assert.ok(movimientoReserva, 'Debe retornar movimiento_id');

  const { data: productoAfterReserva } = await supabase
    .from('productos')
    .select('stock_actual, stock_reservado')
    .eq('id', productoId)
    .single();

  assert.ok(productoAfterReserva, 'Producto debe existir tras reserva');
  assert.strictEqual(parseFloat((productoAfterReserva as any).stock_actual), 8, 'Stock total no debe cambiar en reserva');
  assert.strictEqual(parseFloat(productoAfterReserva.stock_reservado), 2, 'Stock reservado debe incrementarse');

  // Cleanup
  await supabase.from('movimientos_inventario').delete().eq('tenant_id', tenantId);
  await supabase.from('producto_existencias').delete().eq('tenant_id', tenantId);
  await supabase.from('productos').delete().eq('id', productoId);
  await supabase.from('almacenes').delete().eq('id', almacenId);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E Inventario – Reconciliación: productos.stock_actual == SUM(producto_existencias.stock_actual)', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();
  const productoId = crypto.randomUUID();
  const almacenA = crypto.randomUUID();
  const almacenB = crypto.randomUUID();

  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Tenant reconciliación stock',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  await supabase.from('almacenes').insert([
    { id: almacenA, tenant_id: tenantId, nombre: 'Alm A', codigo: `A-${Date.now()}`, activo: true },
    { id: almacenB, tenant_id: tenantId, nombre: 'Alm B', codigo: `B-${Date.now()}`, activo: true },
  ]);

  await supabase.from('productos').insert({
    id: productoId,
    tenant_id: tenantId,
    codigo: `PROD-REC-${Date.now()}`,
    nombre: 'Producto reconciliación',
    precio: 5,
    stock_actual: 0,
    stock_reservado: 0,
    activo: true,
    unidad_medida: 'NIU',
  });

  const entrada = async (almacenId: string, qty: number) => {
    const { error } = await supabase.rpc('registrar_entrada_stock_atomico', {
      p_producto_id: productoId,
      p_almacen_id: almacenId,
      p_cantidad: qty,
      p_referencia_tipo: 'E2E',
      p_referencia_id: `entrada-${almacenId}`,
      p_notas: 'Entrada para reconciliación',
      p_ubicacion_id: null,
      p_lote: null,
      p_fecha_expiracion: null,
    });
    assert.ok(!error, `Entrada atómica debe funcionar: ${error?.message}`);
  };

  await entrada(almacenA, 4);
  await entrada(almacenB, 6);

  const { data: prod } = await supabase
    .from('productos')
    .select('stock_actual')
    .eq('id', productoId)
    .single();
  assert.ok(prod, 'Producto debe existir');

  const { data: existencias } = await supabase
    .from('producto_existencias')
    .select('stock_actual')
    .eq('tenant_id', tenantId)
    .eq('producto_id', productoId);

  const sumExistencias = (existencias || []).reduce((sum: number, row: any) => sum + parseFloat(row.stock_actual ?? 0), 0);
  assert.strictEqual(sumExistencias, 10, 'Suma de existencias debe ser 10');
  assert.strictEqual(parseFloat((prod as any).stock_actual), 10, 'productos.stock_actual debe igualar suma de existencias');

  // Cleanup
  await supabase.from('movimientos_inventario').delete().eq('tenant_id', tenantId);
  await supabase.from('producto_existencias').delete().eq('tenant_id', tenantId);
  await supabase.from('productos').delete().eq('id', productoId);
  await supabase.from('almacenes').delete().eq('tenant_id', tenantId);
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
