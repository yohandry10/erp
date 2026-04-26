import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CerrarConciliacionDto {
  @ApiPropertyOptional({
    description: 'Forzar el cierre de la conciliación incluso si hay movimientos pendientes de conciliar. Use con precaución.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forzar_cierre?: boolean;
}
