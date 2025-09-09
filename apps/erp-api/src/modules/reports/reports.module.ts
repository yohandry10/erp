import { Module } from '@nestjs/common';
import { ReportsController } from '../reports.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [ReportsController],
  providers: [],
  exports: []
})
export class ReportsModule {}