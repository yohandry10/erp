import {
  Body,
  Controller,
  Get,
  Headers,
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
import { CxpService } from './cxp.service';
import { CrearCxpDto, FiltrarCxpDto, ActualizarCxpDto, AplicarPagoCxpDto, AnularCxpDto, VencimientosCxpDto } from './dto';

@ApiTags('Finanzas - Cuentas por Pagar')
@ApiBearerAuth()
@Controller('finanzas/cxp')
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: CxP exige permisos granulares.
export class CxpController {
  constructor(private readonly cxpService: CxpService) {}

  @Get()
  @RequirePermission('finanzas.cxp.ver')
  @ApiOperation({
    summary: 'Listar cuentas por pagar',
    description: 'Obtiene la lista de cuentas por pagar con filtros opcionales',
  })
  @ApiResponse({ status: 200, description: 'Lista de cuentas por pagar obtenida exitosamente' })
  @ApiResponse({ status: 400, description: 'Error al obtener las cuentas por pagar' })
  async listarCuentasPorPagar(
    @CurrentTenant() tenantId: string,
    @Query() filtros: FiltrarCxpDto,
  ) {
    return this.cxpService.listarCuentasPorPagar(tenantId, filtros);
  }

  @Get('aging')
  @RequirePermission('finanzas.cxp.ver')
  @ApiOperation({
    summary: 'Reporte de aging de cuentas por pagar',
    description: 'Genera un reporte de antigüedad de cuentas por pagar, categorizando las deudas por rangos de días vencidos: 0-30, 31-60, 61-90, >90 días. Incluye totales por rango y por proveedor.',
  })
  @ApiResponse({ status: 200, description: 'Reporte de aging generado exitosamente' })
  @ApiResponse({ status: 400, description: 'Error al generar el reporte' })
  async obtenerAgingCxp(
    @CurrentTenant() tenantId: string,
    @Query('proveedor_id') proveedorId?: string,
  ) {
    return this.cxpService.obtenerAgingCxp(tenantId, proveedorId);
  }

  @Get('vencimientos')
  @RequirePermission('finanzas.cxp.ver')
  @ApiOperation({
    summary: 'Obtener próximos vencimientos de cuentas por pagar',
    description: 'Obtiene las cuentas por pagar que vencen en los próximos N días (por defecto 30 días). Incluye resumen por moneda y detalle de cada vencimiento con días restantes.',
  })
  @ApiResponse({ status: 200, description: 'Próximos vencimientos obtenidos exitosamente' })
  @ApiResponse({ status: 400, description: 'Error al obtener los vencimientos' })
  async obtenerProximosVencimientos(
    @CurrentTenant() tenantId: string,
    @Query() filtros: VencimientosCxpDto,
  ) {
    return this.cxpService.obtenerProximosVencimientos(tenantId, filtros);
  }

  @Get('proveedores-mayor-deuda')
  @RequirePermission('finanzas.cxp.ver')
  @ApiOperation({
    summary: 'Obtener proveedores con mayor deuda',
    description: 'Genera un ranking de proveedores ordenados por el monto total de deuda pendiente. Incluye deuda total, cantidad de CxP y desglose por moneda. Útil para identificar proveedores prioritarios para pagos.',
  })
  @ApiResponse({ status: 200, description: 'Reporte de proveedores con mayor deuda generado exitosamente' })
  @ApiResponse({ status: 400, description: 'Error al generar el reporte' })
  async obtenerProveedoresMayorDeuda(
    @CurrentTenant() tenantId: string,
    @Query('limite') limite?: number,
  ) {
    return this.cxpService.obtenerProveedoresMayorDeuda(tenantId, limite);
  }

  @Get('detracciones/tasas')
  @RequirePermission('finanzas.cxp.ver')
  @ApiOperation({
    summary: 'Catálogo de tasas de detracción vigentes',
    description:
      'Códigos del SPOT con su anexo, tasa e importe mínimo, vigentes a la fecha indicada ' +
      '(por defecto, la de hoy en el calendario del contribuyente). Lo consume el registro ' +
      'de la factura del proveedor: el código no se sabe de memoria y equivocarlo cuesta la ' +
      'multa por no depositar más la pérdida del crédito fiscal.',
  })
  @ApiResponse({ status: 200, description: 'Catálogo obtenido' })
  async listarTasasDetraccion(
    @CurrentTenant() tenantId: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.cxpService.listarTasasDetraccion(tenantId, fecha);
  }

  @Get(':id')
  @RequirePermission('finanzas.cxp.ver')
  @ApiOperation({
    summary: 'Obtener cuenta por pagar por ID',
    description: 'Obtiene el detalle completo de una cuenta por pagar específica',
  })
  @ApiResponse({ status: 200, description: 'Cuenta por pagar obtenida exitosamente' })
  @ApiResponse({ status: 404, description: 'Cuenta por pagar no encontrada' })
  async obtenerCuentaPorPagar(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.cxpService.obtenerCuentaPorPagar(tenantId, id);
  }

  @Post()
  @RequirePermission('finanzas.cxp.gestionar')
  @ApiOperation({
    summary: 'Crear cuenta por pagar manual',
    description: 'Crea una cuenta por pagar de forma manual (no desde recepción)',
  })
  @ApiResponse({ status: 201, description: 'Cuenta por pagar creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o cuenta duplicada' })
  async crearCuentaPorPagar(
    @Body() crearCxpDto: CrearCxpDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.cxpService.crearCuentaPorPagar(tenantId, crearCxpDto, user?.id);
  }

  @Put(':id')
  @RequirePermission('finanzas.cxp.gestionar')
  @ApiOperation({
    summary: 'Actualizar cuenta por pagar',
    description: 'Actualiza los datos de una cuenta por pagar existente. No se puede modificar si está pagada o anulada.',
  })
  @ApiResponse({ status: 200, description: 'Cuenta por pagar actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o cuenta no modificable' })
  @ApiResponse({ status: 404, description: 'Cuenta por pagar no encontrada' })
  async actualizarCuentaPorPagar(
    @Param('id') id: string,
    @Body() actualizarCxpDto: ActualizarCxpDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cxpService.actualizarCuentaPorPagar(tenantId, id, actualizarCxpDto, user?.id, idempotencyKey);
  }

  @Post(':id/aplicar-pago')
  @RequirePermission('finanzas.cxp.gestionar')
  @ApiOperation({
    summary: 'Aplicar pago a cuenta por pagar',
    description: 'Registra un pago aplicado a una cuenta por pagar, actualizando su saldo y estado. Si el saldo llega a 0, la cuenta se marca como PAGADA.',
  })
  @ApiResponse({ status: 200, description: 'Pago aplicado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos, monto excede saldo o cuenta no permite pagos' })
  @ApiResponse({ status: 404, description: 'Cuenta por pagar no encontrada' })
  async aplicarPago(
    @Param('id') id: string,
    @Body() aplicarPagoDto: AplicarPagoCxpDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.cxpService.aplicarPago(tenantId, id, aplicarPagoDto, user?.id);
  }

  @Post(':id/anular')
  @RequirePermission('finanzas.cxp.gestionar')
  @ApiOperation({
    summary: 'Anular cuenta por pagar',
    description: 'Anula una cuenta por pagar. Solo se pueden anular cuentas que no tengan pagos aplicados (saldo = total). Una vez anulada, no se puede modificar ni aplicar pagos.',
  })
  @ApiResponse({ status: 200, description: 'Cuenta por pagar anulada exitosamente' })
  @ApiResponse({ status: 400, description: 'La cuenta ya está anulada o tiene pagos aplicados' })
  @ApiResponse({ status: 404, description: 'Cuenta por pagar no encontrada' })
  async anularCuentaPorPagar(
    @Param('id') id: string,
    @Body() anularCxpDto: AnularCxpDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cxpService.anularCuentaPorPagar(tenantId, id, anularCxpDto, user?.id, idempotencyKey);
  }

  @Get(':id/pagos')
  @RequirePermission('finanzas.cxp.ver')
  @ApiOperation({
    summary: 'Obtener historial de pagos de una cuenta por pagar',
    description: 'Obtiene el historial completo de pagos aplicados a una cuenta por pagar específica, ordenados por fecha descendente.',
  })
  @ApiResponse({ status: 200, description: 'Historial de pagos obtenido exitosamente' })
  @ApiResponse({ status: 404, description: 'Cuenta por pagar no encontrada' })
  async obtenerHistorialPagos(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.cxpService.obtenerHistorialPagos(tenantId, id);
  }
}
