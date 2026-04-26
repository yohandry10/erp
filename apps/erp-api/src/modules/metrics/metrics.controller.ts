import { Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Controlador de Métricas
 * 
 * Expone endpoints para consultar métricas de la aplicación
 */
@ApiTags('Métricas')
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Obtener resumen de métricas de negocio
   */
  @Get('summary')
  @ApiOperation({ summary: 'Obtener resumen de métricas de negocio' })
  @ApiResponse({ status: 200, description: 'Resumen de métricas' })
  async getMetricsSummary(
    @Headers('x-metrics-token') token?: string,
    @Query('metrics_token') tokenQuery?: string,
  ) {
    this.validateToken(token, tokenQuery);
    return this.metricsService.getBusinessMetricsSummary();
  }

  /**
   * Obtener métricas de salud del sistema
   */
  @Get('health')
  @ApiOperation({ summary: 'Obtener métricas de salud del sistema' })
  @ApiResponse({ status: 200, description: 'Métricas de salud' })
  async getHealthMetrics(
    @Headers('x-metrics-token') token?: string,
    @Query('metrics_token') tokenQuery?: string,
  ) {
    this.validateToken(token, tokenQuery);
    return this.metricsService.getHealthMetrics();
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
