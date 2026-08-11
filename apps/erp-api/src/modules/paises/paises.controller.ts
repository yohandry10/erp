import { 
  Controller, 
  Get, 
  Put, 
  Body, 
  Param, 
  Req, 
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaisesService } from './paises.service';
import { 
  PaisDto, 
  ConfiguracionFiscalDto, 
  UsuarioConfiguracionDto, 
  UpdateUsuarioConfiguracionDto,
  ConfiguracionPaisDto,
  ValidacionDocumentoDto,
  LibrosRequeridosDto
} from './paises.dto';
import { Request } from 'express';
import { ApiResponseWrapper } from '../../common/decorators/api-response-wrapper.decorator';
import { ResponseDto } from '../../common/dto/response.dto';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Controlador para la gestión de países y configuraciones fiscales
 * Implementa endpoints para:
 * - Consulta de países disponibles
 * - Configuraciones fiscales por jurisdicción
 * - Gestión de preferencias de usuario
 * - Validaciones específicas por país
 */
@ApiTags('paises')
@Controller('paises')
export class PaisesController {
  constructor(private readonly paisesService: PaisesService) {}

  // ========== ENDPOINTS PÚBLICOS (Datos de catálogo) ==========
  
  /**
   * Obtiene la lista completa de países disponibles en el sistema
   * Endpoint público para datos de catálogo
   */
  @Get()
  @Public()
  @ApiOperation({ 
    summary: 'Obtener lista de países disponibles',
    description: 'Retorna todos los países activos con sus configuraciones básicas'
  })
  @ApiResponseWrapper(PaisDto, { isArray: true })
  async obtenerPaises(): Promise<ResponseDto<PaisDto[]>> {
    const paises = await this.paisesService.obtenerPaises();
    return {
      success: true,
      data: paises,
      message: 'Países obtenidos exitosamente'
    };
  }

  /**
   * Obtiene la configuración fiscal específica de un país por su código ISO
   * Endpoint público para datos de catálogo
   */
  @Get(':codigo/configuracion-fiscal')
  @Public()
  @ApiOperation({ 
    summary: 'Obtener configuración fiscal por código de país',
    description: 'Retorna la configuración fiscal completa (impuestos, documentos, etc.) para un país específico'
  })
  @ApiResponseWrapper(ConfiguracionFiscalDto)
  async obtenerConfiguracionFiscal(
    @Param('codigo') codigo: string
  ): Promise<ResponseDto<ConfiguracionFiscalDto>> {
    const configuracion = await this.paisesService.obtenerConfiguracionPorCodigo(codigo);
    return {
      success: true,
      data: configuracion,
      message: 'Configuración fiscal obtenida exitosamente'
    };
  }

  /**
   * Obtiene los libros contables requeridos por la jurisdicción fiscal
   * Endpoint público para datos de catálogo
   */
  @Get(':codigo/libros-requeridos')
  @Public()
  @ApiOperation({ 
    summary: 'Obtener libros contables requeridos por país',
    description: 'Retorna la lista de libros contables obligatorios según la jurisdicción fiscal'
  })
  @ApiResponseWrapper(LibrosRequeridosDto)
  async obtenerLibrosRequeridos(
    @Param('codigo') codigo: string
  ): Promise<ResponseDto<LibrosRequeridosDto>> {
    const resultado = await this.paisesService.obtenerLibrosRequeridosPorCodigo(codigo);
    return {
      success: true,
      data: resultado,
      message: 'Libros requeridos obtenidos exitosamente'
    };
  }

  /**
   * Obtiene la configuración completa del país para renderizado dinámico de UI
   * Endpoint público para datos de catálogo
   */
  @Get(':id/configuracion')
  @Public()
  @ApiOperation({ 
    summary: 'Obtener configuración completa del país',
    description: 'Retorna toda la configuración necesaria para el renderizado dinámico de la interfaz'
  })
  @ApiResponseWrapper(ConfiguracionPaisDto)
  async obtenerConfiguracionCompleta(
    @Param('id', ParseIntPipe) id: number
  ): Promise<ResponseDto<ConfiguracionPaisDto>> {
    const configuracion = await this.paisesService.getConfiguracionPais(id);
    return {
      success: true,
      data: configuracion,
      message: 'Configuración del país obtenida exitosamente'
    };
  }

  // ========== ENDPOINTS AUTENTICADOS ==========
  
  /**
   * Obtiene la configuración de país del usuario autenticado
   */
  @Get('usuario/configuracion')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('paises.usuario.read') // HARDENING: lectura de configuración requiere permiso.
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Obtener configuración de país del usuario actual',
    description: 'Retorna las preferencias de país, idioma y zona horaria del usuario'
  })
  @ApiResponseWrapper(UsuarioConfiguracionDto)
  async obtenerConfiguracionUsuario(
    @Req() req: Request
  ): Promise<ResponseDto<UsuarioConfiguracionDto>> {
    const user = (req as any).user;
    const configuracion = await this.paisesService.obtenerOCrearConfiguracionUsuario(user.id);
    
    return {
      success: true,
      data: configuracion,
      message: 'Configuración de usuario obtenida exitosamente'
    };
  }

  /**
   * Actualiza la configuración de país del usuario autenticado
   */
  @Put('usuario/configuracion')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('paises.usuario.update') // HARDENING: actualización requiere permiso.
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Actualizar configuración de país del usuario',
    description: 'Permite al usuario cambiar su país preferido, idioma y zona horaria'
  })
  @ApiResponseWrapper(UsuarioConfiguracionDto)
  async actualizarConfiguracionUsuario(
    @Req() req: Request,
    @Body() configuracion: UpdateUsuarioConfiguracionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ResponseDto<UsuarioConfiguracionDto>> {
    const user = (req as any).user;
    const configuracionActualizada = await this.paisesService.actualizarConfiguracionUsuario(
      user.id,
      configuracion,
      user.id,
      idempotencyKey,
    );

    return {
      success: true,
      data: configuracionActualizada,
      message: 'Configuración de usuario actualizada exitosamente'
    };
  }

  // ========== UTILIDADES Y VALIDACIONES ==========
  
  /**
   * Valida un documento empresarial según las reglas del país
   * Endpoint público para validaciones de catálogo
   */
  @Get(':codigo/validar-documento/:documento')
  @Public()
  @ApiOperation({ 
    summary: 'Validar documento empresarial según país',
    description: 'Valida formato y estructura de documentos empresariales (RUC, NIT, etc.)'
  })
  @ApiResponseWrapper(ValidacionDocumentoDto)
  async validarDocumento(
    @Param('codigo') codigo: string,
    @Param('documento') documento: string
  ): Promise<ResponseDto<ValidacionDocumentoDto>> {
    const resultado = await this.paisesService.validarDocumentoPorCodigo(codigo, documento);
    
    return {
      success: true,
      data: resultado,
      message: resultado.es_valido ? 'Documento válido' : 'Documento inválido'
    };
  }
}
