import { Module, Global } from '@nestjs/common';
import { TracingService } from './tracing.service';
import { TracingInterceptor } from './tracing.interceptor';
import { EnhancedEventBusService } from '../events/enhanced-event-bus.service';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [OutboxModule],
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