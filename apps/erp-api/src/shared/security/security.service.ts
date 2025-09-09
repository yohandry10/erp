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

    // fallback razonable para dev
    if (allowedOrigins.length === 0) {
      allowedOrigins.push(
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'https://localhost:3000',
        'https://localhost:3001'
      );
    }

    return {
      origin: allowedOrigins,
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
        // 👇 imprescindibles para tu caso
        'x-country-id',
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
