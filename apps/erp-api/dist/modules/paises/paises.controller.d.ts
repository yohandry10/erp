import { PaisesService } from './paises.service';
import { PaisDto, ConfiguracionFiscalDto, UsuarioConfiguracionDto, UpdateUsuarioConfiguracionDto, ConfiguracionPaisDto, ValidacionDocumentoDto, LibrosRequeridosDto } from './paises.dto';
import { Request } from 'express';
import { ResponseDto } from '../../common/dto/response.dto';
export declare class PaisesController {
    private readonly paisesService;
    constructor(paisesService: PaisesService);
    obtenerPaises(): Promise<ResponseDto<PaisDto[]>>;
    obtenerConfiguracionFiscal(codigo: string): Promise<ResponseDto<ConfiguracionFiscalDto>>;
    obtenerLibrosRequeridos(codigo: string): Promise<ResponseDto<LibrosRequeridosDto>>;
    obtenerConfiguracionCompleta(id: number): Promise<ResponseDto<ConfiguracionPaisDto>>;
    obtenerConfiguracionUsuario(req: Request): Promise<ResponseDto<UsuarioConfiguracionDto>>;
    actualizarConfiguracionUsuario(req: Request, configuracion: UpdateUsuarioConfiguracionDto): Promise<ResponseDto<UsuarioConfiguracionDto>>;
    validarDocumento(codigo: string, documento: string): Promise<ResponseDto<ValidacionDocumentoDto>>;
}
