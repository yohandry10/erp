import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, Logger, Res, Headers } from '@nestjs/common';
import type { Response } from 'express';
import { RrhhService } from './rrhh.service';
import { PlanillasService } from './planillas.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { RequireFeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlanillaElectronicaPeruService } from './planilla-electronica-peru.service';
import { CalcularPlanillaPersonalizadaDto } from './dto/calcular-planilla-personalizada.dto';

/**
 * ✅ MULTI-TENANT: Controlador de RRHH con soporte multi-tenant
 * Todos los endpoints filtran automáticamente por tenant
 */
@Controller('rrhh')
@UseGuards(JwtAuthGuard, PermissionGuard, FeatureFlagGuard) // HARDENING: autenticación, permisos y feature flag.
@RequireFeatureFlag('rrhh')
@RequirePermission('rrhh.access')
export class RrhhController {
  private readonly logger = new Logger(RrhhController.name);

  constructor(
    private readonly rrhhService: RrhhService,
    private readonly planillasService: PlanillasService,
    private readonly planillaElectronicaPeru: PlanillaElectronicaPeruService,
  ) { }

  // ===== EMPLEADOS BÁSICOS =====
  @Get('empleados')
  async getEmpleados(@CurrentTenant() tenantId: string) {
    this.logger.debug(`👥 [RRHH] Obteniendo empleados para tenant: ${tenantId}`);
    return this.rrhhService.getEmpleados(tenantId);
  }

  @Get('departamentos')
  async getDepartamentos(@CurrentTenant() tenantId: string) {
    this.logger.debug(`🏢 [RRHH] Obteniendo departamentos para tenant: ${tenantId}`);
    return this.rrhhService.getDepartamentos(tenantId);
  }

  @Get('configuracion-laboral')
  async getConfiguracionLaboral(@CurrentTenant() tenantId: string) {
    return this.rrhhService.getConfiguracionLaboral(tenantId);
  }

  @Put('configuracion-laboral/argentina')
  async updateConfiguracionLaboralArgentina(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() configuracion: any,
  ) {
    return this.rrhhService.updateConfiguracionLaboralArgentina(
      tenantId, configuracion, userId, idempotencyKey,
    );
  }

  @Put('configuracion-laboral/colombia')
  async updateConfiguracionLaboralColombia(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() configuracion: any,
  ) {
    return this.rrhhService.updateConfiguracionLaboralColombia(
      tenantId, configuracion, userId, idempotencyKey,
    );
  }

  @Post('configuracion-laboral/colombia/pila/test')
  async probarIntegracionPilaColombia(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.rrhhService.probarIntegracionPilaColombia(tenantId, userId, idempotencyKey);
  }

  @Post('empleados')
  async createEmpleado(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() empleadoData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando empleado para tenant: ${tenantId}`);
    return this.rrhhService.createEmpleado(empleadoData, tenantId, userId, idempotencyKey);
  }

  @Put('empleados/:id')
  async updateEmpleado(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Body() empleadoData: any
  ) {
    this.logger.debug(`✏️ [RRHH] Actualizando empleado ${id} para tenant: ${tenantId}`);
    return this.rrhhService.updateEmpleado(id, empleadoData, tenantId, userId, idempotencyKey);
  }

  @Delete('empleados/:id')
  async deleteEmpleado(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string
  ) {
    this.logger.debug(`🗑️ [RRHH] Eliminando empleado ${id} para tenant: ${tenantId}`);
    return this.rrhhService.deleteEmpleado(id, tenantId, userId, idempotencyKey);
  }

  @Post('departamentos')
  async createDepartamento(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() departamentoData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando departamento para tenant: ${tenantId}`);
    return this.rrhhService.createDepartamento(departamentoData, tenantId, userId, idempotencyKey);
  }

  // ===== PLANILLAS (EXISTENTE) =====
  @Get('planillas')
  @RequirePermission('rrhh.planillas.read')
  async getPlanillas(@CurrentTenant() tenantId: string) {
    this.logger.debug(`📋 [RRHH] Obteniendo planillas para tenant: ${tenantId}`);
    return this.planillasService.getPlanillas(tenantId);
  }

  @Post('planillas')
  async crearPlanilla(@CurrentTenant() tenantId: string, @Body() planillaData: any) {
    this.logger.debug(`📋 [RRHH] Creando planilla para tenant: ${tenantId}`, planillaData);
    return this.planillasService.crearPlanilla(planillaData, tenantId);
  }

  @Post('planillas/:id/calcular')
  async calcularPlanilla(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string
  ) {
    this.logger.debug(`🧮 [RRHH] Calculando planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.calcularPlanillaMensual(planillaId, tenantId);
  }

  @Get('planillas/:id/detalle')
  @RequirePermission('rrhh.planillas.read')
  async getDetallePlanilla(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string
  ) {
    this.logger.debug(`📊 [RRHH] Obteniendo detalle planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.getDetallePlanilla(planillaId, tenantId);
  }

  @Get('boleta/:empleadoPlanillaId')
  @RequirePermission('rrhh.planillas.read')
  async getBoleta(
    @CurrentTenant() tenantId: string,
    @Param('empleadoPlanillaId') empleadoPlanillaId: string
  ) {
    this.logger.debug(`📄 [RRHH] Obteniendo boleta ${empleadoPlanillaId} para tenant: ${tenantId}`);
    return this.planillasService.getBoleta(empleadoPlanillaId, tenantId);
  }

  @Put('planillas/:id')
  async updatePlanilla(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') planillaId: string,
    @Body() updateData: any
  ) {
    this.logger.debug(`✏️ [RRHH] Actualizando planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.updatePlanilla(planillaId, updateData, tenantId, userId);
  }

  @Post('planillas/:id/aprobar')
  async aprobarPlanilla(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') planillaId: string,
  ) {
    this.logger.debug(`✅ [RRHH] Aprobando planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.aprobarPlanilla(planillaId, tenantId, userId);
  }

  @Delete('planillas/:id')
  async deletePlanilla(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string
  ) {
    this.logger.debug(`🗑️ [RRHH] Eliminando planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.deletePlanilla(planillaId, tenantId);
  }

  @Get('conceptos')
  async getConceptos(@CurrentTenant() tenantId: string) {
    this.logger.debug(`📋 [RRHH] Obteniendo conceptos para tenant: ${tenantId}`);
    return this.planillasService.getConceptos(tenantId);
  }

  @Post('planillas/:id/calcular-personalizada')
  async calcularPlanillaPersonalizada(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string,
    @Body() empleadosData: CalcularPlanillaPersonalizadaDto
  ) {
    this.logger.debug('🧮 Calculando planilla personalizada:', planillaId);
    return this.planillasService.calcularPlanillaPersonalizada(planillaId, empleadosData.empleados, tenantId);
  }

  // ===== PAGOS Y COMPROBANTES =====
  @Get('pagos')
  async getPagos(
    @CurrentTenant() tenantId: string,
    @Query('periodo') periodo?: string,
    @Query('empleado_id') empleadoId?: string
  ) {
    this.logger.debug(`💰 [RRHH] Obteniendo pagos para tenant: ${tenantId}`);
    return this.rrhhService.getPagos(periodo, empleadoId, tenantId);
  }

  @Put('pagos/:id/procesar')
  async procesarPago(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') pagoId: string
  ) {
    this.logger.debug(`✅ [RRHH] Delegando pago legado ${pagoId} al cierre atómico del tenant: ${tenantId}`);
    return this.planillasService.procesarPagoLegado(pagoId, tenantId, userId);
  }

  @Post('planillas/:id/pagar')
  async pagarPlanillaCompleta(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') planillaId: string,
    @Body() pagoData: { metodo_pago: 'efectivo' | 'transferencia' }
  ) {
    this.logger.debug(`💰 [RRHH] Pagando planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.pagarPlanillaCompleta(planillaId, pagoData.metodo_pago, tenantId, userId);
  }

  @Post('planillas/:id/pagar-empleados')
  async pagarEmpleadosSeleccionados(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') planillaId: string,
    @Body() pagoData: any
  ) {
    this.logger.debug(`💰 [RRHH] Delegando ruta legada de empleados al pago atómico de planilla ${planillaId}`);
    return this.planillasService.pagarEmpleadosSeleccionados(planillaId, pagoData, tenantId, userId);
  }

  @Post('planillas/:id/generar-asientos')
  @RequirePermission('rrhh.planillas.accounting')
  async generarAsientosContables(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string
  ) {
    this.logger.debug(`📊 [RRHH] Consultando devengo durable de planilla ${planillaId}, tenant: ${tenantId}`);
    return this.planillasService.getEstadoDevengoContable(planillaId, tenantId);
  }

  // ===== PLANILLA ELECTRÓNICA PERÚ: PLAME / T-REGISTRO =====
  @Get('peru/planilla-electronica/:planillaId/preview')
  @RequirePermission('rrhh.planilla_electronica.read')
  async previsualizarPlanillaElectronicaPeru(
    @CurrentTenant() tenantId: string,
    @Param('planillaId') planillaId: string,
  ) {
    return { success: true, data: await this.planillaElectronicaPeru.previsualizar(tenantId, planillaId) };
  }

  @Put('peru/planilla-electronica/empleados/:empleadoId/ficha')
  @RequirePermission('rrhh.planilla_electronica.write')
  async guardarFichaLaboralPeru(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('empleadoId') empleadoId: string,
    @Body() payload: any,
  ) {
    return { success: true, data: await this.planillaElectronicaPeru.guardarFicha(
      tenantId, userId, empleadoId, payload, idempotencyKey,
    ) };
  }

  @Put('peru/planilla-electronica/detalles/:detalleId/jornada')
  @RequirePermission('rrhh.planilla_electronica.write')
  async guardarJornadaPlamePeru(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('detalleId') detalleId: string,
    @Body() payload: { horas_ordinarias: number; dias_no_laborados: number },
  ) {
    return { success: true, data: await this.planillaElectronicaPeru.guardarJornada(
      tenantId, userId, detalleId, payload, idempotencyKey,
    ) };
  }

  @Post('peru/planilla-electronica/:planillaId/paquetes')
  @RequirePermission('rrhh.planilla_electronica.write')
  async guardarPaquetePlanillaElectronicaPeru(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('planillaId') planillaId: string,
    @Body() payload: { notas?: string },
  ) {
    return { success: true, data: await this.planillaElectronicaPeru.guardarPaquete(tenantId, userId, planillaId, payload?.notas) };
  }

  @Get('peru/planilla-electronica/paquetes/historial')
  @RequirePermission('rrhh.planilla_electronica.read')
  async historialPlanillaElectronicaPeru(
    @CurrentTenant() tenantId: string,
    @Query('limite') limite?: string,
  ) {
    return { success: true, data: await this.planillaElectronicaPeru.historial(tenantId, Number(limite || 36)) };
  }

  @Post('peru/planilla-electronica/paquetes/:id/evidencia')
  @RequirePermission('rrhh.planilla_electronica.write')
  async registrarEvidenciaPlanillaElectronicaPeru(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() payload: any,
  ) {
    return { success: true, data: await this.planillaElectronicaPeru.registrarEvidencia(tenantId, userId, id, payload) };
  }

  @Get('peru/planilla-electronica/paquetes/:id/descargar')
  @RequirePermission('rrhh.planilla_electronica.read')
  async descargarPaquetePlanillaElectronicaPeru(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const paquete = await this.planillaElectronicaPeru.descargar(tenantId, id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${paquete.nombre}"`);
    return res.send(paquete.buffer);
  }

  @Get('planillas/:id/historial-pagos')
  async getHistorialPagos(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string
  ) {
    this.logger.debug(`📋 [RRHH] Obteniendo historial de pagos planilla ${planillaId}, tenant: ${tenantId}`);
    return this.planillasService.getHistorialPagos(planillaId, tenantId);
  }

  @Get('pagos/:id/comprobante')
  async generarComprobante(
    @CurrentTenant() tenantId: string,
    @Param('id') pagoId: string,
    @Res() res: Response,
  ) {
    this.logger.debug(`📄 [RRHH] Generando comprobante ${pagoId}, tenant: ${tenantId}`);
    const pdf = await this.rrhhService.generarComprobantePago(pagoId, tenantId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="comprobante-pago-${pagoId}.pdf"`);
    return res.send(pdf);
  }

  @Get('empleados/:id/boleta-pago/:mes')
  async generarBoletaPago(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string,
    @Param('mes') mes: string
  ) {
    this.logger.debug(`📄 [RRHH] Generando boleta de pago para empleado ${empleadoId}, mes ${mes}, tenant: ${tenantId}`);
    return this.rrhhService.generarBoletaPago(empleadoId, mes, tenantId);
  }

  // ===== CONTRATOS =====
  @Get('contratos')
  async getContratos(
    @CurrentTenant() tenantId: string,
    @Query('empleado_id') empleadoId?: string
  ) {
    this.logger.debug(`📄 [RRHH] Obteniendo contratos para tenant: ${tenantId}`);
    return this.rrhhService.getContratos(empleadoId, tenantId);
  }

  @Post('contratos')
  async createContrato(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() contratoData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando contrato para tenant: ${tenantId}`);
    return this.rrhhService.createContrato(contratoData, tenantId, userId, idempotencyKey);
  }

  @Post('contratos/:id/renovar')
  async renovarContrato(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') contratoId: string,
    @Body() data: { meses: number }
  ) {
    this.logger.debug(`🔄 [RRHH] Renovando contrato ${contratoId} para tenant: ${tenantId}`);
    return this.rrhhService.renovarContrato(
      contratoId, data.meses, tenantId, userId, idempotencyKey,
    );
  }

  @Put('contratos/:id/finalizar')
  async finalizarContrato(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') contratoId: string,
    @Body() data: { motivo_finalizacion: string; fecha_finalizacion: string }
  ) {
    this.logger.debug(`🛑 [RRHH] Finalizando contrato ${contratoId} para tenant: ${tenantId}`);
    return this.rrhhService.finalizarContrato(
      contratoId, data.motivo_finalizacion, data.fecha_finalizacion,
      tenantId, userId, idempotencyKey,
    );
  }

  @Get('contratos/:id/generar')
  async generarContrato(
    @CurrentTenant() tenantId: string,
    @Param('id') contratoId: string,
    @Res() res: Response,
  ) {
    this.logger.debug(`📄 [RRHH] Generando contrato PDF ${contratoId} para tenant: ${tenantId}`);
    const pdf = await this.rrhhService.generarContratoPDF(contratoId, tenantId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contrato-${contratoId}.pdf"`);
    return res.send(pdf);
  }

  // ===== ASISTENCIAS MEJORADAS =====
  @Get('asistencias')
  async getAsistenciasPorFecha(
    @CurrentTenant() tenantId: string,
    @Query('fecha') fecha: string
  ) {
    this.logger.debug(`📋 [RRHH] Obteniendo asistencias por fecha ${fecha} para tenant: ${tenantId}`);
    return this.rrhhService.getAsistenciasPorFecha(fecha, tenantId);
  }

  @Post('asistencias/marcar')
  async marcarAsistencia(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() data: { empleado_id: string; fecha: string; tipo: 'entrada' | 'salida'; hora: string }
  ) {
    this.logger.debug(`⏰ [RRHH] Marcando asistencia para empleado ${data.empleado_id}, tenant: ${tenantId}`);
    return this.rrhhService.marcarAsistencia(
      data.empleado_id, data.fecha, data.tipo, data.hora, tenantId, userId, idempotencyKey,
    );
  }

  // ===== RECLUTAMIENTO Y VACANTES =====
  @Get('vacantes')
  async getVacantes(@CurrentTenant() tenantId: string) {
    this.logger.debug(`📋 [RRHH] Obteniendo vacantes para tenant: ${tenantId}`);
    return this.rrhhService.getVacantes(tenantId);
  }

  @Post('vacantes')
  async createVacante(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() vacanteData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando vacante para tenant: ${tenantId}`);
    return this.rrhhService.createVacante(vacanteData, tenantId, userId, idempotencyKey);
  }

  @Get('candidatos')
  async getCandidatos(
    @CurrentTenant() tenantId: string,
    @Query('vacante_id') vacanteId?: string
  ) {
    this.logger.debug(`👤 [RRHH] Obteniendo candidatos para tenant: ${tenantId}`);
    return this.rrhhService.getCandidatos(vacanteId, tenantId);
  }

  @Post('candidatos')
  async createCandidato(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() candidatoData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando candidato para tenant: ${tenantId}`);
    return this.rrhhService.createCandidato(candidatoData, tenantId, userId, idempotencyKey);
  }

  @Put('candidatos/:id')
  async updateCandidato(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') candidatoId: string,
    @Body() candidatoData: any,
  ) {
    return this.rrhhService.updateCandidato(
      candidatoId, candidatoData, tenantId, userId, idempotencyKey,
    );
  }

  @Put('candidatos/:id/estado')
  async updateEstadoCandidato(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') candidatoId: string,
    @Body() data: { estado: string; observaciones?: string }
  ) {
    this.logger.debug(`✏️ [RRHH] Actualizando estado de candidato ${candidatoId} para tenant: ${tenantId}`);
    return this.rrhhService.updateEstadoCandidato(
      candidatoId, data.estado, data.observaciones, tenantId, userId, idempotencyKey,
    );
  }

  // ===== ASISTENCIA Y TIEMPO =====
  @Post('asistencia/entrada/:empleadoId')
  async registrarEntrada(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('empleadoId') empleadoId: string
  ) {
    this.logger.debug(`⏰ [RRHH] Registrando entrada para empleado ${empleadoId}, tenant: ${tenantId}`);
    return this.rrhhService.registrarAsistencia(
      empleadoId, 'entrada', tenantId, userId, idempotencyKey,
    );
  }

  @Post('asistencia/salida/:empleadoId')
  async registrarSalida(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('empleadoId') empleadoId: string
  ) {
    this.logger.debug(`⏰ [RRHH] Registrando salida para empleado ${empleadoId}, tenant: ${tenantId}`);
    return this.rrhhService.registrarAsistencia(
      empleadoId, 'salida', tenantId, userId, idempotencyKey,
    );
  }

  @Get('asistencia')
  async getAsistencia(
    @CurrentTenant() tenantId: string,
    @Query('empleado_id') empleadoId?: string,
    @Query('fecha_desde') fechaDesde?: string,
    @Query('fecha_hasta') fechaHasta?: string
  ) {
    this.logger.debug(`📋 [RRHH] Obteniendo asistencias para tenant: ${tenantId}`);
    return this.rrhhService.getAsistencia(empleadoId, fechaDesde, fechaHasta, tenantId);
  }

  // ===== SOLICITUDES (Vacaciones, Licencias) =====
  @Get('solicitudes')
  async getSolicitudes(
    @CurrentTenant() tenantId: string,
    @Query('empleado_id') empleadoId?: string,
    @Query('estado') estado?: string
  ) {
    this.logger.debug(`📝 [RRHH] Obteniendo solicitudes para tenant: ${tenantId}`);
    return this.rrhhService.getSolicitudes(empleadoId, estado, tenantId);
  }

  @Post('solicitudes')
  async createSolicitud(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() solicitudData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando solicitud para tenant: ${tenantId}`);
    return this.rrhhService.createSolicitud(solicitudData, tenantId, userId, idempotencyKey);
  }

  @Put('solicitudes/:id/aprobar')
  async aprobarSolicitud(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') solicitudId: string,
    @Body() data: { aprobado_por: string; observaciones?: string }
  ) {
    this.logger.debug(`✅ [RRHH] Aprobando solicitud ${solicitudId} para tenant: ${tenantId}`);
    return this.rrhhService.aprobarSolicitud(
      solicitudId, data.aprobado_por, data.observaciones, tenantId, userId, idempotencyKey,
    );
  }

  @Put('solicitudes/:id/rechazar')
  async rechazarSolicitud(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') solicitudId: string,
    @Body() data: { aprobado_por: string; observaciones: string }
  ) {
    this.logger.debug(`❌ [RRHH] Rechazando solicitud ${solicitudId} para tenant: ${tenantId}`);
    return this.rrhhService.rechazarSolicitud(
      solicitudId, data.aprobado_por, data.observaciones, tenantId, userId, idempotencyKey,
    );
  }

  // ===== BENEFICIOS =====
  @Get('beneficios')
  async getBeneficios(@CurrentTenant() tenantId: string) {
    this.logger.debug(`🎁 [RRHH] Obteniendo beneficios para tenant: ${tenantId}`);
    return this.rrhhService.getBeneficios(tenantId);
  }

  @Get('empleados/:id/beneficios')
  async getBeneficiosEmpleado(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string
  ) {
    this.logger.debug(`🎁 [RRHH] Obteniendo beneficios del empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.getBeneficiosEmpleado(empleadoId, tenantId);
  }

  @Post('empleados/:id/beneficios')
  async asignarBeneficio(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') empleadoId: string,
    @Body() data: { beneficio_id: string; fecha_inicio: string }
  ) {
    this.logger.debug(`➕ [RRHH] Asignando beneficio al empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.asignarBeneficio(
      empleadoId, data.beneficio_id, data.fecha_inicio, tenantId, userId, idempotencyKey,
    );
  }

  // ===== EVALUACIONES DE DESEMPEÑO =====
  @Get('evaluaciones')
  async getEvaluaciones(
    @CurrentTenant() tenantId: string,
    @Query('empleado_id') empleadoId?: string
  ) {
    this.logger.debug(`📊 [RRHH] Obteniendo evaluaciones para tenant: ${tenantId}`);
    return this.rrhhService.getEvaluaciones(empleadoId, tenantId);
  }

  @Post('evaluaciones')
  async createEvaluacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() evaluacionData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando evaluación para tenant: ${tenantId}`);
    return this.rrhhService.createEvaluacion(
      evaluacionData, tenantId, userId, idempotencyKey,
    );
  }

  @Put('evaluaciones/:id')
  async updateEvaluacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Body() evaluacionData: any
  ) {
    this.logger.debug(`✏️ [RRHH] Actualizando evaluación ${id} para tenant: ${tenantId}`);
    return this.rrhhService.updateEvaluacion(
      id, evaluacionData, tenantId, userId, idempotencyKey,
    );
  }

  // ===== CAPACITACIONES =====
  @Get('capacitaciones')
  async getCapacitaciones(@CurrentTenant() tenantId: string) {
    this.logger.debug(`🎓 [RRHH] Obteniendo capacitaciones para tenant: ${tenantId}`);
    return this.rrhhService.getCapacitaciones(tenantId);
  }

  @Get('empleados/:id/capacitaciones')
  async getCapacitacionesEmpleado(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string
  ) {
    this.logger.debug(`🎓 [RRHH] Obteniendo capacitaciones del empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.getCapacitacionesEmpleado(empleadoId, tenantId);
  }

  @Post('empleados/:id/capacitaciones')
  async inscribirCapacitacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') empleadoId: string,
    @Body() data: { capacitacion_id: string }
  ) {
    this.logger.debug(`➕ [RRHH] Inscribiendo empleado ${empleadoId} en capacitación para tenant: ${tenantId}`);
    return this.rrhhService.inscribirCapacitacion(
      empleadoId, data.capacitacion_id, tenantId, userId, idempotencyKey,
    );
  }

  // ===== LIQUIDACIONES =====
  @Get('liquidaciones')
  async getLiquidaciones(@CurrentTenant() tenantId: string) {
    return this.rrhhService.getLiquidaciones(tenantId);
  }

  @Post('empleados/:id/liquidacion')
  async calcularLiquidacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') usuarioId: string,
    @Param('id') empleadoId: string,
    @Body() data: { motivo_terminacion: string; fecha_terminacion: string }
  ) {
    this.logger.debug(`💼 [RRHH] Calculando liquidación para empleado ${empleadoId}, tenant: ${tenantId}`);
    return this.rrhhService.calcularLiquidacion(
      empleadoId,
      data.motivo_terminacion,
      data.fecha_terminacion,
      tenantId,
      usuarioId,
    );
  }

  @Post('liquidaciones/:id/confirmar')
  async confirmarLiquidacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') usuarioId: string,
    @Param('id') liquidacionId: string,
  ) {
    this.logger.debug(`✅ [RRHH] Confirmando liquidación ${liquidacionId}, tenant: ${tenantId}`);
    return this.rrhhService.confirmarLiquidacion(liquidacionId, tenantId, usuarioId);
  }

  @Post('liquidaciones/:id/pagar')
  async pagarLiquidacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') usuarioId: string,
    @Param('id') liquidacionId: string,
    @Body() pago: {
      metodo_pago: 'efectivo' | 'transferencia';
      cuenta_bancaria_id?: string;
      referencia?: string;
      fecha_pago?: string;
      idempotency_key?: string;
    },
  ) {
    return this.rrhhService.pagarLiquidacion(liquidacionId, pago, tenantId, usuarioId);
  }

  @Post('liquidaciones/:id/pago/revertir')
  async revertirPagoLiquidacion(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') usuarioId: string,
    @Param('id') liquidacionId: string,
    @Body() data: { motivo: string },
  ) {
    return this.rrhhService.revertirPagoLiquidacion(
      liquidacionId,
      data?.motivo,
      tenantId,
      usuarioId,
    );
  }

  // ===== CTS =====
  // La CTS se deposita en mayo y noviembre; no es un concepto de planilla.
  @Get('cts/depositos')
  async getDepositosCts(
    @CurrentTenant() tenantId: string,
    @Query('periodo') periodo?: string,
  ) {
    return this.rrhhService.getDepositosCts(tenantId, periodo);
  }

  @Post('cts/depositos')
  async calcularDepositosCts(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') usuarioId: string,
    @Body() data: { periodo: string },
  ) {
    this.logger.debug(`💰 [RRHH] Calculando depósitos de CTS del periodo ${data?.periodo}, tenant: ${tenantId}`);
    return this.rrhhService.calcularDepositosCts(data?.periodo, tenantId, usuarioId);
  }

  @Post('cts/depositos/:id/depositar')
  async depositarCts(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') usuarioId: string,
    @Param('id') depositoId: string,
    @Body() pago: { cuenta_bancaria_id: string; referencia: string; fecha_deposito?: string },
  ) {
    return this.rrhhService.depositarCts(depositoId, pago, tenantId, usuarioId);
  }

  // ===== HORARIOS =====
  @Get('horarios')
  async getHorarios(@CurrentTenant() tenantId: string) {
    this.logger.debug(`⏰ [RRHH] Obteniendo horarios para tenant: ${tenantId}`);
    return this.rrhhService.getHorarios(tenantId);
  }

  @Post('empleados/:id/horario')
  async asignarHorario(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') empleadoId: string,
    @Body() data: { horario_id: string; fecha_inicio: string }
  ) {
    this.logger.debug(`➕ [RRHH] Asignando horario al empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.asignarHorario(
      empleadoId, data.horario_id, data.fecha_inicio, tenantId, userId, idempotencyKey,
    );
  }

  // ===== EXPEDIENTE =====
  @Get('empleados/:id/expediente')
  async getExpediente(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string
  ) {
    this.logger.debug(`📁 [RRHH] Obteniendo expediente del empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.getExpediente(empleadoId, tenantId);
  }

  @Post('empleados/:id/expediente')
  async subirDocumento(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') empleadoId: string,
    @Body() data: {
      tipo_documento: string;
      nombre_archivo: string;
      archivo_url: string;
      subido_por: string;
    }
  ) {
    this.logger.debug(`📤 [RRHH] Subiendo documento al expediente del empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.subirDocumento(
      empleadoId,
      data.tipo_documento,
      data.nombre_archivo,
      data.archivo_url,
      data.subido_por,
      tenantId,
      userId,
      idempotencyKey,
    );
  }

  // ===== DASHBOARD Y REPORTES =====
  @Get('dashboard')
  async getDashboardRrhh(@CurrentTenant() tenantId: string) {
    this.logger.debug(`📊 [RRHH] Obteniendo dashboard para tenant: ${tenantId}`);
    return this.rrhhService.getDashboardRrhh(tenantId);
  }

} 
