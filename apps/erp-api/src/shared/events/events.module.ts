import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service';
import { EnhancedEventBusService } from './enhanced-event-bus.service';

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
  ],
  providers: [EventBusService, EnhancedEventBusService],
  exports: [EventBusService, EnhancedEventBusService],
})
export class EventsModule {}
