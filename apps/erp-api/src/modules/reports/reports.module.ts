import { Module } from '@nestjs/common';
import { ReportsController } from '../reports.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SupabaseModule, PermissionsModule, AuthModule],
  controllers: [ReportsController],
  providers: [],
  exports: []
})
export class ReportsModule {}