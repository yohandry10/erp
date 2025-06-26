import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { RrhhService } from './rrhh.service';
import { PlanillasService } from './planillas.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('rrhh')
export class RrhhController {
  constructor(
    private readonly rrhhService: RrhhService,
    private readonly planillasService: PlanillasService
  ) {}

  // ===== EMPLEADOS BÁSICOS =====
  @Get('empleados')
  async getEmpleados() {
    return this.rrhhService.getEmpleados();
  }

  @Get('departamentos')
  async getDepartamentos() {
    return this.rrhhService.getDepartamentos();
  }

  @Post('empleados')
  async createEmpleado(@Body() empleadoData: any) {
    return this.rrhhService.createEmpleado(empleadoData);
  }

  @Put('empleados/:id')
  async updateEmpleado(@Param('id') id: string, @Body() empleadoData: any) {
    return this.rrhhService.updateEmpleado(id, empleadoData);
  }

  @Delete('empleados/:id')
  async deleteEmpleado(@Param('id') id: string) {
    return this.rrhhService.deleteEmpleado(id);
  }

  @Post('departamentos')
  async createDepartamento(@Body() departamentoData: any) {
    return this.rrhhService.createDepartamento(departamentoData);
  }

  // ===== PLANILLAS (EXISTENTE) =====
  @Get('planillas')
  async getPlanillas() {
    return this.planillasService.getPlanillas();
  }

  @Post('planillas')
  async crearPlanilla(@Body() planillaData: any) {
    console.log('Creando planilla con datos:', planillaData);
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
  async getPagos(@Query('periodo') periodo?: string, @Query('empleado_id') empleadoId?: string) {
    return this.rrhhService.getPagos(periodo, empleadoId);
  }

  @Put('pagos/:id/procesar')
  async procesarPago(@Param('id') pagoId: string) {
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
  async generarBoletaPago(@Param('id') empleadoId: string, @Param('mes') mes: string) {
    console.log(`📄 Generando boleta de pago para empleado ${empleadoId}, mes ${mes}`);
    return this.rrhhService.generarBoletaPago(empleadoId, mes);
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
  async getVacantes() {
    return this.rrhhService.getVacantes();
  }

  @Post('vacantes')
  async createVacante(@Body() vacanteData: any) {
    return this.rrhhService.createVacante(vacanteData);
  }

  @Get('candidatos')
  async getCandidatos(@Query('vacante_id') vacanteId?: string) {
    return this.rrhhService.getCandidatos(vacanteId);
  }

  @Post('candidatos')
  async createCandidato(@Body() candidatoData: any) {
    return this.rrhhService.createCandidato(candidatoData);
  }

  @Put('candidatos/:id/estado')
  async updateEstadoCandidato(
    @Param('id') candidatoId: string, 
    @Body() data: { estado: string; observaciones?: string }
  ) {
    return this.rrhhService.updateEstadoCandidato(candidatoId, data.estado, data.observaciones);
  }

  // ===== ASISTENCIA Y TIEMPO =====
  @Post('asistencia/entrada/:empleadoId')
  async registrarEntrada(@Param('empleadoId') empleadoId: string) {
    return this.rrhhService.registrarAsistencia(empleadoId, 'entrada');
  }

  @Post('asistencia/salida/:empleadoId')
  async registrarSalida(@Param('empleadoId') empleadoId: string) {
    return this.rrhhService.registrarAsistencia(empleadoId, 'salida');
  }

  @Get('asistencia')
  async getAsistencia(
    @Query('empleado_id') empleadoId?: string,
    @Query('fecha_desde') fechaDesde?: string,
    @Query('fecha_hasta') fechaHasta?: string
  ) {
    return this.rrhhService.getAsistencia(empleadoId, fechaDesde, fechaHasta);
  }

  // ===== SOLICITUDES (Vacaciones, Licencias) =====
  @Get('solicitudes')
  async getSolicitudes(
    @Query('empleado_id') empleadoId?: string,
    @Query('estado') estado?: string
  ) {
    return this.rrhhService.getSolicitudes(empleadoId, estado);
  }

  @Post('solicitudes')
  async createSolicitud(@Body() solicitudData: any) {
    return this.rrhhService.createSolicitud(solicitudData);
  }

  @Put('solicitudes/:id/aprobar')
  async aprobarSolicitud(
    @Param('id') solicitudId: string,
    @Body() data: { aprobado_por: string; observaciones?: string }
  ) {
    return this.rrhhService.aprobarSolicitud(solicitudId, data.aprobado_por, data.observaciones);
  }

  @Put('solicitudes/:id/rechazar')
  async rechazarSolicitud(
    @Param('id') solicitudId: string,
    @Body() data: { aprobado_por: string; observaciones: string }
  ) {
    return this.rrhhService.rechazarSolicitud(solicitudId, data.aprobado_por, data.observaciones);
  }

  // ===== BENEFICIOS =====
  @Get('beneficios')
  async getBeneficios() {
    return this.rrhhService.getBeneficios();
  }

  @Get('empleados/:id/beneficios')
  async getBeneficiosEmpleado(@Param('id') empleadoId: string) {
    return this.rrhhService.getBeneficiosEmpleado(empleadoId);
  }

  @Post('empleados/:id/beneficios')
  async asignarBeneficio(
    @Param('id') empleadoId: string,
    @Body() data: { beneficio_id: string; fecha_inicio: string }
  ) {
    return this.rrhhService.asignarBeneficio(empleadoId, data.beneficio_id, data.fecha_inicio);
  }

  // ===== EVALUACIONES DE DESEMPEÑO =====
  @Get('evaluaciones')
  async getEvaluaciones(@Query('empleado_id') empleadoId?: string) {
    return this.rrhhService.getEvaluaciones(empleadoId);
  }

  @Post('evaluaciones')
  async createEvaluacion(@Body() evaluacionData: any) {
    return this.rrhhService.createEvaluacion(evaluacionData);
  }

  @Put('evaluaciones/:id')
  async updateEvaluacion(@Param('id') id: string, @Body() evaluacionData: any) {
    return this.rrhhService.updateEvaluacion(id, evaluacionData);
  }

  // ===== CAPACITACIONES =====
  @Get('capacitaciones')
  async getCapacitaciones() {
    return this.rrhhService.getCapacitaciones();
  }

  @Get('empleados/:id/capacitaciones')
  async getCapacitacionesEmpleado(@Param('id') empleadoId: string) {
    return this.rrhhService.getCapacitacionesEmpleado(empleadoId);
  }

  @Post('empleados/:id/capacitaciones')
  async inscribirCapacitacion(
    @Param('id') empleadoId: string,
    @Body() data: { capacitacion_id: string }
  ) {
    return this.rrhhService.inscribirCapacitacion(empleadoId, data.capacitacion_id);
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
  async getHorarios() {
    return this.rrhhService.getHorarios();
  }

  @Post('empleados/:id/horario')
  async asignarHorario(
    @Param('id') empleadoId: string,
    @Body() data: { horario_id: string; fecha_inicio: string }
  ) {
    return this.rrhhService.asignarHorario(empleadoId, data.horario_id, data.fecha_inicio);
  }

  // ===== EXPEDIENTE =====
  @Get('empleados/:id/expediente')
  async getExpediente(@Param('id') empleadoId: string) {
    return this.rrhhService.getExpediente(empleadoId);
  }

  @Post('empleados/:id/expediente')
  async subirDocumento(
    @Param('id') empleadoId: string,
    @Body() data: { 
      tipo_documento: string;
      nombre_archivo: string;
      archivo_url: string;
      subido_por: string;
    }
  ) {
    return this.rrhhService.subirDocumento(
      empleadoId,
      data.tipo_documento,
      data.nombre_archivo,
      data.archivo_url,
      data.subido_por
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