import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { CxcService } from './cxc.service';
import { RegistrarPagoCxcDto } from './dto';

@ApiTags('Finanzas - Cuentas por Cobrar')
@ApiBearerAuth()
@Controller('api/finanzas/cxc')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: CxC exige permisos granulares.
export class CxcController {
  constructor(private readonly cxcService: CxcService) {}

  @Get()
  @RequirePermission('finanzas.cxc.ver')
  @ApiOperation({
    summary: 'Listar cuentas por cobrar',
    description: 'Obtiene la bandeja de cuentas por cobrar con filtros opcionales',
  })
  @ApiResponse({ status: 200, description: 'Listado obtenido exitosamente' })
  async listarCuentas(
    @CurrentTenant() tenantId: string,
    @Query('estado') estado?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'VENCIDO',
    @Query('cliente_id') clienteId?: string,
    @Query('search') search?: string,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('vencidas') vencidasParam?: string,
    @Query('hasta') hasta?: string,
  ) {
    const page = pageParam ? parseInt(pageParam, 10) : undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const vencidas =
      vencidasParam != null ? ['true', '1', 'yes', 'on'].includes(vencidasParam.toLowerCase()) : undefined;

    return this.cxcService.listarCuentasPorCobrar(tenantId, {
      estado,
      cliente_id: clienteId,
      search,
      page,
      limit,
      vencidas,
      hasta,
    });
  }

  @Get(':id')
  @RequirePermission('finanzas.cxc.ver')
  @ApiOperation({
    summary: 'Detalle de cuenta por cobrar',
    description: 'Obtiene el detalle completo de una cuenta por cobrar, incluyendo pagos registrados',
  })
  @ApiResponse({ status: 200, description: 'Detalle obtenido exitosamente' })
  async obtenerDetalle(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.cxcService.obtenerCuentaPorCobrar(tenantId, id);
  }

  @Post(':id/pagos')
  @RequirePermission('finanzas.cxc.gestionar')
  @ApiOperation({
    summary: 'Registrar pago/anticipo',
    description:
      'Registra un pago parcial o total, anticipos y movimientos relacionados (percepciones/detracciones) sobre la cuenta por cobrar',
  })
  @ApiResponse({ status: 200, description: 'Pago registrado correctamente' })
  async registrarPago(
    @Param('id') id: string,
    @Body() registrarPagoDto: RegistrarPagoCxcDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.cxcService.registrarPago(tenantId, id, registrarPagoDto, user?.id);
  }
}
