import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Body, 
  Param, 
  Query, 
  UseGuards 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { RetencionesService } from '../modules/retenciones/retenciones.service';
import { 
  CreateRetencionDto, 
  CalcularRetencionDto 
} from '../modules/retenciones/retenciones.types'

@ApiTags('retenciones')
@Controller('retenciones')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RetencionesController {
  constructor(private readonly retencionesService: RetencionesService) {}

  @Post('calcular')
  @ApiOperation({ summary: 'Calcular retención para un pago' })
  @ApiResponse({ status: 200, description: 'Cálculo de retención realizado exitosamente' })
  async calcularRetencion(@Body() data: CalcularRetencionDto) {
    try {
      const calculo = await this.retencionesService.calcularRetencion(data);
      return {
        success: true,
        data: calculo
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva retención' })
  @ApiResponse({ status: 201, description: 'Retención creada exitosamente' })
  async crearRetencion(@Body() data: CreateRetencionDto) {
    try {
      const retencion = await this.retencionesService.crearRetencion(data);
      return {
        success: true,
        data: retencion,
        message: 'Retención creada exitosamente'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get()
  @ApiOperation({ summary: 'Obtener listado de retenciones' })
  @ApiResponse({ status: 200, description: 'Retenciones obtenidas exitosamente' })
  async getRetenciones(
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('categoria') categoria?: string,
    @Query('proveedorId') proveedorId?: string
  ) {
    try {
      const retenciones = await this.retencionesService.getRetenciones(
        fechaDesde,
        fechaHasta,
        categoria,
        proveedorId
      );
      return {
        success: true,
        data: retenciones,
        // Cambiar esta línea:
        // total: retenciones.length
        // Por:
        total: retenciones.total
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Obtener resumen de retenciones por período' })
  @ApiResponse({ status: 200, description: 'Resumen obtenido exitosamente' })
  async getResumenRetenciones(
    @Query('fechaDesde') fechaDesde: string,
    @Query('fechaHasta') fechaHasta: string
  ) {
    try {
      const resumen = await this.retencionesService.getResumenRetenciones(
        fechaDesde,
        fechaHasta
      );
      return {
        success: true,
        data: resumen
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener retención por ID' })
  @ApiResponse({ status: 200, description: 'Retención obtenida exitosamente' })
  async getRetencionById(@Param('id') id: string) {
    try {
      const retencion = await this.retencionesService.getRetencionById(id);
      return {
        success: true,
        data: retencion
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Put(':id/anular')
  @ApiOperation({ summary: 'Anular retención' })
  @ApiResponse({ status: 200, description: 'Retención anulada exitosamente' })
  async anularRetencion(
    @Param('id') id: string,
    @Body('motivo') motivo: string
  ) {
    try {
      await this.retencionesService.anularRetencion(id, motivo);
      return {
        success: true,
        message: 'Retención anulada exitosamente'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}