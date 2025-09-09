import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';
export declare class RrhhService {
    private readonly supabaseService;
    private readonly eventBus;
    constructor(supabaseService: SupabaseService, eventBus: EventBusService);
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
    updateEstadoCandidato(candidatoId: string, estado: string, observaciones?: string): Promise<{
        success: boolean;
        data: any;
    }>;
    registrarAsistencia(empleadoId: string, tipo: 'entrada' | 'salida'): Promise<{
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
    aprobarSolicitud(solicitudId: string, aprobadoPor: string, observaciones?: string): Promise<{
        success: boolean;
        data: any;
    }>;
    rechazarSolicitud(solicitudId: string, aprobadoPor: string, observaciones: string): Promise<{
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
    asignarBeneficio(empleadoId: string, beneficioId: string, fechaInicio: string): Promise<{
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
    inscribirCapacitacion(empleadoId: string, capacitacionId: string): Promise<{
        success: boolean;
        data: any;
    }>;
    calcularLiquidacion(empleadoId: string, motivoTerminacion: string, fechaTerminacion: string): Promise<{
        success: boolean;
        data: any;
    }>;
    private calcularVacacionesUsadas;
    private calcularDiasCts;
    getHorarios(): Promise<{
        success: boolean;
        data: any[];
    }>;
    asignarHorario(empleadoId: string, horarioId: string, fechaInicio: string): Promise<{
        success: boolean;
        data: any;
    }>;
    getExpediente(empleadoId: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    subirDocumento(empleadoId: string, tipoDocumento: string, nombreArchivo: string, archivoUrl: string, subidoPor: string): Promise<{
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
    getPagos(periodo?: string, empleadoId?: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    procesarPago(pagoId: string): Promise<{
        success: boolean;
        data: any;
    }>;
    generarComprobantePago(pagoId: string): Promise<{
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
    private generarBoletaHTML;
    getContratos(empleadoId?: string): Promise<any[]>;
    createContrato(contratoData: any): Promise<{
        success: boolean;
        data: any;
    }>;
    renovarContrato(contratoId: string, meses: number): Promise<{
        success: boolean;
        data: any;
    }>;
    finalizarContrato(contratoId: string, motivoFinalizacion: string, fechaFinalizacion: string): Promise<{
        success: boolean;
        data: any;
    }>;
    generarContratoPDF(contratoId: string): Promise<{
        success: boolean;
        message: string;
        download_url: string;
    }>;
    getAsistenciasPorFecha(fecha: string): Promise<any[]>;
    marcarAsistencia(empleadoId: string, fecha: string, tipo: 'entrada' | 'salida', hora: string): Promise<{
        success: boolean;
        data: any;
        message: string;
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
