import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Body de alta y edición de empleado.
 *
 * Los campos son exactamente los de `CAMPOS_EMPLEADO_PERMITIDOS` en
 * `RrhhService`, que ya filtraba la entrada. Esa lista protegía contra columnas
 * inesperadas pero no contra tipos: `cantidad_hijos` podía llegar como texto
 * libre y `tiene_hijos` como cualquier cosa, y de ahí sale el derecho a la
 * asignación familiar. El DTO cierra esa mitad.
 *
 * Se mantienen los tres bloques nacionales en el mismo DTO porque el mismo
 * formulario sirve a los tres países y envía sólo el bloque que aplica; separar
 * por país exigiría tres rutas para una pantalla.
 *
 * Las validaciones de negocio —tipo de documento válido según el país, CUIL con
 * dígito verificador, DNI de ocho cifras, documento único— siguen en el
 * servicio: dependen del país laboral del tenant, que aquí no se conoce.
 */
class EmpleadoCamposComunes {
  @IsOptional() @IsString() @MaxLength(20) tipo_documento?: string;
  @IsOptional() @IsString() @MaxLength(30) numero_documento?: string;

  /** El formulario envía cadena vacía cuando no hay correo; el servicio la
   * descarta. Validar el formato sobre "" devolvería 400 en un alta legítima. */
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional() @IsString() @MaxLength(60) telefono?: string;
  @IsOptional() @IsString() @MaxLength(500) direccion?: string;
  @IsOptional() @IsString() @MaxLength(20) fecha_nacimiento?: string;
  @IsOptional() @IsString() @MaxLength(20) fecha_ingreso?: string;
  @IsOptional() @IsString() @MaxLength(80) id_departamento?: string;
  @IsOptional() @IsString() @MaxLength(200) puesto?: string;
  @IsOptional() @IsString() @MaxLength(40) estado?: string;
  @IsOptional() @IsString() @MaxLength(30) genero?: string;
  @IsOptional() @IsString() @MaxLength(40) estado_civil?: string;
  @IsOptional() @IsString() @MaxLength(10) nacionalidad?: string;
  @IsOptional() @IsString() @MaxLength(20) ubigeo?: string;

  @IsOptional() @IsBoolean() tiene_hijos?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(30) cantidad_hijos?: number;
  @IsOptional() @IsBoolean() asignacion_familiar?: boolean;

  @IsOptional() @IsString() @MaxLength(40) cuenta_bancaria?: string;
  @IsOptional() @IsString() @MaxLength(120) banco?: string;
  @IsOptional() @IsString() @MaxLength(40) tipo_cuenta?: string;
  @IsOptional() @IsString() @MaxLength(200) contacto_emergencia?: string;
  @IsOptional() @IsString() @MaxLength(60) telefono_emergencia?: string;
  @IsOptional() @IsString() @MaxLength(1000) foto_url?: string;

  // Argentina
  @IsOptional() @IsString() @MaxLength(20) cuil?: string;
  @IsOptional() @IsString() @MaxLength(30) obra_social_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) sindicato_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) situacion_revista_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) modalidad_contratacion_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) condicion_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) actividad_codigo?: string;
  @IsOptional() @IsString() @MaxLength(10) zona_codigo?: string;

  // Colombia
  @IsOptional() @IsString() @MaxLength(30) eps_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) fondo_pension_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) arl_codigo?: string;
  @IsOptional() @IsString() @MaxLength(30) caja_compensacion_codigo?: string;
}

export class CrearEmpleadoDto extends EmpleadoCamposComunes {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombres!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  apellidos!: string;
}

export class ActualizarEmpleadoDto extends EmpleadoCamposComunes {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) nombres?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) apellidos?: string;
}
