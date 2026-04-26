import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { SecurityDashboardService } from './security-dashboard.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule],
  controllers: [SecurityController],
  providers: [SecurityDashboardService],
  exports: [SecurityDashboardService],
})
export class SecurityDashboardModule {}
