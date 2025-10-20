import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../permissions';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { LogisticaService } from './logistica.service';
import { PrepararPedidoDto, ConfirmarDespachoDto } from './dto';

/**
 * LogisticaController
 * Controlador para gestionar el flujo logístico de pedidos
 * Solo aplica cuando usar_flujo_logistica = true
 * Requirements: 9.2, 14.6, 21.1, 21.2
 */
@ApiTags('Inventario - Logística')
@ApiBearerAuth()
@Controller('api/inventario/logistica')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LogisticaController {
  constructor(private readonly logisticaService: LogisticaService) {}

  /**
   * GET /api/inventario/logistica/ordenes-pendientes
   * Lista pedidos en estado CONFIRMADO que requieren preparación
   * Requirements: 9.2, 21.1, 21.2
   */
  @Get('ordenes-pendientes')
  @RequirePermissions('inventario', 'logistica', 'ver')
  @ApiOperation({
    summary: 'Listar órdenes pendientes de preparación',
    description: 'Obtiene la lista de pedidos confirmados que están esperando preparación en almacén',
  })
  @ApiResponse({ status: 200, description: 'Órdenes pendientes obtenidas exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  async getOrdenesPendientes(@CurrentTenant() tenantId: string) {
    return this.logisticaService.getOrdenesPendientes(tenantId);
  }

  /**
   * POST /api/inventario/logistica/:pedidoId/preparar
   * Inicia la preparación de un pedido
   * Requirements: 9.3, 9.4, 9.5, 21.3, 21.4
   */
  @Post(':pedidoId/preparar')
  @RequirePermissions('inventario', 'logistica', 'preparar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preparar pedido',
    description: 'Inicia la preparación de un pedido en almacén, cambiando su estado a EN_PREPARACION',
  })
  @ApiResponse({ status: 200, description: 'Pedido marcado como en preparación' })
  @ApiResponse({ status: 400, description: 'Estado inválido o flujo logístico no habilitado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async prepararPedido(
    @Param('pedidoId') pedidoId: string,
    @Body() prepararPedidoDto: PrepararPedidoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.logisticaService.prepararPedido(
      pedidoId,
      tenantId,
      prepararPedidoDto,
      user?.id,
    );
  }

  /**
   * POST /api/inventario/logistica/:pedidoId/marcar-listo
   * Marca un pedido como listo para despacho
   * Requirements: 9.6, 21.6
   */
  @Post(':pedidoId/marcar-listo')
  @RequirePermissions('inventario', 'logistica', 'preparar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marcar pedido como listo para despacho',
    description: 'Marca un pedido como listo para despacho, cambiando su estado a LISTO_DESPACHO',
  })
  @ApiResponse({ status: 200, description: 'Pedido marcado como listo para despacho' })
  @ApiResponse({ status: 400, description: 'Estado inválido o flujo logístico no habilitado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async marcarListoDespacho(
    @Param('pedidoId') pedidoId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.logisticaService.marcarListoDespacho(pedidoId, tenantId, user?.id);
  }

  /**
   * POST /api/inventario/logistica/:pedidoId/confirmar-despacho
   * Confirma el despacho de un pedido
   * Descuenta stock real (SALIDA), libera reserva y cambia a LISTO_FACTURAR
   * Requirements: 9.7, 21.7, 21.8
   */
  @Post(':pedidoId/confirmar-despacho')
  @RequirePermissions('inventario', 'logistica', 'despachar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar despacho de pedido',
    description: 'Confirma el despacho del pedido, descuenta stock real, libera reservas y lo marca como listo para facturar',
  })
  @ApiResponse({ status: 200, description: 'Despacho confirmado exitosamente' })
  @ApiResponse({ status: 400, description: 'Estado inválido o flujo logístico no habilitado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async confirmarDespacho(
    @Param('pedidoId') pedidoId: string,
    @Body() confirmarDespachoDto: ConfirmarDespachoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.logisticaService.confirmarDespacho(
      pedidoId,
      tenantId,
      confirmarDespachoDto,
      user?.id,
    );
  }
}
