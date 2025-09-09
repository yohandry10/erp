"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RrhhController = void 0;
const common_1 = require("@nestjs/common");
const rrhh_service_1 = require("./rrhh.service");
const planillas_service_1 = require("./planillas.service");
let RrhhController = class RrhhController {
    constructor(rrhhService, planillasService) {
        this.rrhhService = rrhhService;
        this.planillasService = planillasService;
    }
    // ===== EMPLEADOS BÁSICOS =====
    async getEmpleados() {
        return this.rrhhService.getEmpleados();
    }
    async getDepartamentos() {
        return this.rrhhService.getDepartamentos();
    }
    async createEmpleado(empleadoData) {
        return this.rrhhService.createEmpleado(empleadoData);
    }
    async updateEmpleado(id, empleadoData) {
        return this.rrhhService.updateEmpleado(id, empleadoData);
    }
    async deleteEmpleado(id) {
        return this.rrhhService.deleteEmpleado(id);
    }
    async createDepartamento(departamentoData) {
        return this.rrhhService.createDepartamento(departamentoData);
    }
    // ===== PLANILLAS (EXISTENTE) =====
    async getPlanillas() {
        return this.planillasService.getPlanillas();
    }
    async crearPlanilla(planillaData) {
        console.log('Creando planilla con datos:', planillaData);
        return this.planillasService.crearPlanilla(planillaData);
    }
    async calcularPlanilla(planillaId) {
        return this.planillasService.calcularPlanillaMensual(planillaId);
    }
    async getDetallePlanilla(planillaId) {
        return this.planillasService.getDetallePlanilla(planillaId);
    }
    async getBoleta(empleadoPlanillaId) {
        return this.planillasService.getBoleta(empleadoPlanillaId);
    }
    async updatePlanilla(planillaId, updateData) {
        return this.planillasService.updatePlanilla(planillaId, updateData);
    }
    async deletePlanilla(planillaId) {
        console.log('🗑️ Eliminando planilla:', planillaId);
        return this.planillasService.deletePlanilla(planillaId);
    }
    async getConceptos() {
        return this.planillasService.getConceptos();
    }
    async calcularPlanillaPersonalizada(planillaId, empleadosData) {
        console.log('🧮 Calculando planilla personalizada:', planillaId);
        return this.planillasService.calcularPlanillaPersonalizada(planillaId, empleadosData.empleados);
    }
    // ===== PAGOS Y COMPROBANTES =====
    async getPagos(periodo, empleadoId) {
        return this.rrhhService.getPagos(periodo, empleadoId);
    }
    async procesarPago(pagoId) {
        return this.rrhhService.procesarPago(pagoId);
    }
    async generarComprobante(pagoId) {
        return this.rrhhService.generarComprobantePago(pagoId);
    }
    // ===== CONTRATOS =====
    async getContratos(empleadoId) {
        return this.rrhhService.getContratos(empleadoId);
    }
    async createContrato(contratoData) {
        return this.rrhhService.createContrato(contratoData);
    }
    async renovarContrato(contratoId, data) {
        return this.rrhhService.renovarContrato(contratoId, data.meses);
    }
    async finalizarContrato(contratoId, data) {
        return this.rrhhService.finalizarContrato(contratoId, data.motivo_finalizacion, data.fecha_finalizacion);
    }
    async generarContrato(contratoId) {
        return this.rrhhService.generarContratoPDF(contratoId);
    }
    // ===== ASISTENCIAS MEJORADAS =====
    async getAsistenciasPorFecha(fecha) {
        return this.rrhhService.getAsistenciasPorFecha(fecha);
    }
    async marcarAsistencia(data) {
        return this.rrhhService.marcarAsistencia(data.empleado_id, data.fecha, data.tipo, data.hora);
    }
    // ===== RECLUTAMIENTO Y VACANTES =====
    async getVacantes() {
        return this.rrhhService.getVacantes();
    }
    async createVacante(vacanteData) {
        return this.rrhhService.createVacante(vacanteData);
    }
    async getCandidatos(vacanteId) {
        return this.rrhhService.getCandidatos(vacanteId);
    }
    async createCandidato(candidatoData) {
        return this.rrhhService.createCandidato(candidatoData);
    }
    async updateEstadoCandidato(candidatoId, data) {
        return this.rrhhService.updateEstadoCandidato(candidatoId, data.estado, data.observaciones);
    }
    // ===== ASISTENCIA Y TIEMPO =====
    async registrarEntrada(empleadoId) {
        return this.rrhhService.registrarAsistencia(empleadoId, 'entrada');
    }
    async registrarSalida(empleadoId) {
        return this.rrhhService.registrarAsistencia(empleadoId, 'salida');
    }
    async getAsistencia(empleadoId, fechaDesde, fechaHasta) {
        return this.rrhhService.getAsistencia(empleadoId, fechaDesde, fechaHasta);
    }
    // ===== SOLICITUDES (Vacaciones, Licencias) =====
    async getSolicitudes(empleadoId, estado) {
        return this.rrhhService.getSolicitudes(empleadoId, estado);
    }
    async createSolicitud(solicitudData) {
        return this.rrhhService.createSolicitud(solicitudData);
    }
    async aprobarSolicitud(solicitudId, data) {
        return this.rrhhService.aprobarSolicitud(solicitudId, data.aprobado_por, data.observaciones);
    }
    async rechazarSolicitud(solicitudId, data) {
        return this.rrhhService.rechazarSolicitud(solicitudId, data.aprobado_por, data.observaciones);
    }
    // ===== BENEFICIOS =====
    async getBeneficios() {
        return this.rrhhService.getBeneficios();
    }
    async getBeneficiosEmpleado(empleadoId) {
        return this.rrhhService.getBeneficiosEmpleado(empleadoId);
    }
    async asignarBeneficio(empleadoId, data) {
        return this.rrhhService.asignarBeneficio(empleadoId, data.beneficio_id, data.fecha_inicio);
    }
    // ===== EVALUACIONES DE DESEMPEÑO =====
    async getEvaluaciones(empleadoId) {
        return this.rrhhService.getEvaluaciones(empleadoId);
    }
    async createEvaluacion(evaluacionData) {
        return this.rrhhService.createEvaluacion(evaluacionData);
    }
    async updateEvaluacion(id, evaluacionData) {
        return this.rrhhService.updateEvaluacion(id, evaluacionData);
    }
    // ===== CAPACITACIONES =====
    async getCapacitaciones() {
        return this.rrhhService.getCapacitaciones();
    }
    async getCapacitacionesEmpleado(empleadoId) {
        return this.rrhhService.getCapacitacionesEmpleado(empleadoId);
    }
    async inscribirCapacitacion(empleadoId, data) {
        return this.rrhhService.inscribirCapacitacion(empleadoId, data.capacitacion_id);
    }
    // ===== LIQUIDACIONES =====
    async calcularLiquidacion(empleadoId, data) {
        return this.rrhhService.calcularLiquidacion(empleadoId, data.motivo_terminacion, data.fecha_terminacion);
    }
    // ===== HORARIOS =====
    async getHorarios() {
        return this.rrhhService.getHorarios();
    }
    async asignarHorario(empleadoId, data) {
        return this.rrhhService.asignarHorario(empleadoId, data.horario_id, data.fecha_inicio);
    }
    // ===== EXPEDIENTE =====
    async getExpediente(empleadoId) {
        return this.rrhhService.getExpediente(empleadoId);
    }
    async subirDocumento(empleadoId, data) {
        return this.rrhhService.subirDocumento(empleadoId, data.tipo_documento, data.nombre_archivo, data.archivo_url, data.subido_por);
    }
    // ===== DASHBOARD Y REPORTES =====
    async getDashboardRrhh() {
        return this.rrhhService.getDashboardRrhh();
    }
    // ===== DEBUG =====
    async debugEmpleadosContratos() {
        return this.rrhhService.debugEmpleadosContratos();
    }
};
exports.RrhhController = RrhhController;
__decorate([
    (0, common_1.Get)('empleados'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getEmpleados", null);
__decorate([
    (0, common_1.Get)('departamentos'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getDepartamentos", null);
__decorate([
    (0, common_1.Post)('empleados'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "createEmpleado", null);
__decorate([
    (0, common_1.Put)('empleados/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "updateEmpleado", null);
__decorate([
    (0, common_1.Delete)('empleados/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "deleteEmpleado", null);
__decorate([
    (0, common_1.Post)('departamentos'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "createDepartamento", null);
__decorate([
    (0, common_1.Get)('planillas'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getPlanillas", null);
__decorate([
    (0, common_1.Post)('planillas'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "crearPlanilla", null);
__decorate([
    (0, common_1.Post)('planillas/:id/calcular'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "calcularPlanilla", null);
__decorate([
    (0, common_1.Get)('planillas/:id/detalle'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getDetallePlanilla", null);
__decorate([
    (0, common_1.Get)('boleta/:empleadoPlanillaId'),
    __param(0, (0, common_1.Param)('empleadoPlanillaId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getBoleta", null);
__decorate([
    (0, common_1.Put)('planillas/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "updatePlanilla", null);
__decorate([
    (0, common_1.Delete)('planillas/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "deletePlanilla", null);
__decorate([
    (0, common_1.Get)('conceptos'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getConceptos", null);
__decorate([
    (0, common_1.Post)('planillas/:id/calcular-personalizada'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "calcularPlanillaPersonalizada", null);
__decorate([
    (0, common_1.Get)('pagos'),
    __param(0, (0, common_1.Query)('periodo')),
    __param(1, (0, common_1.Query)('empleado_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getPagos", null);
__decorate([
    (0, common_1.Put)('pagos/:id/procesar'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "procesarPago", null);
__decorate([
    (0, common_1.Get)('pagos/:id/comprobante'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "generarComprobante", null);
__decorate([
    (0, common_1.Get)('contratos'),
    __param(0, (0, common_1.Query)('empleado_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getContratos", null);
__decorate([
    (0, common_1.Post)('contratos'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "createContrato", null);
__decorate([
    (0, common_1.Post)('contratos/:id/renovar'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "renovarContrato", null);
__decorate([
    (0, common_1.Put)('contratos/:id/finalizar'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "finalizarContrato", null);
__decorate([
    (0, common_1.Get)('contratos/:id/generar'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "generarContrato", null);
__decorate([
    (0, common_1.Get)('asistencias'),
    __param(0, (0, common_1.Query)('fecha')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getAsistenciasPorFecha", null);
__decorate([
    (0, common_1.Post)('asistencias/marcar'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "marcarAsistencia", null);
__decorate([
    (0, common_1.Get)('vacantes'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getVacantes", null);
__decorate([
    (0, common_1.Post)('vacantes'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "createVacante", null);
__decorate([
    (0, common_1.Get)('candidatos'),
    __param(0, (0, common_1.Query)('vacante_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getCandidatos", null);
__decorate([
    (0, common_1.Post)('candidatos'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "createCandidato", null);
__decorate([
    (0, common_1.Put)('candidatos/:id/estado'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "updateEstadoCandidato", null);
__decorate([
    (0, common_1.Post)('asistencia/entrada/:empleadoId'),
    __param(0, (0, common_1.Param)('empleadoId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "registrarEntrada", null);
__decorate([
    (0, common_1.Post)('asistencia/salida/:empleadoId'),
    __param(0, (0, common_1.Param)('empleadoId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "registrarSalida", null);
__decorate([
    (0, common_1.Get)('asistencia'),
    __param(0, (0, common_1.Query)('empleado_id')),
    __param(1, (0, common_1.Query)('fecha_desde')),
    __param(2, (0, common_1.Query)('fecha_hasta')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getAsistencia", null);
__decorate([
    (0, common_1.Get)('solicitudes'),
    __param(0, (0, common_1.Query)('empleado_id')),
    __param(1, (0, common_1.Query)('estado')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getSolicitudes", null);
__decorate([
    (0, common_1.Post)('solicitudes'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "createSolicitud", null);
__decorate([
    (0, common_1.Put)('solicitudes/:id/aprobar'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "aprobarSolicitud", null);
__decorate([
    (0, common_1.Put)('solicitudes/:id/rechazar'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "rechazarSolicitud", null);
__decorate([
    (0, common_1.Get)('beneficios'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getBeneficios", null);
__decorate([
    (0, common_1.Get)('empleados/:id/beneficios'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getBeneficiosEmpleado", null);
__decorate([
    (0, common_1.Post)('empleados/:id/beneficios'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "asignarBeneficio", null);
__decorate([
    (0, common_1.Get)('evaluaciones'),
    __param(0, (0, common_1.Query)('empleado_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getEvaluaciones", null);
__decorate([
    (0, common_1.Post)('evaluaciones'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "createEvaluacion", null);
__decorate([
    (0, common_1.Put)('evaluaciones/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "updateEvaluacion", null);
__decorate([
    (0, common_1.Get)('capacitaciones'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getCapacitaciones", null);
__decorate([
    (0, common_1.Get)('empleados/:id/capacitaciones'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getCapacitacionesEmpleado", null);
__decorate([
    (0, common_1.Post)('empleados/:id/capacitaciones'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "inscribirCapacitacion", null);
__decorate([
    (0, common_1.Post)('empleados/:id/liquidacion'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "calcularLiquidacion", null);
__decorate([
    (0, common_1.Get)('horarios'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getHorarios", null);
__decorate([
    (0, common_1.Post)('empleados/:id/horario'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "asignarHorario", null);
__decorate([
    (0, common_1.Get)('empleados/:id/expediente'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getExpediente", null);
__decorate([
    (0, common_1.Post)('empleados/:id/expediente'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "subirDocumento", null);
__decorate([
    (0, common_1.Get)('dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "getDashboardRrhh", null);
__decorate([
    (0, common_1.Get)('debug/empleados-contratos'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RrhhController.prototype, "debugEmpleadosContratos", null);
exports.RrhhController = RrhhController = __decorate([
    (0, common_1.Controller)('rrhh'),
    __metadata("design:paramtypes", [rrhh_service_1.RrhhService,
        planillas_service_1.PlanillasService])
], RrhhController);
