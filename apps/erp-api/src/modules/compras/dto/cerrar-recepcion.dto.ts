import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CerrarRecepcionDto {
  @ApiPropertyOptional({ description: 'Observaciones finales al cerrar la recepción' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}
