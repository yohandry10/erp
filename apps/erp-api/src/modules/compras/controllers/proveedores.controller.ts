import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ProveedoresService } from '../services/proveedores.service';
import { CreateProveedorDto } from '../dto/create-proveedor.dto';
import { UpdateProveedorDto } from '../dto/update-proveedor.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('compras/proveedores')
@Controller('compras/proveedores')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: permisos granulares para proveedores.
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Post()
  @ApiOperation({ summary: 'Crear nuevo proveedor' })
  @ApiResponse({ status: 201, description: 'Proveedor creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Ya existe un proveedor con ese RUC' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateProveedorDto,
    @CurrentTenant() tenantId: string
  ) {
    try {
      // HARDENING: tenant proviene del contexto autenticado.
      const proveedor = await this.proveedoresService.create(createDto, tenantId);
      return {
        success: true,
        message: 'Proveedor creado exitosamente',
        data: proveedor
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Get()
  @ApiOperation({ summary: 'Obtener lista de proveedores con filtros' })
  @ApiResponse({ status: 200, description: 'Proveedores obtenidos exitosamente' })
  @ApiQuery({ name: 'tenant_id', required: false, description: 'ID del tenant' })
  @ApiQuery({ name: 'activo', required: false, description: 'Filtrar por estado activo (true/false)' })
  @ApiQuery({ name: 'search', required: false, description: 'Buscar por razón social, RUC o nombre comercial' })
  @ApiQuery({ name: 'estado', required: false, description: 'Filtrar por estado (ACTIVO/INACTIVO)' })
  @ApiQuery({ name: 'condiciones_pago', required: false, description: 'Filtrar por condiciones de pago' })
  @ApiQuery({ name: 'ruc', required: false, description: 'Filtrar por RUC exacto' })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite de resultados' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset para paginación' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query('activo') activo?: string,
    @Query('search') search?: string,
    @Query('estado') estado?: string,
    @Query('condiciones_pago') condicionesPago?: string,
    @Query('ruc') ruc?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    try {
      const filters: any = {};
      
      if (activo !== undefined) {
        filters.activo = activo === 'true';
      }
      
      if (search) {
        filters.search = search;
      }

      if (estado) {
        filters.estado = estado;
      }

      if (condicionesPago) {
        filters.condiciones_pago = condicionesPago;
      }

      if (ruc) {
        filters.ruc = ruc;
      }

      if (limit) {
        filters.limit = parseInt(limit, 10);
      }

      if (offset) {
        filters.offset = parseInt(offset, 10);
      }

      const proveedores = await this.proveedoresService.findAll(tenantId, filters);
      
      return {
        success: true,
        data: proveedores,
        count: proveedores.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  @Get('buscar-ruc/:ruc')
  @ApiOperation({ summary: 'Buscar proveedor por RUC' })
  @ApiResponse({ status: 200, description: 'Proveedor encontrado' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  async findByRuc(
    @Param('ruc') ruc: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      const proveedor = await this.proveedoresService.findByRuc(ruc, tenantId);
      
      if (!proveedor) {
        return {
          success: false,
          message: 'Proveedor no encontrado',
          data: null
        };
      }

      return {
        success: true,
        data: proveedor
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener proveedor por ID' })
  @ApiResponse({ status: 200, description: 'Proveedor encontrado' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  async findOne(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      const proveedor = await this.proveedoresService.findById(id, tenantId);
      return {
        success: true,
        data: proveedor
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar proveedor' })
  @ApiResponse({ status: 200, description: 'Proveedor actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  @ApiResponse({ status: 409, description: 'Ya existe otro proveedor con ese RUC' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateProveedorDto,
    @CurrentTenant() tenantId: string
  ) {
    try {
      const proveedor = await this.proveedoresService.update(id, updateDto, tenantId);
      return {
        success: true,
        message: 'Proveedor actualizado exitosamente',
        data: proveedor
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar proveedor (soft delete)' })
  @ApiResponse({ status: 200, description: 'Proveedor desactivado exitosamente' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      const proveedor = await this.proveedoresService.softDelete(id, tenantId);
      return {
        success: true,
        message: 'Proveedor desactivado exitosamente',
        data: proveedor
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
