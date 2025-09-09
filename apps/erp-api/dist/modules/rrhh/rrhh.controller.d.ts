import { RrhhService } from './rrhh.service';
import { PlanillasService } from './planillas.service';
export declare class RrhhController {
    private readonly rrhhService;
    private readonly planillasService;
    constructor(rrhhService: RrhhService, planillasService: PlanillasService);
    getEmpleados(): Promise<{
        success: boolean;
        data: any[];
    }>;
    getDepartamentos(): Promise<any[]>;
    createEmpleado(empleadoData: any): Promise<any>;
    updateEmpleado(id: string, empleadoData: any): Promise<any>;
    deleteEmpleado(id: string): Promise<{
        success: boolean;
        message: string;
    }>;
    createDepartamento(departamentoData: any): Promise<any>;
    getPlanillas(): Promise<{
        success: boolean;
        data: any[];
    }>;
    crearPlanilla(planillaData: any): Promise<any>;
    calcularPlanilla(planillaId: string): Promise<{
        success: boolean;
        totalEmpleados: number;
        totalIngresos: number;
        totalDescuentos: number;
        totalNeto: number;
    }>;
    getDetallePlanilla(planillaId: string): Promise<any[]>;
    getBoleta(empleadoPlanillaId: string): Promise<any>;
    updatePlanilla(planillaId: string, updateData: any): Promise<any>;
    deletePlanilla(planillaId: string): Promise<{
        success: boolean;
        message: string;
        deletedPlanilla: any;
    }>;
    getConceptos(): Promise<{
        success: boolean;
        data: any[];
    }>;
    calcularPlanillaPersonalizada(planillaId: string, empleadosData: any): Promise<{
        success: boolean;
        totalEmpleados: number;
        totalIngresos: number;
        totalDescuentos: number;
        totalNeto: number;
    }>;
    getPagos(periodo?: string, empleadoId?: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    procesarPago(pagoId: string): Promise<{
        success: boolean;
        data: any;
    }>;
    pagarPlanillaCompleta(planillaId: string, pagoData: {
        metodo_pago: 'efectivo' | 'transferencia';
    }): Promise<{
        success: boolean;
        message: string;
        data: {
            planillaId: string;
            periodo: any;
            totalPagado: number;
            empleadosPagados: number;
            metodoPago: "transferencia" | "efectivo";
            pagos: any[];
        };
    }>;
    pagarEmpleadosSeleccionados(planillaId: string, pagoData: any): Promise<{
        success: boolean;
        message: string;
        data: {
            empleados_pagados: number;
            total_pagado: number;
            metodo_pago: any;
            asientos_generados: boolean;
        };
    }>;
    generarAsientosContables(planillaId: string): Promise<{
        success: boolean;
        message: string;
        data: {
            numero_asiento: string;
            asiento_id: any;
            registros: number;
            monto_total: any;
            planilla_periodo: any;
            tablas_utilizadas: string[];
        };
    }>;
    getHistorialPagos(planillaId: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    generarComprobante(pagoId: string): Promise<{
        success: boolean;
        message: string;
        download_url: string;
    }>;
    generarBoletaPago(empleadoId: string, mes: string): Promise<{
        success: boolean;
        message: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            empleado: string;
            mes: string;
            totalPagos: number;
            totalNeto: any;
            boleta_html: string;
        };
        message: string;
    }>;
    getContratos(empleadoId?: string): Promise<any[]>;
    createContrato(contratoData: any): Promise<{
        success: boolean;
        data: any;
    }>;
    renovarContrato(contratoId: string, data: {
        meses: number;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    finalizarContrato(contratoId: string, data: {
        motivo_finalizacion: string;
        fecha_finalizacion: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    generarContrato(contratoId: string): Promise<{
        success: boolean;
        message: string;
        download_url: string;
    }>;
    getAsistenciasPorFecha(fecha: string): Promise<any[]>;
    marcarAsistencia(data: {
        empleado_id: string;
        fecha: string;
        tipo: 'entrada' | 'salida';
        hora: string;
    }): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    getVacantes(): Promise<{
        success: boolean;
        data: any[];
    }>;
    createVacante(vacanteData: any): Promise<{
        success: boolean;
        data: any;
    }>;
    getCandidatos(vacanteId?: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    createCandidato(candidatoData: any): Promise<{
        success: boolean;
        data: any;
    }>;
    updateEstadoCandidato(candidatoId: string, data: {
        estado: string;
        observaciones?: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    registrarEntrada(empleadoId: string): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    registrarSalida(empleadoId: string): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    getAsistencia(empleadoId?: string, fechaDesde?: string, fechaHasta?: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    getSolicitudes(empleadoId?: string, estado?: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    createSolicitud(solicitudData: any): Promise<{
        success: boolean;
        data: any;
    }>;
    aprobarSolicitud(solicitudId: string, data: {
        aprobado_por: string;
        observaciones?: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    rechazarSolicitud(solicitudId: string, data: {
        aprobado_por: string;
        observaciones: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getBeneficios(): Promise<{
        success: boolean;
        data: any[];
    }>;
    getBeneficiosEmpleado(empleadoId: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    asignarBeneficio(empleadoId: string, data: {
        beneficio_id: string;
        fecha_inicio: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getEvaluaciones(empleadoId?: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    createEvaluacion(evaluacionData: any): Promise<{
        success: boolean;
        data: any;
    }>;
    updateEvaluacion(id: string, evaluacionData: any): Promise<{
        success: boolean;
        data: any;
    }>;
    getCapacitaciones(): Promise<{
        success: boolean;
        data: any[];
    }>;
    getCapacitacionesEmpleado(empleadoId: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    inscribirCapacitacion(empleadoId: string, data: {
        capacitacion_id: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    calcularLiquidacion(empleadoId: string, data: {
        motivo_terminacion: string;
        fecha_terminacion: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getHorarios(): Promise<{
        success: boolean;
        data: any[];
    }>;
    asignarHorario(empleadoId: string, data: {
        horario_id: string;
        fecha_inicio: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getExpediente(empleadoId: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    subirDocumento(empleadoId: string, data: {
        tipo_documento: string;
        nombre_archivo: string;
        archivo_url: string;
        subido_por: string;
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getDashboardRrhh(): Promise<{
        success: boolean;
        data: {
            empleadosActivos: number;
            solicitudesPendientes: number;
            evaluacionesPendientes: number;
            proximosCumpleanos: {
                nombres: any;
                apellidos: any;
                fecha_nacimiento: any;
            }[];
        };
    }>;
    debugEmpleadosContratos(): Promise<{
        totalEmpleados: number;
        totalContratos: number;
        empleadosConContratosCount: number;
        empleados: any[];
        contratos: any[];
        empleadosConContratos: any[];
    }>;
}
