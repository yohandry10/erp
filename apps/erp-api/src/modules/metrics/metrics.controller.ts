import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

/**
 * Controlador de Métricas
 * 
 * Expone endpoints para consultar métricas de la aplicación
 */
@ApiTags('Métricas')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Obtener resumen de métricas de negocio
   */
  @Get('summary')
  @ApiOperation({ summary: 'Obtener resumen de métricas de negocio' })
  @ApiResponse({ status: 200, description: 'Resumen de métricas' })
  async getMetricsSummary() {
    return this.metricsService.getBusinessMetricsSummary();
  }

  /**
   * Obtener métricas de salud del sistema
   */
  @Get('health')
  @ApiOperation({ summary: 'Obtener métricas de salud del sistema' })
  @ApiResponse({ status: 200, description: 'Métricas de salud' })
  async getHealthMetrics() {
    return this.metricsService.getHealthMetrics();
  }
}
