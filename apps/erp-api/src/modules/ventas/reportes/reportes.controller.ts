import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
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
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: reportes exige permisos granulares.
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  /**
   * GET /api/ventas/reportes/ventas-por-cliente
   * Reporte de ventas agrupadas por cliente
   * Requirements: 16.1
   */
  @Get('ventas-por-cliente')
  @RequirePermission('ventas.reportes.ver')
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
  @RequirePermission('ventas.reportes.ver')
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
  @RequirePermission('ventas.reportes.ver')
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
  @RequirePermission('ventas.reportes.ver')
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
  @RequirePermission('ventas.reportes.ver')
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
  @RequirePermission('ventas.reportes.ver')
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

  /**
   * GET /api/ventas/reportes/pipeline
   * Pipeline comercial (cotizaciones → pedidos → facturas)
   */
  @Get('pipeline')
  @RequirePermission('ventas.reportes.ver')
  @ApiOperation({
    summary: 'Pipeline comercial',
    description: 'Obtiene métricas de conversión desde cotizaciones hasta facturación',
  })
  async getPipeline(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    const data = await this.reportesService.getPipelineVentas(tenantId, fechaDesde, fechaHasta);
    return { success: true, data };
  }

  /**
   * GET /api/ventas/reportes/fill-rate
   * Fill-rate y OTIF del flujo logístico
   */
  @Get('fill-rate')
  @RequirePermission('ventas.reportes.ver')
  @ApiOperation({
    summary: 'Fill-rate y OTIF',
    description:
      'Calcula el porcentaje de pedidos entregados en cantidad completa y dentro del SLA definido',
  })
  async getFillRate(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    const data = await this.reportesService.getFillRateOtif(tenantId, fechaDesde, fechaHasta);
    return { success: true, data };
  }

  /**
   * GET /api/ventas/reportes/cxc-aging
   * Aging de cuentas por cobrar
   */
  @Get('cxc-aging')
  @RequirePermission('ventas.reportes.ver')
  @ApiOperation({
    summary: 'Aging de cuentas por cobrar',
    description: 'Distribución del saldo pendiente por rangos de mora e identificación de cuentas críticas',
  })
  async getAging(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    const data = await this.reportesService.getAgingCxc(tenantId, fechaDesde, fechaHasta);
    return { success: true, data };
  }

  /**
   * GET /api/ventas/reportes/sunat-kpis
   * Métricas de aceptación SUNAT
   */
  @Get('sunat-kpis')
  @RequirePermission('ventas.reportes.ver')
  @ApiOperation({
    summary: 'KPIs SUNAT',
    description: 'Tasas de aceptación, observación y rechazo de documentos electrónicos',
  })
  async getSunatKpis(
    @CurrentTenant() tenantId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    const data = await this.reportesService.getSunatMetricas(tenantId, fechaDesde, fechaHasta);
    return { success: true, data };
  }
}
