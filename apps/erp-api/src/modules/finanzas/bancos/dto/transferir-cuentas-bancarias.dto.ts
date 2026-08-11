import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class TransferirCuentasBancariasDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  cuenta_origen_id: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  cuenta_destino_id: string;

  @ApiProperty({ minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  moneda: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  tipo_cambio?: number;

  @ApiProperty({ example: '2026-08-09' })
  @IsDateString()
  fecha: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  descripcion: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referencia?: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key: string;
}
