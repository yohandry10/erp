import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery
} from '@nestjs/swagger';
import { OrdenesCompraService } from '../services/ordenes-compra.service';
import { RecepcionesService } from '../services/recepciones.service';
import { CreateOrdenCompraDto } from '../dto/create-orden-compra.dto';
import { UpdateOrdenCompraDto } from '../dto/update-orden-compra.dto';
import { AprobarOrdenCompraDto } from '../dto/aprobar-orden-compra.dto';
import { RechazarOrdenCompraDto } from '../dto/rechazar-orden-compra.dto';
import { CancelarOrdenCompraDto } from '../dto/cancelar-orden-compra.dto';
import { CreateRecepcionDto } from '../dto/create-recepcion.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@ApiTags('Compras - Órdenes de Compra')
@Controller('compras/ordenes')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: proteger con permisos granulares.
export class OrdenesCompraController {
  constructor(
    private readonly ordenesCompraService: OrdenesCompraService,
    private readonly recepcionesService: RecepcionesService,
  ) {}

  @Post()
  @RequirePermission('compras.ordenes.crear') // HARDENING: crear orden de compra.
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Crear nueva orden de compra',
    description: 'Crea una nueva orden de compra con sus detalles. Puede ser creada desde una cotización aprobada o de forma independiente.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Orden de compra creada exitosamente' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos inválidos o validación fallida' 
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Ya existe una orden con el mismo número' 
  })
  async create(
    @Body(ValidationPipe) createDto: CreateOrdenCompraDto,
    @CurrentTenant() tenantId: string
  ) {
    try {
      const orden = await this.ordenesCompraService.create(createDto, tenantId);
      return {
        success: true,
        message: 'Orden de compra creada exitosamente',
        data: orden
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Get()
  @RequirePermission('compras.ordenes.ver') // HARDENING: listar órdenes.
  @ApiOperation({ 
    summary: 'Listar órdenes de compra',
    description: 'Obtiene todas las órdenes de compra con filtros opcionales'
  })
  @ApiQuery({ name: 'estado', required: false, description: 'Filtrar por estado' })
  @ApiQuery({ name: 'proveedor_id', required: false, description: 'Filtrar por proveedor' })
  @ApiQuery({ name: 'fecha_desde', required: false, description: 'Fecha desde (YYYY-MM-DD)' })
  @ApiQuery({ name: 'fecha_hasta', required: false, description: 'Fecha hasta (YYYY-MM-DD)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite de resultados', type: Number })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset para paginación', type: Number })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de órdenes de compra obtenida exitosamente' 
  })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query('estado') estado?: string,
    @Query('proveedor_id') proveedor_id?: string,
    @Query('fecha_desde') fecha_desde?: string,
    @Query('fecha_hasta') fecha_hasta?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    try {
      const result = await this.ordenesCompraService.findAll(tenantId, {
        estado,
        proveedor_id,
        fecha_desde,
        fecha_hasta,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined
      });
      
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
  @RequirePermission('compras.ordenes.ver') // HARDENING: ver detalle de orden.
  @ApiOperation({ 
    summary: 'Obtener orden de compra por ID',
    description: 'Obtiene los detalles completos de una orden de compra específica'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Orden de compra encontrada' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Orden de compra no encontrada' 
  })
  async findById(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      // HARDENING: ignoramos tenant externo, usamos contexto.
      const orden = await this.ordenesCompraService.findById(id, tenantId);
      return {
        success: true,
        data: orden
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
  @RequirePermission('compras.ordenes.actualizar') // HARDENING: actualizar orden.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Actualizar orden de compra',
    description: 'Actualiza una orden de compra existente. Solo se pueden editar órdenes en estado BORRADOR.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Orden de compra actualizada exitosamente' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos inválidos o la orden no está en estado BORRADOR' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Orden de compra no encontrada' 
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Ya existe otra orden con el mismo número' 
  })
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateDto: UpdateOrdenCompraDto,
    @CurrentTenant() tenantId: string
  ) {
    try {
      // HARDENING: usamos tenant del contexto, ignoramos valores externos.
      const orden = await this.ordenesCompraService.update(id, updateDto, tenantId);
      return {
        success: true,
        message: 'Orden de compra actualizada exitosamente',
        data: orden
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post(':id/aprobar')
  @RequirePermission('compras.ordenes.aprobar') // HARDENING: aprobar orden.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Aprobar orden de compra',
    description: 'Aprueba una orden de compra cambiando su estado a APROBADA. Solo se pueden aprobar órdenes en estado PENDIENTE, BORRADOR o APROBACION.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Orden de compra aprobada exitosamente' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'La orden no está en un estado que permita aprobación' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Orden de compra no encontrada' 
  })
  async aprobar(
    @Param('id') id: string,
    @Body(ValidationPipe) aprobarDto: AprobarOrdenCompraDto,
    @CurrentTenant() tenantId: string
  ) {
    try {
      const orden = await this.ordenesCompraService.aprobar(id, aprobarDto, tenantId);
      return {
        success: true,
        message: 'Orden de compra aprobada exitosamente',
        data: orden
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post(':id/rechazar')
  @RequirePermission('compras.ordenes.rechazar') // HARDENING: rechazar orden.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Rechazar orden de compra',
    description: 'Rechaza una orden de compra cambiando su estado a RECHAZADA. Solo se pueden rechazar órdenes en estado PENDIENTE, BORRADOR o APROBACION. Se requiere especificar el motivo del rechazo.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Orden de compra rechazada exitosamente' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'La orden no está en un estado que permita rechazo o falta el motivo' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Orden de compra no encontrada' 
  })
  async rechazar(
    @Param('id') id: string,
    @Body(ValidationPipe) rechazarDto: RechazarOrdenCompraDto,
    @CurrentTenant() tenantId: string
  ) {
    try {
      // HARDENING: usamos tenant del contexto para evitar fuga multi-tenant.
      const orden = await this.ordenesCompraService.rechazar(id, rechazarDto, tenantId);
      return {
        success: true,
        message: 'Orden de compra rechazada exitosamente',
        data: orden
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post(':id/cancelar')
  @RequirePermission('compras.ordenes.cancelar') // HARDENING: cancelar orden.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Cancelar orden de compra',
    description: 'Cancela una orden de compra cambiando su estado a ANULADA. Solo se pueden cancelar órdenes en estado PENDIENTE, BORRADOR, APROBACION, APROBADA o PARCIAL. Se requiere especificar el motivo de la cancelación.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Orden de compra cancelada exitosamente' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'La orden no está en un estado que permita cancelación o falta el motivo' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Orden de compra no encontrada' 
  })
  async cancelar(
    @Param('id') id: string,
    @Body(ValidationPipe) cancelarDto: CancelarOrdenCompraDto,
    @CurrentTenant() tenantId: string
  ) {
    try {
      // HARDENING: ignoramos tenant externo; usamos contexto autenticado.
      const orden = await this.ordenesCompraService.cancelar(id, cancelarDto, tenantId);
      return {
        success: true,
        message: 'Orden de compra cancelada exitosamente',
        data: orden
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post(':id/recepciones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Crear recepción para una orden de compra',
    description: 'Crea una nueva recepción de mercancía en estado BORRADOR para una orden de compra específica. La orden debe estar en estado APROBADA o PARCIAL.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Recepción creada exitosamente' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos inválidos o estado de orden no válido para recepción' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Orden de compra no encontrada' 
  })
  async createRecepcion(
    @Param('id') ordenId: string,
    @Body(ValidationPipe) createRecepcionDto: CreateRecepcionDto,
    @CurrentTenant() tenantId: string
  ) {
    try {
      // Asegurar que el orden_id del DTO coincida con el parámetro de la ruta
      createRecepcionDto.orden_id = ordenId;
      
      const recepcion = await this.recepcionesService.crearRecepcion(
        tenantId,
        createRecepcionDto,
        null // userId - se puede obtener del CurrentUser decorator cuando se habilite autenticación
      );
      
      return {
        success: true,
        message: 'Recepción creada exitosamente',
        data: recepcion
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Get(':id/recepciones')
  @ApiOperation({ 
    summary: 'Obtener recepciones de una orden de compra',
    description: 'Obtiene todas las recepciones de mercancía asociadas a una orden de compra específica'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Recepciones obtenidas exitosamente' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Orden de compra no encontrada' 
  })
  async findRecepcionesByOrdenId(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      const recepciones = await this.ordenesCompraService.findRecepcionesByOrdenId(id, tenantId);
      return {
        success: true,
        data: recepciones,
        count: recepciones.length
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

  @Get(':id/aprobaciones')
  @ApiOperation({ 
    summary: 'Obtener aprobaciones de una orden de compra',
    description: 'Obtiene todos los registros de aprobación asociados a una orden de compra específica'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Aprobaciones obtenidas exitosamente' 
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Orden de compra no encontrada' 
  })
  async findAprobacionesByOrdenId(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string
  ) {
    try {
      const aprobaciones = await this.ordenesCompraService.findAprobacionesByOrdenId(id, tenantId);
      return {
        success: true,
        data: aprobaciones,
        count: aprobaciones.length
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
}
