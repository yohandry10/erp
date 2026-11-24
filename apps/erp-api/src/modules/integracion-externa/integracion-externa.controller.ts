import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IntegracionExternaService } from './integracion-externa.service';
import {
  CrearIntegracionExternaDto,
  RevocarIntegracionExternaDto,
  RotarIntegracionExternaDto,
  VencimientoIntegracionExternaDto,
} from './dto/integracion-externa.dto';

/**
 * Administración de credenciales de integración externa. La administra quien
 * administra usuarios de la empresa. Ninguna de estas rutas acepta la propia
 * credencial: no lleva `@PermiteIntegracionExterna`.
 */
@Controller('integraciones-externas')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IntegracionExternaController {
  constructor(private readonly service: IntegracionExternaService) {}

  @Get()
  @RequirePermission('users.manage')
  async listar(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.service.listar(tenantId) };
  }

  @Get(':id/eventos')
  @RequirePermission('users.manage')
  async eventos(
    @CurrentTenant() tenantId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('limite') limite?: string,
  ) {
    return { success: true, data: await this.service.eventos(tenantId, id, Number(limite) || 100) };
  }

  @Post()
  @RequirePermission('users.manage')
  @Header('Cache-Control', 'no-store')
  async crear(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: CrearIntegracionExternaDto,
  ) {
    return { success: true, data: await this.service.crear(tenantId, actorId, dto) };
  }

  @Post(':id/rotar')
  @RequirePermission('users.manage')
  @Header('Cache-Control', 'no-store')
  async rotar(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RotarIntegracionExternaDto,
  ) {
    return { success: true, data: await this.service.rotar(tenantId, actorId, id, dto) };
  }

  @Post(':id/finalizar-rotacion')
  @RequirePermission('users.manage')
  async finalizarRotacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return { success: true, data: await this.service.finalizarRotacion(tenantId, actorId, id) };
  }

  @Put(':id/vencimiento')
  @RequirePermission('users.manage')
  async vencimiento(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: VencimientoIntegracionExternaDto,
  ) {
    return { success: true, data: await this.service.actualizarVencimiento(tenantId, actorId, id, dto) };
  }

  @Post(':id/revocar')
  @RequirePermission('users.manage')
  async revocar(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RevocarIntegracionExternaDto,
  ) {
    return { success: true, data: await this.service.revocar(tenantId, actorId, id, dto) };
  }
}
