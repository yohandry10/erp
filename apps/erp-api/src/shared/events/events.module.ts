import { Module, Global, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service';
import { EnhancedEventBusService } from './enhanced-event-bus.service';
import { OutboxModule } from '../outbox/outbox.module';
import { OutboxService } from '../outbox/outbox.service';

@Global()
@Module({
  imports: [
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
    EnhancedEventBusService,
  ],
  exports: [EventBusService, EnhancedEventBusService],
})
export class EventsModule {}
