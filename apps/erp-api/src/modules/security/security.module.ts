import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { SecurityDashboardService } from './security-dashboard.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { EmailModule } from '../../shared/email/email.module';
import { PlatformDiagnosticsService } from './platform-diagnostics.service';

@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule, EmailModule],
  controllers: [SecurityController],
  providers: [SecurityDashboardService, PlatformDiagnosticsService],
  exports: [SecurityDashboardService],
})
export class SecurityDashboardModule {}
