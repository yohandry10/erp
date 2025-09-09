import { Module } from '@nestjs/common';
import { PosController } from '../pos.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';

@Module({
  imports: [SupabaseModule, IntegrationModule],
  controllers: [PosController],
  providers: [],
  exports: []
})
export class PosModule {}