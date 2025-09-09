import { Module } from '@nestjs/common';
import { AnalyticsController } from '../analytics.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';

@Module({
  imports: [SupabaseModule, IntegrationModule],
  controllers: [AnalyticsController],
  providers: [],
  exports: []
})
export class AnalyticsModule {}