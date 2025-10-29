import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { TipoCuenta } from './crear-cuenta-bancaria.dto';

export class ActualizarCuentaBancariaDto {
  @IsOptional()
  @IsString({ message: 'El nombre de la cuenta debe ser texto' })
  nombre?: string;

  @IsOptional()
  @IsString({ message: 'El nombre del banco debe ser texto' })
  banco?: string;

  @IsOptional()
  @IsString({ message: 'El número de cuenta debe ser texto' })
  numero_cuenta?: string;

  @IsOptional()
  @IsEnum(TipoCuenta, { message: 'Tipo de cuenta inválido' })
  tipo_cuenta?: TipoCuenta;

  @IsOptional()
  @IsBoolean({ message: 'El campo permite_sobregiro debe ser booleano' })
  permite_sobregiro?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'El campo activa debe ser booleano' })
  activa?: boolean;
}
