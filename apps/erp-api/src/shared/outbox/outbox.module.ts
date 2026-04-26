import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SupabaseModule } from '../supabase/supabase.module';
import { EventsModule } from '../events/events.module';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox-worker.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SupabaseModule,
    forwardRef(() => EventsModule), // ForwardRef para evitar dependencia circular
  ],
  providers: [OutboxService, OutboxWorker],
  exports: [OutboxService],
})
export class OutboxModule {}
