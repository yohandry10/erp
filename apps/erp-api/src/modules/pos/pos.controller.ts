import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PosService } from './pos.service';

@Controller('pos')
@UseGuards(JwtAuthGuard)
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('productos')
  async getProductos(@Req() req: any) {
    return this.posService.getProductos(req.user);
  }

  @Get('clientes')
  async getClientes(@Req() req: any) {
    return this.posService.getClientes(req.user);
  }

  @Get('metodos-pago')
  async getMetodosPago(@Req() req: any) {
    return this.posService.getMetodosPago(req.user);
  }

  @Get('empresa-config')
  async getEmpresaConfig(@Req() req: any) {
    return this.posService.getEmpresaConfig(req.user);
  }

  @Get('sesion-caja')
  async getSesionCaja(@Req() req: any) {
    return this.posService.getSesionCajaActual(req.user);
  }

  @Get('ventas-recientes')
  async getVentasRecientes(@Req() req: any) {
    return this.posService.getVentasRecientes(req.user);
  }

  @Post('venta')
  async procesarVenta(@Body() ventaData: any, @Req() req: any) {
    return this.posService.procesarVenta(ventaData, req.user);
  }

  @Post('caja/abrir')
  async abrirCaja(@Body() data: { monto_inicial: number }, @Req() req: any) {
    return this.posService.abrirCaja(data.monto_inicial, req.user);
  }

  @Post('caja/cerrar')
  async cerrarCaja(@Body() data: { monto_contado: number; notas: string }, @Req() req: any) {
    return this.posService.cerrarCaja(data.monto_contado, data.notas, req.user);
  }

  @Post('detalles-venta/:id')
  async getDetallesVenta(@Body() data: { venta_id: string }, @Req() req: any) {
    return this.posService.getDetallesVenta(data.venta_id, req.user);
  }

  @Post('configurar-certificado')
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
  async getConfigurationStatus(@Req() req: any) {
    return this.posService.getConfigurationStatus(req.user);
  }
}
