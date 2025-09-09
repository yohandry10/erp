import { Module } from '@nestjs/common';
import { DashboardController } from '../dashboard.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [DashboardController],
  providers: [],
  exports: []
})
export class DashboardModule {}