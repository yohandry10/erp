import { Module } from '@nestjs/common';
import { AnalyticsController } from '../analytics.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SupabaseModule, IntegrationModule, PermissionsModule, AuthModule],
  controllers: [AnalyticsController],
  providers: [],
  exports: []
})
export class AnalyticsModule {}