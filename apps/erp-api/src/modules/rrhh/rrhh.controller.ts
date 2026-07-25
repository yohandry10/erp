import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RrhhService } from './rrhh.service';
import { PlanillasService } from './planillas.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { RequireFeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

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
    private readonly planillasService: PlanillasService
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

  @Post('empleados')
  async createEmpleado(
    @CurrentTenant() tenantId: string,
    @Body() empleadoData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando empleado para tenant: ${tenantId}`);
    return this.rrhhService.createEmpleado(empleadoData, tenantId);
  }

  @Put('empleados/:id')
  async updateEmpleado(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() empleadoData: any
  ) {
    this.logger.debug(`✏️ [RRHH] Actualizando empleado ${id} para tenant: ${tenantId}`);
    return this.rrhhService.updateEmpleado(id, empleadoData, tenantId);
  }

  @Delete('empleados/:id')
  async deleteEmpleado(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string
  ) {
    this.logger.debug(`🗑️ [RRHH] Eliminando empleado ${id} para tenant: ${tenantId}`);
    return this.rrhhService.deleteEmpleado(id, tenantId);
  }

  @Post('departamentos')
  async createDepartamento(
    @CurrentTenant() tenantId: string,
    @Body() departamentoData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando departamento para tenant: ${tenantId}`);
    return this.rrhhService.createDepartamento(departamentoData, tenantId);
  }

  // ===== PLANILLAS (EXISTENTE) =====
  @Get('planillas')
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
  async getDetallePlanilla(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string
  ) {
    this.logger.debug(`📊 [RRHH] Obteniendo detalle planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.getDetallePlanilla(planillaId, tenantId);
  }

  @Get('boleta/:empleadoPlanillaId')
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
    @Param('id') planillaId: string,
    @Body() updateData: any
  ) {
    this.logger.debug(`✏️ [RRHH] Actualizando planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.updatePlanilla(planillaId, updateData, tenantId);
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
    @Body() empleadosData: any
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
    @Param('id') pagoId: string
  ) {
    this.logger.debug(`✅ [RRHH] Procesando pago ${pagoId} para tenant: ${tenantId}`);
    return this.rrhhService.procesarPago(pagoId, tenantId);
  }

  @Post('planillas/:id/pagar')
  async pagarPlanillaCompleta(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string,
    @Body() pagoData: { metodo_pago: 'efectivo' | 'transferencia' }
  ) {
    this.logger.debug(`💰 [RRHH] Pagando planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.pagarPlanillaCompleta(planillaId, pagoData.metodo_pago, tenantId);
  }

  @Post('planillas/:id/pagar-empleados')
  async pagarEmpleadosSeleccionados(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string,
    @Body() pagoData: any
  ) {
    this.logger.debug(`💰 [RRHH] Pagando empleados seleccionados de planilla ${planillaId} para tenant: ${tenantId}`);
    return this.planillasService.pagarEmpleadosSeleccionados(planillaId, pagoData, tenantId);
  }

  @Post('planillas/:id/generar-asientos')
  async generarAsientosContables(
    @CurrentTenant() tenantId: string,
    @Param('id') planillaId: string
  ) {
    this.logger.debug(`📊 [RRHH] Generando asientos para planilla ${planillaId}, tenant: ${tenantId}`);
    return this.planillasService.generarAsientosContables(planillaId, tenantId);
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
    @Body() contratoData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando contrato para tenant: ${tenantId}`);
    return this.rrhhService.createContrato(contratoData, tenantId);
  }

  @Post('contratos/:id/renovar')
  async renovarContrato(
    @CurrentTenant() tenantId: string,
    @Param('id') contratoId: string,
    @Body() data: { meses: number }
  ) {
    this.logger.debug(`🔄 [RRHH] Renovando contrato ${contratoId} para tenant: ${tenantId}`);
    return this.rrhhService.renovarContrato(contratoId, data.meses, tenantId);
  }

  @Put('contratos/:id/finalizar')
  async finalizarContrato(
    @CurrentTenant() tenantId: string,
    @Param('id') contratoId: string,
    @Body() data: { motivo_finalizacion: string; fecha_finalizacion: string }
  ) {
    this.logger.debug(`🛑 [RRHH] Finalizando contrato ${contratoId} para tenant: ${tenantId}`);
    return this.rrhhService.finalizarContrato(contratoId, data.motivo_finalizacion, data.fecha_finalizacion, tenantId);
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
    @Body() data: { empleado_id: string; fecha: string; tipo: 'entrada' | 'salida'; hora: string }
  ) {
    this.logger.debug(`⏰ [RRHH] Marcando asistencia para empleado ${data.empleado_id}, tenant: ${tenantId}`);
    return this.rrhhService.marcarAsistencia(data.empleado_id, data.fecha, data.tipo, data.hora, tenantId);
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
    @Body() vacanteData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando vacante para tenant: ${tenantId}`);
    return this.rrhhService.createVacante(vacanteData, tenantId);
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
    @Body() candidatoData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando candidato para tenant: ${tenantId}`);
    return this.rrhhService.createCandidato(candidatoData, tenantId);
  }

  @Put('candidatos/:id/estado')
  async updateEstadoCandidato(
    @CurrentTenant() tenantId: string,
    @Param('id') candidatoId: string,
    @Body() data: { estado: string; observaciones?: string }
  ) {
    this.logger.debug(`✏️ [RRHH] Actualizando estado de candidato ${candidatoId} para tenant: ${tenantId}`);
    return this.rrhhService.updateEstadoCandidato(candidatoId, data.estado, data.observaciones, tenantId);
  }

  // ===== ASISTENCIA Y TIEMPO =====
  @Post('asistencia/entrada/:empleadoId')
  async registrarEntrada(
    @CurrentTenant() tenantId: string,
    @Param('empleadoId') empleadoId: string
  ) {
    this.logger.debug(`⏰ [RRHH] Registrando entrada para empleado ${empleadoId}, tenant: ${tenantId}`);
    return this.rrhhService.registrarAsistencia(empleadoId, 'entrada', tenantId);
  }

  @Post('asistencia/salida/:empleadoId')
  async registrarSalida(
    @CurrentTenant() tenantId: string,
    @Param('empleadoId') empleadoId: string
  ) {
    this.logger.debug(`⏰ [RRHH] Registrando salida para empleado ${empleadoId}, tenant: ${tenantId}`);
    return this.rrhhService.registrarAsistencia(empleadoId, 'salida', tenantId);
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
    @Body() solicitudData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando solicitud para tenant: ${tenantId}`);
    return this.rrhhService.createSolicitud(solicitudData, tenantId);
  }

  @Put('solicitudes/:id/aprobar')
  async aprobarSolicitud(
    @CurrentTenant() tenantId: string,
    @Param('id') solicitudId: string,
    @Body() data: { aprobado_por: string; observaciones?: string }
  ) {
    this.logger.debug(`✅ [RRHH] Aprobando solicitud ${solicitudId} para tenant: ${tenantId}`);
    return this.rrhhService.aprobarSolicitud(solicitudId, data.aprobado_por, data.observaciones, tenantId);
  }

  @Put('solicitudes/:id/rechazar')
  async rechazarSolicitud(
    @CurrentTenant() tenantId: string,
    @Param('id') solicitudId: string,
    @Body() data: { aprobado_por: string; observaciones: string }
  ) {
    this.logger.debug(`❌ [RRHH] Rechazando solicitud ${solicitudId} para tenant: ${tenantId}`);
    return this.rrhhService.rechazarSolicitud(solicitudId, data.aprobado_por, data.observaciones, tenantId);
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
    @Param('id') empleadoId: string,
    @Body() data: { beneficio_id: string; fecha_inicio: string }
  ) {
    this.logger.debug(`➕ [RRHH] Asignando beneficio al empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.asignarBeneficio(empleadoId, data.beneficio_id, data.fecha_inicio, tenantId);
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
    @Body() evaluacionData: any
  ) {
    this.logger.debug(`➕ [RRHH] Creando evaluación para tenant: ${tenantId}`);
    return this.rrhhService.createEvaluacion(evaluacionData, tenantId);
  }

  @Put('evaluaciones/:id')
  async updateEvaluacion(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() evaluacionData: any
  ) {
    this.logger.debug(`✏️ [RRHH] Actualizando evaluación ${id} para tenant: ${tenantId}`);
    return this.rrhhService.updateEvaluacion(id, evaluacionData, tenantId);
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
    @Param('id') empleadoId: string,
    @Body() data: { capacitacion_id: string }
  ) {
    this.logger.debug(`➕ [RRHH] Inscribiendo empleado ${empleadoId} en capacitación para tenant: ${tenantId}`);
    return this.rrhhService.inscribirCapacitacion(empleadoId, data.capacitacion_id, tenantId);
  }

  // ===== LIQUIDACIONES =====
  @Post('empleados/:id/liquidacion')
  async calcularLiquidacion(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string,
    @Body() data: { motivo_terminacion: string; fecha_terminacion: string }
  ) {
    this.logger.debug(`💼 [RRHH] Calculando liquidación para empleado ${empleadoId}, tenant: ${tenantId}`);
    return this.rrhhService.calcularLiquidacion(empleadoId, data.motivo_terminacion, data.fecha_terminacion, tenantId);
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
    @Param('id') empleadoId: string,
    @Body() data: { horario_id: string; fecha_inicio: string }
  ) {
    this.logger.debug(`➕ [RRHH] Asignando horario al empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.asignarHorario(empleadoId, data.horario_id, data.fecha_inicio, tenantId);
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
      tenantId
    );
  }

  // ===== DASHBOARD Y REPORTES =====
  @Get('dashboard')
  async getDashboardRrhh(@CurrentTenant() tenantId: string) {
    this.logger.debug(`📊 [RRHH] Obteniendo dashboard para tenant: ${tenantId}`);
    return this.rrhhService.getDashboardRrhh(tenantId);
  }

} 
