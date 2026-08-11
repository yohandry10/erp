import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ImportExportService } from './import-export.service';
import { PreviewComprobantesDto } from './dto/preview-comprobantes.dto';
import { ImportCatalogoDto } from './dto/import-catalogo.dto';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common';
import { Throttle } from '@nestjs/throttler';

/**
 * Controlador de Import/Export
 * 
 * ✅ HARDENING: Todos los endpoints protegidos con JWT + Permisos
 * ✅ HARDENING: tenantId viene del token, no del body
 */
@ApiTags('Import/Export')
@ApiBearerAuth()
@Controller('import-export')
  @Throttle({ default: { limit: 25, ttl: 60000 } })
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ImportExportController {
  constructor(private readonly service: ImportExportService) {}

  @Get('templates/comprobantes')
  @RequirePermission('import-export.templates.read')
  async downloadComprobantesTemplate(@Res() res: Response) {
    const { filename, content } = this.service.getComprobantesTemplate();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(content);
  }

  @Post('comprobantes/preview')
  @RequirePermission('import-export.comprobantes.preview')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async previewComprobantes(@Body() body: PreviewComprobantesDto) {
    const csv = Buffer.from(body.fileBase64, 'base64').toString('utf8');
    return this.service.validateComprobantesCsv(csv);
  }

  @Get('templates/catalogo')
  @RequirePermission('import-export.templates.read')
  async downloadCatalogoTemplate(@Res() res: Response) {
    const { filename, content } = this.service.getCatalogoTemplate();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(content);
  }

  @Post('catalogo/preview')
  @RequirePermission('import-export.catalogo.preview')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async previewCatalogo(@Body() body: PreviewComprobantesDto) {
    const csv = Buffer.from(body.fileBase64, 'base64').toString('utf8');
    return this.service.validateCatalogoCsv(csv);
  }

  /**
   * Importar catálogo de productos
   * 
   * ✅ HARDENING: tenantId viene del token JWT, no del body
   * Esto previene que un usuario importe datos a otro tenant
   */
  @Post('catalogo/import')
  @RequirePermission('import-export.catalogo.import')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async importCatalogo(
    @Body() body: ImportCatalogoDto,
    @CurrentTenant() tenantId: string,  // ✅ Del token, no del body
    @CurrentUser('id') actorId: string,
  ) {
    const csv = Buffer.from(body.fileBase64, 'base64').toString('utf8');
    // Ignoramos body.tenantId y usamos el del token
    return this.service.importCatalogo(csv, tenantId, actorId, body.idempotency_key);
  }
}
