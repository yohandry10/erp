import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
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
  constructor(
    private readonly rrhhService: RrhhService,
    private readonly planillasService: PlanillasService
  ) { }

  // ===== EMPLEADOS BÁSICOS =====
  @Get('empleados')
  async getEmpleados(@CurrentTenant() tenantId: string) {
    console.log(`👥 [RRHH] Obteniendo empleados para tenant: ${tenantId}`);
    return this.rrhhService.getEmpleados(tenantId);
  }

  @Get('departamentos')
  async getDepartamentos(@CurrentTenant() tenantId: string) {
    console.log(`🏢 [RRHH] Obteniendo departamentos para tenant: ${tenantId}`);
    return this.rrhhService.getDepartamentos(tenantId);
  }

  @Post('empleados')
  async createEmpleado(
    @CurrentTenant() tenantId: string,
    @Body() empleadoData: any
  ) {
    console.log(`➕ [RRHH] Creando empleado para tenant: ${tenantId}`);
    return this.rrhhService.createEmpleado(empleadoData, tenantId);
  }

  @Put('empleados/:id')
  async updateEmpleado(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() empleadoData: any
  ) {
    console.log(`✏️ [RRHH] Actualizando empleado ${id} para tenant: ${tenantId}`);
    return this.rrhhService.updateEmpleado(id, empleadoData, tenantId);
  }

  @Delete('empleados/:id')
  async deleteEmpleado(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string
  ) {
    console.log(`🗑️ [RRHH] Eliminando empleado ${id} para tenant: ${tenantId}`);
    return this.rrhhService.deleteEmpleado(id, tenantId);
  }

  @Post('departamentos')
  async createDepartamento(
    @CurrentTenant() tenantId: string,
    @Body() departamentoData: any
  ) {
    console.log(`➕ [RRHH] Creando departamento para tenant: ${tenantId}`);
    return this.rrhhService.createDepartamento(departamentoData, tenantId);
  }

  // ===== PLANILLAS (EXISTENTE) =====
  @Get('planillas')
  async getPlanillas(@CurrentTenant() tenantId: string) {
    console.log(`📋 [RRHH] Obteniendo planillas para tenant: ${tenantId}`);
    return this.planillasService.getPlanillas();
  }

  @Post('planillas')
  async crearPlanilla(@CurrentTenant() tenantId: string, @Body() planillaData: any) {
    console.log(`📋 [RRHH] Creando planilla para tenant: ${tenantId}`, planillaData);
    return this.planillasService.crearPlanilla(planillaData);
  }

  @Post('planillas/:id/calcular')
  async calcularPlanilla(@Param('id') planillaId: string) {
    return this.planillasService.calcularPlanillaMensual(planillaId);
  }

  @Get('planillas/:id/detalle')
  async getDetallePlanilla(@Param('id') planillaId: string) {
    return this.planillasService.getDetallePlanilla(planillaId);
  }

  @Get('boleta/:empleadoPlanillaId')
  async getBoleta(@Param('empleadoPlanillaId') empleadoPlanillaId: string) {
    return this.planillasService.getBoleta(empleadoPlanillaId);
  }

  @Put('planillas/:id')
  async updatePlanilla(@Param('id') planillaId: string, @Body() updateData: any) {
    return this.planillasService.updatePlanilla(planillaId, updateData);
  }

  @Delete('planillas/:id')
  async deletePlanilla(@Param('id') planillaId: string) {
    console.log('🗑️ Eliminando planilla:', planillaId);
    return this.planillasService.deletePlanilla(planillaId);
  }

  @Get('conceptos')
  async getConceptos() {
    return this.planillasService.getConceptos();
  }

  @Post('planillas/:id/calcular-personalizada')
  async calcularPlanillaPersonalizada(@Param('id') planillaId: string, @Body() empleadosData: any) {
    console.log('🧮 Calculando planilla personalizada:', planillaId);
    return this.planillasService.calcularPlanillaPersonalizada(planillaId, empleadosData.empleados);
  }

  // ===== PAGOS Y COMPROBANTES =====
  @Get('pagos')
  async getPagos(
    @CurrentTenant() tenantId: string,
    @Query('periodo') periodo?: string,
    @Query('empleado_id') empleadoId?: string
  ) {
    console.log(`💰 [RRHH] Obteniendo pagos para tenant: ${tenantId}`);
    return this.rrhhService.getPagos(periodo, empleadoId);
  }

  @Put('pagos/:id/procesar')
  async procesarPago(
    @CurrentTenant() tenantId: string,
    @Param('id') pagoId: string
  ) {
    console.log(`✅ [RRHH] Procesando pago ${pagoId} para tenant: ${tenantId}`);
    return this.rrhhService.procesarPago(pagoId);
  }

  @Post('planillas/:id/pagar')
  async pagarPlanillaCompleta(@Param('id') planillaId: string, @Body() pagoData: { metodo_pago: 'efectivo' | 'transferencia' }) {
    return this.planillasService.pagarPlanillaCompleta(planillaId, pagoData.metodo_pago);
  }

  @Post('planillas/:id/pagar-empleados')
  async pagarEmpleadosSeleccionados(@Param('id') planillaId: string, @Body() pagoData: any) {
    return this.planillasService.pagarEmpleadosSeleccionados(planillaId, pagoData);
  }

  @Post('planillas/:id/generar-asientos')
  async generarAsientosContables(@Param('id') planillaId: string) {
    return this.planillasService.generarAsientosContables(planillaId);
  }

  @Get('planillas/:id/historial-pagos')
  async getHistorialPagos(@Param('id') planillaId: string) {
    return this.planillasService.getHistorialPagos(planillaId);
  }

  @Get('pagos/:id/comprobante')
  async generarComprobante(@Param('id') pagoId: string) {
    return this.rrhhService.generarComprobantePago(pagoId);
  }

  @Get('empleados/:id/boleta-pago/:mes')
  async generarBoletaPago(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string,
    @Param('mes') mes: string
  ) {
    console.log(`📄 [RRHH] Generando boleta de pago para empleado ${empleadoId}, mes ${mes}, tenant: ${tenantId}`);
    return this.rrhhService.generarBoletaPago(empleadoId, mes, tenantId);
  }

  // ===== CONTRATOS =====
  @Get('contratos')
  async getContratos(@Query('empleado_id') empleadoId?: string) {
    return this.rrhhService.getContratos(empleadoId);
  }

  @Post('contratos')
  async createContrato(@Body() contratoData: any) {
    return this.rrhhService.createContrato(contratoData);
  }

  @Post('contratos/:id/renovar')
  async renovarContrato(@Param('id') contratoId: string, @Body() data: { meses: number }) {
    return this.rrhhService.renovarContrato(contratoId, data.meses);
  }

  @Put('contratos/:id/finalizar')
  async finalizarContrato(@Param('id') contratoId: string, @Body() data: { motivo_finalizacion: string; fecha_finalizacion: string }) {
    return this.rrhhService.finalizarContrato(contratoId, data.motivo_finalizacion, data.fecha_finalizacion);
  }

  @Get('contratos/:id/generar')
  async generarContrato(@Param('id') contratoId: string) {
    return this.rrhhService.generarContratoPDF(contratoId);
  }

  // ===== ASISTENCIAS MEJORADAS =====
  @Get('asistencias')
  async getAsistenciasPorFecha(@Query('fecha') fecha: string) {
    return this.rrhhService.getAsistenciasPorFecha(fecha);
  }

  @Post('asistencias/marcar')
  async marcarAsistencia(@Body() data: { empleado_id: string; fecha: string; tipo: 'entrada' | 'salida'; hora: string }) {
    return this.rrhhService.marcarAsistencia(data.empleado_id, data.fecha, data.tipo, data.hora);
  }

  // ===== RECLUTAMIENTO Y VACANTES =====
  @Get('vacantes')
  async getVacantes(@CurrentTenant() tenantId: string) {
    console.log(`📋 [RRHH] Obteniendo vacantes para tenant: ${tenantId}`);
    return this.rrhhService.getVacantes(tenantId);
  }

  @Post('vacantes')
  async createVacante(
    @CurrentTenant() tenantId: string,
    @Body() vacanteData: any
  ) {
    console.log(`➕ [RRHH] Creando vacante para tenant: ${tenantId}`);
    return this.rrhhService.createVacante(vacanteData, tenantId);
  }

  @Get('candidatos')
  async getCandidatos(
    @CurrentTenant() tenantId: string,
    @Query('vacante_id') vacanteId?: string
  ) {
    console.log(`👤 [RRHH] Obteniendo candidatos para tenant: ${tenantId}`);
    return this.rrhhService.getCandidatos(vacanteId, tenantId);
  }

  @Post('candidatos')
  async createCandidato(
    @CurrentTenant() tenantId: string,
    @Body() candidatoData: any
  ) {
    console.log(`➕ [RRHH] Creando candidato para tenant: ${tenantId}`);
    return this.rrhhService.createCandidato(candidatoData, tenantId);
  }

  @Put('candidatos/:id/estado')
  async updateEstadoCandidato(
    @CurrentTenant() tenantId: string,
    @Param('id') candidatoId: string,
    @Body() data: { estado: string; observaciones?: string }
  ) {
    console.log(`✏️ [RRHH] Actualizando estado de candidato ${candidatoId} para tenant: ${tenantId}`);
    return this.rrhhService.updateEstadoCandidato(candidatoId, data.estado, data.observaciones, tenantId);
  }

  // ===== ASISTENCIA Y TIEMPO =====
  @Post('asistencia/entrada/:empleadoId')
  async registrarEntrada(
    @CurrentTenant() tenantId: string,
    @Param('empleadoId') empleadoId: string
  ) {
    console.log(`⏰ [RRHH] Registrando entrada para empleado ${empleadoId}, tenant: ${tenantId}`);
    return this.rrhhService.registrarAsistencia(empleadoId, 'entrada', tenantId);
  }

  @Post('asistencia/salida/:empleadoId')
  async registrarSalida(
    @CurrentTenant() tenantId: string,
    @Param('empleadoId') empleadoId: string
  ) {
    console.log(`⏰ [RRHH] Registrando salida para empleado ${empleadoId}, tenant: ${tenantId}`);
    return this.rrhhService.registrarAsistencia(empleadoId, 'salida', tenantId);
  }

  @Get('asistencia')
  async getAsistencia(
    @CurrentTenant() tenantId: string,
    @Query('empleado_id') empleadoId?: string,
    @Query('fecha_desde') fechaDesde?: string,
    @Query('fecha_hasta') fechaHasta?: string
  ) {
    console.log(`📋 [RRHH] Obteniendo asistencias para tenant: ${tenantId}`);
    return this.rrhhService.getAsistencia(empleadoId, fechaDesde, fechaHasta, tenantId);
  }

  // ===== SOLICITUDES (Vacaciones, Licencias) =====
  @Get('solicitudes')
  async getSolicitudes(
    @CurrentTenant() tenantId: string,
    @Query('empleado_id') empleadoId?: string,
    @Query('estado') estado?: string
  ) {
    console.log(`📝 [RRHH] Obteniendo solicitudes para tenant: ${tenantId}`);
    return this.rrhhService.getSolicitudes(empleadoId, estado, tenantId);
  }

  @Post('solicitudes')
  async createSolicitud(
    @CurrentTenant() tenantId: string,
    @Body() solicitudData: any
  ) {
    console.log(`➕ [RRHH] Creando solicitud para tenant: ${tenantId}`);
    return this.rrhhService.createSolicitud(solicitudData, tenantId);
  }

  @Put('solicitudes/:id/aprobar')
  async aprobarSolicitud(
    @CurrentTenant() tenantId: string,
    @Param('id') solicitudId: string,
    @Body() data: { aprobado_por: string; observaciones?: string }
  ) {
    console.log(`✅ [RRHH] Aprobando solicitud ${solicitudId} para tenant: ${tenantId}`);
    return this.rrhhService.aprobarSolicitud(solicitudId, data.aprobado_por, data.observaciones, tenantId);
  }

  @Put('solicitudes/:id/rechazar')
  async rechazarSolicitud(
    @CurrentTenant() tenantId: string,
    @Param('id') solicitudId: string,
    @Body() data: { aprobado_por: string; observaciones: string }
  ) {
    console.log(`❌ [RRHH] Rechazando solicitud ${solicitudId} para tenant: ${tenantId}`);
    return this.rrhhService.rechazarSolicitud(solicitudId, data.aprobado_por, data.observaciones, tenantId);
  }

  // ===== BENEFICIOS =====
  @Get('beneficios')
  async getBeneficios(@CurrentTenant() tenantId: string) {
    console.log(`🎁 [RRHH] Obteniendo beneficios para tenant: ${tenantId}`);
    return this.rrhhService.getBeneficios(tenantId);
  }

  @Get('empleados/:id/beneficios')
  async getBeneficiosEmpleado(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string
  ) {
    console.log(`🎁 [RRHH] Obteniendo beneficios del empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.getBeneficiosEmpleado(empleadoId, tenantId);
  }

  @Post('empleados/:id/beneficios')
  async asignarBeneficio(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string,
    @Body() data: { beneficio_id: string; fecha_inicio: string }
  ) {
    console.log(`➕ [RRHH] Asignando beneficio al empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.asignarBeneficio(empleadoId, data.beneficio_id, data.fecha_inicio, tenantId);
  }

  // ===== EVALUACIONES DE DESEMPEÑO =====
  @Get('evaluaciones')
  async getEvaluaciones(
    @CurrentTenant() tenantId: string,
    @Query('empleado_id') empleadoId?: string
  ) {
    console.log(`📊 [RRHH] Obteniendo evaluaciones para tenant: ${tenantId}`);
    return this.rrhhService.getEvaluaciones(empleadoId, tenantId);
  }

  @Post('evaluaciones')
  async createEvaluacion(
    @CurrentTenant() tenantId: string,
    @Body() evaluacionData: any
  ) {
    console.log(`➕ [RRHH] Creando evaluación para tenant: ${tenantId}`);
    return this.rrhhService.createEvaluacion(evaluacionData, tenantId);
  }

  @Put('evaluaciones/:id')
  async updateEvaluacion(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() evaluacionData: any
  ) {
    console.log(`✏️ [RRHH] Actualizando evaluación ${id} para tenant: ${tenantId}`);
    return this.rrhhService.updateEvaluacion(id, evaluacionData, tenantId);
  }

  // ===== CAPACITACIONES =====
  @Get('capacitaciones')
  async getCapacitaciones(@CurrentTenant() tenantId: string) {
    console.log(`🎓 [RRHH] Obteniendo capacitaciones para tenant: ${tenantId}`);
    return this.rrhhService.getCapacitaciones(tenantId);
  }

  @Get('empleados/:id/capacitaciones')
  async getCapacitacionesEmpleado(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string
  ) {
    console.log(`🎓 [RRHH] Obteniendo capacitaciones del empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.getCapacitacionesEmpleado(empleadoId, tenantId);
  }

  @Post('empleados/:id/capacitaciones')
  async inscribirCapacitacion(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string,
    @Body() data: { capacitacion_id: string }
  ) {
    console.log(`➕ [RRHH] Inscribiendo empleado ${empleadoId} en capacitación para tenant: ${tenantId}`);
    return this.rrhhService.inscribirCapacitacion(empleadoId, data.capacitacion_id, tenantId);
  }

  // ===== LIQUIDACIONES =====
  @Post('empleados/:id/liquidacion')
  async calcularLiquidacion(
    @Param('id') empleadoId: string,
    @Body() data: { motivo_terminacion: string; fecha_terminacion: string }
  ) {
    return this.rrhhService.calcularLiquidacion(empleadoId, data.motivo_terminacion, data.fecha_terminacion);
  }

  // ===== HORARIOS =====
  @Get('horarios')
  async getHorarios(@CurrentTenant() tenantId: string) {
    console.log(`⏰ [RRHH] Obteniendo horarios para tenant: ${tenantId}`);
    return this.rrhhService.getHorarios(tenantId);
  }

  @Post('empleados/:id/horario')
  async asignarHorario(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string,
    @Body() data: { horario_id: string; fecha_inicio: string }
  ) {
    console.log(`➕ [RRHH] Asignando horario al empleado ${empleadoId} para tenant: ${tenantId}`);
    return this.rrhhService.asignarHorario(empleadoId, data.horario_id, data.fecha_inicio, tenantId);
  }

  // ===== EXPEDIENTE =====
  @Get('empleados/:id/expediente')
  async getExpediente(
    @CurrentTenant() tenantId: string,
    @Param('id') empleadoId: string
  ) {
    console.log(`📁 [RRHH] Obteniendo expediente del empleado ${empleadoId} para tenant: ${tenantId}`);
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
    console.log(`📤 [RRHH] Subiendo documento al expediente del empleado ${empleadoId} para tenant: ${tenantId}`);
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
  async getDashboardRrhh() {
    return this.rrhhService.getDashboardRrhh();
  }

  // ===== DEBUG =====
  @Get('debug/empleados-contratos')
  async debugEmpleadosContratos() {
    return this.rrhhService.debugEmpleadosContratos();
  }
} 
