import {
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseService } from './shared/supabase/supabase.service';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { Public } from './common/decorators/public.decorator';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check and API info' })
  getStatus() {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      message: '🚀 ERP KAME API - Sistema de Facturación Electrónica SUNAT',
      endpoints: {
        docs: '/api/docs',
        health: '/api/health'
      }
    };
  }

  @Get('api/health')
  @Public()
  @ApiOperation({ summary: 'Health check endpoint for Docker' })
  healthCheck(@Req() req: Request) {
    const token = process.env.HEALTH_TOKEN;
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
      version: '1.0.0'
    };
  }

  @Post('api/test-connection')
  @UseGuards(JwtAuthGuard)
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

  @Get('api/info')
  @Public()
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
        ose: 'Operador de Servicios Electrónicos'
      },
      features: [
        'Facturación Electrónica SUNAT',
        'Firma Digital XML',
        'Multi-tenant architecture',
        'Real-time notifications',
        'PDF generation',
        'XML validation',
        'OSE integration'
      ],
      documentation: '/api/docs',
      timestamp: new Date().toISOString()
    };
  }
} 
