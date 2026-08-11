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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { RmaService } from './rma.service';
import {
  AplicarSaldoFavorDto,
  AprobarRmaDto,
  CrearRmaDto,
  GenerarNotaCreditoDto,
  RecepcionarRmaDto,
  ReembolsarSaldoFavorDto,
  RevertirReembolsoSaldoFavorDto,
  RevertirRecepcionRmaDto,
} from './dto';

@ApiTags('Ventas - RMA')
@ApiBearerAuth()
@Controller('ventas/rma')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: RMA requiere permisos específicos.
export class RmaController {
  constructor(private readonly rmaService: RmaService) {}

  @Get()
  @RequirePermission('ventas.rma.ver')
  @ApiOperation({ summary: 'Listar solicitudes RMA' })
  async listar(@CurrentTenant() tenantId: string, @Query('estado') estado?: string) {
    return this.rmaService.listar(tenantId, estado);
  }

  @Get('saldos-favor')
  @RequirePermission('ventas.rma.ver')
  @ApiOperation({ summary: 'Listar saldos a favor originados por RMA' })
  async listarSaldosFavor(
    @CurrentTenant() tenantId: string,
    @Query('cliente_id') clienteId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.rmaService.listarSaldosFavor(tenantId, clienteId, estado);
  }

  @Get('candidatos')
  @RequirePermission('ventas.rma.crear')
  @ApiOperation({ summary: 'Listar pedidos, líneas y documentos elegibles para crear RMA' })
  async listarCandidatos(@CurrentTenant() tenantId: string) {
    return this.rmaService.listarCandidatos(tenantId);
  }

  @Get('recursos-recepcion')
  @RequirePermission('ventas.rma.recepcionar')
  @ApiOperation({ summary: 'Listar almacenes, ubicaciones y regla de calidad para recibir RMA' })
  async listarRecursosRecepcion(@CurrentTenant() tenantId: string) {
    return this.rmaService.listarRecursosRecepcion(tenantId);
  }

  @Get('medios-reembolso')
  @RequirePermission('ventas.rma.reembolsar')
  @ApiOperation({ summary: 'Listar bancos y sesiones propias habilitadas para reembolsos' })
  async listarMediosReembolso(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.rmaService.listarMediosReembolso(tenantId, userId);
  }

  @Get('saldos-favor/:id/cxc-aplicables')
  @RequirePermission('ventas.rma.generar_nota_credito')
  @ApiOperation({ summary: 'Listar CxC futuras compatibles con un saldo a favor' })
  async listarCxcAplicables(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.rmaService.listarCxcAplicables(tenantId, id);
  }

  @Get('saldos-favor/:id')
  @RequirePermission('ventas.rma.ver')
  @ApiOperation({ summary: 'Obtener un saldo a favor y sus movimientos' })
  async obtenerSaldoFavor(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.rmaService.obtenerSaldoFavor(tenantId, id);
  }

  @Get(':id')
  @RequirePermission('ventas.rma.ver')
  @ApiOperation({ summary: 'Obtener detalle de una RMA' })
  async obtener(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.rmaService.obtenerPorId(tenantId, id);
  }

  @Post()
  @RequirePermission('ventas.rma.crear')
  @ApiOperation({ summary: 'Crear una solicitud de RMA' })
  async crear(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CrearRmaDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmaService.crear(tenantId, userId, dto, idempotencyKey);
  }

  @Post(':id/aprobar')
  @RequirePermission('ventas.rma.aprobar')
  @ApiOperation({ summary: 'Aprobar o rechazar una RMA' })
  async aprobar(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AprobarRmaDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmaService.aprobar(tenantId, userId, id, dto, idempotencyKey);
  }

  @Post(':id/recepcionar')
  @RequirePermission('ventas.rma.recepcionar')
  @ApiOperation({ summary: 'Registrar la recepción física de una RMA' })
  async recepcionar(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RecepcionarRmaDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmaService.recepcionar(tenantId, userId, id, dto, idempotencyKey);
  }

  @Post(':id/revertir-recepcion')
  @RequirePermission('ventas.rma.recepcionar')
  @ApiOperation({ summary: 'Revertir íntegramente la recepción antes de emitir la NC' })
  async revertirRecepcion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RevertirRecepcionRmaDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmaService.revertirRecepcion(tenantId, userId, id, dto, idempotencyKey);
  }

  @Post(':id/nota-credito')
  @RequirePermission('ventas.rma.generar_nota_credito')
  @ApiOperation({ summary: 'Generar nota de crédito para una RMA' })
  async generarNotaCredito(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: GenerarNotaCreditoDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmaService.generarNotaCredito(tenantId, userId, id, dto, idempotencyKey);
  }

  @Post('saldos-favor/:id/aplicar')
  @RequirePermission('ventas.rma.generar_nota_credito')
  @ApiOperation({ summary: 'Aplicar saldo a favor a una CxC futura del mismo cliente' })
  async aplicarSaldoFavor(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AplicarSaldoFavorDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmaService.aplicarSaldoFavor(tenantId, userId, id, dto, idempotencyKey);
  }

  @Post('saldos-favor/:id/reembolsar')
  @RequirePermission('ventas.rma.reembolsar')
  @ApiOperation({ summary: 'Reembolsar saldo a favor por caja o banco explícito' })
  async reembolsarSaldoFavor(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReembolsarSaldoFavorDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmaService.reembolsarSaldoFavor(tenantId, userId, id, dto, idempotencyKey);
  }

  @Post('saldos-favor/:id/reembolsos/:movimientoId/revertir')
  @RequirePermission('ventas.rma.revertir_reembolso')
  @ApiOperation({ summary: 'Revertir un reembolso y reponer el saldo a favor' })
  async revertirReembolsoSaldoFavor(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('movimientoId') movimientoId: string,
    @Body() dto: RevertirReembolsoSaldoFavorDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rmaService.revertirReembolsoSaldoFavor(
      tenantId,
      userId,
      id,
      movimientoId,
      dto,
      idempotencyKey,
    );
  }
}
