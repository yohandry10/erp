import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Body del cierre físico avanzado de caja.
 *
 * El arqueo se declara como dos mapas de denominación a cantidad, igual que la
 * interfaz `Denominaciones` que consume el servicio de conciliación. Las claves
 * son el valor del billete o la moneda, así que no se pueden enumerar con
 * decoradores: se valida que sean objetos y el recuento lo cuadra el servicio,
 * que ya compara el total declarado contra el contado.
 *
 * `supervisor_id` y `codigo_autorizacion` se declaran porque el controlador los
 * usa para la autorización de diferencias; sin declararlos el pipe los borraría
 * antes de que el handler pudiera verlos.
 */
export class DenominacionesArqueoDto {
  @IsObject() billetes!: Record<string, number>;
  @IsObject() monedas!: Record<string, number>;
}

export class CerrarCajaAvanzadoDto {
  @IsNumber() @Min(0) monto_contado!: number;

  @ValidateNested()
  @Type(() => DenominacionesArqueoDto)
  denominaciones!: DenominacionesArqueoDto;

  @IsOptional() @IsString() @MaxLength(2000) notas?: string;
  @IsOptional() @IsUUID('4') supervisor_id?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'El código de supervisor debe tener 6 dígitos' })
  codigo_autorizacion?: string;
}
