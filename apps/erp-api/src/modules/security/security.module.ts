import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { SecurityDashboardService } from './security-dashboard.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [SecurityController],
  providers: [SecurityDashboardService],
  exports: [SecurityDashboardService],
})
export class SecurityDashboardModule {}
