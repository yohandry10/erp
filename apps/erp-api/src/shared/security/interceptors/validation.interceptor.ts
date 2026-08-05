import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ValidationInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Validar tamaño del payload
    const contentLength = parseInt(request.headers['content-length'] || '0');
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (contentLength > maxSize) {
      throw new BadRequestException('Payload demasiado grande');
    }

    // Validar headers maliciosos
    this.validateHeaders(request);
    
    // Validar query parameters
    this.validateQueryParams(request);

    return next.handle();
  }

  private validateHeaders(request: Request) {
    // x-forwarded-host es un header normal de un reverse proxy. Rechazarlo sin
    // mirar su valor bloqueaba todas las llamadas same-origin Vercel -> Render.
    // Se acepta únicamente cuando coincide con un origen configurado.
    const forwardedHost = request.headers['x-forwarded-host'];
    if (forwardedHost && !this.isAllowedForwardedHost(forwardedHost)) {
      throw new BadRequestException('Header x-forwarded-host no permitido');
    }

    for (const header of ['x-original-url', 'x-rewrite-url']) {
      if (request.headers[header]) {
        throw new BadRequestException(`Header ${header} no permitido`);
      }
    }
  }

  private isAllowedForwardedHost(value: string | string[]): boolean {
    const rawAllowed = [
      this.configService.get<string>('ALLOWED_ORIGINS'),
      this.configService.get<string>('FRONTEND_URL'),
    ]
      .filter((entry): entry is string => Boolean(entry))
      .flatMap(entry => entry.split(','));

    const allowedHosts = new Set(
      rawAllowed
        .map(entry => this.extractHost(entry))
        .filter((host): host is string => Boolean(host)),
    );
    if (allowedHosts.size === 0) return false;

    const forwardedValues = (Array.isArray(value) ? value : value.split(','))
      .map(entry => this.extractHost(entry))
      .filter((host): host is string => Boolean(host));

    return forwardedValues.length > 0 && forwardedValues.every(host => allowedHosts.has(host));
  }

  private extractHost(value: string): string | null {
    const trimmed = value.trim().toLowerCase().replace(/\.$/, '');
    if (!trimmed) return null;
    try {
      return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).host;
    } catch {
      return null;
    }
  }

  private validateQueryParams(request: Request) {
    const query = request.query;
    
    // Validar que no haya parámetros con caracteres peligrosos
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') {
        // Detectar posibles inyecciones SQL o XSS
        const dangerousPatterns = [
          /<script[^>]*>.*?<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /(union|select|insert|update|delete|drop|create|alter)\s+/gi,
        ];
        
        for (const pattern of dangerousPatterns) {
          if (pattern.test(value)) {
            throw new BadRequestException(`Parámetro ${key} contiene contenido no válido`);
          }
        }
      }
    }
  }
}
