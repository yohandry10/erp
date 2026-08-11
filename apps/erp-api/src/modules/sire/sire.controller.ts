import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateSireReportDto, SireReportFiltersDto } from './sire.dto';
import { SireService } from './sire.service';

@ApiTags('sire')
@Controller('sire')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class SireController {
  constructor(private readonly sireService: SireService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas SIRE del tenant' })
  @ApiResponse({ status: 200, description: 'Estadísticas SIRE obtenidas' })
  @RequirePermission('sire.read')
  getStats(@CurrentTenant() tenantId: string) {
    return this.sireService.getStats(tenantId);
  }

  @Get('reportes')
  @ApiOperation({ summary: 'Listar reportes SIRE' })
  @ApiResponse({ status: 200, description: 'Reportes SIRE obtenidos' })
  @RequirePermission('sire.read')
  getReportes(@Query() filters: SireReportFiltersDto, @CurrentTenant() tenantId: string) {
    return this.sireService.getReportes(filters, tenantId);
  }

  @Post('generar-reporte')
  @ApiOperation({ summary: 'Congelar una instantánea local RVIE/RCE' })
  @ApiResponse({ status: 201, description: 'Instantánea SIRE generada de forma idempotente' })
  @RequirePermission('sire.emitir')
  generarReporte(
    @Body() reportData: GenerateSireReportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.sireService.generarReporte(
      reportData,
      tenantId,
      this.requireActor(actorId),
      this.requireIdempotencyKey(idempotencyKey),
    );
  }

  @Get('reportes/:id/download')
  @ApiOperation({ summary: 'Descargar la instantánea SIRE congelada' })
  @ApiResponse({ status: 200, description: 'Instantánea SIRE obtenida' })
  @RequirePermission('sire.read')
  downloadReporte(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.sireService.downloadReporte(id, tenantId);
  }

  @Post('reportes/:id/enviar-sunat')
  @ApiOperation({ summary: 'Aceptar la propuesta RVIE/RCE y persistir su ticket' })
  @ApiResponse({ status: 200, description: 'Aceptación reservada/finalizada idempotentemente' })
  @RequirePermission('sire.emitir')
  enviarSunat(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.sireService.enviarSunat(
      id,
      tenantId,
      this.requireActor(actorId),
      this.requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post('reportes/:id/consultar-ticket')
  @ApiOperation({ summary: 'Consultar y persistir el estado del ticket SIRE' })
  @ApiResponse({ status: 200, description: 'Consulta SIRE finalizada idempotentemente' })
  @RequirePermission('sire.emitir')
  consultarTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.sireService.consultarTicket(
      id,
      tenantId,
      this.requireActor(actorId),
      this.requireIdempotencyKey(idempotencyKey),
    );
  }

  @Get('reportes/:id/operaciones')
  @ApiOperation({ summary: 'Obtener la bitácora durable de operaciones SIRE' })
  @RequirePermission('sire.read')
  getOperaciones(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.sireService.getOperaciones(id, tenantId);
  }

  private requireActor(actorId?: string): string {
    if (!actorId) throw new BadRequestException('Se requiere un usuario autenticado para operar SIRE');
    return actorId;
  }

  private requireIdempotencyKey(value?: string): string {
    const key = String(value ?? '').trim();
    if (key.length < 8 || key.length > 200) {
      throw new BadRequestException('Idempotency-Key SIRE es obligatorio y debe tener entre 8 y 200 caracteres');
    }
    return key;
  }
}
