import { Module } from '@nestjs/common';
import { ContabilidadController } from '../contabilidad.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';

@Module({
  imports: [SupabaseModule, IntegrationModule],
  controllers: [ContabilidadController],
  providers: [],
  exports: []
})
export class ContabilidadModule {}