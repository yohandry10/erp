import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CajasService } from './cajas.service';
import { CreateCajaDto } from './dto/create-caja.dto';
import { UpdateCajaDto } from './dto/update-caja.dto';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

@Controller('cajas')
@UseGuards(JwtAuthGuard, PermissionGuard) // Asegura req.user y tenant_id para @CurrentTenant()
export class CajasController {
  constructor(private readonly service: CajasService) {}

  @Get()
  async listar(@CurrentTenant() tenantId: string) {
    const data = await this.service.listarCajas(tenantId);
    return { success: true, data };
  }

  @Post()
  async crear(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateCajaDto
  ) {
    const data = await this.service.crearCaja(tenantId, dto, user?.id);
    return { success: true, data };
  }

  @Put(':id')
  async actualizar(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCajaDto
  ) {
    const data = await this.service.actualizarCaja(tenantId, id, dto);
    return { success: true, data };
  }

  @Post(':id/apertura')
  async abrir(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AbrirCajaDto
  ) {
    const data = await this.service.abrirCaja(tenantId, id, dto, user?.id);
    return { success: true, data };
  }

  @Post(':id/cierre')
  async cerrar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CerrarCajaDto
  ) {
    const sesionId = dto['sesion_id'] || dto['sesionId'] || null;
    const cajaId = id;
    const data = await this.service.cerrarCaja(tenantId, cajaId, sesionId, dto, user?.id);
    return { success: true, data };
  }

  @Get('sesiones')
  async listarSesiones(
    @CurrentTenant() tenantId: string,
    @Query('estado') estado?: string,
    @Query('cajero_id') cajero_id?: string,
    @Query('fecha_desde') fecha_desde?: string,
    @Query('fecha_hasta') fecha_hasta?: string,
  ) {
    const data = await this.service.listarSesiones(tenantId, { estado, cajero_id, fecha_desde, fecha_hasta });
    return { success: true, data };
  }
}
