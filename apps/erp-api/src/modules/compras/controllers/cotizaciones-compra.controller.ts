import { 
  Controller, 
  Get, 
  Post, 
  Put,
  Body, 
  Param, 
  Query,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CotizacionesCompraService } from '../services/cotizaciones-compra.service';
import { CreateCotizacionCompraDto } from '../dto/create-cotizacion-compra.dto';
import { UpdateCotizacionCompraDto } from '../dto/update-cotizacion-compra.dto';
import { CreateOrdenCompraDto } from '../dto/create-orden-compra.dto';

@ApiTags('compras/cotizaciones')
@Controller('compras/cotizaciones')
export class CotizacionesCompraController {
  constructor(
    private readonly cotizacionesService: CotizacionesCompraService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear nueva cotización de compra' })
  @ApiResponse({ status: 201, description: 'Cotización creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Ya existe una cotización con ese número' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateCotizacionCompraDto & { tenant_id?: string }
  ) {
    try {
      // Obtener tenant_id del body o usar valor por defecto para testing
      const tenantId = createDto.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      
      const cotizacion = await this.cotizacionesService.create(createDto, tenantId);
      
      return {
        success: true,
        message: 'Cotización de compra creada exitosamente',
        data: cotizacion
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Get()
  @ApiOperation({ summary: 'Obtener lista de cotizaciones con filtros' })
  @ApiResponse({ status: 200, description: 'Cotizaciones obtenidas exitosamente' })
  @ApiQuery({ name: 'tenant_id', required: false, description: 'ID del tenant' })
  @ApiQuery({ name: 'estado', required: false, description: 'Filtrar por estado' })
  @ApiQuery({ name: 'proveedor_id', required: false, description: 'Filtrar por proveedor' })
  @ApiQuery({ name: 'fecha_desde', required: false, description: 'Fecha desde (YYYY-MM-DD)' })
  @ApiQuery({ name: 'fecha_hasta', required: false, description: 'Fecha hasta (YYYY-MM-DD)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite de resultados' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset para paginación' })
  async findAll(
    @Query('tenant_id') tenantId?: string,
    @Query('estado') estado?: string,
    @Query('proveedor_id') proveedorId?: string,
    @Query('fecha_desde') fechaDesde?: string,
    @Query('fecha_hasta') fechaHasta?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    try {
      const tenant = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const filters: any = {};
      
      if (estado) {
        filters.estado = estado;
      }

      if (proveedorId) {
        filters.proveedor_id = proveedorId;
      }

      if (fechaDesde) {
        filters.fecha_desde = fechaDesde;
      }

      if (fechaHasta) {
        filters.fecha_hasta = fechaHasta;
      }

      if (limit) {
        filters.limit = parseInt(limit, 10);
      }

      if (offset) {
        filters.offset = parseInt(offset, 10);
      }

      const result = await this.cotizacionesService.findAll(tenant, filters);
      
      return {
        success: true,
        data: result.data,
        count: result.count
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: [],
        count: 0
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener cotización por ID' })
  @ApiResponse({ status: 200, description: 'Cotización encontrada' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  async findOne(
    @Param('id') id: string,
    @Query('tenant_id') tenantId?: string
  ) {
    try {
      const tenant = tenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const cotizacion = await this.cotizacionesService.findById(id, tenant);
      
      return {
        success: true,
        data: cotizacion
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
  @ApiOperation({ summary: 'Actualizar cotización de compra' })
  @ApiResponse({ status: 200, description: 'Cotización actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o cotización no editable' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  @ApiResponse({ status: 409, description: 'Ya existe una cotización con ese número' })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateCotizacionCompraDto & { tenant_id?: string },
    @Query('tenant_id') queryTenantId?: string
  ) {
    try {
      // Obtener tenant_id del body, query o usar valor por defecto
      const tenantId = updateDto.tenant_id || queryTenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const cotizacion = await this.cotizacionesService.update(id, updateDto, tenantId);
      
      return {
        success: true,
        message: 'Cotización de compra actualizada exitosamente',
        data: cotizacion
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post(':id/enviar')
  @ApiOperation({ summary: 'Enviar cotización (cambiar estado de BORRADOR a ENVIADA)' })
  @ApiResponse({ status: 200, description: 'Cotización enviada exitosamente' })
  @ApiResponse({ status: 400, description: 'Cotización no puede ser enviada (estado inválido o vencida)' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  @HttpCode(HttpStatus.OK)
  async enviar(
    @Param('id') id: string,
    @Body() body: { tenant_id?: string },
    @Query('tenant_id') queryTenantId?: string
  ) {
    try {
      // Obtener tenant_id del body, query o usar valor por defecto
      const tenantId = body.tenant_id || queryTenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const cotizacion = await this.cotizacionesService.enviar(id, tenantId);
      
      return {
        success: true,
        message: 'Cotización enviada exitosamente',
        data: cotizacion
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post(':id/aprobar')
  @ApiOperation({ summary: 'Aprobar cotización (cambiar estado de ENVIADA a APROBADA)' })
  @ApiResponse({ status: 200, description: 'Cotización aprobada exitosamente' })
  @ApiResponse({ status: 400, description: 'Cotización no puede ser aprobada (estado inválido o vencida)' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  @HttpCode(HttpStatus.OK)
  async aprobar(
    @Param('id') id: string,
    @Body() body: { tenant_id?: string },
    @Query('tenant_id') queryTenantId?: string
  ) {
    try {
      // Obtener tenant_id del body, query o usar valor por defecto
      const tenantId = body.tenant_id || queryTenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const cotizacion = await this.cotizacionesService.aprobar(id, tenantId);
      
      return {
        success: true,
        message: 'Cotización aprobada exitosamente',
        data: cotizacion
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post(':id/rechazar')
  @ApiOperation({ summary: 'Rechazar cotización (cambiar estado de ENVIADA a RECHAZADA)' })
  @ApiResponse({ status: 200, description: 'Cotización rechazada exitosamente' })
  @ApiResponse({ status: 400, description: 'Cotización no puede ser rechazada (estado inválido)' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  @HttpCode(HttpStatus.OK)
  async rechazar(
    @Param('id') id: string,
    @Body() body: { motivo?: string; tenant_id?: string },
    @Query('tenant_id') queryTenantId?: string
  ) {
    try {
      // Obtener tenant_id del body, query o usar valor por defecto
      const tenantId = body.tenant_id || queryTenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      const cotizacion = await this.cotizacionesService.rechazar(
        id, 
        tenantId, 
        body.motivo
      );
      
      return {
        success: true,
        message: 'Cotización rechazada exitosamente',
        data: cotizacion
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post(':id/convertir-oc')
  @ApiOperation({ summary: 'Convertir cotización aprobada a orden de compra' })
  @ApiResponse({ status: 201, description: 'Orden de compra creada exitosamente desde cotización' })
  @ApiResponse({ status: 400, description: 'Cotización no puede ser convertida (estado inválido, vencida, o ya convertida)' })
  @ApiResponse({ status: 404, description: 'Cotización no encontrada' })
  @ApiResponse({ status: 409, description: 'Ya existe una orden de compra con ese número' })
  @HttpCode(HttpStatus.CREATED)
  async convertirAOrdenCompra(
    @Param('id') id: string,
    @Body() body: { numero_oc: string; tenant_id?: string },
    @Query('tenant_id') queryTenantId?: string
  ) {
    try {
      // Obtener tenant_id del body, query o usar valor por defecto
      const tenantId = body.tenant_id || queryTenantId || '550e8400-e29b-41d4-a716-446655440000';
      
      // Validar que se proporcionó el número de OC
      if (!body.numero_oc) {
        return {
          success: false,
          error: 'Debe proporcionar el número de orden de compra (numero_oc)'
        };
      }

      const ordenCompra = await this.cotizacionesService.convertirAOrdenCompra(
        id,
        tenantId,
        body.numero_oc
      );
      
      return {
        success: true,
        message: 'Orden de compra creada exitosamente desde cotización',
        data: ordenCompra
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
