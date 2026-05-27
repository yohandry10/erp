import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MigrationService } from './migration.service';
import {
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
  constructor(private readonly service: MigrationService) {}

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
    return this.service.getRunDetail(tenantId, id);
  }

  @Get('validar-apertura')
  @RequirePermission('migration.validar.read')
  async validarApertura(@CurrentTenant() tenantId: string, @Query('fechaCorte') fechaCorte?: string) {
    return this.service.validarApertura(tenantId, fechaCorte);
  }
}
