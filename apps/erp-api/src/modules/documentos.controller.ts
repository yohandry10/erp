import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import {
  ActualizarDocumentoManualDto,
  AnularDocumentoDto,
  CrearDocumentoManualDto,
  CrearSerieDocumentoDto,
  DocumentoFiltrosDto,
  GenerarXmlDocumentoDto,
  ValidarRucDto,
} from './documentos/dto/documentos.dto';
import { DocumentosService } from './documentos.service';

@ApiTags('Documentos')
@Controller('documentos')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  private actorId(req: Request): string | undefined {
    return (req.user as any)?.id;
  }

  @Get('stats')
  @RequirePermission('documentos.stats.read')
  @ApiOperation({ summary: 'Obtener métricas del centro de documentos' })
  @ApiResponse({ status: 200, description: 'Métricas recuperadas' })
  getStats(@CurrentTenant() tenantId: string) {
    return this.documentosService.getStats(tenantId);
  }

  @Get('lista')
  @RequirePermission('documentos.read')
  @ApiOperation({ summary: 'Listar documentos del tenant' })
  getDocumentos(
    @Query() filters: DocumentoFiltrosDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.documentosService.getDocumentos(filters, tenantId);
  }

  @Get('config/series')
  @RequirePermission('documentos.series.read')
  @ApiOperation({ summary: 'Listar series del tenant' })
  getSeries(@CurrentTenant() tenantId: string) {
    return this.documentosService.getSeries(tenantId);
  }

  @Post('config/series')
  @RequirePermission('documentos.series.write')
  @ApiOperation({ summary: 'Crear una serie documental' })
  crearSerie(
    @Body() dto: CrearSerieDocumentoDto,
    @CurrentTenant() tenantId: string,
    @Req() req: Request,
  ) {
    return this.documentosService.crearSerie(dto, tenantId, this.actorId(req));
  }

  @Post('validar-ruc')
  @RequirePermission('documentos.validations.run')
  @ApiOperation({ summary: 'Validar identificador fiscal según el país del tenant' })
  validarRUC(@Body() dto: ValidarRucDto, @CurrentTenant() tenantId: string) {
    return this.documentosService.validarRUC(dto.ruc, tenantId);
  }

  @Post('validar-documento')
  @RequirePermission('documentos.validations.run')
  @ApiOperation({ summary: 'Validación auxiliar del formulario documental' })
  validarDocumento(
    @Body() dto: CrearDocumentoManualDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.documentosService.validarDocumento(dto, tenantId);
  }

  @Post('crear')
  @RequirePermission('documentos.create')
  @ApiOperation({ summary: 'Crear borrador manual de forma atómica' })
  @ApiResponse({ status: 201, description: 'Borrador creado' })
  crearDocumento(
    @Body() dto: CrearDocumentoManualDto,
    @CurrentTenant() tenantId: string,
    @Req() req: Request,
  ) {
    return this.documentosService.crearDocumento(dto, tenantId, this.actorId(req));
  }

  @Get(':id')
  @RequirePermission('documentos.read')
  @ApiOperation({ summary: 'Obtener documento por ID' })
  getDocumento(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.documentosService.getDocumento(id, tenantId);
  }

  @Put(':id')
  @RequirePermission('documentos.update')
  @ApiOperation({ summary: 'Reemplazar un borrador manual de forma atómica' })
  actualizarDocumento(
    @Param('id') id: string,
    @Body() dto: ActualizarDocumentoManualDto,
    @CurrentTenant() tenantId: string,
    @Req() req: Request,
  ) {
    return this.documentosService.actualizarDocumento(id, dto, tenantId, this.actorId(req));
  }

  @Post(':id/generar-xml')
  @RequirePermission('documentos.generate_xml')
  @ApiOperation({ summary: 'Emitir CPE y firmar XML con las credenciales del tenant' })
  generarXML(
    @Param('id') id: string,
    @Body() dto: GenerarXmlDocumentoDto,
    @CurrentTenant() tenantId: string,
    @Req() req: Request,
  ) {
    return this.documentosService.generarXML(
      id,
      dto.idempotency_key,
      tenantId,
      this.actorId(req),
    );
  }

  @Post(':id/enviar-sunat')
  @RequirePermission('documentos.enviar_sunat')
  @ApiOperation({ summary: 'Enviar o reintentar el CPE firmado al proveedor fiscal' })
  enviarSUNAT(
    @Param('id') id: string,
    @Body() dto: GenerarXmlDocumentoDto,
    @CurrentTenant() tenantId: string,
    @Req() req: Request,
  ) {
    return this.documentosService.enviarSUNAT(
      id,
      dto.idempotency_key,
      tenantId,
      this.actorId(req),
    );
  }

  @Get(':id/descargar-pdf')
  @RequirePermission('documentos.download')
  @ApiOperation({ summary: 'Resolver la representación impresa del CPE' })
  descargarPDF(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.documentosService.generarPDF(id, tenantId);
  }

  @Get(':id/descargar-xml')
  @RequirePermission('documentos.download')
  @ApiOperation({ summary: 'Descargar el XML firmado del CPE' })
  descargarXML(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.documentosService.descargarXML(id, tenantId);
  }

  @Get(':id/auditoria')
  @RequirePermission('documentos.audit.read')
  @ApiOperation({ summary: 'Obtener auditoría del documento' })
  getAuditoria(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.documentosService.getAuditoria(id, tenantId);
  }

  @Post(':id/anular')
  @RequirePermission('documentos.cancel')
  @ApiOperation({ summary: 'Anular borrador o delegar la anulación fiscal a CPE/448' })
  anularDocumento(
    @Param('id') id: string,
    @Body() dto: AnularDocumentoDto,
    @CurrentTenant() tenantId: string,
    @Req() req: Request,
  ) {
    return this.documentosService.anularDocumento(
      id,
      dto.motivo,
      dto.idempotency_key,
      tenantId,
      this.actorId(req),
    );
  }
}
