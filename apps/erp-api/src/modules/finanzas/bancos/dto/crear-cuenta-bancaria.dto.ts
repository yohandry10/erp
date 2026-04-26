import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum TipoCuenta {
  CORRIENTE = 'CORRIENTE',
  AHORROS = 'AHORROS',
  DETRACCION = 'DETRACCION',
  PLAZO_FIJO = 'PLAZO_FIJO',
}

export enum Moneda {
  PEN = 'PEN',
  USD = 'USD',
  EUR = 'EUR',
}

export class CrearCuentaBancariaDto {
  @IsString({ message: 'El nombre de la cuenta es requerido' })
  nombre!: string;

  @IsString({ message: 'El nombre del banco es requerido' })
  banco!: string;

  @IsString({ message: 'El número de cuenta es requerido' })
  numero_cuenta!: string;

  @IsOptional()
  @IsEnum(TipoCuenta, { message: 'Tipo de cuenta inválido' })
  tipo_cuenta?: TipoCuenta;

  @IsOptional()
  @IsEnum(Moneda, { message: 'Moneda inválida' })
  moneda?: Moneda;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El saldo debe ser numérico' })
  @Min(0, { message: 'El saldo no puede ser negativo' })
  saldo?: number;

  @IsOptional()
  @IsBoolean({ message: 'El campo permite_sobregiro debe ser booleano' })
  permite_sobregiro?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'El campo activa debe ser booleano' })
  activa?: boolean;
}
