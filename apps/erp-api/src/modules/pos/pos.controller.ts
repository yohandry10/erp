import { Controller, Get, Post, Body, UseGuards, Req, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { RequireFeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { PosService } from './pos.service';

@Controller('pos')
@UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard) // HARDENING: permisos + feature flag POS.
@RequireFeatureFlag('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('productos')
  @RequirePermission('pos.read') // HARDENING: consulta de catálogos POS.
  async getProductos(@Req() req: any) {
    return this.posService.getProductos(req.user);
  }

  @Get('clientes')
  @RequirePermission('pos.read') // HARDENING: consulta clientes POS.
  async getClientes(@Req() req: any) {
    return this.posService.getClientes(req.user);
  }

  @Get('metodos-pago')
  @RequirePermission('pos.read') // HARDENING: consulta métodos de pago.
  async getMetodosPago(@Req() req: any) {
    return this.posService.getMetodosPago(req.user);
  }

  @Get('empresa-config')
  @RequirePermission('pos.read') // HARDENING: lectura configuración POS.
  async getEmpresaConfig(@Req() req: any) {
    return this.posService.getEmpresaConfig(req.user);
  }

  @Get('sesion-caja')
  @RequirePermission('pos.read') // HARDENING: consultar sesión de caja.
  async getSesionCaja(@Req() req: any) {
    return this.posService.getSesionCajaActual(req.user);
  }

  @Get('ventas-recientes')
  @RequirePermission('pos.read') // HARDENING: historial ventas POS.
  async getVentasRecientes(@Req() req: any) {
    return this.posService.getVentasRecientes(req.user);
  }

  @Post('venta')
  @RequirePermission('pos.vender') // HARDENING: venta rápida requiere permiso.
  async procesarVenta(@Body() ventaData: any, @Req() req: any) {
    return this.posService.procesarVenta(ventaData, req.user);
  }

  @Post('caja/abrir')
  @RequirePermission('pos.caja.write') // HARDENING: apertura de caja protegida.
  async abrirCaja(@Body() data: { monto_inicial: number }, @Req() req: any) {
    return this.posService.abrirCaja(data.monto_inicial, req.user);
  }

  @Post('caja/cerrar')
  @RequirePermission('pos.caja.write') // HARDENING: cierre de caja protegido.
  async cerrarCaja(@Body() data: { monto_contado: number; notas: string }, @Req() req: any) {
    return this.posService.cerrarCaja(data.monto_contado, data.notas, req.user);
  }

  @Post('detalles-venta/:id')
  @RequirePermission('pos.read') // HARDENING: consultar detalle de venta.
  async getDetallesVenta(@Body() data: { venta_id: string }, @Req() req: any) {
    return this.posService.getDetallesVenta(data.venta_id, req.user);
  }

  @Post('configurar-certificado')
  @RequirePermission('pos.configuracion.write') // HARDENING: configurar certificado POS.
  async configurarCertificado(
    @Body() data: { certificado_base64: string; password: string },
    @Req() req: any
  ) {
    return this.posService.configurarCertificado(
      data.certificado_base64,
      data.password,
      req.user
    );
  }

  @Get('configuration-status')
  @RequirePermission('pos.read') // HARDENING: estado de configuración.
  async getConfigurationStatus(@Req() req: any) {
    return this.posService.getConfigurationStatus(req.user);
  }

  @Get('ventas-pendientes-facturacion')
  @RequirePermission('pos.read') // HARDENING: consultar ventas pendientes de facturación.
  async obtenerVentasPendientesFacturacion(@Req() req: any) {
    return this.posService.obtenerVentasPendientesFacturacion(req.user);
  }

  @Post('reintentar-facturacion/:ventaId')
  @RequirePermission('pos.vender') // HARDENING: reintentar facturación requiere permiso de venta.
  async reintentarFacturacionVenta(@Param('ventaId') ventaId: string, @Req() req: any) {
    return this.posService.reintentarFacturacionVenta(ventaId, req.user);
  }
}
