import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { LoggerService } from './logger.service';
import { ObservabilityInterceptor } from './observability.interceptor';
import { ObservabilityController } from './observability.controller';
import { TracingModule } from '../tracing/tracing.module';

@Global()
@Module({
  imports: [TracingModule],
  providers: [
    MetricsService,
    LoggerService,
    ObservabilityInterceptor,
  ],
  controllers: [ObservabilityController],
  exports: [
    MetricsService,
    LoggerService,
    ObservabilityInterceptor,
  ],
})
export class ObservabilityModule {}