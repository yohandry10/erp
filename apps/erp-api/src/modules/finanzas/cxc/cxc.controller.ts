import {
  Body,
  Controller,
  Get,
  Headers,
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
import { RegistrarPagoCxcDto, AplicarNotaCreditoDto, ReprogramarCxcDto } from './dto';

@ApiTags('Finanzas - Cuentas por Cobrar')
@ApiBearerAuth()
@Controller('finanzas/cxc')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: CxC exige permisos granulares.
export class CxcController {
  constructor(private readonly cxcService: CxcService) {}

  @Get()
  @RequirePermission('finanzas.cxc.read')
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
    @Query('desde') desde?: string, // HARDENING: habilitar filtro desde para evitar exposiciones de tenant cruzado.
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
      desde,
      hasta,
    });
  }

  @Get(':id')
  @RequirePermission('finanzas.cxc.read')
  @ApiOperation({
    summary: 'Detalle de cuenta por cobrar',
    description: 'Obtiene el detalle completo de una cuenta por cobrar, incluyendo pagos registrados',
  })
  @ApiResponse({ status: 200, description: 'Detalle obtenido exitosamente' })
  async obtenerDetalle(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.cxcService.obtenerCuentaPorCobrar(tenantId, id);
  }

  @Post(':id/pagos')
  @RequirePermission('cpe.comprobantes.emitir')
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

  @Post(':id/notas-credito')
  @RequirePermission('finanzas.cxc.cobros.write')
  @ApiOperation({
    summary: 'Crear nota de crédito fiscal referenciada desde una CxC',
    description: 'Delega al writer canónico 472: crea documento/CPE, reduce CxC, genera saldo a favor y outbox en un commit',
  })
  @ApiResponse({ status: 200, description: 'Nota de crédito aplicada correctamente' })
  async aplicarNotaCredito(
    @Param('id') id: string,
    @Body() aplicarNotaCreditoDto: AplicarNotaCreditoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.cxcService.aplicarNotaCredito(tenantId, id, aplicarNotaCreditoDto, user?.id);
  }

  @Post(':id/reprogramar')
  @RequirePermission('finanzas.cxc.cobros.write')
  @ApiOperation({
    summary: 'Reprogramar vencimiento de una CxC',
    description: 'Actualiza la fecha de vencimiento de la cuenta por cobrar manteniendo trazabilidad en auditoría',
  })
  @ApiResponse({ status: 200, description: 'Reprogramación registrada correctamente' })
  async reprogramarCuenta(
    @Param('id') id: string,
    @Body() reprogramarDto: ReprogramarCxcDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cxcService.reprogramarCuentaPorCobrar(tenantId, id, reprogramarDto, user?.id, idempotencyKey);
  }
}
