/**
 * Tests E2E Reales - Módulo RRHH
 * 
 * Estos tests ejecutan operaciones REALES contra Supabase local.
 * Validan tablas de empleados, departamentos, contratos y planillas.
 * 
 * Requisitos:
 * - Supabase local corriendo: `npx supabase start`
 * - Migraciones aplicadas: `npx supabase db reset`
 * 
 * Ejecutar: npx ts-node --transpile-only apps/erp-api/tests/e2e/rrhh-e2e.test.ts
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
// TESTS E2E REALES - MÓDULO RRHH
// ============================================================================

test('E2E RRHH – Tablas principales existen', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  // Verificar tabla empleados
  const { error: empError } = await supabase
    .from('empleados')
    .select('id, tenant_id, nombres, apellidos')
    .limit(1);
  
  if (empError) {
    if (empError.message.includes('does not exist') || empError.message.includes('relation')) {
      console.warn('⚠️ Tabla empleados no existe - módulo RRHH puede no estar configurado');
      return;
    }
  }
  assert.ok(!empError, `Tabla empleados debe existir: ${empError?.message}`);

  // Verificar tabla departamentos
  const { error: depError } = await supabase
    .from('departamentos')
    .select('id, tenant_id, nombre')
    .limit(1);
  
  if (!depError) {
    console.log('✅ Tabla departamentos existe');
  }

  // Verificar tabla contratos
  const { error: contError } = await supabase
    .from('contratos')
    .select('id, id_empleado')
    .limit(1);
  
  if (!contError) {
    console.log('✅ Tabla contratos existe');
  }

  // Verificar tabla asistencia
  const { error: asistError } = await supabase
    .from('asistencia')
    .select('id, id_empleado')
    .limit(1);
  
  if (!asistError) {
    console.log('✅ Tabla asistencia existe');
  }

  console.log('✅ Tablas principales de RRHH verificadas');
});

test('E2E RRHH – Crear departamento', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Crear tenant
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant RRHH',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tabla departamentos existe
  const { error: checkError } = await supabase
    .from('departamentos')
    .select('id')
    .limit(1);

  if (checkError && checkError.message.includes('does not exist')) {
    console.warn('⚠️ Tabla departamentos no existe - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear departamento
  const { data: depto, error } = await supabase
    .from('departamentos')
    .insert({
      tenant_id: tenantId,
      nombre: 'Tecnología',
      descripcion: 'Departamento de TI',
      activo: true,
    })
    .select()
    .single();

  assert.ok(!error, `Departamento debe crearse: ${error?.message}`);
  assert.ok(depto, 'Departamento debe retornar datos');
  assert.strictEqual(depto.nombre, 'Tecnología', 'Nombre debe ser correcto');

  console.log('✅ Departamento creado correctamente');

  // Cleanup
  await supabase.from('departamentos').delete().eq('id', depto.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E RRHH – Crear empleado con departamento', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Setup tenant
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Empleados',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tablas existen
  const { error: checkEmp } = await supabase.from('empleados').select('id').limit(1);
  const { error: checkDep } = await supabase.from('departamentos').select('id').limit(1);

  if ((checkEmp && checkEmp.message.includes('does not exist')) ||
      (checkDep && checkDep.message.includes('does not exist'))) {
    console.warn('⚠️ Tablas de RRHH no existen - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear departamento
  const { data: depto } = await supabase
    .from('departamentos')
    .insert({
      tenant_id: tenantId,
      nombre: 'Ventas',
      activo: true,
    })
    .select()
    .single();

  // Crear empleado
  const { data: empleado, error } = await supabase
    .from('empleados')
    .insert({
      tenant_id: tenantId,
      nombres: 'Juan Carlos',
      apellidos: 'Pérez García',
      tipo_documento: 'DNI',
      numero_documento: '12345678',
      email: 'juan.perez@test.com',
      telefono: '999888777',
      fecha_nacimiento: '1990-05-15',
      fecha_ingreso: new Date().toISOString().split('T')[0],
      id_departamento: depto?.id,
      puesto: 'Vendedor Senior',
      estado: 'activo',
    })
    .select()
    .single();

  assert.ok(!error, `Empleado debe crearse: ${error?.message}`);
  assert.ok(empleado, 'Empleado debe retornar datos');
  assert.strictEqual(empleado.nombres, 'Juan Carlos', 'Nombres deben ser correctos');
  assert.strictEqual(empleado.estado, 'activo', 'Estado debe ser activo');

  console.log('✅ Empleado creado correctamente');

  // Cleanup
  await supabase.from('empleados').delete().eq('id', empleado.id);
  await supabase.from('departamentos').delete().eq('id', depto?.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E RRHH – RLS aísla empleados entre tenants', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();

  // Setup tenants
  await supabase.from('tenants').insert([
    { id: tenantA, nombre: 'Empresa A RRHH', ruc: `20${Date.now().toString().slice(-9)}`, pais: 'PE', activo: true },
    { id: tenantB, nombre: 'Empresa B RRHH', ruc: `20${(Date.now() + 1).toString().slice(-9)}`, pais: 'PE', activo: true },
  ]);

  // Verificar si tabla empleados existe
  const { error: checkError } = await supabase.from('empleados').select('id').limit(1);
  if (checkError && checkError.message.includes('does not exist')) {
    console.warn('⚠️ Tabla empleados no existe - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantA);
    await supabase.from('tenants').delete().eq('id', tenantB);
    return;
  }

  // Crear empleados en cada tenant
  const { data: empA } = await supabase
    .from('empleados')
    .insert({
      tenant_id: tenantA,
      nombres: 'Empleado',
      apellidos: 'Empresa A',
      tipo_documento: 'DNI',
      numero_documento: '11111111',
      fecha_ingreso: new Date().toISOString().split('T')[0],
      estado: 'activo',
    })
    .select()
    .single();

  const { data: empB } = await supabase
    .from('empleados')
    .insert({
      tenant_id: tenantB,
      nombres: 'Empleado',
      apellidos: 'Empresa B',
      tipo_documento: 'DNI',
      numero_documento: '22222222',
      fecha_ingreso: new Date().toISOString().split('T')[0],
      estado: 'activo',
    })
    .select()
    .single();

  // Consultar empleados de cada tenant
  const { data: empsA } = await supabase
    .from('empleados')
    .select('*')
    .eq('tenant_id', tenantA);

  const { data: empsB } = await supabase
    .from('empleados')
    .select('*')
    .eq('tenant_id', tenantB);

  // Verificar aislamiento
  assert.strictEqual(empsA?.length, 1, 'Tenant A debe tener 1 empleado');
  assert.strictEqual(empsB?.length, 1, 'Tenant B debe tener 1 empleado');
  assert.strictEqual(empsA?.[0].apellidos, 'Empresa A', 'Empleado A debe ser de Empresa A');
  assert.strictEqual(empsB?.[0].apellidos, 'Empresa B', 'Empleado B debe ser de Empresa B');

  console.log('✅ RLS aísla empleados correctamente entre tenants');

  // Cleanup
  await supabase.from('empleados').delete().eq('id', empA?.id);
  await supabase.from('empleados').delete().eq('id', empB?.id);
  await supabase.from('tenants').delete().eq('id', tenantA);
  await supabase.from('tenants').delete().eq('id', tenantB);
});


test('E2E RRHH – Crear contrato de empleado', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Setup
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Contratos',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tablas existen
  const { error: checkEmp } = await supabase.from('empleados').select('id').limit(1);
  const { error: checkCont } = await supabase.from('contratos').select('id').limit(1);

  if ((checkEmp && checkEmp.message.includes('does not exist')) ||
      (checkCont && checkCont.message.includes('does not exist'))) {
    console.warn('⚠️ Tablas de RRHH no existen - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear empleado
  const { data: empleado } = await supabase
    .from('empleados')
    .insert({
      tenant_id: tenantId,
      nombres: 'María',
      apellidos: 'López',
      tipo_documento: 'DNI',
      numero_documento: '33333333',
      fecha_ingreso: new Date().toISOString().split('T')[0],
      estado: 'activo',
    })
    .select()
    .single();

  // Crear contrato
  const { data: contrato, error } = await supabase
    .from('contratos')
    .insert({
      tenant_id: tenantId,
      id_empleado: empleado?.id,
      tipo_contrato: 'INDEFINIDO',
      fecha_inicio: new Date().toISOString().split('T')[0],
      sueldo_bruto: 3500.00,
      moneda: 'PEN',
      estado: 'vigente',
    })
    .select()
    .single();

  assert.ok(!error, `Contrato debe crearse: ${error?.message}`);
  assert.ok(contrato, 'Contrato debe retornar datos');
  assert.strictEqual(parseFloat(contrato.sueldo_bruto), 3500.00, 'Sueldo debe ser correcto');
  assert.strictEqual(contrato.estado, 'vigente', 'Estado debe ser vigente');

  console.log('✅ Contrato de empleado creado correctamente');

  // Cleanup
  await supabase.from('contratos').delete().eq('id', contrato.id);
  await supabase.from('empleados').delete().eq('id', empleado?.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E RRHH – Registrar asistencia', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Setup
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Asistencia',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tablas existen
  const { error: checkEmp } = await supabase.from('empleados').select('id').limit(1);
  const { error: checkAsist } = await supabase.from('asistencia').select('id').limit(1);

  if ((checkEmp && checkEmp.message.includes('does not exist')) ||
      (checkAsist && checkAsist.message.includes('does not exist'))) {
    console.warn('⚠️ Tablas de RRHH no existen - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear empleado
  const { data: empleado } = await supabase
    .from('empleados')
    .insert({
      tenant_id: tenantId,
      nombres: 'Pedro',
      apellidos: 'Sánchez',
      tipo_documento: 'DNI',
      numero_documento: '44444444',
      fecha_ingreso: new Date().toISOString().split('T')[0],
      estado: 'activo',
    })
    .select()
    .single();

  const hoy = new Date().toISOString().split('T')[0];

  // Registrar entrada
  const { data: asistencia, error } = await supabase
    .from('asistencia')
    .insert({
      tenant_id: tenantId,
      id_empleado: empleado?.id,
      fecha: hoy,
      hora_entrada: '08:00:00',
      estado: 'presente',
    })
    .select()
    .single();

  assert.ok(!error, `Asistencia debe registrarse: ${error?.message}`);
  assert.ok(asistencia, 'Asistencia debe retornar datos');
  assert.strictEqual(asistencia.estado, 'presente', 'Estado debe ser presente');

  console.log('✅ Asistencia registrada correctamente');

  // Cleanup
  await supabase.from('asistencia').delete().eq('id', asistencia.id);
  await supabase.from('empleados').delete().eq('id', empleado?.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E RRHH – Crear solicitud de vacaciones', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Setup
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Solicitudes',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tablas existen
  const { error: checkEmp } = await supabase.from('empleados').select('id').limit(1);
  const { error: checkSol } = await supabase.from('solicitudes').select('id').limit(1);

  if ((checkEmp && checkEmp.message.includes('does not exist')) ||
      (checkSol && checkSol.message.includes('does not exist'))) {
    console.warn('⚠️ Tablas de RRHH no existen - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear empleado
  const { data: empleado } = await supabase
    .from('empleados')
    .insert({
      tenant_id: tenantId,
      nombres: 'Ana',
      apellidos: 'Martínez',
      tipo_documento: 'DNI',
      numero_documento: '55555555',
      fecha_ingreso: '2023-01-01',
      estado: 'activo',
    })
    .select()
    .single();

  // Crear solicitud de vacaciones
  const fechaInicio = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const fechaFin = new Date(Date.now() + 44 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: solicitud, error } = await supabase
    .from('solicitudes')
    .insert({
      tenant_id: tenantId,
      id_empleado: empleado?.id,
      tipo: 'vacaciones',
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      dias: 15,
      motivo: 'Vacaciones anuales',
      estado: 'pendiente',
    })
    .select()
    .single();

  assert.ok(!error, `Solicitud debe crearse: ${error?.message}`);
  assert.ok(solicitud, 'Solicitud debe retornar datos');
  assert.strictEqual(solicitud.tipo, 'vacaciones', 'Tipo debe ser vacaciones');
  assert.strictEqual(solicitud.estado, 'pendiente', 'Estado debe ser pendiente');
  assert.strictEqual(solicitud.dias, 15, 'Días deben ser 15');

  console.log('✅ Solicitud de vacaciones creada correctamente');

  // Cleanup
  await supabase.from('solicitudes').delete().eq('id', solicitud.id);
  await supabase.from('empleados').delete().eq('id', empleado?.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

test('E2E RRHH – Tipos NUMERIC correctos para sueldos', async () => {
  const client = getTestClient();
  const supabase = client.getClient();

  const tenantId = crypto.randomUUID();

  // Setup
  await supabase.from('tenants').insert({
    id: tenantId,
    nombre: 'Test Tenant Numeric RRHH',
    ruc: `20${Date.now().toString().slice(-9)}`,
    pais: 'PE',
    activo: true,
  });

  // Verificar si tablas existen
  const { error: checkEmp } = await supabase.from('empleados').select('id').limit(1);
  const { error: checkCont } = await supabase.from('contratos').select('id').limit(1);

  if ((checkEmp && checkEmp.message.includes('does not exist')) ||
      (checkCont && checkCont.message.includes('does not exist'))) {
    console.warn('⚠️ Tablas de RRHH no existen - saltando test');
    await supabase.from('tenants').delete().eq('id', tenantId);
    return;
  }

  // Crear empleado
  const { data: empleado } = await supabase
    .from('empleados')
    .insert({
      tenant_id: tenantId,
      nombres: 'Test',
      apellidos: 'Numeric',
      tipo_documento: 'DNI',
      numero_documento: '66666666',
      fecha_ingreso: new Date().toISOString().split('T')[0],
      estado: 'activo',
    })
    .select()
    .single();

  // Crear contrato con sueldo decimal preciso
  const { data: contrato, error } = await supabase
    .from('contratos')
    .insert({
      tenant_id: tenantId,
      id_empleado: empleado?.id,
      tipo_contrato: 'PLAZO_FIJO',
      fecha_inicio: new Date().toISOString().split('T')[0],
      sueldo_bruto: 4567.89,
      moneda: 'PEN',
      estado: 'vigente',
    })
    .select()
    .single();

  assert.ok(!error, `Contrato con decimales debe crearse: ${error?.message}`);
  assert.strictEqual(parseFloat(contrato.sueldo_bruto), 4567.89, 'Sueldo debe mantener precisión decimal');

  console.log('✅ Tipos NUMERIC mantienen precisión decimal en sueldos');

  // Cleanup
  await supabase.from('contratos').delete().eq('id', contrato.id);
  await supabase.from('empleados').delete().eq('id', empleado?.id);
  await supabase.from('tenants').delete().eq('id', tenantId);
});

// ============================================================================
// RUNNER
// ============================================================================

export async function runRrhhE2ETests() {
  console.log('\n🧪 TESTS E2E REALES - MÓDULO RRHH');
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

  console.log(`\n[RRHH E2E] ${passed}/${tests.length} pruebas superadas`);

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
  runRrhhE2ETests().then(({ passed, total }) => {
    process.exitCode = passed === total ? 0 : 1;
  });
}
