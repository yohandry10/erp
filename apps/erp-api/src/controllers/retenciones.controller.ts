import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../modules/auth/current-user.decorator';
import { RetencionesService } from '../modules/retenciones/retenciones.service';
import {
  CalcularAjusteFiscalDto,
  DepositarDetraccionDto,
  ListarAjustesFiscalesQueryDto,
  ListarAnticiposQueryDto,
  RegistrarAjusteFiscalDto,
  RegistrarAnticipoDto,
  RevertirAjusteFiscalCxcDto,
} from '../modules/retenciones/dto/retenciones-input.dto';

@ApiTags('Finanzas - Ajustes fiscales y anticipos')
@ApiBearerAuth()
@Controller('retenciones')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RetencionesController {
  constructor(private readonly retencionesService: RetencionesService) {}

  @Post('calcular')
  @RequirePermission('finanzas.read')
  @ApiOperation({ summary: 'Calcular un ajuste fiscal sin persistirlo' })
  calcular(@Body() dto: CalcularAjusteFiscalDto) {
    return { success: true, data: this.retencionesService.calcularAjuste(dto) };
  }

  @Get()
  @RequirePermission('finanzas.read')
  @ApiOperation({ summary: 'Listar retenciones, percepciones, detracciones y anticipos aplicados' })
  listar(
    @CurrentTenant() tenantId: string,
    @Query() filtros: ListarAjustesFiscalesQueryDto,
  ) {
    return this.retencionesService.listarAjustes(tenantId, filtros);
  }

  @Get('anticipos')
  @RequirePermission('finanzas.read')
  @ApiOperation({ summary: 'Listar anticipos reales y su saldo disponible' })
  listarAnticipos(
    @CurrentTenant() tenantId: string,
    @Query() filtros: ListarAnticiposQueryDto,
  ) {
    return this.retencionesService.listarAnticipos(tenantId, filtros);
  }

  @Post('anticipos')
  @RequirePermission('finanzas.write')
  @ApiOperation({ summary: 'Registrar anticipo y movimiento bancario en una transacción' })
  @ApiResponse({ status: 201, description: 'Anticipo registrado idempotentemente' })
  registrarAnticipo(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: RegistrarAnticipoDto,
  ) {
    return this.retencionesService.registrarAnticipo(tenantId, user?.id, dto);
  }

  @Post('ajustes')
  @RequirePermission('finanzas.write')
  @ApiOperation({ summary: 'Aplicar ajuste fiscal o anticipo a una CxC/CxP' })
  @ApiResponse({ status: 201, description: 'Documento, evidencia y outbox confirmados juntos' })
  registrarAjuste(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: RegistrarAjusteFiscalDto,
  ) {
    return this.retencionesService.registrarAjuste(tenantId, user?.id, dto);
  }

  @Post(':id/depositar-detraccion')
  @RequirePermission('finanzas.write')
  @ApiOperation({ summary: 'Depositar una detracción pendiente de proveedor' })
  depositarDetraccion(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: DepositarDetraccionDto,
  ) {
    return this.retencionesService.depositarDetraccion(tenantId, id, user?.id, dto);
  }

  @Post(':id/revertir-ajuste-cxc')
  @RequirePermission('finanzas.write')
  @ApiOperation({ summary: 'Revertir explícitamente un ajuste fiscal CxC activo' })
  revertirAjusteCxc(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: RevertirAjusteFiscalCxcDto,
  ) {
    return this.retencionesService.revertirAjusteCxc(tenantId, id, user?.id, dto);
  }

  @Get(':id')
  @RequirePermission('finanzas.read')
  @ApiOperation({ summary: 'Obtener una operación fiscal por ID' })
  obtener(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.retencionesService.obtenerAjuste(tenantId, id);
  }
}
