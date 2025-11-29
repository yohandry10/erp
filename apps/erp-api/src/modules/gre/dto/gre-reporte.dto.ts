import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GreReporteQueryDto {
  @ApiPropertyOptional({ description: 'Año (YYYY)', example: 2025 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(3000)
  anio?: number;

  @ApiPropertyOptional({ description: 'Mes (1-12)', example: 11 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;
}
