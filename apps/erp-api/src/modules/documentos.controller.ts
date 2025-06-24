import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
// import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { DocumentosService } from './documentos.service';
import { Request } from 'express';

@ApiTags('Documentos')
@Controller('documentos')
// @UseGuards(JwtAuthGuard)  // Temporalmente deshabilitado para desarrollo
// @ApiBearerAuth()
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  // ========== GESTIÓN DE DOCUMENTOS ==========
  @Get('stats')
  @ApiOperation({ summary: 'Get documents statistics' })
  @ApiResponse({ status: 200, description: 'Documents statistics retrieved successfully' })
  async getStats(@Req() req: Request) {
    try {
      console.log('📊 Endpoint documentos stats llamado');
      const user = req.user as any;
      
      // Por ahora, vamos a probar SIN filtro de tenant para ver si es ese el problema
      console.log('🔍 Usuario detectado:', user);
      
      // Intentar primero sin tenant_id para diagnosticar
      const resultSinTenant = await this.documentosService.getStats(null);
      console.log('📊 Resultado SIN tenant_id:', resultSinTenant);
      
      // Si funciona sin tenant, intentar con tenant
      if (resultSinTenant.success) {
        const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
        console.log('🔍 Intentando con tenant_id:', tenantId);
        return await this.documentosService.getStats(tenantId);
      }
      
      return resultSinTenant;
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
  @ApiOperation({ summary: 'Get documents list' })
  @ApiResponse({ status: 200, description: 'Documents list retrieved successfully' })
  async getDocumentos(@Query() filters: any, @Req() req: Request) {
    try {
      console.log('📄 Endpoint documentos lista llamado con filtros:', filters);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000'; // Default tenant for development
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
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiResponse({ status: 200, description: 'Document retrieved successfully' })
  async getDocumento(@Param('id') id: string, @Req() req: Request) {
    try {
      console.log('📄 Endpoint obtener documento:', id);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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
  @ApiOperation({ summary: 'Create new document' })
  @ApiResponse({ status: 201, description: 'Document created successfully' })
  async crearDocumento(@Body() documentoData: any, @Req() req: Request) {
    try {
      console.log('📝 Creando nuevo documento:', documentoData.tipo_documento);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      const userId = user?.id;
      
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
  @ApiOperation({ summary: 'Update document' })
  @ApiResponse({ status: 200, description: 'Document updated successfully' })
  async actualizarDocumento(@Param('id') id: string, @Body() documentoData: any, @Req() req: Request) {
    try {
      console.log('📝 Actualizando documento:', id);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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
  @ApiOperation({ summary: 'Generate XML for electronic invoice' })
  @ApiResponse({ status: 200, description: 'XML generated successfully' })
  async generarXML(@Param('id') id: string, @Req() req: Request) {
    try {
      console.log('🔧 Generando XML para documento:', id);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
  @ApiOperation({ summary: 'Send document to SUNAT' })
  @ApiResponse({ status: 200, description: 'Document sent to SUNAT successfully' })
  async enviarSUNAT(@Param('id') id: string, @Req() req: Request) {
    try {
      console.log('📡 Enviando documento a SUNAT:', id);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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
  @ApiOperation({ summary: 'Download document PDF' })
  @ApiResponse({ status: 200, description: 'PDF downloaded successfully' })
  async descargarPDF(@Param('id') id: string, @Req() req: Request) {
    try {
      console.log('📥 Descargando PDF documento:', id);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
  @ApiOperation({ summary: 'Download document XML' })
  @ApiResponse({ status: 200, description: 'XML downloaded successfully' })
  async descargarXML(@Param('id') id: string, @Req() req: Request) {
    try {
      console.log('📥 Descargando XML documento:', id);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
  @ApiOperation({ summary: 'Validate RUC with SUNAT' })
  @ApiResponse({ status: 200, description: 'RUC validated successfully' })
  async validarRUC(@Body() data: { ruc: string }, @Req() req: Request) {
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
  @ApiOperation({ summary: 'Validate document data before sending' })
  @ApiResponse({ status: 200, description: 'Document validated successfully' })
  async validarDocumento(@Body() documentoData: any, @Req() req: Request) {
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
  @ApiOperation({ summary: 'Get document series configuration' })
  @ApiResponse({ status: 200, description: 'Series configuration retrieved successfully' })
  async getSeries(@Req() req: Request) {
    try {
      console.log('📋 Obteniendo configuración de series');
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
  @ApiOperation({ summary: 'Create new document series' })
  @ApiResponse({ status: 201, description: 'Series created successfully' })
  async crearSerie(@Body() serieData: any, @Req() req: Request) {
    try {
      console.log('📋 Creando nueva serie:', serieData);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
  @ApiOperation({ summary: 'Get document audit log' })
  @ApiResponse({ status: 200, description: 'Audit log retrieved successfully' })
  async getAuditoria(@Param('id') id: string, @Req() req: Request) {
    try {
      console.log('📋 Obteniendo auditoría documento:', id);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
  @ApiOperation({ summary: 'Cancel/void document' })
  @ApiResponse({ status: 200, description: 'Document cancelled successfully' })
  async anularDocumento(@Param('id') id: string, @Body() data: { motivo: string }, @Req() req: Request) {
    try {
      console.log('❌ Anulando documento:', id, 'motivo:', data.motivo);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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