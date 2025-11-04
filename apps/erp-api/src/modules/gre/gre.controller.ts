import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GreService } from './gre.service';
import { CreateGuiaRemisionDto, GuiaRemisionResponseDto } from './gre.types';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('gre')
@Controller('gre')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: GRE exige permisos granulares.
@ApiBearerAuth()
export class GreController {
  constructor(private readonly greService: GreService) {}

  @Get()
  @RequirePermission('gre.guias.ver')
  @ApiOperation({ summary: 'Get GRE list (placeholder)' })
  findAll() {
    return this.greService.findAll();
  }

  @Get('guias')
  @RequirePermission('gre.guias.ver')
  @ApiOperation({ summary: 'Listar guías de remisión' })
  async findAllGuias(@Query() filters: any, @CurrentTenant() tenantId: string) {
    try {
      console.log('🔍 Recibiendo petición para listar GREs con filtros:', filters);
      
      const guias = await this.greService.findAllGuias(tenantId);
      console.log(`✅ Controlador: Se encontraron ${guias.length} GREs`);
      
      return { 
        success: true, 
        data: guias,
        message: `Se encontraron ${guias.length} guías de remisión`
      };
    } catch (error) {
      console.error('❌ Error en controlador al listar GREs:', error);
      return {
        success: false,
        data: [],
        message: error.message || 'Error al consultar las guías de remisión'
      };
    }
  }

  @Get('guias/:id')
  @RequirePermission('gre.guias.ver')
  @ApiOperation({ summary: 'Obtener una guía de remisión por ID' })
  @ApiResponse({ status: 200, description: 'Guía de remisión obtenida exitosamente' })
  async findGuiaById(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    console.log(`🔍 Obteniendo guía de remisión con ID: ${id}`);
    
    try {
      const guia = await this.greService.findGuiaById(id, tenantId);
      
      console.log(`✅ Guía de remisión obtenida:`, guia);
      
      return {
        success: true,
        message: 'Guía de remisión obtenida exitosamente',
        data: guia
      };
    } catch (error) {
      console.error('❌ Error al obtener guía:', error);
      return {
        success: false,
        message: error.message || 'Error al obtener la guía de remisión',
        error: error.message
      };
    }
  }

  @Post('guias')
  @RequirePermission('gre.guias.emitir')
  @ApiOperation({ summary: 'Crear nueva guía de remisión electrónica' })
  @ApiResponse({ status: 201, description: 'Guía de remisión creada exitosamente' })
  async createGuia(
    @Body() greData: CreateGuiaRemisionDto,
    @CurrentTenant() tenantId: string,
  ) {
    console.log('📦 Recibiendo datos para crear GRE:', greData);
    
    try {
      const nuevaGuia = await this.greService.createGuia(greData, tenantId);
      
      console.log('✅ GRE creada exitosamente:', nuevaGuia);
      
      return {
        success: true,
        message: `Guía de remisión ${nuevaGuia.numero} creada exitosamente`,
        data: nuevaGuia
      };
    } catch (error) {
      console.error('❌ Error al crear GRE:', error);
      return {
        success: false,
        message: error.message || 'Error al crear la guía de remisión',
        error: error.message
      };
    }
  }

  @Get('reporte')
  @RequirePermission('gre.reportes.ver')
  @ApiOperation({ summary: 'Generar reporte GRE' })
  generateReport() {
    // TODO: Implement real GRE report generation
    return {
      success: true,
      data: null,
      message: 'Funcionalidad en desarrollo'
    };
  }

  @Get('stats')
  @RequirePermission('gre.reportes.ver')
  @ApiOperation({ summary: 'Obtener estadísticas de GRE' })
  async getStats(@CurrentTenant() tenantId: string) {
    try {
      const stats = await this.greService.getStats(tenantId);
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error('❌ Error al obtener estadísticas:', error);
      return {
        success: true,
        data: {
          greEmitidas: 0,
          totalGre: 0,
          enTransito: 0,
          completados: 0
        }
      };
    }
  }

  @Post('guias/:id/reenviar')
  @RequirePermission('gre.guias.reenviar')
  @ApiOperation({ summary: 'Reenviar guía de remisión a SUNAT' })
  @ApiResponse({ status: 200, description: 'GRE reenviada exitosamente' })
  async reenviarGre(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    console.log(`🔄 [GRE] Reenviando GRE ${id} a SUNAT...`);
    
    try {
      const resultado = await this.greService.reenviarGre(id, tenantId);
      
      return {
        success: resultado.success,
        message: resultado.message,
        data: { id, timestamp: new Date() }
      };
    } catch (error) {
      console.error(`❌ Error reenviando GRE ${id}:`, error);
      return {
        success: false,
        message: `Error reenviando GRE: ${error.message}`,
        error: error.message
      };
    }
  }

  @Get('guias/:id/estado-sunat')
  @RequirePermission('gre.guias.consultar')
  @ApiOperation({ summary: 'Consultar estado de GRE en SUNAT' })
  @ApiResponse({ status: 200, description: 'Estado consultado exitosamente' })
  async consultarEstadoSunat(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    console.log(`🔍 [GRE] Consultando estado de GRE ${id} en SUNAT...`);
    
    try {
      const estado = await this.greService.consultarEstadoGre(id, tenantId);
      
      return {
        success: true,
        message: 'Estado consultado exitosamente',
        data: estado
      };
    } catch (error) {
      console.error(`❌ Error consultando estado de GRE ${id}:`, error);
      return {
        success: false,
        message: `Error consultando estado: ${error.message}`,
        error: error.message
      };
    }
  }

  @Get('guias/:id/xml')
  @RequirePermission('gre.guias.descargar_xml')
  @ApiOperation({ summary: 'Obtener XML firmado de la GRE' })
  @ApiResponse({ status: 200, description: 'XML obtenido exitosamente' })
  async obtenerXmlFirmado(@Param('id') id: string, @Res() res: any) {
    console.log(`📄 [GRE] Obteniendo XML de GRE ${id}...`);
    
    try {
      // Por ahora retornamos un placeholder
      // En el futuro, se puede implementar obtener el XML firmado de la BD
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!-- XML firmado de GRE ${id} -->
<DespatchAdvice>
  <ID>GRE-${id}</ID>
  <IssueDate>${new Date().toISOString().split('T')[0]}</IssueDate>
  <!-- Contenido XML completo se implementará -->
</DespatchAdvice>`;

      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="GRE-${id}.xml"`);
      
      return res.send(xmlContent);
    } catch (error) {
      console.error(`❌ Error obteniendo XML de GRE ${id}:`, error);
      return res.status(500).json({
        success: false,
        message: `Error obteniendo XML: ${error.message}`
      });
    }
  }

  @Post('guias/:id/enviar-sunat')
  @RequirePermission('gre.guias.enviar')
  @ApiOperation({ summary: 'Enviar GRE firmada a SUNAT manualmente' })
  @ApiResponse({ status: 200, description: 'GRE enviada a SUNAT exitosamente' })
  async enviarManualmenteSunat(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    console.log(`🚀 [GRE] Envío manual a SUNAT solicitado para GRE ${id}`);
    
    try {
      // Verificar que la GRE esté en estado FIRMADO
      const gre = await this.greService.findGuiaById(id, tenantId);
      
      if (gre.estado !== 'FIRMADO') {
        return {
          success: false,
          message: `GRE debe estar en estado FIRMADO para enviar a SUNAT. Estado actual: ${gre.estado}`
        };
      }

      // Enviar a SUNAT usando el método existente
      const resultado = await this.greService.enviarManualmenteSunat(id, tenantId);
      
      return {
        success: resultado.success,
        message: resultado.message,
        data: { id, timestamp: new Date() }
      };

    } catch (error) {
      console.error(`❌ Error enviando GRE ${id} a SUNAT:`, error);
      return {
        success: false,
        message: `Error enviando GRE a SUNAT: ${error.message}`
      };
    }
  }

  @Post('evaluate-auto-creation')
  @RequirePermission('gre.configuracion.evaluar')
  @ApiOperation({ summary: 'Evaluar si una venta debe generar GRE automática' })
  @ApiResponse({ status: 200, description: 'Evaluación completada' })
  async evaluateAutoCreation(
    @CurrentTenant() tenantId: string,
    @Body() body: {
      saleId: string;
      total: number;
      cpeId?: string;
    }
  ) {
    console.log(`🚚 [GRE] Evaluating auto creation for sale ${body.saleId}`);
    
    try {
      const shouldCreate = await this.greService.evaluateAutoGRECreation({
        tenantId, // HARDENING: tenant proviene del contexto, no del cliente.
        saleId: body.saleId,
        total: body.total,
        cpeId: body.cpeId,
      });

      return {
        success: true,
        data: {
          shouldCreate,
          saleId: body.saleId,
          total: body.total,
          message: shouldCreate 
            ? 'La venta cumple los criterios para GRE automática' 
            : 'La venta no cumple los criterios para GRE automática',
        },
      };
    } catch (error) {
      console.error(`❌ Error evaluating auto GRE creation:`, error);
      return {
        success: false,
        message: `Error evaluando creación automática: ${error.message}`,
      };
    }
  }

  @Get('auto-config')
  @RequirePermission('gre.configuracion.ver')
  @ApiOperation({ summary: 'Obtener configuración de GRE automática' })
  @ApiResponse({ status: 200, description: 'Configuración obtenida exitosamente' })
  async getAutoConfig(@CurrentTenant() tenantId: string) {
    console.log(`🚚 [GRE] Getting auto config for tenant ${tenantId}`);
    
    try {
      const config = await this.greService.getGREThresholdConfig(tenantId);

      return {
        success: true,
        data: config,
        message: 'Configuración obtenida exitosamente',
      };
    } catch (error) {
      console.error(`❌ Error getting auto config:`, error);
      return {
        success: false,
        message: `Error obteniendo configuración: ${error.message}`,
      };
    }
  }

  @Post('auto-config')
  @RequirePermission('gre.configuracion.actualizar')
  @ApiOperation({ summary: 'Actualizar configuración de GRE automática' })
  @ApiResponse({ status: 200, description: 'Configuración actualizada exitosamente' })
  async updateAutoConfig(
    @CurrentTenant() tenantId: string,
    @Body() body: {
      umbralGREAutomatico?: number;
      greAutomaticoHabilitado?: boolean;
    }
  ) {
    console.log(`🚚 [GRE] Updating auto config for tenant ${tenantId}`);
    
    try {
      // Update empresa_config with new thresholds
      const updateData: any = {};
      
      if (body.umbralGREAutomatico !== undefined) {
        updateData.umbral_gre_automatico = body.umbralGREAutomatico;
      }
      
      if (body.greAutomaticoHabilitado !== undefined) {
        updateData.gre_automatico_habilitado = body.greAutomaticoHabilitado;
      }

      // Use supabase service to update
      const supabase = this.greService['supabaseService'].getClient();
      const { error } = await supabase
        .from('empresa_config')
        .update(updateData)
        .eq('tenant_id', tenantId); // HARDENING: nunca usamos tenant del payload.

      if (error) {
        throw error;
      }

      // Get updated config
      const updatedConfig = await this.greService.getGREThresholdConfig(tenantId);

      return {
        success: true,
        data: updatedConfig,
        message: 'Configuración actualizada exitosamente',
      };
    } catch (error) {
      console.error(`❌ Error updating auto config:`, error);
      return {
        success: false,
        message: `Error actualizando configuración: ${error.message}`,
      };
    }
  }
}
