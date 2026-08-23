import {
  Controller,
  Get,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from './common/decorators/public.decorator';
import { RequirePermission } from './common/decorators/require-permission.decorator';
import { SupabaseService } from './shared/supabase/supabase.service';
import { CacheService } from './shared/cache/cache.service';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  @Get()
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Health check and API info' })
  getStatus() {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      message: '🚀 ERP KAME API - Sistema de Facturación Electrónica SUNAT',
      endpoints: {
        docs: '/api/docs',
        health: '/api/health',
      },
    };
  }

  @Get('health')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Legacy health check endpoint for Docker' })
  healthCheck(@Req() req: Request) {
    const token = this.configService.get<string>('HEALTH_TOKEN');
    if (token) {
      const provided = req.headers['x-health-token'] || req.query['health_token'];
      if (provided !== token) {
        throw new UnauthorizedException('Health token inválido');
      }
    }

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    };
  }

  @Get('health/live')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Liveness check' })
  getLiveHealth() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: {
        process: 'ok',
      },
    };
  }

  @Get('health/ready')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Readiness check with dependency validation' })
  async getReadyHealth() {
    const checks: Record<string, unknown> = {};
    const failures: string[] = [];

    const dependencies = [
      { name: 'database', validator: () => this.checkDatabaseDependency() },
      { name: 'redis', validator: () => this.checkRedisDependency() },
    ];

    for (const dependency of dependencies) {
      try {
        checks[dependency.name] = await dependency.validator();
      } catch (error) {
        checks[dependency.name] = 'fail';
        failures.push(dependency.name);
      }
    }

    if (failures.length > 0) {
      throw new ServiceUnavailableException({
        status: 'unready',
        timestamp: new Date().toISOString(),
        checks,
        failures,
      });
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks,
      version: '1.0.0',
    };
  }

  @Get('health/version')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Runtime version info' })
  getVersionInfo() {
    return {
      service: 'erp-api',
      version: this.configService.get<string>('APP_VERSION') ?? '1.0.0',
      commit: this.configService.get<string>('APP_COMMIT_SHA')
        ?? this.configService.get<string>('RENDER_GIT_COMMIT')
        ?? this.configService.get<string>('SOURCE_VERSION')
        ?? 'unknown',
      buildDate: this.configService.get<string>('APP_BUILD_DATE')
        ?? this.configService.get<string>('RENDER_DEPLOY_CREATED_AT')
        ?? 'unknown',
      renderServiceId: this.configService.get<string>('RENDER_SERVICE_ID') ?? null,
      nodeEnv: this.configService.get<string>('NODE_ENV') ?? 'development',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('test-connection')
  @RequirePermission('system.debug')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test database connection (authenticated)' })
  async testConnection(@Req() req: Request) {
    try {
      const user = req.user as any;
      
      // Test Supabase connection
      const { data, error } = await this.supabaseService
        .getClient()
        .from('profiles')
        .select('id')
        .eq('id', user.sub)
        .single();

      if (error) {
        throw error;
      }

      return {
        status: 'OK',
        message: 'Database connection successful',
        user_id: user.sub,
        tenant_id: user.tenant_id,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'ERROR',
        message: 'Database connection failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('info')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'API information and available modules' })
  getApiInfo() {
    return {
      name: 'ERP KAME API',
      version: '1.0.0',
      description: 'Sistema ERP completo con CPE, GRE, SIRE - Monorepo TypeScript',
      modules: {
        auth: 'Authentication & Authorization',
        cpe: 'Comprobantes de Pago Electrónicos (Facturas, Boletas, Notas)',
        gre: 'Guías de Remisión Electrónicas',
        sire: 'Sistema Integrado de Registros Electrónicos',
        ose: 'Operador de Servicios Electrónicos',
      },
      features: [
        'Facturación Electrónica SUNAT',
        'Firma Digital XML',
        'Multi-tenant architecture',
        'Real-time notifications',
        'PDF generation',
        'XML validation',
        'OSE integration',
      ],
      documentation: '/api/docs',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabaseDependency(): Promise<Record<string, unknown>> {
    const response = await this.supabaseService.getPublicClient().rpc('outbox_runtime_health_492', {
      p_max_claimable: this.readPositiveInt('OUTBOX_READY_MAX_CLAIMABLE', 5000),
      p_max_oldest_seconds: this.readPositiveInt('OUTBOX_READY_MAX_OLDEST_SECONDS', 900),
      p_max_dead_letter: this.readPositiveInt('OUTBOX_READY_MAX_DEAD_LETTER', 100),
      p_processing_stale_seconds: this.readPositiveInt('OUTBOX_READY_STALE_SECONDS', 900),
      p_required_schema_version: this.readPositiveInt('REQUIRED_DATABASE_SCHEMA_VERSION', 502),
    });
    const responseWithError = response as {
      data?: Record<string, unknown> | null;
      error?: { message?: string } | null;
    };
    if (responseWithError?.error) {
      throw new Error(responseWithError.error.message || 'Dependency check failed');
    }
    if (!responseWithError.data || responseWithError.data.ready !== true) {
      throw new Error(`Runtime database contract unready: ${JSON.stringify(responseWithError.data ?? {})}`);
    }
    return responseWithError.data;
  }

  private async checkRedisDependency(): Promise<Record<string, unknown>> {
    if (!this.cacheService) {
      if ((this.configService.get<string>('NODE_ENV') ?? '').toLowerCase() === 'production') {
        throw new Error('Redis health service unavailable');
      }
      return { ready: true, required: false, status: 'not_registered', mode: 'memory' };
    }
    const health = await this.cacheService.getRuntimeHealth();
    if (!health.ready) {
      throw new Error(`Redis unready: ${health.status}`);
    }
    return health;
  }

  private readPositiveInt(key: string, fallback: number): number {
    const value = Number.parseInt(this.configService.get<string>(key) ?? '', 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
}
