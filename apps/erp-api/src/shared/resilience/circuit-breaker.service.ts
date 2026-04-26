import { Injectable, Logger } from '@nestjs/common';

/**
 * Q33: Circuit Breaker para servicios externos
 * 
 * Estados:
 * - CLOSED: Funcionamiento normal, las llamadas pasan
 * - OPEN: Circuito abierto, las llamadas fallan inmediatamente
 * - HALF_OPEN: Probando si el servicio se recuperó
 * 
 * Configuración por servicio:
 * - failureThreshold: Número de fallos consecutivos para abrir el circuito
 * - successThreshold: Número de éxitos en HALF_OPEN para cerrar el circuito
 * - timeout: Tiempo en ms antes de pasar de OPEN a HALF_OPEN
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;  // Fallos para abrir (default: 5)
  successThreshold: number;  // Éxitos para cerrar (default: 2)
  timeout: number;           // ms antes de probar de nuevo (default: 30000)
  monitorInterval?: number;  // ms para logging de estado (default: 60000)
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  openedAt: Date | null;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000, // 30 segundos
  monitorInterval: 60000, // 1 minuto
};

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private circuits: Map<string, CircuitStats> = new Map();
  private configs: Map<string, CircuitBreakerConfig> = new Map();

  /**
   * Registra un nuevo circuito para un servicio
   */
  registerCircuit(serviceName: string, config?: Partial<CircuitBreakerConfig>): void {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    this.configs.set(serviceName, finalConfig);
    this.circuits.set(serviceName, {
      state: CircuitState.CLOSED,
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      openedAt: null,
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
    });
    this.logger.log(`Circuit breaker registrado para: ${serviceName}`);
  }

  /**
   * Verifica si se puede ejecutar una llamada al servicio
   */
  canExecute(serviceName: string): boolean {
    const stats = this.getOrCreateCircuit(serviceName);
    const config = this.configs.get(serviceName) || DEFAULT_CONFIG;

    if (stats.state === CircuitState.CLOSED) {
      return true;
    }

    if (stats.state === CircuitState.OPEN) {
      // Verificar si pasó el timeout para probar de nuevo
      if (stats.openedAt && Date.now() - stats.openedAt.getTime() >= config.timeout) {
        this.transitionTo(serviceName, CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN: permitir una llamada de prueba
    return true;
  }

  /**
   * Registra una llamada exitosa
   */
  recordSuccess(serviceName: string): void {
    const stats = this.getOrCreateCircuit(serviceName);
    const config = this.configs.get(serviceName) || DEFAULT_CONFIG;

    stats.totalCalls++;
    stats.totalSuccesses++;
    stats.lastSuccess = new Date();
    stats.failures = 0; // Reset de fallos consecutivos

    if (stats.state === CircuitState.HALF_OPEN) {
      stats.successes++;
      if (stats.successes >= config.successThreshold) {
        this.transitionTo(serviceName, CircuitState.CLOSED);
      }
    }
  }

  /**
   * Registra una llamada fallida
   */
  recordFailure(serviceName: string, error?: Error): void {
    const stats = this.getOrCreateCircuit(serviceName);
    const config = this.configs.get(serviceName) || DEFAULT_CONFIG;

    stats.totalCalls++;
    stats.totalFailures++;
    stats.failures++;
    stats.lastFailure = new Date();
    stats.successes = 0; // Reset de éxitos consecutivos

    if (stats.state === CircuitState.HALF_OPEN) {
      // Fallo en prueba - volver a abrir
      this.transitionTo(serviceName, CircuitState.OPEN);
    } else if (stats.state === CircuitState.CLOSED) {
      if (stats.failures >= config.failureThreshold) {
        this.transitionTo(serviceName, CircuitState.OPEN);
      }
    }

    this.logger.warn(
      `Circuit ${serviceName}: Fallo registrado (${stats.failures}/${config.failureThreshold}). ` +
      `Error: ${error?.message || 'Unknown'}`,
    );
  }

  /**
   * Ejecuta una función con protección de circuit breaker
   */
  async execute<T>(
    serviceName: string,
    fn: () => Promise<T>,
    fallback?: () => T | Promise<T>,
  ): Promise<T> {
    if (!this.canExecute(serviceName)) {
      const stats = this.circuits.get(serviceName);
      const config = this.configs.get(serviceName) || DEFAULT_CONFIG;
      const remainingTime = stats?.openedAt 
        ? Math.max(0, config.timeout - (Date.now() - stats.openedAt.getTime()))
        : config.timeout;

      this.logger.warn(
        `Circuit ${serviceName} OPEN. Llamada rechazada. ` +
        `Próximo intento en ${Math.ceil(remainingTime / 1000)}s`,
      );

      if (fallback) {
        return fallback();
      }

      throw new CircuitBreakerOpenError(
        serviceName,
        `Servicio ${serviceName} temporalmente no disponible. Intente en ${Math.ceil(remainingTime / 1000)} segundos.`,
      );
    }

    try {
      const result = await fn();
      this.recordSuccess(serviceName);
      return result;
    } catch (error) {
      this.recordFailure(serviceName, error as Error);
      throw error;
    }
  }

  /**
   * Obtiene el estado actual de un circuito
   */
  getState(serviceName: string): CircuitState {
    return this.getOrCreateCircuit(serviceName).state;
  }

  /**
   * Obtiene estadísticas de un circuito
   */
  getStats(serviceName: string): CircuitStats {
    return { ...this.getOrCreateCircuit(serviceName) };
  }

  /**
   * Obtiene estadísticas de todos los circuitos
   */
  getAllStats(): Record<string, CircuitStats> {
    const result: Record<string, CircuitStats> = {};
    this.circuits.forEach((stats, name) => {
      result[name] = { ...stats };
    });
    return result;
  }

  /**
   * Fuerza el cierre de un circuito (para recuperación manual)
   */
  forceClose(serviceName: string): void {
    this.transitionTo(serviceName, CircuitState.CLOSED);
    this.logger.log(`Circuit ${serviceName} forzado a CLOSED manualmente`);
  }

  /**
   * Fuerza la apertura de un circuito (para mantenimiento)
   */
  forceOpen(serviceName: string): void {
    this.transitionTo(serviceName, CircuitState.OPEN);
    this.logger.log(`Circuit ${serviceName} forzado a OPEN manualmente`);
  }

  private getOrCreateCircuit(serviceName: string): CircuitStats {
    if (!this.circuits.has(serviceName)) {
      this.registerCircuit(serviceName);
    }
    return this.circuits.get(serviceName)!;
  }

  private transitionTo(serviceName: string, newState: CircuitState): void {
    const stats = this.circuits.get(serviceName);
    if (!stats) return;

    const oldState = stats.state;
    stats.state = newState;

    if (newState === CircuitState.OPEN) {
      stats.openedAt = new Date();
      stats.successes = 0;
    } else if (newState === CircuitState.CLOSED) {
      stats.failures = 0;
      stats.successes = 0;
      stats.openedAt = null;
    } else if (newState === CircuitState.HALF_OPEN) {
      stats.successes = 0;
    }

    this.logger.log(
      `Circuit ${serviceName}: ${oldState} → ${newState}`,
    );
  }
}

/**
 * Error lanzado cuando el circuito está abierto
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly serviceName: string,
    message: string,
  ) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}
