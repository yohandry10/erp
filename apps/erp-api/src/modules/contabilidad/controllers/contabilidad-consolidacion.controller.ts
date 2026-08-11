import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CrearAjusteConsolidacionDto,
  CrearGrupoConsolidacionDto,
  GenerarReporteConfigurableQueryDto,
  GuardarReporteConfigurableDto,
  InvitarMiembroConsolidacionDto,
  RegistrarTasaConsolidacionDto,
  RegistrarMapeoCuentaConsolidacionDto,
  ResponderInvitacionConsolidacionDto,
} from '@erp-suite/dtos';
import { CurrentTenant, CurrentUser } from '../../../common';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsolidacionReportesService } from '../services/consolidacion-reportes.service';

@ApiTags('contabilidad')
@Controller('contabilidad')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContabilidadConsolidacionController {
  constructor(private readonly service: ConsolidacionReportesService) {}

  @Get('consolidacion/grupos')
  @RequirePermission('contabilidad.reportes.read')
  @ApiOperation({ summary: 'Listar grupos propios e invitaciones de consolidación' })
  async listarGrupos(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.service.listarGrupos(tenantId) };
  }

  @Post('consolidacion/grupos')
  @RequirePermission('contabilidad.reportes.actualizar')
  @ApiOperation({ summary: 'Crear un grupo de consolidación y su controladora' })
  async crearGrupo(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CrearGrupoConsolidacionDto,
  ) {
    return {
      success: true,
      data: await this.service.crearGrupo(tenantId, userId, dto),
      message: 'Grupo de consolidación creado.',
    };
  }

  @Post('consolidacion/grupos/:grupoId/invitaciones')
  @RequirePermission('contabilidad.reportes.actualizar')
  @ApiOperation({ summary: 'Invitar una empresa por RUC; no comparte saldos hasta que acepte' })
  async invitar(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('grupoId') grupoId: string,
    @Body() dto: InvitarMiembroConsolidacionDto,
  ) {
    return {
      success: true,
      data: await this.service.invitarMiembro(tenantId, userId, grupoId, dto),
      message: 'Invitación enviada. La empresa debe aceptarla antes del consolidado.',
    };
  }

  @Post('consolidacion/grupos/:grupoId/respuesta')
  @RequirePermission('contabilidad.reportes.actualizar')
  @ApiOperation({ summary: 'Aceptar o rechazar una invitación de consolidación' })
  async responder(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('grupoId') grupoId: string,
    @Body() dto: ResponderInvitacionConsolidacionDto,
  ) {
    return {
      success: true,
      data: await this.service.responderInvitacion(tenantId, userId, grupoId, dto.aceptar),
      message: dto.aceptar ? 'Invitación aceptada.' : 'Invitación rechazada.',
    };
  }

  @Post('consolidacion/grupos/:grupoId/tasas')
  @RequirePermission('contabilidad.reportes.actualizar')
  @ApiOperation({ summary: 'Registrar tasa explícita de presentación para una empresa miembro' })
  async registrarTasa(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('grupoId') grupoId: string,
    @Body() dto: RegistrarTasaConsolidacionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      data: await this.service.registrarTasa(tenantId, userId, grupoId, dto, idempotencyKey),
      message: 'Tasa de consolidación registrada.',
    };
  }

  @Post('consolidacion/grupos/:grupoId/mapeos-cuentas')
  @RequirePermission('contabilidad.reportes.actualizar')
  @ApiOperation({ summary: 'Homologar una cuenta de una empresa miembro con la controladora' })
  async registrarMapeoCuenta(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('grupoId') grupoId: string,
    @Body() dto: RegistrarMapeoCuentaConsolidacionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      data: await this.service.registrarMapeoCuenta(tenantId, userId, grupoId, dto, idempotencyKey),
      message: 'Mapeo de cuenta registrado.',
    };
  }

  @Post('consolidacion/grupos/:grupoId/ajustes')
  @RequirePermission('contabilidad.reportes.actualizar')
  @ApiOperation({ summary: 'Crear eliminación o reclasificación sin alterar libros legales' })
  async crearAjuste(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('grupoId') grupoId: string,
    @Body() dto: CrearAjusteConsolidacionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      data: await this.service.crearAjuste(tenantId, userId, grupoId, dto, idempotencyKey),
      message: 'Ajuste de consolidación creado; los libros legales no fueron modificados.',
    };
  }

  @Get('reportes-configurables')
  @RequirePermission('contabilidad.reportes.read')
  @ApiOperation({ summary: 'Listar definiciones de reportes contables' })
  async listarReportes(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.service.listarReportes(tenantId) };
  }

  @Post('reportes-configurables')
  @RequirePermission('contabilidad.reportes.actualizar')
  @ApiOperation({ summary: 'Crear o reemplazar atómicamente un reporte configurable' })
  async guardarReporte(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: GuardarReporteConfigurableDto,
  ) {
    return {
      success: true,
      data: await this.service.guardarReporte(tenantId, userId, dto),
      message: 'Definición de reporte guardada.',
    };
  }

  @Get('reportes-configurables/:reporteId/generar')
  @RequirePermission('contabilidad.reportes.read')
  @ApiOperation({ summary: 'Generar reporte individual o consolidado' })
  async generarReporte(
    @CurrentTenant() tenantId: string,
    @Param('reporteId') reporteId: string,
    @Query() query: GenerarReporteConfigurableQueryDto,
  ) {
    return {
      success: true,
      data: await this.service.generarReporte(
        tenantId,
        reporteId,
        query.fecha_desde,
        query.fecha_hasta,
        query.grupo_id,
      ),
      message: 'Reporte generado.',
    };
  }
}
