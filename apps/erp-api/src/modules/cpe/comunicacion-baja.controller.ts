import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ComunicacionBajaService, ComunicacionBajaDto, ResumenDiarioDto } from './comunicacion-baja.service';

@ApiTags('cpe-baja')
@Controller('cpe/baja')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class ComunicacionBajaController {
  constructor(private readonly comunicacionBajaService: ComunicacionBajaService) {}

  /**
   * Crear comunicación de baja (RA-) para facturas
   */
  @Post('comunicacion')
  @RequirePermission('cpe.comprobantes.anular')
  @ApiOperation({
    summary: 'Crear comunicación de baja (RA-) para facturas',
    description: 'Genera documento RA- para dar de baja facturas ante SUNAT',
  })
  @ApiResponse({ status: 201, description: 'Comunicación de baja creada exitosamente' })
  async crearComunicacionBaja(
    @Body() dto: ComunicacionBajaDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.comunicacionBajaService.crearComunicacionBaja(dto, tenantId, userId);
  }

  /**
   * Enviar comunicación de baja a SUNAT
   */
  @Post('comunicacion/:id/enviar')
  @RequirePermission('cpe.comprobantes.enviar')
  @ApiOperation({
    summary: 'Enviar comunicación de baja a SUNAT',
    description: 'Envía el documento RA- firmado a SUNAT',
  })
  @ApiResponse({ status: 200, description: 'Comunicación enviada exitosamente' })
  async enviarComunicacionBaja(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.comunicacionBajaService.enviarComunicacionBaja(id, tenantId, userId);
  }

  /**
   * Consultar estado de comunicación de baja
   */
  @Get('comunicacion/:id/estado')
  @RequirePermission('cpe.comprobantes.consultar')
  @ApiOperation({
    summary: 'Consultar estado de comunicación de baja',
    description: 'Consulta el estado de la comunicación de baja en SUNAT usando el ticket',
  })
  @ApiResponse({ status: 200, description: 'Estado consultado exitosamente' })
  async consultarEstadoComunicacion(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.comunicacionBajaService.consultarEstadoComunicacion(id, tenantId);
  }

  /**
   * Crear resumen diario (RC-) para boletas
   */
  @Post('resumen')
  @RequirePermission('cpe.comprobantes.anular')
  @ApiOperation({
    summary: 'Crear resumen diario (RC-) para boletas',
    description: 'Genera documento RC- para dar de baja boletas ante SUNAT',
  })
  @ApiResponse({ status: 201, description: 'Resumen diario creado exitosamente' })
  async crearResumenDiario(
    @Body() dto: ResumenDiarioDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.comunicacionBajaService.crearResumenDiario(dto, tenantId, userId);
  }

  /**
   * Enviar resumen diario a SUNAT
   */
  @Post('resumen/:id/enviar')
  @RequirePermission('cpe.comprobantes.enviar')
  @ApiOperation({
    summary: 'Enviar resumen diario a SUNAT',
    description: 'Envía el documento RC- firmado a SUNAT',
  })
  @ApiResponse({ status: 200, description: 'Resumen enviado exitosamente' })
  async enviarResumenDiario(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.comunicacionBajaService.enviarResumenDiario(id, tenantId, userId);
  }

  /**
   * Consultar estado de resumen diario
   */
  @Get('resumen/:id/estado')
  @RequirePermission('cpe.comprobantes.consultar')
  @ApiOperation({
    summary: 'Consultar estado de resumen diario',
    description: 'Consulta el estado del resumen diario en SUNAT usando el ticket',
  })
  @ApiResponse({ status: 200, description: 'Estado consultado exitosamente' })
  async consultarEstadoResumen(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.comunicacionBajaService.consultarEstadoResumen(id, tenantId);
  }
}
