import { Controller, Get, Post, Body, UseGuards, Req, Param, ForbiddenException, ParseUUIDPipe, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { RequireFeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { PosService } from './pos.service';
import { Public } from '../../common/decorators/public.decorator';
import { WorkerAuthGuard } from '../../shared/guards/worker-auth.guard';
import { CreateVentaPosDto } from './dto/create-venta-pos.dto';
import { CanjearTicketPosDto } from './dto/canjear-ticket-pos.dto';

import { AbrirCajaPosDto, CerrarCajaPosDto, ConfigurarCertificadoPosDto } from './dto/caja-pos.dto';

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
  async procesarVenta(@Body() ventaData: CreateVentaPosDto, @Req() req: any) {
    const resultado: any = await this.posService.procesarVenta(ventaData, req.user);
    // Una venta que no se registró no puede responder 201 Created: los clientes
    // (y cualquier proxy o reintento automático) leen el código HTTP, no el
    // campo `success`. El cuerpo se conserva tal cual para no romper a la UI.
    if (resultado && resultado.success === false) {
      throw new HttpException(resultado, PosController.estadoHttpDeFalloVenta(resultado));
    }
    return resultado;
  }

  private static estadoHttpDeFalloVenta(resultado: any): HttpStatus {
    switch (resultado?.error?.tipo) {
      case 'VALIDATION_ERROR':
      case 'CONFIG_ERROR':
        return HttpStatus.BAD_REQUEST;
      case 'CAJA_CERRADA':
        return HttpStatus.CONFLICT;
      case 'DATABASE_ERROR':
        return HttpStatus.INTERNAL_SERVER_ERROR;
      default:
        // Los rechazos de validación temprana (idempotency_key, items, datos del
        // cliente) devuelven `message` sin `error.tipo`: son culpa del request.
        return resultado?.error ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST;
    }
  }

  @Post('ventas/:ventaId/canjear-ticket')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.ticket.canjear')
  async canjearTicket(
    @Param('ventaId', new ParseUUIDPipe({ version: '4' })) ventaId: string,
    @Body() payload: CanjearTicketPosDto,
    @Req() req: any,
  ) {
    return this.posService.canjearTicket(ventaId, payload, req.user);
  }

  @Post('caja/abrir')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.caja.write') // HARDENING: apertura de caja protegida.
  async abrirCaja(@Body() data: AbrirCajaPosDto, @Req() req: any) {
    if (data?.supervisor_id || data?.razon_autorizacion) {
      throw new ForbiddenException('La autorización de supervisor debe validarse en un flujo dedicado');
    }
    return this.posService.abrirCaja(data as any, req.user);
  }

  @Post('caja/cerrar')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.caja.write') // HARDENING: cierre de caja protegido.
  async cerrarCaja(@Body() data: CerrarCajaPosDto, @Req() req: any) {
    return this.posService.cerrarCaja(data, req.user);
  }

  @Get('detalles-venta/:id')
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
    @Body() data: ConfigurarCertificadoPosDto,
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

  @Get('facturacion/:ventaId')
  @UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard)
  @RequireFeatureFlag('pos')
  @RequirePermission('pos.read') // HARDENING: consultar estado fiscal de una venta POS.
  async obtenerEstadoFacturacionVenta(@Param('ventaId') ventaId: string, @Req() req: any) {
    return this.posService.obtenerEstadoFacturacionVenta(ventaId, req.user);
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
