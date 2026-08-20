import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Bodies de los endpoints de configuración que hasta ahora llegaban como `any`.
 *
 * Cada DTO declara exactamente los campos que el controlador lee; no se añaden
 * campos "por si acaso" porque el `ValidationPipe` global corre con
 * `forbidNonWhitelisted` y cualquier extra pasaría a 400.
 *
 * Los nombres mezclan camelCase y snake_case porque así los lee el handler y así
 * viajan hoy por el cable: renombrarlos sería romper el contrato, no tiparlo.
 */
export class ActualizarDatosEmpresaDto {
  @IsOptional() @IsString() @MaxLength(20) ruc?: string;
  @IsOptional() @IsString() @MaxLength(300) razonSocial?: string;
  @IsOptional() @IsString() @MaxLength(300) nombreComercial?: string;
  @IsOptional() @IsString() @MaxLength(500) direccion?: string;
  @IsOptional() @IsString() @MaxLength(20) ubigeo?: string;
  @IsOptional() @IsString() @MaxLength(150) departamento?: string;
  @IsOptional() @IsString() @MaxLength(150) provincia?: string;
  @IsOptional() @IsString() @MaxLength(150) distrito?: string;
  @IsOptional() @IsString() @MaxLength(60) telefono?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(300) sitioWeb?: string;
  @IsOptional() @IsString() @MaxLength(300) representanteLegal?: string;
  @IsOptional() @IsString() @MaxLength(20) dniRepresentante?: string;
  @IsOptional() @IsString() @MaxLength(100) regimen?: string;
  @IsOptional() @IsString() @MaxLength(300) actividadEconomica?: string;

  /** Porcentaje, no fracción: 18 significa 18 %. */
  @IsOptional() @IsNumber() @Min(0) @Max(100) igvPorcentaje?: number;

  @IsOptional() @IsString() @MaxLength(1000) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(60) tipo_empresa?: string;
  @IsOptional() @IsBoolean() usar_flujo_logistica?: boolean;
  @IsOptional() @IsBoolean() gre_obligatorio?: boolean;
  @IsOptional() @IsBoolean() gre_automatico_habilitado?: boolean;
  @IsOptional() @IsNumber() @Min(0) umbral_gre_automatico?: number;
}

export class ActualizarSerieDto {
  /** Si no llega, el handler cae al `:tipo` de la ruta. */
  @IsOptional() @IsString() @MaxLength(20) serie?: string;

  @IsOptional() @IsInt() @Min(0) correlativo_maximo?: number;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class ActualizarParametrosFacturacionDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) igv?: number;
  @IsOptional() @IsString() @MaxLength(10) monedaDefecto?: string;
  @IsOptional() @IsInt() @Min(0) @Max(6) redondeoDecimales?: number;
  @IsOptional() @IsBoolean() incluirIgvEnPrecio?: boolean;
  @IsOptional() @IsBoolean() envioAutomaticoSunat?: boolean;
  @IsOptional() @IsBoolean() generarPdfAutomatico?: boolean;
  @IsOptional() @IsBoolean() enviarEmailCliente?: boolean;
  @IsOptional() @IsBoolean() validarRucSunat?: boolean;
  @IsOptional() @IsBoolean() usarCodigosBarra?: boolean;
  /** Máscara de formato, p. ej. `#,##0.00`. No es un locale. */
  @IsOptional() @IsString() @MaxLength(40) formatoNumeros?: string;
}
