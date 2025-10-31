import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Módulo de Métricas para Prometheus
 * 
 * Expone métricas de la aplicación en formato Prometheus:
 * - Métricas HTTP (requests, latencia, errores)
 * - Métricas de negocio (órdenes, facturas, etc.)
 * - Métricas de sistema (memoria, CPU)
 * - Métricas de base de datos
 */
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: {
          prefix: 'erp_',
        },
      },
      path: '/metrics', // Ruta relativa, será /api/metrics con el prefijo global
      defaultLabels: {
        app: 'erp-api',
        environment: process.env.NODE_ENV || 'development',
      },
    }),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
