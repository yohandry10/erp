import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { CotizacionesService } from './cotizaciones.service';
import { CreateCotizacionDto, UpdateCotizacionDto, ConvertirPedidoDto } from './dto';
import { EstadoCotizacion } from './entities';

/**
 * CotizacionesController
 * Controlador para gestionar cotizaciones del módulo de ventas
 * Requirements: 3.1, 4.1, 4.6, 14.3
 */
@ApiTags('Ventas - Cotizaciones')
@ApiBearerAuth()
@Controller('api/ventas/cotizaciones')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: cotizaciones exige permisos granulares.
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  /**
   * GET /api/ventas/cotizaciones - Listar cotizaciones
   * Requirements: 3.1
   */
  @Get()
  @RequirePermission('ventas.cotizaciones.ver')
  @ApiOperation({
    summary: 'Listar cotizaciones',
    description: 'Obtiene una lista paginada de cotizaciones con filtros opcionales',
  })
  @ApiResponse({ status: 200, description: 'Cotizaciones obtenidas exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query('estado') estado?: EstadoCotizacion,
    @Query('cliente_id') cliente_id?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cotizacionesService.findAll(tenantId, {
      estado,
      cliente_id,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * POST /api/ventas/cotizaciones - Crear cotización
   * Requirements: 3.2, 14.3
   */
  @Post()
  @RequirePermission('ventas.cotizaciones.crear')
  @ApiOperation({
    summary: 'Crear cotización',
    description: 'Crea una nueva cotización en el sistema',
  })
  @ApiResponse({ status: 201, description: 'Cotización creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async create(
    @Body() createCotizacionDto: CreateCotizacionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.cotizacionesService.create(createCotizacionDto, tenantId, user?.id);
  }

  /**
   * GET /api/ventas/cotizaciones/:id - Obtener cotización por ID
   * Requirements: 3.4
   */
  @Get(':id')
  @RequirePermission('ventas.cotizaciones.ver')
  @ApiOperation({
    summary: 'Obtener cotización',
    description: 'Obtiene los detalles de una cotización específica',
  })
  @ApiResponse({ status: 200, description: 'Cotización obtenida exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  async findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.cotizacionesService.findOne(id, tenantId);
  }

  /**
   * PUT /api/ventas/cotizaciones/:id - Actualizar cotización
   * Requirements: 3.5, 14.3
   */
  @Put(':id')
  @RequirePermission('ventas.cotizaciones.editar')
  @ApiOperation({
    summary: 'Actualizar cotización',
    description: 'Actualiza los datos de una cotización existente',
  })
  @ApiResponse({ status: 200, description: 'Cotización actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  async update(
    @Param('id') id: string,
    @Body() updateCotizacionDto: UpdateCotizacionDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.cotizacionesService.update(id, updateCotizacionDto, tenantId);
  }

  /**
   * DELETE /api/ventas/cotizaciones/:id - Eliminar cotización
   * Requirements: 3.1, 14.3
   */
  @Delete(':id')
  @RequirePermission('ventas.cotizaciones.eliminar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar cotización',
    description: 'Elimina una cotización del sistema',
  })
  @ApiResponse({ status: 204, description: 'Cotización eliminada exitosamente' })
  @ApiResponse({ status: 400, description: 'No se puede eliminar la cotización' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  async delete(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    await this.cotizacionesService.delete(id, tenantId);
  }

  /**
   * POST /api/ventas/cotizaciones/:id/convertir-pedido - Convertir cotización a pedido
   * Requirements: 4.1, 4.2, 4.3, 4.6, 14.3
   */
  @Post(':id/convertir-pedido')
  @RequirePermission('ventas.cotizaciones.convertir_pedido')
  @ApiOperation({
    summary: 'Convertir cotización a pedido',
    description: 'Convierte una cotización aprobada en un pedido de venta',
  })
  @ApiResponse({ status: 200, description: 'Cotización convertida exitosamente' })
  @ApiResponse({ status: 400, description: 'No se puede convertir la cotización' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  async convertirAPedido(
    @Param('id') id: string,
    @Body() convertirPedidoDto: ConvertirPedidoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.cotizacionesService.convertirAPedido(
      id,
      convertirPedidoDto,
      tenantId,
      user?.id,
    );
  }

  /**
   * GET /api/ventas/cotizaciones/:id/historial - Obtener historial de cambios de la cotización
   * Requirements: 27.4
   */
  @Get(':id/historial')
  @RequirePermission('ventas.cotizaciones.ver')
  @ApiOperation({
    summary: 'Obtener historial de la cotización',
    description: 'Obtiene el timeline completo de cambios y eventos de la cotización',
  })
  @ApiResponse({ status: 200, description: 'Historial obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  async getHistorial(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.cotizacionesService.getHistorial(id, tenantId);
  }
}
