import {
  BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MigrationService } from './migration.service';
import { FoxArchivoService } from './fox-archivo.service';
import {
  FoxArchivoCierreDto,
  FoxArchivoConsultaDto,
  FoxArchivoDescarteDto,
  FoxArchivoFilasDto,
  FoxArchivoLoteDto,
  FoxConciliacionDto,
  FoxEnsayoDto,
  MIGRATION_FOX_MAESTRO_RUN_TYPES,
  MigrationFoxMaestroRunType,
  MigrationImportDto,
  MigrationPreviewDto,
  MigrationRunType,
  MIGRATION_RUN_TYPES,
  MIGRATION_IMPORTER_RUN_TYPES,
  MigrationImporterRunType,
} from './dto/import.dto';

@ApiTags('Migration')
@ApiBearerAuth()
@Controller('migration')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class MigrationController {
  constructor(
    private readonly service: MigrationService,
    private readonly archivo: FoxArchivoService,
  ) {}

  @Get('templates/:runType')
  @RequirePermission('migration.templates.read')
  async downloadTemplate(@Param('runType') runType: string, @Res() res: Response) {
    if (!MIGRATION_IMPORTER_RUN_TYPES.includes(runType as MigrationImporterRunType)) {
      return res.status(400).json({ message: `runType inválido: ${runType}` });
    }
    const { filename, content } = this.service.getTemplate(runType as MigrationRunType);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(content);
  }

  @Post('preview')
  @RequirePermission('migration.preview')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async preview(@Body() body: MigrationPreviewDto) {
    return this.service.preview(body);
  }

  @Post('clientes/import')
  @RequirePermission('migration.clientes.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importClientes(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('clientes', body, tenantId, userId);
  }

  @Post('proveedores/import')
  @RequirePermission('migration.proveedores.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importProveedores(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('proveedores', body, tenantId, userId);
  }

  @Post('cxc/import')
  @RequirePermission('migration.cxc.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importCxc(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('cxc_abiertas', body, tenantId, userId);
  }

  @Post('cxp/import')
  @RequirePermission('migration.cxp.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importCxp(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('cxp_abiertas', body, tenantId, userId);
  }

  @Post('balance-apertura/import')
  @RequirePermission('migration.balance_apertura.import')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async importBalance(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('balance_apertura', body, tenantId, userId);
  }

  @Post('stock-inicial/import')
  @RequirePermission('migration.stock_inicial.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importStock(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('stock_inicial', body, tenantId, userId);
  }

  @Post('comprobantes/import')
  @RequirePermission('migration.comprobantes.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importComprobantes(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('comprobantes_historico', body, tenantId, userId);
  }

  @Post('contratos-suministro/import')
  @RequirePermission('migration.suministro.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importContratosSuministro(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('contratos_suministro', body, tenantId, userId);
  }

  @Post('oc-suministro/import')
  @RequirePermission('migration.suministro.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importOcSuministro(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('oc_suministro', body, tenantId, userId);
  }

  @Post('cronograma-suministro/import')
  @RequirePermission('migration.suministro.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importCronogramaSuministro(
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.import('cronograma_suministro', body, tenantId, userId);
  }

  /** Maestros y saldos abiertos FOX: almacenes, plan de cuentas, productos, bancos, listas, OC y pedidos. */
  @Post('fox/:runType/import')
  @RequirePermission('migration.fox.import')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async importMaestroFox(
    @Param('runType') runType: string,
    @Body() body: MigrationImportDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    if (!MIGRATION_FOX_MAESTRO_RUN_TYPES.includes(runType as MigrationFoxMaestroRunType))
      throw new BadRequestException(`Maestro FOX no soportado: ${runType}`);
    return this.service.import(runType as MigrationFoxMaestroRunType, body, tenantId, userId);
  }

  @Post('fox/archivo/lotes')
  @RequirePermission('migration.archivo.import')
  async crearLoteArchivo(
    @Body() body: FoxArchivoLoteDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.archivo.crearLote(tenantId, userId, body, key);
  }

  /** Tandas de hasta 2000 filas: un extracto grande llega en muchas llamadas. */
  @Post('fox/archivo/lotes/:id/filas')
  @RequirePermission('migration.archivo.import')
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  async archivarFilas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FoxArchivoFilasDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.archivo.archivarFilas(tenantId, userId, id, body);
  }

  @Post('fox/archivo/lotes/:id/cerrar')
  @RequirePermission('migration.archivo.import')
  async cerrarLoteArchivo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FoxArchivoCierreDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.archivo.cerrarLote(tenantId, userId, id, body, key);
  }

  @Post('fox/archivo/lotes/:id/descartar')
  @RequirePermission('migration.archivo.import')
  async descartarLoteArchivo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FoxArchivoDescarteDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.archivo.descartarLote(tenantId, userId, id, body, key);
  }

  @Get('fox/archivo')
  @RequirePermission('migration.archivo.read')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async consultarArchivo(
    @Query() query: FoxArchivoConsultaDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.archivo.consultar(tenantId, userId, query);
  }

  @Post('fox/ensayo')
  @RequirePermission('migration.fox.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async ensayoFox(
    @Body() body: FoxEnsayoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.ensayoFox(body, tenantId, userId);
  }

  @Post('fox/conciliacion')
  @RequirePermission('migration.validar.read')
  async conciliacionFox(
    @Body() body: FoxConciliacionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.conciliarFox(body.control, tenantId, userId);
  }

  @Get('runs')
  @RequirePermission('migration.runs.read')
  async listRuns(
    @CurrentTenant() tenantId: string,
    @Query('runType') runType?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200) : 50;
    const rt = runType && MIGRATION_RUN_TYPES.includes(runType as MigrationRunType) ? (runType as MigrationRunType) : undefined;
    return this.service.listRuns(tenantId, rt, lim);
  }

  @Get('runs/:id')
  @RequirePermission('migration.runs.read')
  async getRun(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const run = await this.service.getRunDetail(tenantId, id);
    if (!run) throw new NotFoundException('Lote de migración no encontrado');
    return run;
  }

  @Get('validar-apertura')
  @RequirePermission('migration.validar.read')
  async validarApertura(@CurrentTenant() tenantId: string, @Query('fechaCorte') fechaCorte?: string) {
    return this.service.validarApertura(tenantId, fechaCorte);
  }
}
