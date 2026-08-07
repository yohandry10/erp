import { IsString, IsNumber, IsOptional, IsDateString, IsUUID, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RevaluacionQueryDto {
  @ApiProperty({ description: 'Fecha de corte de la revaluación (YYYY-MM-DD)' })
  @IsDateString()
  fecha: string;
}

export class EjecutarRevaluacionDto {
  @ApiProperty({ description: 'Fecha de corte de la revaluación (YYYY-MM-DD)' })
  @IsDateString()
  fecha: string;

  @ApiPropertyOptional({
    description: 'Concepto del asiento generado. Por omisión se describe la fecha de corte.'
  })
  @IsOptional()
  @IsString()
  concepto?: string;
}

/** Una posición monetaria en moneda extranjera pendiente de revaluar. */
export class PosicionRevaluacionDto {
  @ApiProperty({ enum: ['CXC', 'CXP'] })
  @IsIn(['CXC', 'CXP'])
  tipo: 'CXC' | 'CXP';

  @ApiProperty()
  @IsUUID()
  documento_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  moneda: string;

  @ApiProperty({ description: 'Saldo pendiente en la moneda del documento' })
  @IsNumber()
  saldo_moneda_origen: number;

  @ApiProperty({ description: 'Cotización a la que se contabilizó el documento' })
  @IsNumber()
  tipo_cambio_origen: number;

  @ApiProperty({ description: 'Cotización vigente a la fecha de corte' })
  @IsNumber()
  tipo_cambio_cierre: number;

  @ApiProperty({ description: 'Valor en moneda local con el que está contabilizado' })
  @IsNumber()
  valor_contabilizado: number;

  @ApiProperty({ description: 'Valor en moneda local a la fecha de corte' })
  @IsNumber()
  valor_a_cierre: number;

  @ApiProperty({
    description: 'Positivo = ganancia por diferencia de cambio; negativo = pérdida.'
  })
  @IsNumber()
  diferencia: number;
}

export class RevaluacionResponseDto {
  @ApiProperty()
  @IsDateString()
  fecha: string;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  moneda_local: string;

  @ApiProperty({ type: [PosicionRevaluacionDto] })
  posiciones: PosicionRevaluacionDto[];

  @ApiProperty({ description: 'Suma de las diferencias positivas' })
  @IsNumber()
  total_ganancia: number;

  @ApiProperty({ description: 'Suma de las diferencias negativas, en valor absoluto' })
  @IsNumber()
  total_perdida: number;

  @ApiProperty({ description: 'Efecto neto en resultados' })
  @IsNumber()
  diferencia_neta: number;

  @ApiPropertyOptional({
    description: 'Posiciones en moneda extranjera excluidas y el motivo de la exclusión.'
  })
  @IsOptional()
  excluidas?: Array<{ tipo: string; documento_id: string; motivo: string }>;

  @ApiPropertyOptional({ description: 'ID del asiento generado. Solo al ejecutar.' })
  @IsOptional()
  @IsUUID()
  asiento_id?: string;

  @ApiPropertyOptional({ description: 'Número del asiento generado. Solo al ejecutar.' })
  @IsOptional()
  numero_asiento?: string | number;
}
