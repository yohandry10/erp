import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { BancosService } from './bancos.service';
import { CrearCuentaBancariaDto, ActualizarCuentaBancariaDto, ListarMovimientosQueryDto, CrearMovimientoBancarioDto } from './dto';

@ApiTags('Finanzas - Bancos')
@ApiBearerAuth()
@Controller('finanzas/bancos')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: bancos requiere permisos granulares.
export class BancosController {
  constructor(private readonly bancosService: BancosService) {}

  @Get('cuentas')
  @RequirePermission('finanzas.bancos.ver')
  @ApiOperation({
    summary: 'Obtener cuentas bancarias',
    description: 'Obtiene todas las cuentas bancarias del tenant ordenadas por fecha de creación (más recientes primero).',
  })
  @ApiResponse({ status: 200, description: 'Lista de cuentas bancarias obtenida exitosamente' })
  @ApiResponse({ status: 400, description: 'Error al obtener las cuentas bancarias' })
  async obtenerCuentasBancarias(
    @CurrentTenant() tenantId: string,
  ) {
    return this.bancosService.obtenerCuentasBancarias(tenantId);
  }

  @Get('cuentas/:id')
  @RequirePermission('finanzas.bancos.ver')
  @ApiOperation({
    summary: 'Obtener cuenta bancaria por ID',
    description: 'Obtiene los detalles de una cuenta bancaria específica por su ID.',
  })
  @ApiResponse({ status: 200, description: 'Cuenta bancaria obtenida exitosamente' })
  @ApiResponse({ status: 404, description: 'Cuenta bancaria no encontrada' })
  @ApiResponse({ status: 400, description: 'Error al obtener la cuenta bancaria' })
  async obtenerCuentaBancariaPorId(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.bancosService.obtenerCuentaBancariaPorId(tenantId, id);
  }

  @Post('cuentas')
  @RequirePermission('finanzas.bancos.gestionar')
  @ApiOperation({
    summary: 'Crear cuenta bancaria',
    description: 'Crea una nueva cuenta bancaria para la empresa. Valida que no exista otra cuenta con el mismo número.',
  })
  @ApiResponse({ status: 201, description: 'Cuenta bancaria creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o cuenta duplicada' })
  async crearCuentaBancaria(
    @Body() crearCuentaDto: CrearCuentaBancariaDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.bancosService.crearCuentaBancaria(tenantId, crearCuentaDto, user?.id);
  }

  @Put('cuentas/:id')
  @RequirePermission('finanzas.bancos.gestionar')
  @ApiOperation({
    summary: 'Actualizar cuenta bancaria',
    description: 'Actualiza los datos de una cuenta bancaria existente. No permite modificar el saldo directamente (se actualiza mediante movimientos). Valida que no exista otra cuenta con el mismo número si se cambia.',
  })
  @ApiResponse({ status: 200, description: 'Cuenta bancaria actualizada exitosamente' })
  @ApiResponse({ status: 404, description: 'Cuenta bancaria no encontrada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o cuenta duplicada' })
  async actualizarCuentaBancaria(
    @Param('id') id: string,
    @Body() actualizarCuentaDto: ActualizarCuentaBancariaDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.bancosService.actualizarCuentaBancaria(tenantId, id, actualizarCuentaDto, user?.id);
  }

  @Get('cuentas/:id/movimientos')
  @RequirePermission('finanzas.bancos.ver')
  @ApiOperation({
    summary: 'Obtener movimientos bancarios de una cuenta',
    description: 'Obtiene todos los movimientos bancarios (abonos y cargos) de una cuenta bancaria específica. Soporta filtros por fecha, tipo de movimiento y estado de conciliación. Los resultados están paginados y ordenados por fecha descendente.',
  })
  @ApiResponse({ status: 200, description: 'Movimientos bancarios obtenidos exitosamente' })
  @ApiResponse({ status: 404, description: 'Cuenta bancaria no encontrada' })
  @ApiResponse({ status: 400, description: 'Error al obtener los movimientos bancarios' })
  async obtenerMovimientosBancarios(
    @Param('id') id: string,
    @Query() query: ListarMovimientosQueryDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.bancosService.obtenerMovimientosBancarios(tenantId, id, query);
  }

  @Post('movimientos')
  @RequirePermission('finanzas.bancos.gestionar')
  @ApiOperation({
    summary: 'Crear movimiento bancario manual',
    description: 'Crea un movimiento bancario manual (ABONO o CARGO) y actualiza automáticamente el saldo de la cuenta bancaria. Los movimientos manuales no están vinculados a CxP y son útiles para registrar operaciones directas como depósitos, retiros, transferencias, etc. Valida que la cuenta tenga saldo suficiente si es un CARGO y no permite sobregiro.',
  })
  @ApiResponse({ status: 201, description: 'Movimiento bancario creado exitosamente' })
  @ApiResponse({ status: 404, description: 'Cuenta bancaria no encontrada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o saldo insuficiente' })
  async crearMovimientoBancario(
    @Body() crearMovimientoDto: CrearMovimientoBancarioDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.bancosService.crearMovimientoBancario(tenantId, crearMovimientoDto, user?.id);
  }

  @Get('saldos')
  @RequirePermission('finanzas.bancos.ver')
  @ApiOperation({
    summary: 'Obtener saldos consolidados',
    description: 'Obtiene un resumen consolidado de los saldos de todas las cuentas bancarias del tenant. Agrupa los saldos por moneda y proporciona el detalle de cada cuenta. Incluye totales de cuentas activas e inactivas.',
  })
  @ApiResponse({ status: 200, description: 'Saldos consolidados obtenidos exitosamente' })
  @ApiResponse({ status: 400, description: 'Error al obtener los saldos consolidados' })
  async obtenerSaldosConsolidados(
    @CurrentTenant() tenantId: string,
  ) {
    return this.bancosService.obtenerSaldosConsolidados(tenantId);
  }

  @Get('cuentas/:id/movimientos/exportar')
  @RequirePermission('finanzas.bancos.ver')
  @ApiOperation({
    summary: 'Exportar movimientos bancarios a CSV',
    description: 'Exporta los movimientos bancarios de una cuenta a formato CSV. Soporta los mismos filtros que el listado de movimientos.',
  })
  @ApiResponse({ status: 200, description: 'CSV generado exitosamente' })
  @ApiResponse({ status: 404, description: 'Cuenta bancaria no encontrada' })
  @ApiResponse({ status: 400, description: 'Error al exportar los movimientos' })
  async exportarMovimientosBancarios(
    @Param('id') id: string,
    @Query() query: ListarMovimientosQueryDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.bancosService.exportarMovimientosBancarios(tenantId, id, query);
  }

  @Get('movimientos/periodo')
  @RequirePermission('finanzas.bancos.ver')
  @ApiOperation({
    summary: 'Obtener movimientos bancarios por período',
    description: 'Obtiene todos los movimientos bancarios de todas las cuentas del tenant para un período específico. Útil para reportes consolidados y análisis de flujo de caja. Soporta filtros por fecha, tipo de movimiento, cuenta bancaria y estado de conciliación.',
  })
  @ApiResponse({ status: 200, description: 'Movimientos bancarios por período obtenidos exitosamente' })
  @ApiResponse({ status: 400, description: 'Error al obtener los movimientos bancarios' })
  async obtenerMovimientosPorPeriodo(
    @Query() query: ListarMovimientosQueryDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.bancosService.obtenerMovimientosPorPeriodo(tenantId, query);
  }
}
