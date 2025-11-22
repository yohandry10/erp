import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ImportExportService } from './import-export.service';
import { PreviewComprobantesDto } from './dto/preview-comprobantes.dto';
import { ImportCatalogoDto } from './dto/import-catalogo.dto';
import { Response } from 'express';

@Controller('import-export')
export class ImportExportController {
  constructor(private readonly service: ImportExportService) {}

  @Get('templates/comprobantes')
  async downloadComprobantesTemplate(@Res() res: Response) {
    const { filename, content } = this.service.getComprobantesTemplate();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(content);
  }

  @Post('comprobantes/preview')
  async previewComprobantes(@Body() body: PreviewComprobantesDto) {
    const csv = Buffer.from(body.fileBase64, 'base64').toString('utf8');
    return this.service.validateComprobantesCsv(csv);
  }

  @Get('templates/catalogo')
  async downloadCatalogoTemplate(@Res() res: Response) {
    const { filename, content } = this.service.getCatalogoTemplate();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(content);
  }

  @Post('catalogo/preview')
  async previewCatalogo(@Body() body: PreviewComprobantesDto) {
    const csv = Buffer.from(body.fileBase64, 'base64').toString('utf8');
    return this.service.validateCatalogoCsv(csv);
  }

  @Post('catalogo/import')
  async importCatalogo(@Body() body: ImportCatalogoDto) {
    const csv = Buffer.from(body.fileBase64, 'base64').toString('utf8');
    return this.service.importCatalogo(csv, body.tenantId);
  }
}
