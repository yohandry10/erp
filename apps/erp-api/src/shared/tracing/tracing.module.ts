import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TracingService } from './tracing.service';
import { TracingInterceptor } from './tracing.interceptor';
import { EnhancedEventBusService } from '../events/enhanced-event-bus.service';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [
    OutboxModule,
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
  ],
  providers: [
    TracingService,
    TracingInterceptor,
    EnhancedEventBusService,
  ],
  exports: [
    TracingService,
    TracingInterceptor,
    EnhancedEventBusService,
  ],
})
export class TracingModule {}