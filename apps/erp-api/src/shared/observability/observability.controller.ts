import { Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { LoggerService } from './logger.service';
import { TracingService } from '../tracing/tracing.service';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@Controller('observability')
export class ObservabilityController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly loggerService: LoggerService,
    private readonly tracingService: TracingService
  ) {}

  @Get('metrics')
  getMetrics(
    @Headers('x-metrics-token') token?: string,
    @Query('metrics_token') tokenQuery?: string,
  ) {
    this.validateToken(token, tokenQuery);
    return {
      timestamp: new Date().toISOString(),
      metrics: this.metricsService.getMetricsStats(),
      performance: this.metricsService.getPerformanceStats(),
      business: this.metricsService.getBusinessMetricsStats(),
    };
  }

  @Get('health')
  getHealth(
    @Headers('x-metrics-token') token?: string,
    @Query('metrics_token') tokenQuery?: string,
  ) {
    this.validateToken(token, tokenQuery);
    const performanceStats = this.metricsService.getPerformanceStats();
    const overallSuccessRate = this.calculateOverallSuccessRate(performanceStats);
    const avgResponseTime = this.calculateAvgResponseTime(performanceStats);
    
    return {
      status: overallSuccessRate > 95 && avgResponseTime < 1000 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      metrics: {
        overallSuccessRate: `${overallSuccessRate.toFixed(2)}%`,
        avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
        totalRequests: this.getTotalRequests(performanceStats),
      },
      traceInfo: {
        correlationId: this.tracingService.getCurrentContext()?.correlationId,
        eventId: this.tracingService.getCurrentContext()?.eventId,
      },
    };
  }

  @Get('performance')
  getPerformanceMetrics(
    @Query('operation') operation?: string,
    @Headers('x-metrics-token') token?: string,
    @Query('metrics_token') tokenQuery?: string,
  ) {
    this.validateToken(token, tokenQuery);
    const stats = this.metricsService.getPerformanceStats();
    
    if (operation) {
      return {
        operation,
        stats: stats[operation] || null,
        timestamp: new Date().toISOString(),
      };
    }
    
    return {
      timestamp: new Date().toISOString(),
      operations: stats,
    };
  }

  @Get('business')
  getBusinessMetrics(
    @Headers('x-metrics-token') token?: string,
    @Query('metrics_token') tokenQuery?: string,
  ) {
    this.validateToken(token, tokenQuery);
    return {
      timestamp: new Date().toISOString(),
      metrics: this.metricsService.getBusinessMetricsStats(),
    };
  }

  @Get('trace')
  getCurrentTrace(
    @Headers('x-metrics-token') token?: string,
    @Query('metrics_token') tokenQuery?: string,
  ) {
    this.validateToken(token, tokenQuery);
    const context = this.tracingService.getCurrentContext();
    
    return {
      timestamp: new Date().toISOString(),
      traceContext: context,
      hasActiveTrace: !!context,
    };
  }

  private calculateOverallSuccessRate(stats: Record<string, any>): number {
    let totalRequests = 0;
    let totalSuccessful = 0;
    
    Object.values(stats).forEach((operationStats: any) => {
      totalRequests += operationStats.count;
      totalSuccessful += operationStats.successCount;
    });
    
    return totalRequests > 0 ? (totalSuccessful / totalRequests) * 100 : 100;
  }

  private calculateAvgResponseTime(stats: Record<string, any>): number {
    let totalDuration = 0;
    let totalRequests = 0;
    
    Object.values(stats).forEach((operationStats: any) => {
      totalDuration += operationStats.totalDuration;
      totalRequests += operationStats.count;
    });
    
    return totalRequests > 0 ? totalDuration / totalRequests : 0;
  }

  private getTotalRequests(stats: Record<string, any>): number {
    return Object.values(stats).reduce((total: number, operationStats: any) => {
      return total + operationStats.count;
    }, 0);
  }

  private validateToken(headerToken?: string, queryToken?: string) {
    const expected = process.env.METRICS_TOKEN;
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Metrics token no configurado');
      }
      return;
    }
    const provided = headerToken || queryToken;
    if (provided !== expected) {
      throw new UnauthorizedException('Metrics token inválido');
    }
  }
}
