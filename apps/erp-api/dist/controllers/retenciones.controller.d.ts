import { RetencionesService } from '../modules/retenciones/retenciones.service';
import { CreateRetencionDto, CalcularRetencionDto } from '../modules/retenciones/retenciones.types';
export declare class RetencionesController {
    private readonly retencionesService;
    constructor(retencionesService: RetencionesService);
    calcularRetencion(data: CalcularRetencionDto): Promise<{
        success: boolean;
        data: import("../modules/retenciones/retenciones.types").RetencionCalculada;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data?: undefined;
    }>;
    crearRetencion(data: CreateRetencionDto): Promise<{
        success: boolean;
        data: import("../modules/retenciones/retenciones.types").RetencionResponse;
        message: string;
    } | {
        success: boolean;
        message: any;
        data?: undefined;
    }>;
    getRetenciones(fechaDesde?: string, fechaHasta?: string, categoria?: string, proveedorId?: string): Promise<{
        success: boolean;
        data: {
            data: import("../modules/retenciones/retenciones.types").RetencionResponse[];
            total: number;
            page: number;
            totalPages: number;
        };
        total: number;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data?: undefined;
        total?: undefined;
    }>;
    getResumenRetenciones(fechaDesde: string, fechaHasta: string): Promise<{
        success: boolean;
        data: import("../modules/retenciones/retenciones.types").ResumenRetencionesResponse;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data?: undefined;
    }>;
    getRetencionById(id: string): Promise<{
        success: boolean;
        data: import("../modules/retenciones/retenciones.types").RetencionResponse;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data?: undefined;
    }>;
    anularRetencion(id: string, motivo: string): Promise<{
        success: boolean;
        message: any;
    }>;
}
