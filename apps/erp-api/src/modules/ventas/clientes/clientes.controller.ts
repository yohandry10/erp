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
import { ClientesService } from './clientes.service';
import { CreateClienteDto, UpdateClienteDto, ValidarRucDto } from './dto';

/**
 * ClientesController
 * Controlador para gestionar clientes del módulo de ventas
 * Requirements: 1.1, 1.2, 1.6, 14.1, 14.2
 */
@ApiTags('Ventas - Clientes')
@ApiBearerAuth()
@Controller('ventas/clientes')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: clientes exige permisos granulares.
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  /**
   * GET /api/ventas/clientes - Listar clientes con paginación
   * Requirements: 1.1, 1.7, 24.1, 24.2
   */
  @Get()
  @RequirePermission('ventas.clientes.ver')
  @ApiOperation({
    summary: 'Listar clientes',
    description: 'Obtiene una lista paginada de clientes con filtros opcionales',
  })
  @ApiResponse({ status: 200, description: 'Clientes obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query('search') search?: string,
    @Query('tipo') tipo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.clientesService.findAll(tenantId, {
      search,
      tipo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * POST /api/ventas/clientes - Crear cliente
   * Requirements: 1.2, 14.1
   */
  @Post()
  @RequirePermission('ventas.clientes.crear')
  @ApiOperation({
    summary: 'Crear cliente',
    description: 'Crea un nuevo cliente en el sistema',
  })
  @ApiResponse({ status: 201, description: 'Cliente creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 409, description: 'Cliente duplicado' })
  async create(
    @Body() createClienteDto: CreateClienteDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.clientesService.create(createClienteDto, tenantId, user?.id);
  }

  /**
   * GET /api/ventas/clientes/:id - Obtener cliente por ID
   * Requirements: 1.6, 24.3
   */
  @Get(':id')
  @RequirePermission('ventas.clientes.ver')
  @ApiOperation({
    summary: 'Obtener cliente',
    description: 'Obtiene los detalles de un cliente específico',
  })
  @ApiResponse({ status: 200, description: 'Cliente obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.clientesService.findOne(id, tenantId);
  }

  /**
   * PUT /api/ventas/clientes/:id - Actualizar cliente
   * Requirements: 1.8, 14.1
   */
  @Put(':id')
  @RequirePermission('ventas.clientes.editar')
  @ApiOperation({
    summary: 'Actualizar cliente',
    description: 'Actualiza los datos de un cliente existente',
  })
  @ApiResponse({ status: 200, description: 'Cliente actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiResponse({ status: 409, description: 'Documento duplicado' })
  async update(
    @Param('id') id: string,
    @Body() updateClienteDto: UpdateClienteDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.clientesService.update(id, updateClienteDto, tenantId, user?.id);
  }

  /**
   * DELETE /api/ventas/clientes/:id - Eliminar cliente
   * Requirements: 1.8, 14.1
   */
  @Delete(':id')
  @RequirePermission('ventas.clientes.eliminar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desactivar cliente',
    description: 'Desactiva el cliente conservando su trazabilidad comercial',
  })
  @ApiResponse({ status: 204, description: 'Cliente eliminado exitosamente' })
  @ApiResponse({ status: 400, description: 'Cliente tiene dependencias' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async delete(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    await this.clientesService.delete(id, tenantId, user?.id);
  }

  /**
   * POST /api/ventas/clientes/validar-ruc - Validar formato de RUC
   * Requirements: 1.4, 19.3
   */
  @Post('validar-ruc')
  @RequirePermission('ventas.clientes.validar_ruc')
  @ApiOperation({
    summary: 'Validar RUC',
    description: 'Valida localmente el formato y dígito verificador del RUC; no consulta el padrón SUNAT',
  })
  @ApiResponse({ status: 200, description: 'RUC validado exitosamente' })
  @ApiResponse({ status: 400, description: 'RUC inválido' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async validarRuc(@Body() validarRucDto: ValidarRucDto) {
    return this.clientesService.validarRUC(validarRucDto);
  }
}
