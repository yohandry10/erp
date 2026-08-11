import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Una recepción BORRADOR sólo admite corregir sus observaciones. La orden,
 * los ítems y su identidad requieren una operación transaccional específica.
 */
export class UpdateRecepcionDto {
  @ApiPropertyOptional({ description: 'Observaciones generales de la recepción' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}
