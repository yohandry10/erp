import { Module, Global } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

/**
 * Módulo de resiliencia para servicios externos
 * 
 * Incluye:
 * - Circuit Breaker: Previene sobrecarga de servicios fallidos
 * - (Futuro) Rate Limiter: Control de tasa de llamadas
 * - (Futuro) Bulkhead: Aislamiento de recursos
 */
@Global()
@Module({
  providers: [CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class ResilienceModule {}
