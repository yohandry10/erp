import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  // UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CpeService } from './cpe.service';
import { CreateFacturaDto, FacturaDto, PaginationDto } from '@erp-suite/dtos';
import { Request, Response } from 'express';

@ApiTags('cpe')
@Controller('cpe')
// @UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CpeController {
  constructor(private readonly cpeService: CpeService) {}

  @Post()
  @ApiOperation({ summary: 'Crear y enviar comprobante CPE' })
  @ApiResponse({
    status: 201,
    description: 'CPE creado y enviado exitosamente',
    type: FacturaDto,
  })
  async create(
    @Body() createFacturaDto: CreateFacturaDto,
    @Req() req: Request,
  ): Promise<FacturaDto> {
    const user = req.user as any;
    return this.cpeService.create(createFacturaDto, user.tenant_id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar CPEs con paginación' })
  async findAll(
    @Query() paginationDto: PaginationDto,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    const tenantId = user?.tenant_id || 'mock-tenant';
    return this.cpeService.findAll(paginationDto, tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de CPE' })
  async getStats(@Req() req: Request) {
    try {
      console.log('📊 Calculando estadísticas CPE...');
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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
  @ApiOperation({ summary: 'Listar comprobantes CPE' })
  async getComprobantes(@Query() filters: any, @Req() req: Request) {
    try {
      console.log('📄 Cargando comprobantes CPE desde BD...');
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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
  @ApiOperation({ summary: 'Obtener datos del CPE' })
  async getCpeData(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    try {
      console.log(`📄 Obteniendo datos CPE: ${id}`);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
  @ApiOperation({ summary: 'Descargar PDF del CPE' })
  async downloadPdf(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      console.log(`📄 Generando PDF para CPE: ${id}`);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
  @ApiOperation({ summary: 'Enviar CPE a SUNAT' })
  async enviarSunat(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    try {
      console.log(`📡 Enviando CPE a SUNAT: ${id}`);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
  @ApiOperation({ summary: 'Obtener CPE por ID' })
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<any> {
    const user = req.user as any;
    const tenantId = user?.tenant_id || 'mock-tenant';
    return this.cpeService.findOne(id, tenantId);
  }

  @Get(':id/xml')
  @ApiOperation({ summary: 'Descargar XML firmado del CPE' })
  async downloadXml(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as any;
    const xmlContent = await this.cpeService.getSignedXml(id, user.tenant_id);
    
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="cpe-${id}.xml"`,
    });
    
    res.send(xmlContent);
  }

  @Post(':id/resend')
  @ApiOperation({ summary: 'Reenviar CPE a OSE/SUNAT' })
  async resend(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.cpeService.resendToOse(id, user.tenant_id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Consultar estado del CPE en OSE' })
  async checkStatus(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.cpeService.checkOseStatus(id, user.tenant_id);
  }
}