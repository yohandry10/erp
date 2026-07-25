import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecurityService {
  constructor(private configService: ConfigService) {}

  getHelmetConfig() {
    return {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
          connectSrc: [
            "'self'",
            'https://api.supabase.co',
            'wss://realtime.supabase.co',
            // en dev suele venir bien permitir localhost explícito
            'http://localhost:3001',
            'http://localhost:3002',
          ],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      frameguard: { action: 'deny' as const },
      xssFilter: true,
    };
  }

  getCorsConfig() {
    const envOrigins = this.configService.get<string>('ALLOWED_ORIGINS') ?? '';
    const allowedOrigins = envOrigins
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // En producción requerimos ALLOWED_ORIGINS explícito
    if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
      throw new Error('[CORS] ALLOWED_ORIGINS debe configurarse en producción');
    }

    // fallback razonable para dev - permitir todos los puertos comunes de Next.js
    const defaultOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3002',
      'https://localhost:3000',
      'https://localhost:3001',
      'https://localhost:3002'
    ];

    // En desarrollo, usar función dinámica para permitir cualquier localhost
    const originFunction = process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0
      ? (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
          // Permitir requests sin origin (ej: Postman, mobile apps)
          if (!origin) {
            return callback(null, true);
          }
          // Permitir cualquier localhost en desarrollo
          if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/)) {
            return callback(null, true);
          }
          // También permitir los orígenes por defecto
          if (defaultOrigins.includes(origin)) {
            return callback(null, true);
          }
          callback(null, false);
        }
      : allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;

    if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
      console.log('🌐 [CORS] Modo desarrollo: permitiendo localhost en cualquier puerto');
    }

    return {
      origin: originFunction,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'X-HTTP-Method-Override',
        'X-Forwarded-For',
        'X-Real-IP',
        // Headers funcionales del cliente web/desktop: tenant y pais via contexto.
        'x-tenant-id',
        'X-Tenant-Id',
        'x-user-id',
        'X-User-Id',
        'x-country-id',
        'X-Country-Id',
      ],
      exposedHeaders: ['Content-Disposition'],
      credentials: true,
      preflightContinue: false,
      optionsSuccessStatus: 204,
      maxAge: 86400, // 24h
    };
  }

  getCompressionConfig() {
    return {
      filter: (req: any) => {
        if (req.headers['x-no-compression']) return false;
        return true;
      },
      threshold: 1024,
    };
  }
}
