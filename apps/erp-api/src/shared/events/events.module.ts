import { Module, Global, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service';
import { EnhancedEventBusService } from './enhanced-event-bus.service';
import { OutboxModule } from '../outbox/outbox.module';
import { OutboxService } from '../outbox/outbox.service';
import { EventEmitterService } from './event-emitter.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Global()
@Module({
  imports: [
    SupabaseModule,
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 200,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    forwardRef(() => OutboxModule), // ForwardRef para evitar dependencia circular
  ],
  providers: [
    {
      provide: EventBusService,
      useFactory: (outboxService?: OutboxService) => {
        return new EventBusService(outboxService);
      },
      inject: [OutboxService],
    },
    EventEmitterService,
    EnhancedEventBusService,
  ],
  exports: [EventBusService, EnhancedEventBusService, EventEmitterService],
})
export class EventsModule {}
