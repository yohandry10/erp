import { Injectable } from '@nestjs/common';
import { TracingService } from '../tracing/tracing.service';

export interface MetricData {
  name: string;
  value: number;
  unit: 'ms' | 'count' | 'bytes' | 'percentage' | 'rate';
  tags?: Record<string, string>;
  timestamp: Date;
}

export interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  errorType?: string;
  metadata?: Record<string, any>;
}

export interface BusinessMetric {
  metric: string;
  value: number;
  dimension?: string;
  aggregationType: 'sum' | 'avg' | 'count' | 'max' | 'min';
  metadata?: Record<string, any>;
}

@Injectable()
export class MetricsService {
  private metrics: Map<string, MetricData[]> = new Map();
  private performanceMetrics: PerformanceMetric[] = [];
  private businessMetrics: BusinessMetric[] = [];

  constructor(private readonly tracingService: TracingService) {}

  /**
   * Registra una métrica personalizada
   */
  recordMetric(metric: Omit<MetricData, 'timestamp'>): void {
    const metricData: MetricData = {
      ...metric,
      timestamp: new Date(),
    };

    const key = metric.name;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push(metricData);
    
    // Mantener solo las últimas 1000 métricas por tipo
    const metricsList = this.metrics.get(key)!;
    if (metricsList.length > 1000) {
      metricsList.splice(0, metricsList.length - 1000);
    }

    this.tracingService.log('debug', 'Métrica registrada', {
      metric: metric.name,
      value: metric.value,
      unit: metric.unit,
      tags: metric.tags,
    });
  }

  /**
   * Registra métricas de performance
   */
  recordPerformance(performance: PerformanceMetric): void {
    this.performanceMetrics.push(performance);
    
    // Mantener solo las últimas 5000 métricas de performance
    if (this.performanceMetrics.length > 5000) {
      this.performanceMetrics.splice(0, this.performanceMetrics.length - 5000);
    }

    this.tracingService.log('info', 'Métrica de performance registrada', {
      operation: performance.operation,
      duration: `${performance.duration}ms`,
      success: performance.success,
      errorType: performance.errorType,
    });
  }

  /**
   * Registra métricas de negocio
   */
  recordBusinessMetric(business: BusinessMetric): void {
    this.businessMetrics.push(business);
    
    // Mantener solo las últimas 10000 métricas de negocio
    if (this.businessMetrics.length > 10000) {
      this.businessMetrics.splice(0, this.businessMetrics.length - 10000);
    }

    this.tracingService.log('info', 'Métrica de negocio registrada', {
      metric: business.metric,
      value: business.value,
      dimension: business.dimension,
      aggregationType: business.aggregationType,
    });
  }

  /**
   * Mide el tiempo de ejecución de una función
   */
  async measureTime<T>(
    operation: string,
    fn: () => Promise<T> | T,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let errorType: string | undefined;

    try {
      const result = await fn();
      return result;
    } catch (error) {
      success = false;
      errorType = error.constructor.name;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      
      this.recordPerformance({
        operation,
        duration,
        success,
        errorType,
        metadata,
      });

      this.recordMetric({
        name: `operation.${operation}.duration`,
        value: duration,
        unit: 'ms',
        tags: {
          success: success.toString(),
          errorType: errorType || 'none',
        },
      });
    }
  }

  /**
   * Incrementa un contador
   */
  incrementCounter(name: string, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      value: 1,
      unit: 'count',
      tags,
    });
  }

  /**
   * Registra un gauge (valor instantáneo)
   */
  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      value,
      unit: 'count',
      tags,
    });
  }

  /**
   * Obtiene estadísticas de métricas
   */
  getMetricsStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    // Estadísticas de métricas personalizadas
    for (const [name, metrics] of this.metrics.entries()) {
      const values = metrics.map(m => m.value);
      stats[name] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
        latest: metrics[metrics.length - 1],
      };
    }

    return stats;
  }

  /**
   * Obtiene estadísticas de performance
   */
  getPerformanceStats(): Record<string, any> {
    const operationStats: Record<string, any> = {};

    // Agrupar por operación
    for (const metric of this.performanceMetrics) {
      if (!operationStats[metric.operation]) {
        operationStats[metric.operation] = {
          count: 0,
          successCount: 0,
          errorCount: 0,
          totalDuration: 0,
          minDuration: Infinity,
          maxDuration: 0,
          errors: {} as Record<string, number>,
        };
      }

      const stats = operationStats[metric.operation];
      stats.count++;
      stats.totalDuration += metric.duration;
      stats.minDuration = Math.min(stats.minDuration, metric.duration);
      stats.maxDuration = Math.max(stats.maxDuration, metric.duration);

      if (metric.success) {
        stats.successCount++;
      } else {
        stats.errorCount++;
        if (metric.errorType) {
          stats.errors[metric.errorType] = (stats.errors[metric.errorType] || 0) + 1;
        }
      }
    }

    // Calcular promedios y tasas
    for (const operation in operationStats) {
      const stats = operationStats[operation];
      stats.avgDuration = stats.totalDuration / stats.count;
      stats.successRate = (stats.successCount / stats.count) * 100;
      stats.errorRate = (stats.errorCount / stats.count) * 100;
    }

    return operationStats;
  }

  /**
   * Obtiene estadísticas de métricas de negocio
   */
  getBusinessMetricsStats(): Record<string, any> {
    const businessStats: Record<string, any> = {};

    // Agrupar por métrica
    for (const metric of this.businessMetrics) {
      const key = metric.dimension ? `${metric.metric}.${metric.dimension}` : metric.metric;
      
      if (!businessStats[key]) {
        businessStats[key] = {
          count: 0,
          sum: 0,
          avg: 0,
          min: Infinity,
          max: -Infinity,
          aggregationType: metric.aggregationType,
        };
      }

      const stats = businessStats[key];
      stats.count++;
      stats.sum += metric.value;
      stats.min = Math.min(stats.min, metric.value);
      stats.max = Math.max(stats.max, metric.value);
      stats.avg = stats.sum / stats.count;
    }

    return businessStats;
  }

  /**
   * Limpia métricas antiguas
   */
  cleanupOldMetrics(olderThanHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    // Limpiar métricas personalizadas
    for (const [name, metrics] of this.metrics.entries()) {
      const filteredMetrics = metrics.filter(m => m.timestamp > cutoffTime);
      this.metrics.set(name, filteredMetrics);
    }

    this.tracingService.log('info', 'Métricas antiguas limpiadas', {
      olderThanHours,
      cutoffTime: cutoffTime.toISOString(),
    });
  }
}