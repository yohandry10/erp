import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CpeService } from './cpe.service';
import { CreateFacturaDto, FacturaDto, PaginationDto } from '@erp-suite/dtos';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../auth/user.interface';

@ApiTags('cpe')
@Controller('cpe')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: CPE requiere autenticación + permisos específicos.
@ApiBearerAuth()
export class CpeController {
  constructor(private readonly cpeService: CpeService) {}

  @Post()
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
  @RequirePermission('cpe.comprobantes.listar')
  @ApiOperation({ summary: 'Listar CPEs con paginación' })
  async findAll(
    @Query() paginationDto: PaginationDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.cpeService.findAll(paginationDto, tenantId);
  }

  @Get('stats')
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

  @Get('comprobantes')
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

  @Get('comprobantes/:id')
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
  @RequirePermission('cpe.comprobantes.descargar_pdf')
  @ApiOperation({ summary: 'Descargar PDF del CPE' })
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
  @RequirePermission('cpe.comprobantes.enviar')
  @ApiOperation({ summary: 'Enviar CPE a SUNAT' })
  async enviarSunat(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    try {
      console.log(`📡 Enviando CPE a SUNAT: ${id}`);
      const result = await this.cpeService.resendToOse(id, tenantId);
      
      return {
        success: true,
        message: 'CPE enviado a SUNAT exitosamente',
        data: result
      };
    } catch (error) {
      console.error('❌ Error enviando a SUNAT:', error);
      return {
        success: false,
        message: 'Error enviando CPE a SUNAT',
        error: error.message
      };
    }
  }

  @Get(':id')
  @RequirePermission('cpe.comprobantes.ver')
  @ApiOperation({ summary: 'Obtener CPE por ID' })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ): Promise<any> {
    return this.cpeService.findOne(id, tenantId);
  }

  @Get(':id/xml')
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
  @RequirePermission('cpe.comprobantes.reenviar')
  @ApiOperation({ summary: 'Reenviar CPE a OSE/SUNAT' })
  async resend(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.cpeService.resendToOse(id, tenantId);
  }

  @Get(':id/status')
  @RequirePermission('cpe.comprobantes.consultar')
  @ApiOperation({ summary: 'Consultar estado del CPE en OSE' })
  async checkStatus(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.cpeService.checkOseStatus(id, tenantId);
  }

  @Post(':id/enviar-sunat')
  @RequirePermission('cpe.comprobantes.enviar')
  @ApiOperation({ summary: 'Enviar CPE firmado a SUNAT manualmente' })
  @ApiResponse({ status: 200, description: 'CPE enviado a SUNAT exitosamente' })
  async enviarManualmenteSunat(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    console.log(`🚀 [CPE] Envío manual a SUNAT solicitado para CPE ${id}`);
    
    try {
      // Verificar que el CPE esté en estado FIRMADO
      const cpe = await this.cpeService.findOne(id, tenantId);
      
      if ((cpe.estado as string) !== 'FIRMADO') {
        return {
          success: false,
          message: `CPE debe estar en estado FIRMADO para enviar a SUNAT. Estado actual: ${cpe.estado}`
        };
      }

      // Enviar a SUNAT usando el método existente
      const fileName = `${cpe.ruc_emisor}-${cpe.tipo_documento}-${cpe.serie}-${cpe.numero}`;
      await this.cpeService.sendToOseManual(id, cpe.xml_firmado, fileName);
      
      return {
        success: true,
        message: 'CPE enviado a SUNAT exitosamente',
        data: { id, estado: 'ENVIADO', timestamp: new Date() }
      };

    } catch (error) {
      console.error(`❌ Error enviando CPE ${id} a SUNAT:`, error);
      return {
        success: false,
        message: `Error enviando CPE a SUNAT: ${error.message}`
      };
    }
  }

  /**
   * Anular un comprobante CPE
   * Genera nota de crédito y revierte operaciones relacionadas
   */
  @Post(':id/anular')
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
    @Body() anularDto: { motivo: string; tipo_nota?: string },
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: User,
  ) {
    return this.cpeService.anularComprobante(id, anularDto.motivo, tenantId, user?.id, anularDto.tipo_nota);
  }
}
