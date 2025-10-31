import { Module } from '@nestjs/common';
import { DashboardController } from '../dashboard.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, CacheModule, AuthModule, PermissionsModule],
  controllers: [DashboardController],
  providers: [DashboardMetricsService],
  exports: [DashboardMetricsService]
})
export class DashboardModule {}