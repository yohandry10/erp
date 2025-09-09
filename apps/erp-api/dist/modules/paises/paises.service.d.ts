import { SupabaseService } from '../../shared/supabase/supabase.service';
import { PaisDto, ConfiguracionFiscalDto, UsuarioConfiguracionDto, UpdateUsuarioConfiguracionDto, ConfiguracionPaisDto, ValidacionDocumentoDto, LibrosRequeridosDto } from './paises.dto';
export declare class PaisesService {
    private readonly supabaseService;
    private readonly logger;
    constructor(supabaseService: SupabaseService);
    obtenerPaises(): Promise<PaisDto[]>;
    obtenerPaisPorCodigo(codigoIso: string): Promise<PaisDto>;
    obtenerConfiguracionFiscal(paisId: number): Promise<ConfiguracionFiscalDto>;
    obtenerConfiguracionPorCodigo(codigoIso: string): Promise<ConfiguracionFiscalDto>;
    obtenerConfiguracionUsuario(usuarioId: string): Promise<UsuarioConfiguracionDto | null>;
    actualizarConfiguracionUsuario(usuarioId: string, configuracion: UpdateUsuarioConfiguracionDto): Promise<UsuarioConfiguracionDto>;
    validarDocumentoEmpresa(documento: string, paisId: number): Promise<boolean>;
    obtenerLibrosRequeridos(paisId: number): Promise<string[]>;
    getConfiguracionPais(paisId: number): Promise<ConfiguracionPaisDto>;
    obtenerOCrearConfiguracionUsuario(usuarioId: string): Promise<UsuarioConfiguracionDto>;
    obtenerLibrosRequeridosPorCodigo(codigo: string): Promise<LibrosRequeridosDto>;
    validarDocumentoPorCodigo(codigo: string, documento: string): Promise<ValidacionDocumentoDto>;
}
