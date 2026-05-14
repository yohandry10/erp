import { Controller, Get, Post, Body, UseGuards, Req, Param, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { RequireFeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { PosService } from './pos.service';
import { Public } from '../../common/decorators/public.decorator';
import { WorkerAuthGuard } from '../../shared/guards/worker-auth.guard';

@Controller('pos')
export class PosController {
  constructor(
    private readonly posService: PosService,
  ) {}

  @Get('productos')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: consulta de catálogos POS.
  async getProductos(@Req() req: any) {
    return this.posService.getProductos(req.user);
  }

  @Get('clientes')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: consulta clientes POS.
  async getClientes(@Req() req: any) {
    return this.posService.getClientes(req.user);
  }

  @Get('metodos-pago')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: consulta métodos de pago.
  async getMetodosPago(@Req() req: any) {
    return this.posService.getMetodosPago(req.user);
  }

  @Get('empresa-config')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: lectura configuración POS.
  async getEmpresaConfig(@Req() req: any) {
    return this.posService.getEmpresaConfig(req.user);
  }

  @Get('sesion-caja')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: consultar sesión de caja.
  async getSesionCaja(@Req() req: any) {
    return this.posService.getSesionCajaActual(req.user);
  }

  @Get('ventas-recientes')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: historial ventas POS.
  async getVentasRecientes(@Req() req: any) {
    return this.posService.getVentasRecientes(req.user);
  }

  @Post('venta')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.vender') // HARDENING: venta rápida requiere permiso.
  async procesarVenta(@Body() ventaData: any, @Req() req: any) {
    return this.posService.procesarVenta(ventaData, req.user);
  }

  @Post('caja/abrir')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.caja.write') // HARDENING: apertura de caja protegida.
  async abrirCaja(@Body() data: {
    monto_inicial: number;
    caja_id?: string;
    dispositivo?: string;
    moneda?: string;
    supervisor_id?: string;
    razon_autorizacion?: string;
    denominaciones_apertura?: Record<string, any>;
    ip_address?: string;
    geolocalizacion?: Record<string, any>;
    foto_apertura?: string;
    user_agent?: string;
  }, @Req() req: any) {
    if (data?.supervisor_id || data?.razon_autorizacion) {
      throw new ForbiddenException('La autorización de supervisor debe validarse en un flujo dedicado');
    }
    return this.posService.abrirCaja(data as any, req.user);
  }

  @Post('caja/cerrar')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.caja.write') // HARDENING: cierre de caja protegido.
  async cerrarCaja(@Body() data: { monto_contado: number; notas?: string; caja_id?: string; sesion_id?: string; sesionId?: string }, @Req() req: any) {
    return this.posService.cerrarCaja(data, req.user);
  }

  @Post('detalles-venta/:id')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: consultar detalle de venta.
  async getDetallesVenta(@Param('id') id: string, @Req() req: any) {
    return this.posService.getDetallesVenta(id, req.user);
  }

  @Post('configurar-certificado')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
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
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: estado de configuración.
  async getConfigurationStatus(@Req() req: any) {
    return this.posService.getConfigurationStatus(req.user);
  }

  @Get('ventas-pendientes-facturacion')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: consultar ventas pendientes de facturación.
  async obtenerVentasPendientesFacturacion(@Req() req: any) {
    return this.posService.obtenerVentasPendientesFacturacion(req.user);
  }

  @Post('reintentar-facturacion/:ventaId')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.vender') // HARDENING: reintentar facturación requiere permiso de venta.
  async reintentarFacturacionVenta(@Param('ventaId') ventaId: string, @Req() req: any) {
    return this.posService.reintentarFacturacionVenta(ventaId, req.user);
  }

  @Post('worker/procesar-pendientes')
  @Public()
  @UseGuards(WorkerAuthGuard)
  async procesarVentasPendientesWorker(@Req() req: any) {
    const requestedTenant = req.tenantId;
    if (!requestedTenant) {
      throw new ForbiddenException('Debe indicar tenant_id a procesar');
    }

    return this.posService.procesarVentasPendientesFacturacion(String(requestedTenant), 50);
  }
}
