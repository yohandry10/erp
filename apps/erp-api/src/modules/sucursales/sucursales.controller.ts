import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SucursalesService } from './sucursales.service';
import {
  AsignarSucursalesDto,
  CreateSucursalDto,
  UpdateSucursalDto,
} from './dto/sucursales.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller('sucursales')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SucursalesController {
  constructor(private readonly service: SucursalesService) {}

  @Get()
  @RequirePermission('configuracion.sucursales.read')
  async listar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('incluir_inactivas') incluirInactivas?: string,
  ) {
    const data = await this.service.listar(
      tenantId,
      user?.id,
      String(incluirInactivas ?? '').toLowerCase() === 'true',
    );
    return { success: true, data };
  }

  /**
   * Se declara antes que `:id` porque en Nest gana la primera ruta que casa, y
   * `:id` con ParseUUIDPipe rechazaria «resumen» con un 400 en vez de llegar aqui.
   */
  @Get('resumen')
  @RequirePermission('configuracion.sucursales.read')
  async resumen(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const data = await this.service.resumen(tenantId, user?.id, desde, hasta);
    return { success: true, data };
  }

  @Get(':id')
  @RequirePermission('configuracion.sucursales.read')
  async obtener(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.obtenerPorId(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermission('configuracion.sucursales.create')
  async crear(@CurrentTenant() tenantId: string, @Body() dto: CreateSucursalDto) {
    const data = await this.service.crear(tenantId, dto);
    return { success: true, data };
  }

  @Put(':id')
  @RequirePermission('configuracion.sucursales.update')
  async actualizar(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSucursalDto,
  ) {
    const data = await this.service.actualizar(tenantId, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermission('configuracion.sucursales.delete')
  async desactivar(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.desactivar(tenantId, id);
    return { success: true, data };
  }

  @Get('usuarios/:usuarioId')
  @RequirePermission('configuracion.sucursales.assign')
  async sucursalesDeUsuario(
    @CurrentTenant() tenantId: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
  ) {
    const data = await this.service.sucursalesDeUsuario(tenantId, usuarioId);
    return { success: true, data };
  }

  @Put('usuarios/:usuarioId')
  @RequirePermission('configuracion.sucursales.assign')
  async asignarUsuario(
    @CurrentTenant() tenantId: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: AsignarSucursalesDto,
  ) {
    const data = await this.service.asignarUsuario(tenantId, usuarioId, dto);
    return { success: true, data };
  }
}
