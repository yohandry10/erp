import { IsString, IsIn, IsOptional } from 'class-validator';

/**
 * ActualizarTrackingDto
 * DTO para registrar cambios en el tracking de entrega
 */
export class ActualizarTrackingDto {
  @IsString()
  @IsIn(['EN_TRANSITO', 'ENTREGADO', 'INCIDENCIA'], {
    message: 'El estado debe ser EN_TRANSITO, ENTREGADO o INCIDENCIA',
  })
  estado: 'EN_TRANSITO' | 'ENTREGADO' | 'INCIDENCIA';

  @IsOptional()
  @IsString()
  notas?: string;
}
