import { SupabaseService } from '../shared/supabase/supabase.service';
export declare class UsuariosController {
    private readonly supabaseService;
    constructor(supabaseService: SupabaseService);
    getUsuarios(req: any, rol?: string, estado?: string): Promise<{
        success: boolean;
        data: any[];
        total: number;
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
        total?: undefined;
    }>;
    getStats(req: any): Promise<{
        success: boolean;
        data: {
            totalUsuarios: number;
            usuariosActivos: number;
            usuariosInactivos: number;
            totalRoles: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
    getRoles(req: any): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        data: any[];
        error: any;
    }>;
    crearUsuario(usuarioData: any, req: any): Promise<{
        success: boolean;
        data: any;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    actualizarUsuario(id: string, usuarioData: any, req: any): Promise<{
        success: boolean;
        data: any;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    cambiarEstado(id: string, estadoData: {
        estado: string;
    }, req: any): Promise<{
        success: boolean;
        data: any;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
        message?: undefined;
    }>;
    eliminarUsuario(id: string, req: any): Promise<{
        success: boolean;
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
    }>;
    getUsuario(id: string, req: any): Promise<{
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        data: any;
        error: any;
    }>;
}
