import { Controller, Post, Get, Body, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DemoService } from './demo.service';
import { CreateDemoTenantDto, ConvertDemoToRealDto } from './dto/create-demo-tenant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  private ensureDemoApiEnabled() {
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.DEPLOYMENT_ENV === 'PROD';

    if (isProduction || process.env.DEMO_API_ENABLED !== 'true') {
      throw new ForbiddenException('Demo endpoints are disabled in this environment');
    }
  }

  @Post('create')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 requests por hora
  @ApiOperation({ summary: 'Crear tenant demo con datos seed (14 días)' })
  @ApiResponse({ status: 201, description: 'Tenant demo creado exitosamente' })
  @ApiResponse({ status: 429, description: 'Límite de demos alcanzado (5/hora)' })
  async createDemo(@Body() dto: CreateDemoTenantDto) {
    this.ensureDemoApiEnabled();
    return this.demoService.createDemoTenant(dto);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtener estado del tenant demo y planes disponibles' })
  @ApiResponse({ status: 200, description: 'Estado del demo con planes' })
  async getStatus(@Req() req: any) {
    this.ensureDemoApiEnabled();
    const tenantId = req.user?.tenant_id;
    return this.demoService.getDemoStatus(tenantId);
  }

  @Get('planes')
  @Public()
  @ApiOperation({ summary: 'Obtener planes disponibles para conversión' })
  @ApiResponse({ status: 200, description: 'Lista de planes con precios' })
  async getPlanes() {
    this.ensureDemoApiEnabled();
    return this.demoService.getPlanes();
  }

  @Post('convert-to-real')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Iniciar conversión a cuenta real (requiere pago)' })
  @ApiResponse({ status: 200, description: 'Instrucciones de pago o cuenta activada' })
  async convertToReal(@Req() req: any, @Body() dto: ConvertDemoToRealDto) {
    this.ensureDemoApiEnabled();
    const tenantId = req.user?.tenant_id;
    return this.demoService.convertToReal(tenantId, dto);
  }
}
