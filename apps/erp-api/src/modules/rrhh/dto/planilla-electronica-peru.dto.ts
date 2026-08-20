import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Bodies de la planilla electrónica peruana y del pago legado por empleados.
 *
 * La ficha laboral replica la lista de `PlanillaElectronicaPeruService.guardarFicha`,
 * que ya filtraba la entrada antes de llegar al writer 475. Son los códigos que
 * exige el T-Registro: se declaran como texto porque los valida SUNAT contra sus
 * propias tablas, no este servicio.
 */
export class GuardarFichaLaboralPeruDto {
  @IsOptional() @IsString() @MaxLength(150) apellido_paterno?: string;
  @IsOptional() @IsString() @MaxLength(150) apellido_materno?: string;
  @IsOptional() @IsString() @MaxLength(10) pais_emisor_documento?: string;
  @IsOptional() @IsString() @MaxLength(10) nacionalidad_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) regimen_laboral_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) situacion_educativa_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) ocupacion_codigo?: string;
  @IsOptional() @IsBoolean() discapacidad?: boolean;
  @IsOptional() @IsString() @MaxLength(20) cuspp?: string;
  @IsOptional() @IsString() @MaxLength(10) sctr_pension_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) tipo_contrato_codigo?: string;
  @IsOptional() @IsBoolean() jornada_atipica?: boolean;
  @IsOptional() @IsBoolean() jornada_maxima?: boolean;
  @IsOptional() @IsBoolean() horario_nocturno?: boolean;
  @IsOptional() @IsBoolean() sindicalizado?: boolean;
  @IsOptional() @IsString() @MaxLength(10) periodicidad_remuneracion_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) situacion_codigo?: string;
  @IsOptional() @IsBoolean() quinta_exonerada?: boolean;
  @IsOptional() @IsString() @MaxLength(10) situacion_especial_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) tipo_pago_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) categoria_ocupacional_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) convenio_doble_tributacion_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) tipo_trabajador_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) regimen_salud_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) regimen_pensionario_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) sctr_salud_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) eps_servicios_propios_codigo?: string;
  @IsOptional() @IsString() @MaxLength(20) establecimiento_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) direccion_tipo_via_codigo?: string;
  @IsOptional() @IsString() @MaxLength(200) direccion_nombre_via?: string;
  @IsOptional() @IsString() @MaxLength(40) direccion_numero_via?: string;
  @IsOptional() @IsString() @MaxLength(10) direccion_tipo_zona_codigo?: string;
  @IsOptional() @IsString() @MaxLength(200) direccion_nombre_zona?: string;
  @IsOptional() @IsString() @MaxLength(500) direccion_referencia?: string;
  @IsOptional() @IsString() @MaxLength(60) telefono_cldn?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

/** Evidencia de presentación de PLAME y T-Registro sobre un paquete ya generado. */
export class RegistrarEvidenciaPlanillaElectronicaDto {
  @IsOptional() @IsString() @MaxLength(200) ticket_tregistro?: string;
  @IsOptional() @IsString() @MaxLength(1000) cir_tregistro?: string;
  @IsOptional() @IsString() @MaxLength(1000) constancia_plame?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_presentacion?: string;
}

/**
 * Ruta legada de pago por empleados: delega en el pago atómico de la planilla,
 * que sólo necesita el método. El servicio ya rechazaba cualquier otro valor.
 */
export class PagarEmpleadosSeleccionadosDto {
  @IsIn(['efectivo', 'transferencia'])
  metodo_pago!: 'efectivo' | 'transferencia';
}
