import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CondicionesPagoCxp } from './crear-cxp.dto';

export class ActualizarCxpDto {
  @IsOptional()
  @IsString({ message: 'El número de documento debe ser texto' })
  numero_documento?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de emisión debe ser una fecha válida' })
  fecha_emision?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida' })
  fecha_vencimiento?: string;

  @IsOptional()
  @IsEnum(CondicionesPagoCxp, { message: 'Condiciones de pago inválidas' })
  condiciones_pago?: CondicionesPagoCxp;

  @IsOptional()
  @IsNumber({}, { message: 'Los días de crédito deben ser numéricos' })
  @Min(0, { message: 'Los días de crédito no pueden ser negativos' })
  dias_credito?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El subtotal debe ser numérico' })
  @Min(0, { message: 'El subtotal no puede ser negativo' })
  subtotal?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El IGV debe ser numérico' })
  @Min(0, { message: 'El IGV no puede ser negativo' })
  igv?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El total debe ser numérico' })
  @Min(0.01, { message: 'El total debe ser mayor a cero' })
  total?: number;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
