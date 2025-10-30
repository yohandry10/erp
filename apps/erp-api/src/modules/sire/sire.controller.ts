import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SireService } from './sire.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { isProduction } from '../../common/feature-flags';

@ApiTags('sire')
@Controller('sire')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: proteger SIRE con permisos.
@ApiBearerAuth()
export class SireController {
  constructor(
    private readonly sireService: SireService,
    private readonly eventBus: EventBusService
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get SIRE statistics' })
  @ApiResponse({ status: 200, description: 'SIRE statistics retrieved successfully' })
  @RequirePermission('sire.read')
  async getStats(@CurrentTenant() tenantId: string) {
    try {
      console.log('📊 Endpoint SIRE stats llamado');
      return await this.sireService.getStats(tenantId);
    } catch (error) {
      console.error('❌ Error en endpoint SIRE stats:', error);
      return {
        success: false,
        data: {
          reportesDelMes: 0,
          registrosTotales: 0,
          enviadosASunat: 0,
          pendientes: 0,
        },
        error: error.message
      };
    }
  }

  @Get('reportes')
  @ApiOperation({ summary: 'Get SIRE reports' })
  @ApiResponse({ status: 200, description: 'SIRE reports retrieved successfully' })
  @RequirePermission('sire.read')
  async getReportes(@Query() filters: any, @CurrentTenant() tenantId: string) {
    try {
      console.log('📄 Endpoint SIRE reportes llamado con filtros:', filters);
      return await this.sireService.getReportes(filters, tenantId);
    } catch (error) {
      console.error('❌ Error en endpoint SIRE reportes:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  @Post('generar-reporte')
  @ApiOperation({ summary: 'Generate new SIRE report' })
  @ApiResponse({ status: 201, description: 'SIRE report generated successfully' })
  @RequirePermission('sire.emitir')
  async generarReporte(@Body() reportData: any, @CurrentTenant() tenantId: string) {
    try {
      console.log('🔄 Endpoint SIRE generar-reporte llamado con data:', reportData);
      return await this.sireService.generarReporte(reportData, tenantId);
    } catch (error) {
      console.error('❌ Error en endpoint SIRE generar-reporte:', error);
      return {
        success: false,
        message: 'Error al generar el reporte SIRE',
        error: error.message
      };
    }
  }

  @Get('reportes/:id/download')
  @ApiOperation({ summary: 'Download SIRE report' })
  @ApiResponse({ status: 200, description: 'SIRE report downloaded successfully' })
  @RequirePermission('sire.read')
  async downloadReporte(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    try {
      console.log('📥 Endpoint SIRE download llamado para ID:', id);
      return await this.sireService.downloadReporte(id, tenantId);
    } catch (error) {
      console.error('❌ Error en endpoint SIRE download:', error);
      return {
        success: false,
        message: 'Error al descargar el reporte',
        error: error.message
      };
    }
  }

  @Post('reportes/:id/enviar-sunat')
  @ApiOperation({ summary: 'Send SIRE report to SUNAT' })
  @ApiResponse({ status: 200, description: 'SIRE report sent to SUNAT successfully' })
  @RequirePermission('sire.emitir')
  async enviarSunat(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    try {
      console.log('📡 Endpoint SIRE enviar-sunat llamado para ID:', id);
      return await this.sireService.enviarSunat(id, tenantId);
    } catch (error) {
      console.error('❌ Error en endpoint SIRE enviar-sunat:', error);
      return {
        success: false,
        message: 'Error al enviar reporte a SUNAT',
        error: error.message
      };
    }
  }

  @Post('test-evento')
  @ApiOperation({ summary: 'Test SIRE event processing' })
  @RequirePermission('system.debug')
  async testEvento(@Body() testData: any) {
    try {
      if (isProduction()) {
        throw new ForbiddenException('Endpoint restringido en producción');
      }

      console.log('🧪 [SIRE TEST] Probando evento de comprobante...');
      
      // Simular un evento de comprobante creado
      const eventoTest = {
        id: 'test-cpe-123',
        numero_comprobante: 'F001-00001',
        tipo_comprobante: '01',
        fecha_emision: new Date().toISOString(),
        total: 100.00,
        serie: 'F001',
        numero: 1
      };
      
      console.log('🧪 [SIRE TEST] Emitiendo evento de prueba:', eventoTest);
      this.eventBus.emitComprobanteCreadoEvent({
        cpeId: eventoTest.id,
        tipoDocumento: eventoTest.tipo_comprobante,
        serie: eventoTest.serie,
        numero: eventoTest.numero,
        clienteId: '12345678',
        total: eventoTest.total,
        esCredito: false
      });
      
      return {
        success: true,
        message: 'Evento de prueba emitido correctamente - Revisa logs del servidor para ver si SIRE procesó el evento',
        data: eventoTest
      };
    } catch (error) {
      console.error('❌ [SIRE TEST] Error en prueba:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post('test-integracion-pos')
  @ApiOperation({ summary: 'Test POS → CPE → SIRE integration' })
  @RequirePermission('system.debug')
  async testIntegracionPOS(@Body() testData: any) {
    try {
      if (isProduction()) {
        throw new ForbiddenException('Endpoint restringido en producción');
      }

      console.log('🧪 [INTEGRATION TEST] Probando flujo completo POS → CPE → SIRE...');
      
      // Simular comprobante generado desde POS
      const comprobanteFromPOS = {
        cpeId: 'pos-cpe-456',
        tipoDocumento: '03', // Boleta
        serie: 'T001',
        numero: '000123',
        clienteId: '12345678',
        total: 250.00,
        esCredito: false,
        ventaId: 'venta-789'
      };
      
      console.log('🧪 [INTEGRATION TEST] Simulando evento desde POS:', comprobanteFromPOS);
      
      // Llamar directamente al procesamiento de SIRE
      await this.sireService.procesarComprobanteParaSire(comprobanteFromPOS);
      
      return {
        success: true,
        message: '✅ Test de integración POS → CPE → SIRE completado - Revisa las estadísticas de SIRE',
        data: comprobanteFromPOS
      };
    } catch (error) {
      console.error('❌ [INTEGRATION TEST] Error en test de integración:', error);
      return {
        success: false,
        error: error.message,
        message: 'Error en test de integración - Revisa logs del servidor'
      };
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get SIRE exports (placeholder)' })
  findAll() {
    return this.sireService.findAll();
  }
}
