import { Module } from '@nestjs/common';
import { ReportsController } from '../reports.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, PermissionsModule],
  controllers: [ReportsController],
  providers: [],
  exports: []
})
export class ReportsModule {}