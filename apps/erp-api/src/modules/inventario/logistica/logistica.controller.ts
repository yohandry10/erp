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
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { FeatureFlagGuard } from '../../../common/guards/feature-flag.guard';
import { RequireFeatureFlag } from '../../../common/decorators/feature-flag.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { LogisticaService } from './logistica.service';
import {
  PrepararPedidoDto,
  ConfirmarDespachoDto,
  ActualizarTrackingDto,
  RegistrarEventoLogisticoDto,
  ReprogramarBackorderDto,
} from './dto';

/**
 * LogisticaController
 * Controlador para gestionar el flujo logístico de pedidos
 * Solo aplica cuando usar_flujo_logistica = true
 * Requirements: 9.2, 14.6, 21.1, 21.2
 */
@ApiTags('Inventario - Logística')
@ApiBearerAuth()
@Controller('api/inventario/logistica')
@UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard) // HARDENING: logística exige permisos granulares y bandera de módulo.
@RequireFeatureFlag('inventario') // HARDENING: deshabilita logística si inventario está apagado.
export class LogisticaController {
  constructor(private readonly logisticaService: LogisticaService) {}

  /**
   * GET /api/inventario/logistica/ordenes-pendientes
   * Lista pedidos en estado CONFIRMADO que requieren preparación
   * Requirements: 9.2, 21.1, 21.2
   */
  @Get('ordenes-pendientes')
  @RequirePermission('inventario.logistica.ver')
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
  @RequirePermission('inventario.logistica.preparar')
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
  @RequirePermission('inventario.logistica.preparar')
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
  @RequirePermission('inventario.logistica.despachar')
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

  /**
   * GET /api/inventario/logistica/:pedidoId/backorders
   * Obtiene el listado de backorders pendientes para seguimiento
   */
  @Get(':pedidoId/backorders')
  @RequirePermission('inventario.logistica.ver')
  @ApiOperation({
    summary: 'Listar backorders del pedido',
    description: 'Devuelve las líneas pendientes con su prioridad y próxima fecha comprometida.',
  })
  @ApiResponse({ status: 200, description: 'Backorders obtenidos exitosamente' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async obtenerBackorders(
    @Param('pedidoId') pedidoId: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.logisticaService.obtenerBackorders(pedidoId, tenantId);
  }

  /**
   * POST /api/inventario/logistica/:pedidoId/backorders/:detalleId/reprogramar
   * Reprograma un backorder con nueva fecha y prioridad
   */
  @Post(':pedidoId/backorders/:detalleId/reprogramar')
  @RequirePermission('inventario.logistica.despachar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reprogramar backorder',
    description: 'Actualiza la fecha comprometida y prioridad de un pendiente de despacho.',
  })
  @ApiResponse({ status: 200, description: 'Backorder reprogramado correctamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Backorder no encontrado' })
  async reprogramarBackorder(
    @Param('pedidoId') pedidoId: string,
    @Param('detalleId') detalleId: string,
    @Body() reprogramarBackorderDto: ReprogramarBackorderDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.logisticaService.reprogramarBackorder(
      pedidoId,
      detalleId,
      tenantId,
      reprogramarBackorderDto,
      user?.id,
    );
  }

  /**
   * POST /api/inventario/logistica/:pedidoId/tracking
   * Actualiza el estado de tracking (EN_TRANSITO / ENTREGADO / INCIDENCIA)
   */
  @Post(':pedidoId/tracking')
  @RequirePermission('inventario.logistica.despachar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualizar tracking del pedido',
    description: 'Permite marcar el pedido como en tránsito, entregado o registrar una incidencia',
  })
  @ApiResponse({ status: 200, description: 'Tracking actualizado correctamente' })
  @ApiResponse({ status: 400, description: 'Estado inválido o pedido no encontrado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  async actualizarTracking(
    @Param('pedidoId') pedidoId: string,
    @Body() actualizarTrackingDto: ActualizarTrackingDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.logisticaService.actualizarTracking(
      pedidoId,
      tenantId,
      actualizarTrackingDto,
      user?.id,
    );
  }

  /**
   * GET /api/inventario/logistica/:pedidoId/eventos - Obtener timeline de eventos logísticos
   */
  @Get(':pedidoId/eventos')
  @RequirePermission('inventario.logistica.ver')
  @ApiOperation({
    summary: 'Obtener eventos logísticos',
    description: 'Lista los eventos de picking/packing/despacho/tracking registrados para el pedido',
  })
  @ApiResponse({ status: 200, description: 'Eventos obtenidos exitosamente' })
  async obtenerEventos(
    @Param('pedidoId') pedidoId: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.logisticaService.obtenerEventosLogisticos(pedidoId, tenantId);
  }

  /**
   * POST /api/inventario/logistica/:pedidoId/eventos - Registrar evento logístico manual
   */
  @Post(':pedidoId/eventos')
  @RequirePermission('inventario.logistica.preparar')
  @ApiOperation({
    summary: 'Registrar evento logístico manual',
    description:
      'Permite registrar manualmente eventos de picking, packing, despacho o estado de tracking con metadatos adicionales',
  })
  @ApiResponse({ status: 200, description: 'Evento registrado correctamente' })
  async registrarEventoManual(
    @Param('pedidoId') pedidoId: string,
    @Body() registrarEventoDto: RegistrarEventoLogisticoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.logisticaService.registrarEventoManual(
      pedidoId,
      tenantId,
      registrarEventoDto,
      user?.id,
    );
  }
}
