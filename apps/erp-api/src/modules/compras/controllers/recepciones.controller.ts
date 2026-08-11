import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RecepcionesService } from '../services/recepciones.service';
import { CreateRecepcionDto, CerrarRecepcionDto, UpdateRecepcionDto } from '../dto';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';

/**
 * RecepcionesController
 * Controlador para gestionar recepciones de bienes y servicios de órdenes de compra
 * Requirements: TASK 2.5 - Implementar Módulo Recepciones (Backend)
 */
@ApiTags('Compras - Recepciones')
@ApiBearerAuth()
@Controller('compras/recepciones')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: recepciones protegidas por permisos.
export class RecepcionesController {
  constructor(private readonly recepcionesService: RecepcionesService) {}

  /**
   * GET /api/compras/recepciones
   * Lista todas las recepciones con filtros opcionales
   */
  @Get()
  @RequirePermission('compras.recepciones.ver')
  @ApiOperation({
    summary: 'Listar recepciones',
    description: 'Obtiene la lista de recepciones de mercancía con filtros opcionales',
  })
  @ApiResponse({ status: 200, description: 'Recepciones obtenidas exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async obtenerRecepciones(
    @CurrentTenant() tenantId: string,
    @Query() filtros: any,
  ) {
    return this.recepcionesService.obtenerRecepciones(tenantId, filtros);
  }

  /**
   * GET /api/compras/recepciones/:id
   * Obtiene una recepción específica por ID
   */
  @Get(':id')
  @RequirePermission('compras.recepciones.ver')
  @ApiOperation({
    summary: 'Obtener recepción por ID',
    description: 'Obtiene los detalles completos de una recepción incluyendo sus items',
  })
  @ApiResponse({ status: 200, description: 'Recepción obtenida exitosamente' })
  @ApiResponse({ status: 404, description: 'Recepción no encontrada' })
  async obtenerRecepcionPorId(
    @Param('id') recepcionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.recepcionesService.obtenerRecepcionPorId(recepcionId, tenantId);
  }

  /**
   * POST /api/compras/ordenes/:ordenId/recepciones
   * Crea una nueva recepción para una orden de compra
   */
  @Post('/ordenes/:ordenId')
  @RequirePermission('compras.recepciones.crear')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear recepción',
    description: 'Crea una nueva recepción de bienes o servicios en estado BORRADOR para una orden de compra',
  })
  @ApiResponse({ status: 201, description: 'Recepción creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o estado de orden no válido' })
  @ApiResponse({ status: 404, description: 'Orden de compra no encontrada' })
  async crearRecepcion(
    @Param('ordenId') ordenId: string,
    @Body() createRecepcionDto: CreateRecepcionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    // Asegurar que el orden_id del DTO coincida con el parámetro
    createRecepcionDto.orden_id = ordenId;
    return this.recepcionesService.crearRecepcion(tenantId, createRecepcionDto, user?.id);
  }

  /**
   * PUT /api/compras/recepciones/:id
   * Actualiza una recepción en estado BORRADOR
   */
  @Put(':id')
  @RequirePermission('compras.recepciones.editar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualizar recepción',
    description: 'Actualiza una recepción en estado BORRADOR',
  })
  @ApiResponse({ status: 200, description: 'Recepción actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Solo se pueden actualizar recepciones en estado BORRADOR' })
  @ApiResponse({ status: 404, description: 'Recepción no encontrada' })
  async actualizarRecepcion(
    @Param('id') recepcionId: string,
    @Body() updateDto: UpdateRecepcionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.recepcionesService.actualizarRecepcion(recepcionId, tenantId, updateDto, user?.id);
  }

  /**
   * POST /api/compras/recepciones/:id/cerrar
   * Cierra una recepción y actualiza el inventario
   */
  @Post(':id/cerrar')
  @RequirePermission('compras.recepciones.cerrar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar recepción',
    description: 'Cierra una recepción, actualiza el cumplimiento y mueve inventario sólo cuando corresponde',
  })
  @ApiResponse({ status: 200, description: 'Recepción cerrada exitosamente' })
  @ApiResponse({ status: 400, description: 'Recepción inválida o cierre rechazado' })
  @ApiResponse({ status: 404, description: 'Recepción no encontrada' })
  async cerrarRecepcion(
    @Param('id') recepcionId: string,
    @Body() cerrarRecepcionDto: CerrarRecepcionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.recepcionesService.cerrarRecepcion(recepcionId, tenantId, cerrarRecepcionDto, user?.id);
  }
}
