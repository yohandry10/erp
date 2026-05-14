import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { PedidosService } from './pedidos.service';
import {
  CreatePedidoDto,
  UpdatePedidoDto,
  ConfirmarPedidoDto,
  CancelarPedidoDto,
  DecidirAprobacionDto,
} from './dto';
import { EstadoPedido } from './entities';

/**
 * PedidosController
 * Controlador para gestionar pedidos de venta
 * Requirements: 5.1, 5.4, 14.4, 14.5
 */
@ApiTags('Ventas - Pedidos')
@ApiBearerAuth()
@Controller('ventas/pedidos')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: exigir permisos granulares en pedidos.
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  /**
   * GET /api/ventas/pedidos - Listar pedidos con paginación
   * Requirements: 5.1
   */
  @Get()
  @RequirePermission('ventas.pedidos.ver')
  @ApiOperation({
    summary: 'Listar pedidos',
    description: 'Obtiene una lista paginada de pedidos con filtros opcionales',
  })
  @ApiResponse({ status: 200, description: 'Pedidos obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query('estado') estado?: EstadoPedido,
    @Query('cliente_id') cliente_id?: string,
    @Query('fecha_desde') fecha_desde?: string,
    @Query('fecha_hasta') fecha_hasta?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.pedidosService.findAll(tenantId, {
      estado,
      cliente_id,
      fecha_desde,
      fecha_hasta,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    
    return {
      success: true,
      ...result,
    };
  }

  /**
   * POST /api/ventas/pedidos - Crear pedido
   * Requirements: 5.2, 14.4
   */
  @Post()
  @RequirePermission('ventas.pedidos.crear')
  @ApiOperation({
    summary: 'Crear pedido',
    description: 'Crea un nuevo pedido de venta',
  })
  @ApiResponse({ status: 201, description: 'Pedido creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async create(
    @Body() createPedidoDto: CreatePedidoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    const pedido = await this.pedidosService.create(createPedidoDto, tenantId, user?.id);
    return {
      success: true,
      data: pedido,
      message: `Pedido ${pedido.numero} creado exitosamente`,
    };
  }

  /**
   * GET /api/ventas/pedidos/aprobaciones/pendientes - Bandeja de pedidos pendientes de aprobación
   */
  @Get('aprobaciones/pendientes')
  @RequirePermission('ventas.pedidos_aprobaciones.ver')
  @ApiOperation({
    summary: 'Listar pedidos pendientes de aprobación',
    description: 'Obtiene la bandeja de pedidos que requieren decisión de aprobación o rechazo',
  })
  @ApiResponse({ status: 200, description: 'Pendientes obtenidos exitosamente' })
  async listarPendientesAprobacion(@CurrentTenant() tenantId: string) {
    return this.pedidosService.listarPendientesAprobacion(tenantId);
  }

  /**
   * GET /api/ventas/pedidos/:id/aprobaciones - Historial de aprobaciones del pedido
   */
  @Get(':id/aprobaciones')
  @RequirePermission('ventas.pedidos_aprobaciones.ver')
  @ApiOperation({
    summary: 'Historial de aprobaciones',
    description: 'Obtiene las decisiones registradas para el pedido (aprobaciones/rechazos)',
  })
  @ApiResponse({ status: 200, description: 'Historial obtenido exitosamente' })
  async obtenerHistorialAprobaciones(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.pedidosService.obtenerHistorialAprobaciones(id, tenantId);
  }

  /**
   * POST /api/ventas/pedidos/:id/aprobaciones/decision - Registrar decisión de aprobación
   */
  @Post(':id/aprobaciones/decision')
  @RequirePermission('ventas.pedidos_aprobaciones.resolver')
  @ApiOperation({
    summary: 'Resolver aprobación de pedido',
    description: 'Registra una decisión de aprobación o rechazo para el pedido pendiente',
  })
  @ApiResponse({ status: 200, description: 'Decisión registrada exitosamente' })
  @ApiResponse({ status: 400, description: 'El pedido no está pendiente de aprobación' })
  async decidirAprobacion(
    @Param('id') id: string,
    @Body() decidirAprobacionDto: DecidirAprobacionDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.pedidosService.decidirAprobacion(
      id,
      tenantId,
      decidirAprobacionDto.decision,
      decidirAprobacionDto.motivos ?? [],
      user?.id,
      decidirAprobacionDto.observaciones,
    );
  }

  /**
   * GET /api/ventas/pedidos/:id - Obtener pedido por ID
   * Requirements: 5.3
   */
  @Get(':id')
  @RequirePermission('ventas.pedidos.ver')
  @ApiOperation({
    summary: 'Obtener pedido',
    description: 'Obtiene los detalles completos de un pedido específico',
  })
  @ApiResponse({ status: 200, description: 'Pedido obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    const pedido = await this.pedidosService.findOne(id, tenantId);
    return {
      success: true,
      data: pedido,
    };
  }

  /**
   * PUT /api/ventas/pedidos/:id - Actualizar pedido
   * Requirements: 5.2, 5.3
   */
  @Put(':id')
  @RequirePermission('ventas.pedidos.editar')
  @ApiOperation({
    summary: 'Actualizar pedido',
    description: 'Actualiza los datos de un pedido existente (solo en estado PENDIENTE)',
  })
  @ApiResponse({ status: 200, description: 'Pedido actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o estado no permite edición' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async update(
    @Param('id') id: string,
    @Body() updatePedidoDto: UpdatePedidoDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.pedidosService.update(id, updatePedidoDto, tenantId);
  }

  /**
   * POST /api/ventas/pedidos/:id/confirmar - Confirmar pedido (reservar stock)
   * Requirements: 5.5, 5.6, 14.5
   */
  @Post(':id/confirmar')
  @RequirePermission('ventas.pedidos.confirmar')
  @ApiOperation({
    summary: 'Confirmar pedido',
    description: 'Confirma el pedido y reserva el stock. Puede retornar warnings si hay stock insuficiente.',
  })
  @ApiResponse({ status: 200, description: 'Pedido confirmado exitosamente' })
  @ApiResponse({ status: 400, description: 'Estado inválido para confirmar' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async confirmar(
    @Param('id') id: string,
    @Body() confirmarPedidoDto: ConfirmarPedidoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.pedidosService.confirmarPedido(
      id,
      tenantId,
      confirmarPedidoDto.forzar_confirmacion,
      user?.id,
    );
  }

  /**
   * POST /api/ventas/pedidos/:id/cancelar - Cancelar pedido (liberar stock)
   * Requirements: 12.1, 12.2, 14.5
   */
  @Post(':id/cancelar')
  @RequirePermission('ventas.pedidos.cancelar')
  @ApiOperation({
    summary: 'Cancelar pedido',
    description: 'Cancela el pedido y libera las reservas de stock si aplica',
  })
  @ApiResponse({ status: 200, description: 'Pedido cancelado exitosamente' })
  @ApiResponse({ status: 400, description: 'No se puede cancelar el pedido en su estado actual' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async cancelar(
    @Param('id') id: string,
    @Body() cancelarPedidoDto: CancelarPedidoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.pedidosService.cancelarPedido(
      id,
      tenantId,
      cancelarPedidoDto.motivo,
      user?.id,
    );
  }

  /**
   * POST /api/ventas/pedidos/:id/generar-factura - Generar factura desde pedido
   * Requirements: 10.1, 14.5
   */
  @Post(':id/generar-factura')
  @RequirePermission('ventas.pedidos.generar_factura')
  @ApiOperation({
    summary: 'Generar factura',
    description: 'Genera una factura electrónica desde el pedido. Puede sugerir generación de GRE.',
  })
  @ApiResponse({ status: 200, description: 'Factura generada exitosamente' })
  @ApiResponse({ status: 400, description: 'Estado inválido para generar factura' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async generarFactura(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.pedidosService.generarFactura(id, tenantId, user?.id);
  }

  /**
   * GET /api/ventas/pedidos/:id/historial - Obtener historial de cambios del pedido
   * Requirements: 27.4
   */
  @Get(':id/historial')
  @RequirePermission('ventas.pedidos.ver_historial')
  @ApiOperation({
    summary: 'Obtener historial del pedido',
    description: 'Obtiene el timeline completo de cambios y eventos del pedido',
  })
  @ApiResponse({ status: 200, description: 'Historial obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async getHistorial(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.pedidosService.getHistorial(id, tenantId);
  }

  /**
   * GET /api/ventas/pedidos/:id/gres - Listar GRE asociadas al pedido
   */
  @Get(':id/gres')
  @RequirePermission('ventas.pedidos.ver_gre')
  @ApiOperation({
    summary: 'Listar GRE asociadas',
    description: 'Obtiene las guías de remisión vinculadas al pedido',
  })
  async listarGresDelPedido(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    const data = await this.pedidosService.obtenerGreAsociadas(id, tenantId);
    return { success: true, data };
  }
  /**
   * POST /api/ventas/pedidos/:id/generar-documento - Generar documento fiscal desde pedido
   * Requirements: Flujo completo Ventas → Documentos → CPE → CxC → Contabilidad
   */
  @Post(':id/generar-documento')
  @RequirePermission('ventas.pedidos.generar_factura')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generar documento fiscal desde pedido',
    description: 'Genera una factura o boleta desde un pedido confirmado. Crea automáticamente el CPE, CxC y asiento contable.',
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Documento generado exitosamente con CPE y CxC',
    schema: {
      example: {
        success: true,
        documento: {
          id: 'uuid',
          tipo_documento: '01',
          serie: 'F001',
          numero: '00000123',
          total: 1180.00
        },
        cpe: {
          id: 'uuid',
          estado_sunat: 'PENDIENTE'
        },
        cxc: {
          id: 'uuid',
          monto_pendiente: 1180.00
        },
        message: 'Documento F001-00000123 generado exitosamente'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Pedido no puede ser facturado o ya tiene documento' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async generarDocumento(
    @Param('id') id: string,
    @Body('tipo_documento') tipoDocumento: '01' | '03',
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    // Validar tipo de documento
    if (!tipoDocumento || (tipoDocumento !== '01' && tipoDocumento !== '03')) {
      throw new BadRequestException(
        'tipo_documento es requerido y debe ser "01" (Factura) o "03" (Boleta)'
      );
    }

    return this.pedidosService.generarDocumentoDesdePedido(
      id,
      tipoDocumento,
      tenantId,
      user?.id,
    );
  }
}
