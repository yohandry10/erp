import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BackgroundJobsService } from '../src/shared/jobs/background-jobs.service';
import { SupabaseService } from '../src/shared/supabase/supabase.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const supabase = app.get(SupabaseService);
    // Asegura que PostgREST tenga el esquema actualizado
    try {
      await supabase.getPublicClient().rpc('pgrst_reload_schema');
    } catch (_) {
      /* ignore */
    }

    const svc = app.get(BackgroundJobsService) as any;
    await svc.runPerTenant('stock-bajo', async (t: string) => svc.verificarStockBajo(t));
    console.log('✅ Job manual stock-bajo disparado');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('❌ Error ejecutando job manual:', err);
  process.exit(1);
});
