import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Bodies pequeños que venían con el tipo declarado en línea.
 *
 * Un tipo estructural en `@Body()` no existe en runtime: Nest recibe `Object`,
 * el `ValidationPipe` no puede construir un esquema y el body pasa entero sin
 * comprobar. Estas clases dan al pipe algo que validar sin cambiar el contrato.
 *
 * Viven juntas porque son la misma forma repetida en módulos distintos —un
 * motivo, un identificador— y dispersarlas en seis carpetas para una propiedad
 * cada una haría más ruido que servicio.
 */

/** Motivo opcional: rechazos y cancelaciones que aceptan justificación. */
export class MotivoOpcionalDto {
  @IsOptional() @IsString() @MaxLength(1000) motivo?: string;
}

/** Número de OC opcional al convertir una cotización de compra. */
export class ConvertirCotizacionOcDto {
  @IsOptional() @IsString() @MaxLength(40) numero_oc?: string;
}

export class CrearCentroCostoDto {
  @IsString() @IsNotEmpty() @MaxLength(40) codigo!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) nombre!: string;
  @IsOptional() @IsString() @MaxLength(1000) descripcion?: string;
}

export class ProbarFirmaXmlDto {
  @IsOptional() @IsString() xmlContent?: string;
}

/**
 * El wizard envía su configuración completa como un objeto libre; el servicio la
 * interpreta campo por campo. Se valida que sea un objeto y no un escalar ni un
 * arreglo, que es lo que el handler da por supuesto.
 */
export class CompletarConfiguracionDto {
  @IsObject() configuration!: Record<string, unknown>;
}

export class EvaluarCreacionAutomaticaGreDto {
  @IsString() @IsNotEmpty() @MaxLength(80) saleId!: string;
  @IsNumber() @Min(0) total!: number;
  @IsOptional() @IsString() @MaxLength(80) cpeId?: string;
}
