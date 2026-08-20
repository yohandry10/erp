import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Configuración laboral por país.
 *
 * Los campos replican los conjuntos `permitidos` que `RrhhService` ya aplicaba
 * sobre el body: esa filtración protegía la escritura pero dejaba pasar
 * cualquier tipo, de modo que una tasa podía llegar como texto y sólo fallaba
 * más adentro. Aquí se fija la forma; las reglas que dependen del país del
 * tenant —que el tenant sea argentino, que el CUIT de la ART sea válido, que la
 * alícuota sea mayor que cero— siguen en el servicio.
 *
 * `metadata` queda como objeto libre a propósito: es el saco declarado para lo
 * que cada empleador necesite guardar sin cambiar el esquema.
 */
export class ConfiguracionLaboralArgentinaDto {
  @IsOptional() @IsString() @MaxLength(60) tipo_empleador?: string;
  @IsOptional() @IsString() @MaxLength(120) jurisdiccion_laboral?: string;
  @IsOptional() @IsString() @MaxLength(20) actividad_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) convenio_colectivo_codigo?: string;
  @IsOptional() @IsString() @MaxLength(300) convenio_colectivo_descripcion?: string;
  @IsOptional() @IsString() @MaxLength(120) categoria_default?: string;
  @IsOptional() @IsString() @MaxLength(20) art_cuit?: string;
  @IsOptional() @IsString() @MaxLength(300) art_razon_social?: string;
  @IsOptional() @IsNumber() @Min(0) art_tasa?: number;
  @IsOptional() @IsString() @MaxLength(30) obra_social_codigo_default?: string;
  @IsOptional() @IsString() @MaxLength(30) sindicato_codigo_default?: string;
  @IsOptional() @IsNumber() @Min(0) sindicato_aporte_default?: number;
  @IsOptional() @IsNumber() @Min(0) contribucion_patronal?: number;
  @IsOptional() @IsNumber() @Min(0) seguro_vida_monto?: number;
  @IsOptional() @IsNumber() @Min(0) periodo_prueba_max_meses?: number;
  @IsOptional() @IsString() @MaxLength(60) sistema_indemnizacion?: string;
  @IsOptional() @IsBoolean() libro_sueldos_digital_habilitado?: boolean;
  @IsOptional() @IsBoolean() simplificacion_registral_habilitada?: boolean;
  @IsOptional() @IsBoolean() formulario_931_habilitado?: boolean;
  @IsOptional() @IsBoolean() siradig_habilitado?: boolean;
  @IsOptional() @IsBoolean() configuracion_confirmada?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ConfiguracionLaboralColombiaDto {
  @IsOptional() @IsString() @MaxLength(60) tipo_aportante?: string;
  @IsOptional() @IsString() @MaxLength(20) actividad_economica_ciiu?: string;
  @IsOptional() @IsString() @MaxLength(120) operador_pila?: string;
  @IsOptional() @IsString() @MaxLength(40) pila_integracion_modo?: string;
  @IsOptional() @IsString() @MaxLength(40) pila_operador_codigo?: string;
  @IsOptional() @IsString() @MaxLength(500) pila_api_url?: string;
  @IsOptional() @IsString() @MaxLength(200) pila_api_usuario?: string;
  @IsOptional() @IsString() @MaxLength(2000) pila_api_token?: string;
  @IsOptional() @IsString() @MaxLength(30) eps_default?: string;
  @IsOptional() @IsString() @MaxLength(30) fondo_pension_default?: string;
  @IsOptional() @IsString() @MaxLength(30) arl_default?: string;
  @IsOptional() @IsString() @MaxLength(10) arl_clase_riesgo?: string;
  @IsOptional() @IsNumber() @Min(0) arl_tasa?: number;
  @IsOptional() @IsString() @MaxLength(30) caja_compensacion_default?: string;
  @IsOptional() @IsBoolean() sena_habilitado?: boolean;
  @IsOptional() @IsBoolean() icbf_habilitado?: boolean;
  @IsOptional() @IsBoolean() exonerado_salud_sena_icbf?: boolean;
  @IsOptional() @IsBoolean() nomina_electronica_habilitada?: boolean;
  @IsOptional() @IsString() @MaxLength(200) nomina_software_id?: string;
  @IsOptional() @IsString() @MaxLength(200) nomina_software_pin?: string;
  @IsOptional() @IsString() @MaxLength(200) nomina_test_set_id?: string;
  @IsOptional() @IsBoolean() pila_habilitada?: boolean;
  @IsOptional() @IsNumber() @Min(0) salario_minimo?: number;
  @IsOptional() @IsNumber() @Min(0) auxilio_transporte?: number;
  @IsOptional() @IsBoolean() configuracion_confirmada?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
