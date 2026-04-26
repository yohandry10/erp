import { Module } from '@nestjs/common';
import { BackgroundJobsService } from './background-jobs.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { EventBusService } from '../events/event-bus.service';

@Module({
  imports: [SupabaseModule],
  providers: [BackgroundJobsService],
  exports: [BackgroundJobsService],
})
export class JobsModule {} 