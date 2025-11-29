import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdaptiveRateLimitService } from '../adaptive-rate-limit.service';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Límite base de requests */
  limit?: number;
  /** Ventana de tiempo en ms */
  windowMs?: number;
  /** Si true, omite rate limiting para este endpoint */
  skip?: boolean;
}

/**
 * Decorador para configurar rate limiting por endpoint
 */
export function RateLimit(options: RateLimitOptions) {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor.value);
    } else {
      Reflect.defineMetadata(RATE_LIMIT_KEY, options, target);
    }
    return descriptor || target;
  };
}

@Injectable()
export class AdaptiveRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AdaptiveRateLimitGuard.name);

  constructor(
    private readonly rateLimitService: AdaptiveRateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Obtener opciones del decorador
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    ) || {};

    // Si está marcado para omitir
    if (options.skip) {
      return true;
    }

    // Extraer información del request
    const userId = request.user?.id || request.user?.sub || 'anonymous';
    const tenantId = request.user?.tenantId || request.headers['x-tenant-id'] || 'default';
    const endpoint = `${request.method} ${request.route?.path || request.url}`;
    const ip = this.getClientIp(request);

    // Verificar si usuario está bloqueado
    const isBlocked = await this.rateLimitService.isUserBlocked(userId, tenantId);
    if (isBlocked) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'User temporarily blocked due to suspicious activity',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Verificar rate limit
    const result = await this.rateLimitService.checkRateLimit(
      userId,
      tenantId,
      endpoint,
      ip,
    );

    // Agregar headers de rate limit
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

    // Si es anomalía, registrar y potencialmente bloquear
    if (result.isAnomaly) {
      this.logger.warn(
        `Anomaly detected for user ${userId}: ${result.anomalyReason}`,
      );
      response.setHeader('X-RateLimit-Anomaly', 'true');
      
      // Bloquear si excede 10x el límite
      if (result.remaining < -10) {
        await this.rateLimitService.blockUser(
          userId,
          tenantId,
          30, // 30 minutos
          result.anomalyReason || 'Excessive requests',
        );
      }
    }

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          error: 'Too Many Requests',
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getClientIp(request: any): string {
    // Considerar headers de proxy
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return realIp;
    }

    return (
      request.ip ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }
}
