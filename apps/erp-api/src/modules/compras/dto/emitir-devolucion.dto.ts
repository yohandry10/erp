import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EmitirDevolucionDto {
  @ApiPropertyOptional({
    description: 'Observaciones finales al emitir la devolución',
    example: 'Devolución procesada y notificada al proveedor'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
