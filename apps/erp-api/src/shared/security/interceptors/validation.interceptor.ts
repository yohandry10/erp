import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class ValidationInterceptor implements NestInterceptor {
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
    const suspiciousHeaders = ['x-forwarded-host', 'x-original-url', 'x-rewrite-url'];
    
    for (const header of suspiciousHeaders) {
      if (request.headers[header]) {
        throw new BadRequestException(`Header ${header} no permitido`);
      }
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