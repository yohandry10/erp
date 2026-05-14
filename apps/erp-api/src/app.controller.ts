import {
  Controller,
  Get,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from './common/decorators/public.decorator';
import { RequirePermission } from './common/decorators/require-permission.decorator';
import { SupabaseService } from './shared/supabase/supabase.service';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
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
    const checks: Record<string, string> = {};
    const failures: string[] = [];

    const dependencies = [
      { name: 'database', validator: () => this.checkDatabaseDependency() },
    ];

    for (const dependency of dependencies) {
      try {
        await dependency.validator();
        checks[dependency.name] = 'ok';
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
      commit: this.configService.get<string>('APP_COMMIT_SHA') ?? 'unknown',
      buildDate: this.configService.get<string>('APP_BUILD_DATE') ?? 'unknown',
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

  private async checkDatabaseDependency(): Promise<void> {
    const response = await this.supabaseService.getPublicClient().rpc('pgrst_reload_schema');
    const responseWithError = response as { error?: { message?: string } | null };
    if (responseWithError?.error) {
      throw new Error(responseWithError.error.message || 'Dependency check failed');
    }
  }
}
