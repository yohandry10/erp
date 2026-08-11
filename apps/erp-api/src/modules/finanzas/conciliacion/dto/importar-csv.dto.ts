import { IsString, IsNotEmpty, IsOptional, IsIn, IsNumber, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const BANCOS_SOPORTADOS = ['BCP', 'BBVA', 'INTERBANK', 'SCOTIABANK', 'GENERICO'] as const;

export class ImportarCsvDto {
  @ApiProperty({ description: 'Clave estable de intención' })
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;

  @ApiProperty({ description: 'Saldo inicial informado por el banco' })
  @IsNumber({ maxDecimalPlaces: 2 })
  saldo_banco_inicial!: number;

  @ApiProperty({ description: 'Saldo final informado por el banco' })
  @IsNumber({ maxDecimalPlaces: 2 })
  saldo_banco_final!: number;

  @ApiProperty({
    description: 'Contenido del archivo CSV en formato texto',
    example: 'Fecha,Descripcion,Tipo,Monto\n2025-10-15,Pago proveedor,CARGO,1500.00',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2 * 1024 * 1024, { message: 'El CSV no puede superar 2 MB' })
  contenidoCsv: string;

  @ApiProperty({
    description: 'Nombre del banco para usar el parser específico',
    example: 'BCP',
    enum: BANCOS_SOPORTADOS,
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(BANCOS_SOPORTADOS, { message: 'Banco no soportado' })
  banco?: string;
}
