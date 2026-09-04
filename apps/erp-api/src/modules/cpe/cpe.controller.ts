import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CpeService } from './cpe.service';
import { CpeHelperService } from './cpe-helper.service';
import { CreateFacturaDto, FacturaDto, PaginationDto } from '@erp-suite/dtos';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkerAuthGuard } from '../../shared/guards/worker-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '../auth/user.interface';
import {
  RevertirAjusteCxcDto,
  RevertirCobroCxcDto,
  SolicitarAnulacionCpeDto,
} from './dto/cpe-cancellation.dto';
import { CrearNotaReferenciadaDto } from './dto/referenced-note.dto';
import { ReferencedNotesService } from './referenced-notes.service';
import { DesktopSignedCpeDto } from './dto/desktop-signed-cpe.dto';
import { CreateDianEventDto, ImportDianReceivedInvoiceDto } from './dto/dian-event.dto';
import { CpeDianEventsService } from './cpe-dian-events.service';

import { CrearComprobanteUiDto } from './dto/crear-comprobante-ui.dto';

@ApiTags('cpe')
@Controller('cpe')
@ApiBearerAuth()
export class CpeController {
  constructor(
    private readonly cpeService: CpeService,
    private readonly cpeHelper: CpeHelperService,
    private readonly referencedNotes: ReferencedNotesService,
    private readonly dianEvents: CpeDianEventsService,
  ) { }

  @Post('worker/create')
  @Public()
  @UseGuards(WorkerAuthGuard)
  @ApiOperation({ summary: 'Crear CPE desde Worker' })
  async createFromWorker(
    @Body() createFacturaDto: CreateFacturaDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId?: string,
  ): Promise<FacturaDto> {
    if (!actorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)) {
      throw new BadRequestException('El token worker debe incluir actor_id UUID del tenant para emitir');
    }
    return this.cpeService.create(createFacturaDto, tenantId, actorId);
  }

  @Post('worker/:id/enviar-sunat')
  @Public()
  @UseGuards(WorkerAuthGuard)
  @ApiOperation({ summary: 'Enviar CPE a SUNAT/OSE (worker)' })
  async enviarSunatWorker(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cpeService.resendToOse(id, tenantId, {
      idempotencyKey,
      actorId,
      origin: 'WORKER',
    });
  }

  @Get('worker/:id/status')
  @Public()
  @UseGuards(WorkerAuthGuard)
  @ApiOperation({ summary: 'Consultar estado CPE en OSE (worker)' })
  async checkStatusWorker(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cpeService.checkOseStatus(id, tenantId, {
      idempotencyKey,
      actorId,
      origin: 'WORKER',
    });
  }

  @Get('worker/comprobantes/:id/pdf')
  @Public()
  @UseGuards(WorkerAuthGuard)
  @ApiOperation({ summary: 'Descargar PDF del CPE (worker)' })
  async downloadPdfWorker(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.cpeService.generatePdf(id, tenantId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="cpe-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.emitir')
  @ApiOperation({ summary: 'Crear y enviar comprobante CPE' })
  @ApiResponse({
    status: 201,
    description: 'CPE creado y enviado exitosamente',
    type: FacturaDto,
  })
  async create(
    @Body() createFacturaDto: CreateFacturaDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ): Promise<FacturaDto> {
    // HARDENING: usamos tenant del contexto, nunca valores de request sin validar.
    return this.cpeService.create(createFacturaDto, tenantId, userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.listar')
  @ApiOperation({ summary: 'Listar CPEs con paginación' })
  async findAll(
    @Query() paginationDto: PaginationDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.cpeService.findAll(paginationDto, tenantId);
  }

  @Get('notas-referenciadas/origenes')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.ver')
  @ApiOperation({ summary: 'Listar facturas/boletas elegibles para NC o ND referenciada' })
  async listarOrigenesNota(
    @CurrentTenant() tenantId: string,
    @Query('search') search?: string,
  ) {
    return this.referencedNotes.listarOrigenes(tenantId, search);
  }

  @Post('notas-referenciadas')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.emitir')
  @ApiOperation({
    summary: 'Crear borrador NC/ND fiscalmente neutro; el efecto nace con aceptación fiscal durable',
  })
  async crearNotaReferenciada(
    @Body() dto: CrearNotaReferenciadaDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.referencedNotes.crear(dto, tenantId, userId, idempotencyKey);
  }

  @Post('notas-referenciadas/:id/firmar')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.emitir')
  @ApiOperation({
    summary: 'Preparar y firmar una NC/ND pendiente; todavía no modifica CxC ni contabilidad',
  })
  async firmarNotaReferenciada(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.referencedNotes.firmar(id, tenantId, userId, idempotencyKey);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.reportes.ver')
  @ApiOperation({ summary: 'Obtener estadísticas de CPE' })
  async getStats(@CurrentTenant() tenantId: string) {
    try {
      console.log('📊 Calculando estadísticas CPE...');
      return await this.cpeService.getStatsFromDatabase(tenantId);
    } catch (error) {
      console.error('❌ Error calculando stats CPE:', error);
      return {
        success: false,
        data: {
          cpeEmitidosHoy: 0,
          cpeDelMes: 0,
          montoFacturado: 0,
          rechazados: 0
        }
      };
    }
  }

  @Post('comprobantes')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.emitir')
  @ApiOperation({ summary: 'Crear comprobante CPE desde UI' })
  async createComprobante(
    @Body() payload: CrearComprobanteUiDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ): Promise<FacturaDto> {
    return this.cpeService.createFromComprobantePayload(
      payload,
      tenantId,
      userId,
      idempotencyKey,
    );
  }

  @Get('receptores')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.emitir')
  @ApiOperation({ summary: 'Listar receptores maestros disponibles para emitir CPE' })
  async listReceivers(
    @CurrentTenant() tenantId: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cpeService.listFiscalReceivers(tenantId, search, limit);
  }

  @Get('receptores/:clienteId')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.emitir')
  @ApiOperation({ summary: 'Obtener un receptor maestro para emitir CPE' })
  async getReceiver(
    @CurrentTenant() tenantId: string,
    @Param('clienteId', new ParseUUIDPipe()) clienteId: string,
  ) {
    return { success: true, data: await this.cpeService.getFiscalReceiver(tenantId, clienteId) };
  }

  @Post('desktop/signed')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.emitir')
  @ApiOperation({ summary: 'Registrar XML firmado desde desktop offline' })
  async registerDesktopSignedXml(
    @Body() payload: DesktopSignedCpeDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.cpeService.registerDesktopSignedXml(payload, tenantId, userId);
  }

  @Get('comprobantes')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.listar')
  @ApiOperation({ summary: 'Listar comprobantes CPE' })
  async getComprobantes(
    @Query() filters: any,
    @CurrentTenant() tenantId: string,
  ) {
    try {
      console.log('📄 Cargando comprobantes CPE desde BD...');
      return await this.cpeService.getComprobantesFromDatabase(filters, tenantId);
    } catch (error) {
      console.error('❌ Error cargando comprobantes CPE:', error);
      return {
        success: false,
        message: 'Error cargando comprobantes',
        data: []
      };
    }
  }

  @Get('comprobantes/export')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.listar')
  @ApiOperation({ summary: 'Exportar comprobantes CPE a CSV' })
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async exportComprobantes(
    @Query() filters: any,
    @CurrentTenant() tenantId: string,
    @Res() res: Response,
  ) {
    const result = await this.cpeService.exportComprobantesCsv(filters, tenantId);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message || 'Error exportando comprobantes' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.send(result.content);
  }

  @Get('comprobantes/:id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.ver')
  @ApiOperation({ summary: 'Obtener datos del CPE' })
  async getCpeData(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    try {
      console.log(`📄 Obteniendo datos CPE: ${id}`);

      const cpeData = await this.cpeService.getCpeById(id, tenantId);

      return {
        success: true,
        data: cpeData
      };
    } catch (error) {
      console.error('❌ Error obteniendo datos CPE:', error);
      return {
        success: false,
        message: 'Error obteniendo datos del CPE',
        error: error.message
      };
    }
  }

  @Get('comprobantes/:id/pdf')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.descargar_pdf')
  @ApiOperation({ summary: 'Descargar PDF del CPE' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async downloadPdf(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Res() res: Response,
  ) {
    try {
      console.log(`📄 Generando PDF para CPE: ${id}`);
      const pdfBuffer = await this.cpeService.generatePdf(id, tenantId);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cpe-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.send(pdfBuffer);
    } catch (error) {
      console.error('❌ Error generando PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Error generando PDF',
        error: error.message
      });
    }
  }

  @Post('comprobantes/:id/enviar-sunat')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.enviar')
  @ApiOperation({ summary: 'Enviar CPE a autoridad fiscal (SUNAT/DIAN)' })
  async enviarSunat(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const fiscalAuthority = await this.cpeHelper.getFiscalAuthorityName(tenantId);
    const result = await this.cpeService.resendToOse(id, tenantId, {
      idempotencyKey,
      actorId,
      origin: 'USER',
    });
    return {
      success: true,
      message: `Operación CPE procesada por ${fiscalAuthority}`,
      data: result,
    };
  }

  @Post(':id/dian/eventos')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.dian.eventos_034.emitir')
  @ApiOperation({
    summary: 'Registrar evento DIAN 034 como facturador sobre una factura aceptada',
  })
  async registrarEventoDian(
    @Param('id') id: string,
    @Body() dto: CreateDianEventDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.dianEvents.emitirSobreFacturaEmitida(
      id,
      dto,
      tenantId,
      actorId,
      idempotencyKey,
    );
  }

  @Post('dian/eventos/:operationId/reintentar')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.dian.eventos_034.emitir')
  @ApiOperation({
    summary: 'Reconciliar/reintentar un evento DIAN 034 usando su clave idempotente persistida',
  })
  async reintentarEventoDianEmitido(
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.dianEvents.reintentarEvento(
      operationId,
      tenantId,
      actorId,
      'ISSUED_CPE',
    );
  }

  @Post('dian/facturas-recibidas/importar')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.dian.facturas_recibidas.gestionar')
  @ApiOperation({ summary: 'Importar una FEV recibida aceptada y comprobada directamente en DIAN' })
  async importarFacturaRecibidaDian(
    @Body() dto: ImportDianReceivedInvoiceDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.dianEvents.importarFacturaRecibida(
      dto,
      tenantId,
      actorId,
      idempotencyKey,
    );
  }

  @Post('dian/facturas-recibidas/:id/eventos')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.dian.facturas_recibidas.gestionar')
  @ApiOperation({ summary: 'Registrar evento DIAN 030-033 como adquirente de una FEV recibida' })
  async registrarEventoFacturaRecibidaDian(
    @Param('id') id: string,
    @Body() dto: CreateDianEventDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.dianEvents.emitirSobreFacturaRecibida(
      id,
      dto,
      tenantId,
      actorId,
      idempotencyKey,
    );
  }

  @Post('dian/facturas-recibidas/eventos/:operationId/reintentar')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.dian.facturas_recibidas.gestionar')
  @ApiOperation({
    summary: 'Reconciliar/reintentar un evento DIAN 030-033 con la clave persistida en servidor',
  })
  async reintentarEventoFacturaRecibidaDian(
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.dianEvents.reintentarEvento(
      operationId,
      tenantId,
      actorId,
      'RECEIVED_INVOICE',
    );
  }

  @Get('dian/facturas-recibidas')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.dian.facturas_recibidas.ver')
  @ApiOperation({ summary: 'Listar FEV recibidas y sus eventos DIAN sin exponer XML/PFX' })
  async listarFacturasRecibidasDian(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.dianEvents.listarFacturasRecibidas(tenantId, Number(limit));
  }

  @Get(':id/anulacion-financiera')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('finanzas.cxc.cobros.revertir')
  @ApiOperation({
    summary: 'Consultar cobros y estado financiero de una anulación CPE',
  })
  async obtenerAnulacionFinanciera(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.cpeService.obtenerEstadoFinancieroAnulacion(
      id,
      tenantId,
      userId,
    );
  }

  @Post(':id/cobros/:pagoId/revertir')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('finanzas.cxc.cobros.revertir')
  @ApiOperation({
    summary: 'Revertir un cobro aplicado y continuar la anulación CPE',
  })
  async revertirCobroAplicado(
    @Param('id') id: string,
    @Param('pagoId') pagoId: string,
    @Body() dto: RevertirCobroCxcDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.cpeService.revertirCobroAplicado(
      id,
      pagoId,
      dto,
      tenantId,
      userId,
      idempotencyKey,
    );
  }

  @Post(':id/ajustes/:operacionId/revertir')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('finanzas.cxc.cobros.revertir')
  @ApiOperation({
    summary: 'Revertir un ajuste fiscal aplicado y continuar la anulación CPE',
  })
  async revertirAjusteAplicado(
    @Param('id') id: string,
    @Param('operacionId') operacionId: string,
    @Body() dto: RevertirAjusteCxcDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.cpeService.revertirAjusteAplicado(
      id,
      operacionId,
      dto,
      tenantId,
      userId,
      idempotencyKey,
    );
  }

  @Post(':id/anulacion/finalizar')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.anular')
  @ApiOperation({ summary: 'Reintentar el cierre operativo de la anulación' })
  async finalizarAnulacion(
    @Param('id') notaCreditoId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.cpeService.finalizarAnulacionFinanciera(
      notaCreditoId,
      tenantId,
      userId,
      idempotencyKey,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.ver')
  @ApiOperation({ summary: 'Obtener CPE por ID' })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ): Promise<any> {
    return this.cpeService.findOne(id, tenantId);
  }

  @Get(':id/xml')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.descargar_xml')
  @ApiOperation({ summary: 'Descargar XML firmado del CPE' })
  async downloadXml(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Res() res: Response,
  ) {
    const xmlContent = await this.cpeService.getSignedXml(id, tenantId);

    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="cpe-${id}.xml"`,
    });

    res.send(xmlContent);
  }

  @Post(':id/resend')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.reenviar')
  @ApiOperation({ summary: 'Reenviar CPE a OSE/SUNAT' })
  async resend(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cpeService.resendToOse(id, tenantId, {
      idempotencyKey,
      actorId,
      origin: 'USER',
    });
  }

  @Get(':id/status')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.consultar')
  @ApiOperation({ summary: 'Consultar estado del CPE en OSE' })
  async checkStatus(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cpeService.checkOseStatus(id, tenantId, {
      idempotencyKey,
      actorId,
      origin: 'USER',
    });
  }

  @Post(':id/enviar-sunat')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.enviar')
  @ApiOperation({ summary: 'Enviar CPE firmado a SUNAT manualmente' })
  @ApiResponse({ status: 200, description: 'CPE enviado a SUNAT exitosamente' })
  async enviarManualmenteSunat(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.cpeService.resendToOse(id, tenantId, {
      idempotencyKey,
      actorId,
      origin: 'USER',
    });
    return { success: true, message: 'Operación de envío CPE procesada', data };
  }

  /**
   * Anular un comprobante CPE
   * Genera nota de crédito y revierte operaciones relacionadas
   */
  @Post(':id/anular')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('cpe.comprobantes.anular')
  @ApiOperation({
    summary: 'Anular comprobante CPE',
    description: 'Anula un comprobante electrónico generando nota de crédito y revirtiendo operaciones'
  })
  @ApiResponse({
    status: 200,
    description: 'CPE anulado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'El CPE no puede ser anulado en su estado actual',
  })
  @ApiResponse({
    status: 404,
    description: 'CPE no encontrado',
  })
  async anularCPE(
    @Param('id') id: string,
    @Body() anularDto: SolicitarAnulacionCpeDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: User,
  ) {
    return this.cpeService.anularComprobante(
      id,
      anularDto.motivo,
      tenantId,
      user?.id,
      anularDto.tipo_nota,
      idempotencyKey,
    );
  }
}
