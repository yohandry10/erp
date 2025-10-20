import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../permissions';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { ReportesService } from './reportes.service';

/**
 * ReportesController
 * Controlador para reportes y estadísticas de ventas
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7
 */
@ApiTags('Ventas - Reportes')
@ApiBearerAuth()
@Controller('api/ventas/reportes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  /**
   * GET /api/ventas/reportes/ventas-por-cliente
   * Reporte de ventas agrupadas por cliente
   * Requirements: 16.1
   */
  @Get('ventas-por-cliente')
  @RequirePermissions('ventas', 'reportes', 'ver')
  @ApiOperation({
    summary: 'Reporte de ventas por cliente',
    description: 'Obtiene ventas agrupadas por cliente con totales y estadísticas',
  })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async getVentasPorCliente(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('cliente') cliente?: string,
    @Query('estado') estado?: string,
  ) {
    const data = await this.reportesService.getVentasPorCliente(
      tenantId,
      fechaDesde,
      fechaHasta,
      cliente,
      estado,
    );
    return { success: true, data };
  }

  /**
   * GET /api/ventas/reportes/cotizaciones-pendientes
   * Reporte de cotizaciones en estado BORRADOR o ENVIADA
   * Requirements: 16.2
   */
  @Get('cotizaciones-pendientes')
  @RequirePermissions('ventas', 'reportes', 'ver')
  @ApiOperation({
    summary: 'Reporte de cotizaciones pendientes',
    description: 'Obtiene cotizaciones que requieren seguimiento',
  })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async getCotizacionesPendientes(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('cliente') cliente?: string,
  ) {
    const data = await this.reportesService.getCotizacionesPendientes(
      tenantId,
      fechaDesde,
      fechaHasta,
      cliente,
    );
    return { success: true, data };
  }

  /**
   * GET /api/ventas/reportes/pedidos-por-estado
   * Dashboard de pedidos agrupados por estado
   * Requirements: 16.3
   */
  @Get('pedidos-por-estado')
  @RequirePermissions('ventas', 'reportes', 'ver')
  @ApiOperation({
    summary: 'Dashboard de pedidos por estado',
    description: 'Obtiene distribución de pedidos según su estado',
  })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async getPedidosPorEstado(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('cliente') cliente?: string,
  ) {
    const data = await this.reportesService.getPedidosPorEstado(
      tenantId,
      fechaDesde,
      fechaHasta,
      cliente,
    );
    return { success: true, data };
  }

  /**
   * GET /api/ventas/reportes/productos-mas-vendidos
   * Reporte de productos más vendidos
   * Requirements: 16.4
   */
  @Get('productos-mas-vendidos')
  @RequirePermissions('ventas', 'reportes', 'ver')
  @ApiOperation({
    summary: 'Reporte de productos más vendidos',
    description: 'Obtiene ranking de productos por unidades e importe',
  })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async getProductosMasVendidos(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('cliente') cliente?: string,
  ) {
    const data = await this.reportesService.getProductosMasVendidos(
      tenantId,
      fechaDesde,
      fechaHasta,
      cliente,
    );
    return { success: true, data };
  }

  /**
   * GET /api/ventas/reportes/top-clientes
   * Reporte de clientes con mayor facturación
   * Requirements: 16.5
   */
  @Get('top-clientes')
  @RequirePermissions('ventas', 'reportes', 'ver')
  @ApiOperation({
    summary: 'Reporte de top clientes',
    description: 'Obtiene clientes con mayor volumen de ventas',
  })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async getTopClientes(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('limit') limit?: number,
  ) {
    const data = await this.reportesService.getTopClientes(
      tenantId,
      fechaDesde,
      fechaHasta,
      limit || 10,
    );
    return { success: true, data };
  }

  /**
   * GET /api/ventas/reportes/lead-time
   * Métrica de lead time comercial (cotización → factura)
   * Requirements: 16.6
   */
  @Get('lead-time')
  @RequirePermissions('ventas', 'reportes', 'ver')
  @ApiOperation({
    summary: 'Reporte de lead time comercial',
    description: 'Calcula tiempo promedio desde cotización hasta factura',
  })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async getLeadTime(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    const data = await this.reportesService.getLeadTime(
      tenantId,
      fechaDesde,
      fechaHasta,
    );
    return { success: true, data };
  }
}
