import { IsString, IsBoolean, IsOptional, IsNumber, IsUUID, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PaisDto {
  @ApiProperty({ description: 'ID del país' })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'Código ISO del país (PE, CO)', example: 'PE' })
  @IsString()
  codigo_iso: string;

  @ApiProperty({ description: 'Nombre del país', example: 'Perú' })
  @IsString()
  nombre: string;

  @ApiProperty({ description: 'Nombre de la entidad fiscal', example: 'SUNAT' })
  @IsString()
  nombre_fiscal: string;

  @ApiProperty({ description: 'Código de moneda', example: 'PEN' })
  @IsString()
  moneda_codigo: string;

  @ApiProperty({ description: 'Símbolo de moneda', example: 'S/' })
  @IsString()
  moneda_simbolo: string;

  @ApiProperty({ description: 'Estado activo del país' })
  @IsBoolean()
  activo: boolean;
}

export class ConfiguracionFiscalDto {
  @ApiProperty({ description: 'ID de configuración fiscal' })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'ID del país' })
  @IsNumber()
  pais_id: number;

  @ApiProperty({ description: 'Nombre del impuesto principal', example: 'IGV' })
  @IsString()
  impuesto_principal_nombre: string;

  @ApiProperty({ description: 'Porcentaje del impuesto principal', example: 18.00 })
  @IsNumber()
  impuesto_principal_porcentaje: number;

  @ApiProperty({ description: 'Documento de identidad empresarial', example: 'RUC' })
  @IsString()
  documento_identidad_empresa: string;

  @ApiProperty({ description: 'Longitud del documento empresarial', example: 11 })
  @IsNumber()
  longitud_documento_empresa: number;

  @ApiProperty({ description: 'Requiere Libro Mayor y Balances consolidado' })
  @IsBoolean()
  requiere_libro_mayor_balances: boolean;

  @ApiProperty({ description: 'Requiere libros societarios' })
  @IsBoolean()
  requiere_libros_societarios: boolean;

  @ApiProperty({ description: 'Requiere Libro Diario' })
  @IsBoolean()
  requiere_libro_diario: boolean;

  @ApiProperty({ description: 'Requiere Libro Mayor' })
  @IsBoolean()
  requiere_libro_mayor: boolean;

  @ApiProperty({ description: 'Requiere Libro de Inventarios' })
  @IsBoolean()
  requiere_libro_inventarios: boolean;

  @ApiProperty({ description: 'Requiere Libro de Compras' })
  @IsBoolean()
  requiere_libro_compras: boolean;

  @ApiProperty({ description: 'Requiere Libro de Ventas' })
  @IsBoolean()
  requiere_libro_ventas: boolean;

  @ApiProperty({ description: 'Requiere Kardex Valorizado' })
  @IsBoolean()
  requiere_kardex_valorizado: boolean;

  @ApiProperty({ description: 'Formato de fecha', example: 'DD/MM/YYYY' })
  @IsOptional()
  @IsString()
  formato_fecha?: string;

  @ApiProperty({ description: 'Separador decimal', example: '.' })
  @IsOptional()
  @IsString()
  separador_decimal?: string;

  @ApiProperty({ description: 'Separador de miles', example: ',' })
  @IsOptional()
  @IsString()
  separador_miles?: string;
}

export class UsuarioConfiguracionDto {
  @ApiProperty({ description: 'ID de configuración de usuario' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'ID del usuario' })
  @IsUUID()
  usuario_id: string;

  @ApiProperty({ description: 'ID del país preferido' })
  @IsOptional()
  @IsNumber()
  pais_preferido_id?: number;

  @ApiProperty({ description: 'Idioma preferido', example: 'es' })
  @IsOptional()
  @IsString()
  idioma?: string;

  @ApiProperty({ description: 'Zona horaria', example: 'America/Lima' })
  @IsOptional()
  @IsString()
  zona_horaria?: string;
}

export class UpdateUsuarioConfiguracionDto {
  @ApiProperty({ description: 'ID del país preferido' })
  @IsOptional()
  @IsNumber()
  pais_preferido_id?: number;

  @ApiProperty({ description: 'Idioma preferido', example: 'es' })
  @IsOptional()
  @IsString()
  idioma?: string;

  @ApiProperty({ description: 'Zona horaria', example: 'America/Lima' })
  @IsOptional()
  @IsString()
  zona_horaria?: string;
}

// ========== CONFIGURACIÓN DE UI DINÁMICA ==========
export class TipoDocumentoDto {
  @ApiProperty({ description: 'ID del tipo de documento' })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'Código del tipo de documento', example: '01' })
  @IsString()
  codigo: string;

  @ApiProperty({ description: 'Nombre del tipo de documento', example: 'Factura' })
  @IsString()
  nombre: string;

  @ApiProperty({ description: 'Descripción del documento' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ description: 'Requiere RUC/NIT del cliente' })
  @IsBoolean()
  requiere_ruc: boolean;

  @ApiProperty({ description: 'Permite exportación' })
  @IsBoolean()
  permite_exportacion: boolean;

  @ApiProperty({ description: 'Si está activo' })
  @IsBoolean()
  activo: boolean;
}

export class TipoImpuestoDto {
  @ApiProperty({ description: 'ID del tipo de impuesto' })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'Código del tipo de impuesto', example: 'IGV' })
  @IsString()
  codigo: string;

  @ApiProperty({ description: 'Nombre del impuesto', example: 'Impuesto General a las Ventas' })
  @IsString()
  nombre: string;

  @ApiProperty({ description: 'Porcentaje del impuesto', example: 18.00 })
  @IsNumber()
  porcentaje: number;

  @ApiProperty({ description: 'Tipo de cálculo', example: 'porcentaje' })
  @IsString()
  tipo_calculo: string;

  @ApiProperty({ description: 'Aplica a', example: 'venta' })
  @IsString()
  aplica_a: string;

  @ApiProperty({ description: 'Si está activo' })
  @IsBoolean()
  activo: boolean;
}

export class FormatoConfigDto {
  @ApiProperty({ description: 'Formato de fecha', example: 'DD/MM/YYYY' })
  @IsString()
  fecha: string;

  @ApiProperty({ description: 'Formato de moneda', example: '#,##0.00' })
  @IsString()
  moneda: string;

  @ApiProperty({ description: 'Separador decimal', example: '.' })
  @IsString()
  separador_decimal: string;

  @ApiProperty({ description: 'Separador de miles', example: ',' })
  @IsString()
  separador_miles: string;
}

export class EtiquetasConfigDto {
  @ApiProperty({ description: 'Etiqueta para documento de identidad', example: 'RUC' })
  @IsString()
  documento_identidad: string;

  @ApiProperty({ description: 'Etiqueta para impuesto principal', example: 'IGV' })
  @IsString()
  impuesto_principal: string;

  @ApiProperty({ description: 'Etiqueta para moneda', example: 'Soles' })
  @IsString()
  moneda: string;

  @ApiProperty({ description: 'Etiqueta para entidad fiscal', example: 'SUNAT' })
  @IsString()
  entidad_fiscal: string;
}

export class ReglasValidacionDto {
  @ApiProperty({ description: 'Longitud mínima del documento', example: 11 })
  @IsNumber()
  documento_min_length: number;

  @ApiProperty({ description: 'Longitud máxima del documento', example: 11 })
  @IsNumber()
  documento_max_length: number;

  @ApiProperty({ description: 'Patrón regex para validación', example: '^[0-9]+$' })
  @IsString()
  documento_pattern: string;

  @ApiProperty({ description: 'Mensaje de error personalizado' })
  @IsString()
  documento_error_message: string;
}

export class ConfiguracionPaisDto {
  @ApiProperty({ description: 'Información básica del país' })
  @ValidateNested()
  @Type(() => PaisDto)
  pais: PaisDto;

  @ApiProperty({ description: 'Configuración fiscal' })
  @ValidateNested()
  @Type(() => ConfiguracionFiscalDto)
  configuracion_fiscal: ConfiguracionFiscalDto;

  @ApiProperty({ description: 'Tipos de documentos disponibles', type: [TipoDocumentoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TipoDocumentoDto)
  tipos_documentos: TipoDocumentoDto[];

  @ApiProperty({ description: 'Tipos de impuestos disponibles', type: [TipoImpuestoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TipoImpuestoDto)
  tipos_impuestos: TipoImpuestoDto[];

  @ApiProperty({ description: 'Configuración de formatos' })
  @ValidateNested()
  @Type(() => FormatoConfigDto)
  formatos: FormatoConfigDto;

  @ApiProperty({ description: 'Etiquetas personalizadas' })
  @ValidateNested()
  @Type(() => EtiquetasConfigDto)
  etiquetas: EtiquetasConfigDto;

  @ApiProperty({ description: 'Reglas de validación' })
  @ValidateNested()
  @Type(() => ReglasValidacionDto)
  validaciones: ReglasValidacionDto;
}

export class ValidacionDocumentoDto {
  @ApiProperty({ description: 'Documento validado' })
  @IsString()
  documento: string;

  @ApiProperty({ description: 'Nombre del país' })
  @IsString()
  pais: string;

  @ApiProperty({ description: 'Tipo de documento', example: 'RUC' })
  @IsString()
  tipo_documento: string;

  @ApiProperty({ description: 'Longitud requerida del documento' })
  @IsNumber()
  longitud_requerida: number;

  @ApiProperty({ description: 'Si el documento es válido' })
  @IsBoolean()
  es_valido: boolean;

  @ApiProperty({ description: 'Mensaje de validación', required: false })
  @IsOptional()
  @IsString()
  mensaje?: string;
}

export class LibroContableDto {
  @ApiProperty({ description: 'ID del libro contable' })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'Código del libro', example: '5.1' })
  @IsString()
  codigo: string;

  @ApiProperty({ description: 'Nombre del libro', example: 'Libro Diario' })
  @IsString()
  nombre: string;

  @ApiProperty({ description: 'Descripción del libro' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ description: 'Si es obligatorio' })
  @IsBoolean()
  obligatorio: boolean;

  @ApiProperty({ description: 'Periodicidad', example: 'mensual' })
  @IsString()
  periodicidad: string;
}

export class LibrosRequeridosDto {
  @ApiProperty({ description: 'Nombre del país' })
  @IsString()
  pais: string;

  @ApiProperty({ description: 'Entidad fiscal', example: 'SUNAT' })
  @IsString()
  entidad_fiscal: string;

  @ApiProperty({ description: 'Lista de libros requeridos', type: [LibroContableDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LibroContableDto)
  libros_requeridos: LibroContableDto[];

  @ApiProperty({ description: 'Fecha de última actualización' })
  @IsOptional()
  @IsString()
  ultima_actualizacion?: string;
}