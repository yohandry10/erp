import { Module } from '@nestjs/common';
import { DashboardController } from '../dashboard.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { DashboardMetricsService } from './dashboard-metrics.service';

@Module({
  imports: [SupabaseModule, CacheModule],
  controllers: [DashboardController],
  providers: [DashboardMetricsService],
  exports: [DashboardMetricsService]
})
export class DashboardModule {}