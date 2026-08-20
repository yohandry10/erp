import { Controller, Post, Get, Body, Param, UseGuards, Req, Headers, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DemoService } from './demo.service';
import { CreateDemoTenantDto, ConvertDemoToRealDto } from './dto/create-demo-tenant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';

import { MotivoOpcionalDto } from '../shared-dto/acciones-simples.dto';

@ApiTags('Demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  /**
   * La prueba gratuita es parte del producto y tiene que funcionar en
   * producción: es donde el cliente prueba y donde luego vive su cuenta real,
   * para que al activarla conserve lo que cargó. Antes se bloqueaba en PROD sin
   * excepción, así que el embudo entero era inalcanzable para un cliente.
   * El interruptor sigue siendo explícito y apagado por defecto.
   */
  private ensureDemoApiEnabled() {
    if (process.env.DEMO_API_ENABLED !== 'true') {
      throw new ForbiddenException('Demo endpoints are disabled in this environment');
    }
  }

  @Post('create')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 requests por hora
  @ApiOperation({ summary: 'Crear tenant demo con datos seed (14 días)' })
  @ApiResponse({ status: 201, description: 'Tenant demo creado exitosamente' })
  @ApiResponse({ status: 429, description: 'Límite de demos alcanzado (5/hora)' })
  async createDemo(
    @Body() dto: CreateDemoTenantDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.ensureDemoApiEnabled();
    return this.demoService.createDemoTenant(dto, idempotencyKey);
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

  // ==========================================================================
  // Activación por transferencia: el cliente paga y el superadmin confirma.
  // ==========================================================================

  /**
   * No lleva ensureDemoApiEnabled: aprobar solicitudes es una tarea de
   * administración que tiene que funcionar en producción, que es justo donde
   * los endpoints de demo están apagados.
   */
  /**
   * Público a propósito: la pantalla del cliente consulta su propia solicitud
   * mientras espera, y su sesión de demo puede haber caducado. Solo devuelve el
   * estado, así que conocer el id no revela nada del negocio.
   */
  @Get('conversiones-pendientes/:id/estado')
  @Public()
  @Throttle({ default: { limit: 120, ttl: 3600000 } })
  @ApiOperation({ summary: 'Estado de una solicitud de activación' })
  @ApiResponse({ status: 200, description: 'Estado de la solicitud' })
  async estadoConversion(@Param('id') id: string) {
    return this.demoService.estadoConversionPendiente(id);
  }

  @Get('conversiones-pendientes')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Solicitudes de activación esperando confirmación de pago' })
  @ApiResponse({ status: 200, description: 'Listado de solicitudes pendientes' })
  async listarConversionesPendientes() {
    return this.demoService.listarConversionesPendientes();
  }

  @Post('conversiones-pendientes/:id/aprobar')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Confirmar el pago y activar la cuenta del cliente' })
  @ApiResponse({ status: 201, description: 'Cuenta activada' })
  @ApiResponse({ status: 404, description: 'La solicitud no existe o ya fue procesada' })
  async aprobarConversion(@Req() req: any, @Param('id') id: string) {
    return this.demoService.aprobarConversionPendiente(id, req.user?.email);
  }

  @Post('conversiones-pendientes/:id/rechazar')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Rechazar una solicitud dejando dicho el motivo' })
  @ApiResponse({ status: 201, description: 'Solicitud rechazada' })
  async rechazarConversion(
    @Param('id') id: string,
    @Body() body: MotivoOpcionalDto,
  ) {
    const motivo = String(body?.motivo || '').trim();
    if (!motivo) {
      throw new BadRequestException(
        'Indique el motivo del rechazo: el cliente necesita saber qué corregir',
      );
    }
    return this.demoService.rechazarConversionPendiente(id, motivo);
  }
}
