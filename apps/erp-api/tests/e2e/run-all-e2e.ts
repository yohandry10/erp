/**
 * Runner Unificado de Tests E2E
 * 
 * Ejecuta todos los tests E2E de los módulos críticos contra Supabase local.
 * 
 * Requisitos:
 * - Supabase local corriendo: `npx supabase start`
 * - Migraciones aplicadas: `npx supabase db reset`
 * 
 * Ejecutar: npx ts-node --transpile-only apps/erp-api/tests/e2e/run-all-e2e.ts
 */

import { runVentasE2ETests } from './ventas-e2e.test';
import { runCpeE2ETests } from './cpe-e2e.test';
import { runInventarioE2ETests } from './inventario-e2e.test';
import { runComprasE2ETests } from './compras-e2e.test';
import { runFinanzasE2ETests } from './finanzas-e2e.test';
import { runRrhhE2ETests } from './rrhh-e2e.test';
import { runPosE2ETests } from './pos-e2e.test';

interface ModuleResult {
  module: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

async function runAllE2ETests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           TESTS E2E REALES - MÓDULOS CRÍTICOS              ║');
  console.log('║                                                            ║');
  console.log('║  Requisitos:                                               ║');
  console.log('║  - Supabase local: npx supabase start                      ║');
  console.log('║  - Migraciones: npx supabase db reset                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results: ModuleResult[] = [];

  // Módulo 1: VENTAS
  try {
    const ventasResult = await runVentasE2ETests();
    results.push({
      module: 'VENTAS',
      total: ventasResult.total,
      passed: ventasResult.passed,
      failed: ventasResult.failed,
      skipped: ventasResult.skipped || 0,
    });
  } catch (error) {
    console.error('Error ejecutando tests de VENTAS:', error);
    results.push({ module: 'VENTAS', total: 0, passed: 0, failed: 1, skipped: 0 });
  }

  // Módulo 2: CPE
  try {
    const cpeResult = await runCpeE2ETests();
    results.push({
      module: 'CPE',
      total: cpeResult.total,
      passed: cpeResult.passed,
      failed: cpeResult.failed,
      skipped: cpeResult.skipped || 0,
    });
  } catch (error) {
    console.error('Error ejecutando tests de CPE:', error);
    results.push({ module: 'CPE', total: 0, passed: 0, failed: 1, skipped: 0 });
  }

  // Módulo 3: INVENTARIO
  try {
    const inventarioResult = await runInventarioE2ETests();
    results.push({
      module: 'INVENTARIO',
      total: inventarioResult.total,
      passed: inventarioResult.passed,
      failed: inventarioResult.failed,
      skipped: inventarioResult.skipped || 0,
    });
  } catch (error) {
    console.error('Error ejecutando tests de INVENTARIO:', error);
    results.push({ module: 'INVENTARIO', total: 0, passed: 0, failed: 1, skipped: 0 });
  }

  // Módulo 4: COMPRAS
  try {
    const comprasResult = await runComprasE2ETests();
    results.push({
      module: 'COMPRAS',
      total: comprasResult.total,
      passed: comprasResult.passed,
      failed: comprasResult.failed,
      skipped: comprasResult.skipped || 0,
    });
  } catch (error) {
    console.error('Error ejecutando tests de COMPRAS:', error);
    results.push({ module: 'COMPRAS', total: 0, passed: 0, failed: 1, skipped: 0 });
  }

  // Módulo 5: FINANZAS
  try {
    const finanzasResult = await runFinanzasE2ETests();
    results.push({
      module: 'FINANZAS',
      total: finanzasResult.total,
      passed: finanzasResult.passed,
      failed: finanzasResult.failed,
      skipped: finanzasResult.skipped || 0,
    });
  } catch (error) {
    console.error('Error ejecutando tests de FINANZAS:', error);
    results.push({ module: 'FINANZAS', total: 0, passed: 0, failed: 1, skipped: 0 });
  }

  // Módulo 6: RRHH
  try {
    const rrhhResult = await runRrhhE2ETests();
    results.push({
      module: 'RRHH',
      total: rrhhResult.total,
      passed: rrhhResult.passed,
      failed: rrhhResult.failed,
      skipped: rrhhResult.skipped || 0,
    });
  } catch (error) {
    console.error('Error ejecutando tests de RRHH:', error);
    results.push({ module: 'RRHH', total: 0, passed: 0, failed: 1, skipped: 0 });
  }

  // Módulo 9: POS
  try {
    const posResult = await runPosE2ETests();
    results.push({
      module: 'POS',
      total: posResult.total,
      passed: posResult.passed,
      failed: posResult.failed,
      skipped: posResult.skipped || 0,
    });
  } catch (error) {
    console.error('Error ejecutando tests de POS:', error);
    results.push({ module: 'POS', total: 0, passed: 0, failed: 1, skipped: 0 });
  }

  // Resumen final
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    RESUMEN FINAL E2E                       ║');
  console.log('╠════════════════════════════════════════════════════════════╣');

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const result of results) {
    const status = result.failed === 0 && result.skipped === 0 ? '✅' : 
                   result.skipped > 0 ? '⏭️' : '❌';
    console.log(`║ ${status} ${result.module.padEnd(12)} │ ${result.passed}/${result.total} passed │ ${result.failed} failed │ ${result.skipped} skipped ║`);
    totalTests += result.total;
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalSkipped += result.skipped;
  }

  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║ TOTAL: ${totalPassed}/${totalTests} passed │ ${totalFailed} failed │ ${totalSkipped} skipped          ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Determinar código de salida
  const exitCode = totalFailed > 0 ? 1 : 0;
  
  if (totalSkipped === totalTests) {
    console.log('\n⚠️ Todos los tests fueron saltados. Verifica que Supabase local esté corriendo.');
    console.log('   Ejecuta: npx supabase start');
  } else if (totalFailed > 0) {
    console.log('\n❌ Algunos tests fallaron. Revisa los errores arriba.');
  } else {
    console.log('\n✅ Todos los tests E2E pasaron correctamente.');
  }

  return { results, exitCode };
}

// Ejecutar
runAllE2ETests().then(({ exitCode }) => {
  process.exitCode = exitCode;
});
