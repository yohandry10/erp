import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentosService } from './documentos.service';
import { Request } from 'express';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@ApiTags('Documentos')
@Controller('documentos')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  // ========== GESTIÓN DE DOCUMENTOS ==========
  @Get('stats')
  @RequirePermission('documentos.stats.read') // HARDENING: métricas de documentos requieren permiso explícito.
  @ApiOperation({ summary: 'Get documents statistics' })
  @ApiResponse({ status: 200, description: 'Documents statistics retrieved successfully' })
  async getStats(@CurrentTenant() tenantId: string) {
    try {
      // HARDENING: siempre usamos el tenant del contexto, sin valores por defecto.
      return await this.documentosService.getStats(tenantId);
    } catch (error) {
      console.error('❌ Error en endpoint documentos stats:', error);
      return {
        success: false,
        data: {
          totalDocumentos: 0,
          facturas: 0,
          boletas: 0,
          notasCredito: 0,
          contratos: 0,
          pendientesEnvio: 0
        },
        error: error.message
      };
    }
  }

  @Get('lista')
  @RequirePermission('documentos.read') // HARDENING: listado protegido por permiso de lectura.
  @ApiOperation({ summary: 'Get documents list' })
  @ApiResponse({ status: 200, description: 'Documents list retrieved successfully' })
  async getDocumentos(@Query() filters: any, @CurrentTenant() tenantId: string) {
    try {
      console.log('📄 Endpoint documentos lista llamado con filtros:', filters);
      // HARDENING: se utiliza el tenant del contexto exclusivamente.
      return await this.documentosService.getDocumentos(filters, tenantId);
    } catch (error) {
      console.error('❌ Error en endpoint documentos lista:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  @Get(':id')
  @RequirePermission('documentos.read') // HARDENING: lectura individual protegida.
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiResponse({ status: 200, description: 'Document retrieved successfully' })
  async getDocumento(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    try {
      console.log('📄 Endpoint obtener documento:', id);
      return await this.documentosService.getDocumento(id, tenantId);
    } catch (error) {
      console.error('❌ Error obteniendo documento:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Post('crear')
  @RequirePermission('documentos.create') // HARDENING: creación limitada a usuarios autorizados.
  @ApiOperation({ summary: 'Create new document' })
  @ApiResponse({ status: 201, description: 'Document created successfully' })
  async crearDocumento(
    @Body() documentoData: any,
    @CurrentTenant() tenantId: string,
    @Req() req: Request
  ) {
    try {
      console.log('📝 Creando nuevo documento:', documentoData.tipo_documento);
      const user = req.user as any;
      const userId = user?.id;
      // HARDENING: el tenant proviene del contexto y no del payload.
      return await this.documentosService.crearDocumento(documentoData, tenantId, userId);
    } catch (error) {
      console.error('❌ Error creando documento:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Put(':id')
  @RequirePermission('documentos.update') // HARDENING: actualización restringida.
  @ApiOperation({ summary: 'Update document' })
  @ApiResponse({ status: 200, description: 'Document updated successfully' })
  async actualizarDocumento(
    @Param('id') id: string,
    @Body() documentoData: any,
    @CurrentTenant() tenantId: string,
    @Req() req: Request
  ) {
    try {
      console.log('📝 Actualizando documento:', id);
      const user = req.user as any;
      const userId = user?.id;
      
      return await this.documentosService.actualizarDocumento(id, documentoData, tenantId, userId);
    } catch (error) {
      console.error('❌ Error actualizando documento:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  // ========== FACTURACIÓN ELECTRÓNICA ==========
  @Post(':id/generar-xml')
  @RequirePermission('documentos.generate_xml') // HARDENING: generación de XML requiere permiso específico.
  @ApiOperation({ summary: 'Generate XML for electronic invoice' })
  @ApiResponse({ status: 200, description: 'XML generated successfully' })
  async generarXML(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      console.log('🔧 Generando XML para documento:', id);
      return await this.documentosService.generarXML(id, tenantId);
    } catch (error) {
      console.error('❌ Error generando XML:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Post(':id/enviar-sunat')
  @RequirePermission('documentos.enviar_sunat') // HARDENING: envío a SUNAT requiere permiso.
  @ApiOperation({ summary: 'Send document to SUNAT' })
  @ApiResponse({ status: 200, description: 'Document sent to SUNAT successfully' })
  async enviarSUNAT(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Req() req: Request
  ) {
    try {
      console.log('📡 Enviando documento a SUNAT:', id);
      const user = req.user as any;
      const userId = user?.id;
      
      return await this.documentosService.enviarSUNAT(id, tenantId, userId);
    } catch (error) {
      console.error('❌ Error enviando a SUNAT:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Get(':id/descargar-pdf')
  @RequirePermission('documentos.download') // HARDENING: descargas controladas por permiso.
  @ApiOperation({ summary: 'Download document PDF' })
  @ApiResponse({ status: 200, description: 'PDF downloaded successfully' })
  async descargarPDF(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      console.log('📥 Descargando PDF documento:', id);
      return await this.documentosService.generarPDF(id, tenantId);
    } catch (error) {
      console.error('❌ Error descargando PDF:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Get(':id/descargar-xml')
  @RequirePermission('documentos.download') // HARDENING: descargas controladas por permiso.
  @ApiOperation({ summary: 'Download document XML' })
  @ApiResponse({ status: 200, description: 'XML downloaded successfully' })
  async descargarXML(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      console.log('📥 Descargando XML documento:', id);
      return await this.documentosService.descargarXML(id, tenantId);
    } catch (error) {
      console.error('❌ Error descargando XML:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  // ========== VALIDACIONES ==========
  @Post('validar-ruc')
  @RequirePermission('documentos.validations.run') // HARDENING: validaciones externas requieren permiso.
  @ApiOperation({ summary: 'Validate RUC with SUNAT' })
  @ApiResponse({ status: 200, description: 'RUC validated successfully' })
  async validarRUC(@Body() data: { ruc: string }) {
    try {
      console.log('🔍 Validando RUC:', data.ruc);
      return await this.documentosService.validarRUC(data.ruc);
    } catch (error) {
      console.error('❌ Error validando RUC:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Post('validar-documento')
  @RequirePermission('documentos.validations.run') // HARDENING: validación previa protegida.
  @ApiOperation({ summary: 'Validate document data before sending' })
  @ApiResponse({ status: 200, description: 'Document validated successfully' })
  async validarDocumento(@Body() documentoData: any) {
    try {
      console.log('✅ Validando documento antes de envío');
      return await this.documentosService.validarDocumento(documentoData);
    } catch (error) {
      console.error('❌ Error validando documento:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  // ========== SERIES Y CONFIGURACIÓN ==========
  @Get('config/series')
  @RequirePermission('documentos.series.read') // HARDENING: configuración de series requiere permiso de lectura.
  @ApiOperation({ summary: 'Get document series configuration' })
  @ApiResponse({ status: 200, description: 'Series configuration retrieved successfully' })
  async getSeries(@CurrentTenant() tenantId: string) {
    try {
      console.log('📋 Obteniendo configuración de series');
      return await this.documentosService.getSeries(tenantId);
    } catch (error) {
      console.error('❌ Error obteniendo series:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  @Post('config/series')
  @RequirePermission('documentos.series.write') // HARDENING: modificación de series requiere permiso de escritura.
  @ApiOperation({ summary: 'Create new document series' })
  @ApiResponse({ status: 201, description: 'Series created successfully' })
  async crearSerie(
    @Body() serieData: any,
    @CurrentTenant() tenantId: string
  ) {
    try {
      console.log('📋 Creando nueva serie:', serieData);
      return await this.documentosService.crearSerie(serieData, tenantId);
    } catch (error) {
      console.error('❌ Error creando serie:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  // ========== AUDITORÍA ==========
  @Get(':id/auditoria')
  @RequirePermission('documentos.audit.read') // HARDENING: auditoría restringida.
  @ApiOperation({ summary: 'Get document audit log' })
  @ApiResponse({ status: 200, description: 'Audit log retrieved successfully' })
  async getAuditoria(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      console.log('📋 Obteniendo auditoría documento:', id);
      return await this.documentosService.getAuditoria(id, tenantId);
    } catch (error) {
      console.error('❌ Error obteniendo auditoría:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  // ========== ANULACIÓN ==========
  @Post(':id/anular')
  @RequirePermission('documentos.cancel') // HARDENING: anulación controlada.
  @ApiOperation({ summary: 'Cancel/void document' })
  @ApiResponse({ status: 200, description: 'Document cancelled successfully' })
  async anularDocumento(
    @Param('id') id: string,
    @Body() data: { motivo: string },
    @CurrentTenant() tenantId: string,
    @Req() req: Request
  ) {
    try {
      console.log('❌ Anulando documento:', id, 'motivo:', data.motivo);
      const user = req.user as any;
      const userId = user?.id;
      
      return await this.documentosService.anularDocumento(id, data.motivo, tenantId, userId);
    } catch (error) {
      console.error('❌ Error anulando documento:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }
} 
