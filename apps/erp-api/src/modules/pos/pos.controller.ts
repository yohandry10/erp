import { Controller, Get, Post, Body, UseGuards, Req, Param, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { RequireFeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { PosService } from './pos.service';

@Controller('pos')
export class PosController {
  constructor(
    private readonly posService: PosService,
    private readonly jwtService: JwtService,
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
  async abrirCaja(@Body() data: { monto_inicial: number }, @Req() req: any) {
    return this.posService.abrirCaja(data.monto_inicial, req.user);
  }

  @Post('caja/cerrar')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.caja.write') // HARDENING: cierre de caja protegido.
  async cerrarCaja(@Body() data: { monto_contado: number; notas: string }, @Req() req: any) {
    return this.posService.cerrarCaja(data.monto_contado, data.notas, req.user);
  }

  @Post('detalles-venta/:id')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: consultar detalle de venta.
  async getDetallesVenta(@Body() data: { venta_id: string }, @Req() req: any) {
    return this.posService.getDetallesVenta(data.venta_id, req.user);
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
  async procesarVentasPendientesWorker(@Req() req: any) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const secret = process.env.POS_WORKER_JWT_SECRET;

    if (!token) {
      throw new UnauthorizedException('Falta Authorization Bearer token');
    }
    if (!secret || secret.length < 24) {
      throw new ForbiddenException('POS_WORKER_JWT_SECRET no configurado o demasiado corto');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(token, { secret });
    } catch (err) {
      throw new UnauthorizedException('Token de worker inválido o expirado');
    }

    if (payload?.scope !== 'pos.worker') {
      throw new ForbiddenException('Scope inválido para worker POS');
    }

    const requestedTenant = req.query.tenant_id || req.headers['x-tenant-id'];
    if (!requestedTenant) {
      throw new ForbiddenException('Debe indicar tenant_id a procesar');
    }

    const allowedTenants: string[] = Array.isArray(payload?.tenant_ids) ? payload.tenant_ids : [];
    const singleTenant = payload?.tenant_id;
    const allTenants = payload?.all_tenants === true;

    const isAllowed =
      allTenants ||
      (singleTenant && String(singleTenant) === String(requestedTenant)) ||
      allowedTenants.some(t => String(t) === String(requestedTenant));

    if (!isAllowed) {
      throw new ForbiddenException('El token de worker no tiene acceso al tenant solicitado');
    }

    return this.posService.procesarVentasPendientesFacturacion(String(requestedTenant), 50);
  }
}
