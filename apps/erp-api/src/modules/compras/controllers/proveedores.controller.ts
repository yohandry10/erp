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
  HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ProveedoresService } from '../services/proveedores.service';
import { CreateProveedorDto } from '../dto/create-proveedor.dto';
import { UpdateProveedorDto } from '../dto/update-proveedor.dto';

@ApiTags('compras/proveedores')
@Controller('compras/proveedores')
// @UseGuards(JwtAuthGuard) // Descomentar cuando se implemente autenticación
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Post()
  @ApiOperation({ summary: 'Crear nuevo proveedor' })
  @ApiResponse({ status: 201, description: 'Proveedor creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Ya existe un proveedor con ese RUC' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateProveedorDto & { tenant_id?: string }
  ) {
    try {
      // Obtener tenant_id del body o usar valor por defecto para testing
      const tenantId = createDto.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
    @Query('tenant_id') tenantId?: string,
    @Query('activo') activo?: string,
    @Query('search') search?: string,
    @Query('estado') estado?: string,
    @Query('condiciones_pago') condicionesPago?: string,
    @Query('ruc') ruc?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    try {
      // Usar tenant_id del query o valor por defecto para testing
      const tenant = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
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

      const proveedores = await this.proveedoresService.findAll(tenant, filters);
      
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
    @Query('tenant_id') tenantId?: string
  ) {
    try {
      // Usar tenant_id del query o valor por defecto para testing
      const tenant = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const proveedor = await this.proveedoresService.findByRuc(ruc, tenant);
      
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
    @Query('tenant_id') tenantId?: string
  ) {
    try {
      // Usar tenant_id del query o valor por defecto para testing
      const tenant = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const proveedor = await this.proveedoresService.findById(id, tenant);
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
    @Body() updateDto: UpdateProveedorDto & { tenant_id?: string }
  ) {
    try {
      // Obtener tenant_id del body o usar valor por defecto para testing
      const tenantId = updateDto.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
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
    @Query('tenant_id') tenantId?: string
  ) {
    try {
      // Usar tenant_id del query o valor por defecto para testing
      const tenant = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const proveedor = await this.proveedoresService.softDelete(id, tenant);
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
