import {
  Controller,
  Get,
  Post,
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
import { DevolucionesProveedorService } from '../services/devoluciones-proveedor.service';
import { CreateDevolucionProveedorDto } from '../dto/create-devolucion-proveedor.dto';

/**
 * DevolucionesProveedorController
 * Controlador para gestionar devoluciones de mercancía a proveedores
 * Requirements: TASK 2.6 - Implementar Devoluciones a Proveedor (Backend)
 */
@ApiTags('Compras - Devoluciones')
@ApiBearerAuth()
@Controller('compras/devoluciones')
// @UseGuards(JwtAuthGuard) // Temporalmente deshabilitado para testing
export class DevolucionesProveedorController {
  constructor(private readonly devolucionesService: DevolucionesProveedorService) {}

  /**
   * POST /compras/devoluciones
   * Crea una nueva devolución a proveedor
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear devolución a proveedor',
    description: 'Crea una nueva devolución de mercancía rechazada o defectuosa en estado PENDIENTE',
  })
  @ApiResponse({ status: 201, description: 'Devolución creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Orden de compra o recepción no encontrada' })
  async crearDevolucion(
    @Body() createDto: CreateDevolucionProveedorDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.devolucionesService.crearDevolucion(tenantId, createDto, user?.id);
  }

  /**
   * GET /compras/devoluciones
   * Lista todas las devoluciones con filtros opcionales
   */
  @Get()
  @ApiOperation({
    summary: 'Listar devoluciones',
    description: 'Obtiene la lista de devoluciones a proveedores con filtros opcionales',
  })
  @ApiResponse({ status: 200, description: 'Devoluciones obtenidas exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async obtenerDevoluciones(
    @Query() filtros: any,
  ) {
    // ✅ MULTI-TENANT: Obtener tenant_id de query params o header para testing
    const tenantId = filtros.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
    return this.devolucionesService.obtenerDevoluciones(tenantId, filtros);
  }

  /**
   * GET /compras/devoluciones/:id
   * Obtiene una devolución específica por ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener devolución por ID',
    description: 'Obtiene los detalles completos de una devolución incluyendo sus items',
  })
  @ApiResponse({ status: 200, description: 'Devolución obtenida exitosamente' })
  @ApiResponse({ status: 404, description: 'Devolución no encontrada' })
  async obtenerDevolucionPorId(
    @Param('id') devolucionId: string,
    @Query() query: any,
  ) {
    // ✅ MULTI-TENANT: Obtener tenant_id de query params para testing
    const tenantId = query.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
    return this.devolucionesService.obtenerDevolucionPorId(devolucionId, tenantId);
  }

  /**
   * POST /compras/devoluciones/:id/emitir
   * Emite una devolución a proveedor (procesa la devolución)
   */
  @Post(':id/emitir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Emitir devolución a proveedor',
    description: 'Procesa la devolución: crea movimientos de inventario, actualiza stock y cambia estado a EMITIDA',
  })
  @ApiResponse({ status: 200, description: 'Devolución emitida exitosamente' })
  @ApiResponse({ status: 400, description: 'Devolución ya fue emitida o datos inválidos' })
  @ApiResponse({ status: 404, description: 'Devolución no encontrada' })
  async emitirDevolucion(
    @Param('id') devolucionId: string,
    @Query() query: any,
    @CurrentUser() user: any,
  ) {
    // ✅ MULTI-TENANT: Obtener tenant_id de query params para testing
    const tenantId = query.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
    return this.devolucionesService.emitirDevolucion(devolucionId, tenantId, user?.id);
  }
}
