import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

/**
 * Servicio de Métricas
 * 
 * Gestiona métricas personalizadas de negocio y sistema
 */
@Injectable()
export class MetricsService {
  // Métricas HTTP
  private readonly httpRequestsTotal: Counter;
  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestErrors: Counter;

  // Métricas de Negocio
  private readonly ordenesCompraCreadas: Counter;
  private readonly facturasEmitidas: Counter;
  private readonly pagosRegistrados: Counter;
  private readonly inventarioMovimientos: Counter;

  // Métricas de Base de Datos
  private readonly dbQueryDuration: Histogram;
  private readonly dbConnectionsActive: Gauge;
  private readonly dbErrors: Counter;

  // Métricas de Sistema
  private readonly cacheHits: Counter;
  private readonly cacheMisses: Counter;
  private readonly queueSize: Gauge;

  constructor() {
    // Inicializar métricas HTTP
    this.httpRequestsTotal = new Counter({
      name: 'erp_http_requests_total',
      help: 'Total de requests HTTP',
      labelNames: ['method', 'route', 'status_code', 'tenant_id'],
    });

    this.httpRequestDuration = new Histogram({
      name: 'erp_http_request_duration_seconds',
      help: 'Duración de requests HTTP en segundos',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    });

    this.httpRequestErrors = new Counter({
      name: 'erp_http_request_errors_total',
      help: 'Total de errores HTTP',
      labelNames: ['method', 'route', 'error_type'],
    });

    // Inicializar métricas de negocio
    this.ordenesCompraCreadas = new Counter({
      name: 'erp_ordenes_compra_creadas_total',
      help: 'Total de órdenes de compra creadas',
      labelNames: ['tenant_id', 'estado'],
    });

    this.facturasEmitidas = new Counter({
      name: 'erp_facturas_emitidas_total',
      help: 'Total de facturas emitidas',
      labelNames: ['tenant_id', 'tipo_documento'],
    });

    this.pagosRegistrados = new Counter({
      name: 'erp_pagos_registrados_total',
      help: 'Total de pagos registrados',
      labelNames: ['tenant_id', 'metodo_pago'],
    });

    this.inventarioMovimientos = new Counter({
      name: 'erp_inventario_movimientos_total',
      help: 'Total de movimientos de inventario',
      labelNames: ['tenant_id', 'tipo_movimiento'],
    });

    // Inicializar métricas de base de datos
    this.dbQueryDuration = new Histogram({
      name: 'erp_db_query_duration_seconds',
      help: 'Duración de queries a la base de datos',
      labelNames: ['operation', 'table'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
    });

    this.dbConnectionsActive = new Gauge({
      name: 'erp_db_connections_active',
      help: 'Conexiones activas a la base de datos',
    });

    this.dbErrors = new Counter({
      name: 'erp_db_errors_total',
      help: 'Total de errores de base de datos',
      labelNames: ['error_type'],
    });

    // Inicializar métricas de sistema
    this.cacheHits = new Counter({
      name: 'erp_cache_hits_total',
      help: 'Total de cache hits',
      labelNames: ['cache_key'],
    });

    this.cacheMisses = new Counter({
      name: 'erp_cache_misses_total',
      help: 'Total de cache misses',
      labelNames: ['cache_key'],
    });

    this.queueSize = new Gauge({
      name: 'erp_queue_size',
      help: 'Tamaño actual de la cola de trabajos',
      labelNames: ['queue_name'],
    });
  }

  // Métodos para registrar métricas HTTP
  recordHttpRequest(method: string, route: string, statusCode: number, tenantId?: string) {
    this.httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode,
      tenant_id: tenantId || 'unknown',
    });
  }

  recordHttpDuration(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestDuration.observe(
      {
        method,
        route,
        status_code: statusCode,
      },
      duration,
    );
  }

  recordHttpError(method: string, route: string, errorType: string) {
    this.httpRequestErrors.inc({
      method,
      route,
      error_type: errorType,
    });
  }

  // Métodos para registrar métricas de negocio
  recordOrdenCompraCreada(tenantId: string, estado: string) {
    this.ordenesCompraCreadas.inc({ tenant_id: tenantId, estado });
  }

  recordFacturaEmitida(tenantId: string, tipoDocumento: string) {
    this.facturasEmitidas.inc({ tenant_id: tenantId, tipo_documento: tipoDocumento });
  }

  recordPagoRegistrado(tenantId: string, metodoPago: string) {
    this.pagosRegistrados.inc({ tenant_id: tenantId, metodo_pago: metodoPago });
  }

  recordInventarioMovimiento(tenantId: string, tipoMovimiento: string) {
    this.inventarioMovimientos.inc({ tenant_id: tenantId, tipo_movimiento: tipoMovimiento });
  }

  // Métodos para registrar métricas de base de datos
  recordDbQuery(operation: string, table: string, duration: number) {
    this.dbQueryDuration.observe({ operation, table }, duration);
  }

  setDbConnectionsActive(count: number) {
    this.dbConnectionsActive.set(count);
  }

  recordDbError(errorType: string) {
    this.dbErrors.inc({ error_type: errorType });
  }

  // Métodos para registrar métricas de sistema
  recordCacheHit(cacheKey: string) {
    this.cacheHits.inc({ cache_key: cacheKey });
  }

  recordCacheMiss(cacheKey: string) {
    this.cacheMisses.inc({ cache_key: cacheKey });
  }

  setQueueSize(queueName: string, size: number) {
    this.queueSize.set({ queue_name: queueName }, size);
  }

  // Métodos para obtener resúmenes
  async getBusinessMetricsSummary() {
    const metrics = await register.metrics();
    return {
      timestamp: new Date().toISOString(),
      metrics: this.parseMetrics(metrics),
    };
  }

  async getHealthMetrics() {
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    };
  }

  private parseMetrics(metricsText: string) {
    // Parsear métricas de Prometheus a formato JSON
    const lines = metricsText.split('\n');
    const metrics: Record<string, any> = {};

    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      
      const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?(.*?)\}?\s+(.+)$/);
      if (match) {
        const [, name, labels, value] = match;
        if (!metrics[name]) {
          metrics[name] = [];
        }
        metrics[name].push({
          labels: labels ? this.parseLabels(labels) : {},
          value: parseFloat(value),
        });
      }
    }

    return metrics;
  }

  private parseLabels(labelsStr: string): Record<string, string> {
    const labels: Record<string, string> = {};
    const matches = labelsStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g);
    
    for (const match of matches) {
      labels[match[1]] = match[2];
    }
    
    return labels;
  }
}
