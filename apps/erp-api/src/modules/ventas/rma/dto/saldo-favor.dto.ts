import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class AplicarSaldoFavorDto {
  @IsUUID('4')
  cxc_id!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto!: number;
}

export class ReembolsarSaldoFavorDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto!: number;

  @IsIn(['CAJA', 'BANCO'])
  medio!: 'CAJA' | 'BANCO';

  @ValidateIf((dto: ReembolsarSaldoFavorDto) => dto.medio === 'CAJA')
  @IsUUID('4')
  sesion_caja_id?: string;

  @ValidateIf((dto: ReembolsarSaldoFavorDto) => dto.medio === 'BANCO')
  @IsUUID('4')
  cuenta_bancaria_id?: string;

  @ValidateIf((dto: ReembolsarSaldoFavorDto) => dto.medio === 'BANCO')
  @IsString()
  @MaxLength(200)
  referencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}
