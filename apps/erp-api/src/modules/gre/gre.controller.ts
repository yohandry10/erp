import { Controller, Get, Post, Body, Param, Query, /* UseGuards, */ Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GreService } from './gre.service';
import { CreateGuiaRemisionDto, GuiaRemisionResponseDto } from './gre.types';

@ApiTags('gre')
@Controller('gre')
// @UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GreController {
  constructor(private readonly greService: GreService) {}

  @Get()
  @ApiOperation({ summary: 'Get GRE list (placeholder)' })
  findAll() {
    return this.greService.findAll();
  }

  @Get('guias')
  @ApiOperation({ summary: 'Listar guías de remisión' })
  async findAllGuias(@Query() filters: any) {
    try {
      console.log('🔍 Recibiendo petición para listar GREs con filtros:', filters);
      
      const guias = await this.greService.findAllGuias();
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
  @ApiOperation({ summary: 'Obtener una guía de remisión por ID' })
  @ApiResponse({ status: 200, description: 'Guía de remisión obtenida exitosamente' })
  async findGuiaById(@Param('id') id: string) {
    console.log(`🔍 Obteniendo guía de remisión con ID: ${id}`);
    
    try {
      const guia = await this.greService.findGuiaById(id);
      
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
  @ApiOperation({ summary: 'Crear nueva guía de remisión electrónica' })
  @ApiResponse({ status: 201, description: 'Guía de remisión creada exitosamente' })
  async createGuia(@Body() greData: CreateGuiaRemisionDto) {
    console.log('📦 Recibiendo datos para crear GRE:', greData);
    
    try {
      const nuevaGuia = await this.greService.createGuia(greData);
      
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
  @ApiOperation({ summary: 'Obtener estadísticas de GRE' })
  async getStats() {
    try {
      const stats = await this.greService.getStats();
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
}