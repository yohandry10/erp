import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  IsUUID,
  Min,
} from 'class-validator';
import { IsUuidOpcional } from './uuid-opcional.decorator';

/**
 * Acciones puntuales de RRHH cuyo body venía declarado con un tipo estructural
 * en línea.
 *
 * Ese tipo desaparece al compilar: en runtime Nest sólo ve `Object`, no puede
 * construir un esquema y el `ValidationPipe` deja pasar el body entero sin
 * mirarlo. Parecía tipado y no lo estaba. Los campos aquí son los mismos que
 * declaraba cada tipo en línea, comprobados uno a uno contra lo que envía la
 * pantalla.
 */
export class JornadaPlanillaElectronicaDto {
  @IsNumber() @Min(0) @Max(744) horas_ordinarias!: number;
  @IsNumber() @Min(0) @Max(31) dias_no_laborados!: number;
}

export class GenerarPaquetePlanillaElectronicaDto {
  @IsOptional() @IsString() @MaxLength(2000) notas?: string;
}

export class RenovarContratoDto {
  @IsInt() @Min(1) @Max(120) meses!: number;
}

export class FinalizarContratoDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) motivo_finalizacion!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) fecha_finalizacion!: string;
}

export class MarcarAsistenciaDto {
  @IsUuidOpcional() empleado_id?: string;
  @IsString() @IsNotEmpty() @MaxLength(30) fecha!: string;
  @IsIn(['entrada', 'salida']) tipo!: 'entrada' | 'salida';
  @IsString() @IsNotEmpty() @MaxLength(10) hora!: string;
}

export class CambiarEstadoCandidatoDto {
  @IsString() @IsNotEmpty() @MaxLength(60) estado!: string;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
}

export class AprobarSolicitudDto {
  @IsString() @IsNotEmpty() @MaxLength(120) aprobado_por!: string;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
}

/** Al rechazar, el motivo no es opcional: es lo que lee el solicitante. */
export class RechazarSolicitudDto {
  @IsString() @IsNotEmpty() @MaxLength(120) aprobado_por!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) observaciones!: string;
}

export class AsignarBeneficioDto {
  @IsUuidOpcional() beneficio_id?: string;
  @IsString() @IsNotEmpty() @MaxLength(30) fecha_inicio!: string;
}

export class InscribirCapacitacionDto {
  @IsUuidOpcional() capacitacion_id?: string;
}

export class CalcularLiquidacionDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) motivo_terminacion!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) fecha_terminacion!: string;
}

export class PagarLiquidacionDto {
  @IsIn(['efectivo', 'transferencia']) metodo_pago!: 'efectivo' | 'transferencia';
  @IsUuidOpcional() cuenta_bancaria_id?: string;
  @IsOptional() @IsString() @MaxLength(200) referencia?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_pago?: string;
  @IsOptional() @IsString() @MaxLength(200) idempotency_key?: string;
}

export class RevertirPagoLiquidacionDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) motivo!: string;
}

export class CalcularDepositosCtsDto {
  /** Periodo CTS en formato AAAA-MM. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El periodo debe tener el formato AAAA-MM' })
  periodo!: string;
}

export class DepositarCtsDto {
  // Obligatoria: el servicio la exige y el botón de la pantalla está
  // deshabilitado mientras no se elija una cuenta.
  @IsUUID('4') cuenta_bancaria_id!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) referencia!: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_deposito?: string;
}

export class AsignarHorarioDto {
  @IsUuidOpcional() horario_id?: string;
  @IsString() @IsNotEmpty() @MaxLength(30) fecha_inicio!: string;
}

export class AgregarDocumentoExpedienteDto {
  @IsString() @IsNotEmpty() @MaxLength(60) tipo_documento!: string;
  @IsString() @IsNotEmpty() @MaxLength(300) nombre_archivo!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) archivo_url!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) subido_por!: string;
}
