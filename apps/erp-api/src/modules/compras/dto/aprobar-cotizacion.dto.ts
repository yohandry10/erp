import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AprobarCotizacionDto {
  @ApiPropertyOptional({
    description: 'Comentarios de la aprobación',
    example: 'Aprobado según presupuesto disponible'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentarios?: string;
}
