import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsUuidOpcional } from './uuid-opcional.decorator';

/**
 * Bodies de las operaciones de RRHH que van a `ejecutar_operacion_rrhh_tx`.
 *
 * Cada clase replica la lista que `app.rrhh_pick_475` aplica a su operación, que
 * es el contrato real: la RPC descarta en silencio cualquier clave fuera de esa
 * lista. Al tipar el body, lo que antes se descartaba pasa a rechazarse con 400,
 * así que las listas se copiaron una a una del writer y no de la intuición.
 *
 * Los alias duplicados (`id_empleado`/`empleado_id`, `salario_min`/`salario_minimo`,
 * `id_vacante`/`vacante_id`) se conservan porque el writer los acepta y hay
 * clientes usando cada variante.
 *
 * Las comprobaciones de existencia —que el departamento exista y esté activo,
 * que el evaluador pertenezca al tenant— siguen donde estaban: son consultas
 * contra la base y no caben en un decorador.
 */
export class CrearDepartamentoDto {
  @IsString() @IsNotEmpty() @MaxLength(200) nombre!: string;
  @IsOptional() @IsString() @MaxLength(40) codigo?: string;
  @IsOptional() @IsString() @MaxLength(1000) descripcion?: string;
  @IsUuidOpcional() responsable_id?: string;
  @IsOptional() @IsString() @MaxLength(40) estado?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CrearVacanteDto {
  @IsString() @IsNotEmpty() @MaxLength(200) titulo!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) puesto_solicitado!: string;
  @IsOptional() @IsString() @MaxLength(2000) descripcion?: string;
  @IsUuidOpcional() departamento_id?: string;
  @IsOptional() @IsString() @MaxLength(200) departamento?: string;
  @IsOptional() @IsString() @MaxLength(200) ubicacion?: string;
  @IsOptional() @IsString() @MaxLength(60) tipo_contrato?: string;
  @IsOptional() @IsNumber() @Min(0) salario_minimo?: number;
  @IsOptional() @IsNumber() @Min(0) salario_maximo?: number;
  @IsOptional() @IsNumber() @Min(0) salario_min?: number;
  @IsOptional() @IsNumber() @Min(0) salario_max?: number;
  @IsOptional() @IsString() @MaxLength(200) experiencia_requerida?: string;
  @IsOptional() @IsString() @MaxLength(4000) requisitos?: string;
  @IsOptional() @IsString() @MaxLength(4000) beneficios?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_limite?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_publicacion?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_cierre?: string;
  @IsOptional() @IsString() @MaxLength(40) estado?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

class CandidatoCamposComunes {
  @IsUuidOpcional() id_vacante?: string;
  @IsUuidOpcional() vacante_id?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(60) telefono?: string;
  @IsOptional() @IsString() @MaxLength(30) numero_documento?: string;
  @IsOptional() @IsString() @MaxLength(20) tipo_documento?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_nacimiento?: string;
  @IsOptional() @IsString() @MaxLength(500) direccion?: string;
  @IsOptional() @IsString() @MaxLength(120) nivel_educacion?: string;
  @IsOptional() @IsNumber() @Min(0) experiencia_anos?: number;

  /** Con eñe: así lo envía CandidatoModal. El writer sólo conoce
   * `experiencia_anos` y descarta esta variante, pero declararla es lo que
   * evita que el alta pase a 400. */
  @IsOptional() @IsNumber() @Min(0) 'experiencia_años'?: number;

  /** Aceptado y descartado: la pantalla lo envía y candidatos no tiene esa columna. */
  @IsOptional() @IsString() @MaxLength(40) estado_civil?: string;
  @IsOptional() @IsNumber() @Min(0) pretension_salarial?: number;
  @IsOptional() @IsString() @MaxLength(1000) cv_url?: string;
  @IsOptional() @IsString() @MaxLength(1000) linkedin_url?: string;
  @IsOptional() @IsString() @MaxLength(1000) portfolio_url?: string;
  // jsonb en la base: la pantalla los envía como arreglos.
  @IsOptional() @IsArray() idiomas?: unknown[];
  @IsOptional() @IsArray() habilidades_tecnicas?: unknown[];
  @IsOptional() @IsArray() experiencia_laboral?: unknown[];
  @IsOptional() @IsArray() formacion_academica?: unknown[];
  @IsOptional() @IsString() @MaxLength(40) estado?: string;
  @IsOptional() @IsString() @MaxLength(60) estado_proceso?: string;
  @IsOptional() @IsNumber() @Min(0) puntuacion_cv?: number;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
  @IsOptional() @IsBoolean() disponibilidad_inmediata?: boolean;
  @IsOptional() @IsString() @MaxLength(60) modalidad_trabajo_preferida?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_postulacion?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CrearCandidatoDto extends CandidatoCamposComunes {
  @IsString() @IsNotEmpty() @MaxLength(150) nombres!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) apellidos!: string;
}

export class ActualizarCandidatoDto extends CandidatoCamposComunes {
  @IsOptional() @IsString() @MaxLength(150) nombres?: string;
  @IsOptional() @IsString() @MaxLength(150) apellidos?: string;
}

export class CrearSolicitudDto {
  @IsUuidOpcional() id_empleado?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_inicio?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_fin?: string;
  @IsOptional() @IsNumber() @Min(0) dias?: number;
  @IsOptional() @IsString() @MaxLength(60) tipo?: string;
  @IsOptional() @IsString() @MaxLength(2000) motivo?: string;
  @IsOptional() @IsString() @MaxLength(2000) comentario?: string;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

/** El writer ignora `id` en el body de evaluación: llega por la ruta. */
export class EvaluacionRequestDto {
  @IsUuidOpcional() id_empleado?: string;
  @IsUuidOpcional() evaluador_id?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_evaluacion?: string;
  @IsOptional() @IsString() @MaxLength(40) periodo?: string;
  @IsOptional() @IsString() @MaxLength(60) tipo?: string;
  @IsOptional() @IsNumber() @Min(0) puntaje_total?: number;
  @IsOptional() @IsString() @MaxLength(4000) fortalezas?: string;
  @IsOptional() @IsString() @MaxLength(4000) oportunidades_mejora?: string;
  @IsOptional() @IsString() @MaxLength(4000) plan_accion?: string;
  @IsOptional() @IsString() @MaxLength(30) proxima_evaluacion?: string;
  @IsOptional() @IsString() @MaxLength(40) estado?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CrearContratoDto {
  @IsUuidOpcional() id_empleado?: string;
  @IsUuidOpcional() empleado_id?: string;
  @IsOptional() @IsString() @MaxLength(60) tipo_contrato?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_inicio?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_fin?: string;
  @IsOptional() @IsNumber() @Min(0) sueldo_bruto?: number;
  @IsOptional() @IsNumber() @Min(0) salario?: number;
  @IsOptional() @IsString() @MaxLength(10) moneda?: string;
  @IsOptional() @IsString() @MaxLength(4000) beneficios?: string;
  @IsOptional() @IsString() @MaxLength(40) regimen_pensionario?: string;
  @IsOptional() @IsString() @MaxLength(60) jornada_laboral?: string;
  @IsOptional() @IsNumber() @Min(0) periodo_prueba_meses?: number;
  @IsOptional() @IsString() @MaxLength(30) fecha_firma?: string;
  @IsOptional() @IsString() @MaxLength(40) estado?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;

  // Argentina
  @IsOptional() @IsString() @MaxLength(60) regimen_seguridad_social?: string;
  @IsOptional() @IsString() @MaxLength(30) convenio_colectivo_codigo?: string;
  @IsOptional() @IsString() @MaxLength(120) categoria_convenio?: string;
  @IsOptional() @IsString() @MaxLength(30) modalidad_contratacion_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) situacion_revista_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) obra_social_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) sindicato_codigo?: string;
  @IsOptional() @IsNumber() @Min(0) sindicato_aporte_tasa?: number;
  @IsOptional() @IsString() @MaxLength(20) art_cuit?: string;
  @IsOptional() @IsNumber() @Min(0) art_tasa?: number;
  @IsOptional() @IsNumber() @Min(0) ganancias_retencion_mensual?: number;
  @IsOptional() @IsNumber() @Min(0) seguro_vida_monto?: number;
  @IsOptional() @IsNumber() @Min(0) mejor_remuneracion_normal_habitual?: number;
  @IsOptional() @IsNumber() @Min(0) tope_indemnizatorio_convenio?: number;
  @IsOptional() @IsBoolean() fondo_cese_reemplaza_indemnizacion?: boolean;

  // Perú: la administradora y el tipo de comisión son obligatorios cuando el
  // régimen es AFP; el servicio lo exige porque depende del país del tenant.
  @IsOptional() @IsString() @MaxLength(30) afp_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) tipo_comision_afp?: string;
  @IsOptional() @IsNumber() @Min(0) tasa_comision_afp?: number;
  @IsOptional() @IsNumber() @Min(0) tasa_seguro_afp?: number;
  @IsOptional() @IsString() @MaxLength(200) cargo?: string;

  // Colombia
  @IsOptional() @IsString() @MaxLength(30) eps_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) fondo_pension_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) arl_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) caja_compensacion_codigo?: string;
}
