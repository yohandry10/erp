/**
 * Script de prueba para el Worker de Retry de CPE
 * 
 * Este script permite probar el job de retry sin esperar al cron
 * 
 * Uso:
 *   npx ts-node test-pos-cpe-retry.ts
 */

import 'dotenv/config';
import { runPosCpeRetryJob } from './src/jobs/pos-cpe-retry.job';

async function main() {
  console.log('🧪 [Test] Iniciando prueba del job de retry de CPE...\n');

  try {
    const result = await runPosCpeRetryJob();

    console.log('\n📊 [Test] Resultados:');
    console.log(`   ✅ Éxito: ${result.success}`);
    console.log(`   📝 Procesadas: ${result.procesadas}`);
    console.log(`   ❌ Errores: ${result.errores}`);
    console.log(`   ⏭️  Omitidas: ${result.omitidas}`);

    if (result.success) {
      console.log('\n✅ [Test] Job ejecutado exitosamente');
      process.exit(0);
    } else {
      console.log('\n❌ [Test] Job falló');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ [Test] Error ejecutando el job:', error);
    process.exit(1);
  }
}

main();
