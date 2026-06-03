import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards, BadRequestException, Res } from '@nestjs/common';
import { Response } from 'express';
import { CajasService } from './cajas.service';
import { CreateCajaDto } from './dto/create-caja.dto';
import { UpdateCajaDto } from './dto/update-caja.dto';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Denominaciones } from './services/cash-reconciliation.service';


@Controller('cajas')
@UseGuards(JwtAuthGuard, PermissionGuard) // Asegura req.user y tenant_id para @CurrentTenant()
export class CajasController {
  constructor(private readonly service: CajasService) { }

  @Get()
  @RequirePermission('cajas.ver')
  async listar(@CurrentTenant() tenantId: string) {
    const data = await this.service.listarCajas(tenantId);
    return { success: true, data };
  }

  @Post()
  @RequirePermission('cajas.crear')
  async crear(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateCajaDto
  ) {
    const data = await this.service.crearCaja(tenantId, dto, user?.id);
    return { success: true, data };
  }

  @Put(':id')
  @RequirePermission('cajas.editar')
  async actualizar(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCajaDto
  ) {
    const data = await this.service.actualizarCaja(tenantId, id, dto);
    return { success: true, data };
  }

  @Post(':id/apertura')
  @RequirePermission('cajas.apertura')
  async abrir(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AbrirCajaDto,
    @Req() req: any,
  ) {
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || null;
    const data = await this.service.abrirCaja(tenantId, id, dto, user?.id, ipAddress);
    return { success: true, data };
  }

  @Post(':id/cierre')
  @RequirePermission('cajas.cierre')
  async cerrar(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CerrarCajaDto
  ) {
    // Normalizar alias provenientes del frontend/POS
    const sesionId = dto.sesion_id || dto.sesionId || null;
    const cajaId = id;
    dto.monto_cierre = dto.monto_cierre ?? dto.monto_contado;

    const data = await this.service.cerrarCaja(tenantId, cajaId, sesionId, dto, user?.id);
    return { success: true, data };
  }

  @Get('sesiones')
  @RequirePermission('cajas.sesiones.ver')
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

  @Get('cortes')
  @RequirePermission('cajas.cortes.ver')
  async listarCortes(
    @CurrentTenant() tenantId: string,
    @Query('fecha_desde') fecha_desde?: string,
    @Query('fecha_hasta') fecha_hasta?: string,
    @Query('caja_id') caja_id?: string,
  ) {
    const data = await this.service.listarCortes(tenantId, { fecha_desde, fecha_hasta, caja_id });
    return { success: true, data };
  }

  @Get('cortes/:corteId')
  @RequirePermission('cajas.cortes.ver')
  async obtenerCorte(
    @CurrentTenant() tenantId: string,
    @Param('corteId') corteId: string,
  ) {
    const data = await this.service.obtenerCorte(tenantId, corteId);
    return { success: true, data };
  }

  @Get('cortes/:corteId/pdf')
  @RequirePermission('cajas.cortes.exportar_pdf')
  async descargarCortePdf(
    @CurrentTenant() tenantId: string,
    @Param('corteId') corteId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportarCortePdf(tenantId, corteId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="corte-${corteId}.pdf"`);
    res.send(buffer);
  }

  @Get('cortes/:corteId/csv')
  @RequirePermission('cajas.cortes.exportar_csv')
  async descargarCorteCsv(
    @CurrentTenant() tenantId: string,
    @Param('corteId') corteId: string,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportarCorteCsv(tenantId, corteId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="corte-${corteId}.csv"`);
    res.send(csv);
  }

  @Get('validar-precierre/:sesionId')
  @RequirePermission('cajas.precierre.ver')
  async validarPrecierre(
    @CurrentTenant() tenantId: string,
    @Param('sesionId') sesionId: string,
  ) {
    const data = await this.service.validarPrecierre(tenantId, sesionId);
    return { success: true, data };
  }

  @Get('saldo-esperado/:sesionId')
  @RequirePermission('cajas.saldo_esperado.ver')
  async obtenerSaldoEsperado(
    @CurrentTenant() tenantId: string,
    @Param('sesionId') sesionId: string,
  ) {
    const data = await this.service.obtenerSaldoEsperado(tenantId, sesionId);
    return { success: true, data };
  }

  @Post('cerrar/:sesionId')
  @RequirePermission('cajas.cierre_administrativo')
  async cerrarCajaAvanzado(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('sesionId') sesionId: string,
    @Body() dto: {
      monto_contado: number;
      denominaciones: Denominaciones;
      notas?: string;
      supervisor_id?: string;
      codigo_autorizacion?: string;
    },
  ) {
    const data = await this.service.cerrarCajaAvanzado(
      tenantId,
      sesionId,
      {
        monto_contado: dto.monto_contado,
        denominaciones: dto.denominaciones,
        notas: dto.notas,
      },
      user?.id,
      dto.supervisor_id,
      dto.codigo_autorizacion,
    );
    return { success: true, data };
  }

  @Post('retiros/:sesionId')
  @RequirePermission('cajas.retiros.crear')
  async solicitarRetiro(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('sesionId') sesionId: string,
    @Body() dto: {
      monto: number;
      motivo: string;
      motivo_detalle?: string;
      banco_destino?: string;
      numero_operacion?: string;
      foto_comprobante?: string;
      supervisor_id?: string;
      codigo_autorizacion?: string;
    },
  ) {
    const data = await this.service.solicitarRetiro(
      tenantId,
      sesionId,
      dto.monto,
      dto.motivo as any,
      user?.id,
      {
        motivo_detalle: dto.motivo_detalle,
        banco_destino: dto.banco_destino,
        numero_operacion: dto.numero_operacion,
        foto_comprobante: dto.foto_comprobante,
      },
      dto.supervisor_id,
      dto.codigo_autorizacion,
    );
    return { success: true, data };
  }

  @Post('retiros/:retiroId/conciliar')
  @RequirePermission('cajas.retiros.conciliar')
  async conciliarRetiro(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('retiroId') retiroId: string,
    @Body() dto: {
      banco_destino: string;
      numero_operacion: string;
      fecha_conciliacion: string;
      comprobante_url?: string;
    },
  ) {
    const data = await this.service.conciliarRetiro(tenantId, retiroId, dto, user?.id);
    return { success: true, data };
  }

  @Post('cambio-turno/iniciar/:sesionId')
  @RequirePermission('cajas.cambios_turno.iniciar')
  async iniciarCambioTurno(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('sesionId') sesionId: string,
    @Body() dto: { usuario_entrante_id: string },
  ) {
    const data = await this.service.iniciarCambioTurno(
      tenantId,
      sesionId,
      user?.id,
      dto.usuario_entrante_id,
    );
    return { success: true, data };
  }

  @Post('cambio-turno/completar/:cambioId')
  @RequirePermission('cajas.cambios_turno.completar')
  async completarCambioTurno(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('cambioId') cambioId: string,
    @Body() dto: {
      monto_contado: number;
      denominaciones: Record<string, any>;
      foto_arqueo?: string;
      firma_saliente: string;
      firma_entrante: string;
    },
  ) {
    const data = await this.service.completarCambioTurno(
      tenantId,
      cambioId,
      dto.monto_contado,
      dto.denominaciones,
      dto.foto_arqueo || '',
      {
        saliente: dto.firma_saliente,
        entrante: dto.firma_entrante,
      },
    );
    return { success: true, data };
  }

  @Post('cambio-turno/cancelar/:cambioId')
  @RequirePermission('cajas.cambios_turno.cancelar')
  async cancelarCambioTurno(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('cambioId') cambioId: string,
    @Body() dto: { razon: string },
  ) {
    const data = await this.service.cancelarCambioTurno(
      tenantId,
      cambioId,
      dto.razon,
      user?.id,
    );
    return { success: true, data };
  }

  @Get('sesiones/:sesionId/cambios-turno')
  @RequirePermission('cajas.cambios_turno.ver')
  async listarCambiosTurno(
    @CurrentTenant() tenantId: string,
    @Param('sesionId') sesionId: string,
  ) {
    const data = await this.service.obtenerCambiosTurnoSesion(tenantId, sesionId);
    return { success: true, data };
  }

  @Post('movimientos/manual/:sesionId')
  @RequirePermission('cajas.movimientos.manual')
  async registrarMovimientoManual(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('sesionId') sesionId: string,
    @Body() dto: {
      tipo: 'INGRESO' | 'GASTO';
      monto: number;
      motivo: string;
      idempotency_key?: string;
      referencia_documento?: string;
    },
  ) {
    const data = await this.service.registrarMovimientoManual(
      tenantId,
      sesionId,
      dto.tipo,
      dto.monto,
      dto.motivo,
      user?.id,
      dto.idempotency_key || dto.referencia_documento,
    );
    return { success: true, data };
  }

  /**
   * Cierre administrativo de sesión colgada
   * 
   * Endpoint para supervisores/admins para cerrar sesiones que quedaron abiertas
   * por eventos inesperados (corte de luz, fallo de sistema, etc.)
   * 
   * Requiere permisos de supervisor/admin
   */
  @Post('sesiones/:sesionId/cierre-administrativo')
  @RequirePermission('cajas.cierre_administrativo')
  async cerrarSesionAdministrativa(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('sesionId') sesionId: string,
    @Body('razon_cierre') razonCierre: string,
  ) {
    if (!razonCierre) {
      throw new BadRequestException('Debe proporcionar una razón detallada para el cierre administrativo');
    }

    const data = await this.service.cerrarSesionAdministrativa(
      tenantId,
      sesionId,
      razonCierre,
      user?.id,
    );

    return {
      success: true,
      data,
      message: 'Sesión cerrada administrativamente. Esta acción ha sido registrada en auditoría.',
    };
  }

  @Get(':id/corte-z')
  @RequirePermission('cajas.corte_z.ver')
  async obtenerCorteZ(
    @CurrentTenant() tenantId: string,
    @Param('id') cajaId: string,
    @Query('sesionId') sesionId: string,
  ) {
    const data = await this.service.obtenerCorteZ(tenantId, sesionId);
    return { success: true, data, cajaId, sesionId };
  }
}
