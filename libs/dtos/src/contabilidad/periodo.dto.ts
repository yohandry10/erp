import { IsInt, IsNotEmpty, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePeriodoDto {
  @ApiProperty({
    description: 'Año del período contable',
    example: 2025,
    minimum: 2000,
    maximum: 2100
  })
  @IsInt()
  @IsNotEmpty()
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiProperty({
    description: 'Mes del período contable (1-12)',
    example: 10,
    minimum: 1,
    maximum: 12
  })
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  @Max(12)
  mes: number;
}

export class PeriodoResponseDto {
  @ApiProperty({ description: 'ID del período' })
  id: string;

  @ApiProperty({ description: 'ID del tenant' })
  tenant_id: string;

  @ApiProperty({ description: 'Año del período' })
  anio: number;

  @ApiProperty({ description: 'Mes del período' })
  mes: number;

  @ApiProperty({ description: 'Estado del período', enum: ['ABIERTO', 'CERRADO', 'BLOQUEADO'] })
  estado: string;

  @ApiProperty({ description: 'Fecha de cierre', required: false })
  fecha_cierre?: string;

  @ApiProperty({ description: 'Usuario que cerró el período', required: false })
  cerrado_por?: string;

  @ApiProperty({ description: 'Fecha de creación' })
  created_at: string;

  @ApiProperty({ description: 'Fecha de última actualización' })
  updated_at: string;
}
