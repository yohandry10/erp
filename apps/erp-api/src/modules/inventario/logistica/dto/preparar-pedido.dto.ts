import { OperacionLogisticaDto } from './operacion-logistica.dto';
import { IsOptional, IsString, IsArray } from 'class-validator';

/**
 * PrepararPedidoDto
 * DTO para iniciar la preparación de un pedido
 * Requirements: 9.3, 9.4, 9.5
 */
export class PrepararPedidoDto extends OperacionLogisticaDto {
  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsString()
  responsable?: string;

  @IsOptional()
  @IsString()
  ubicacion?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  items_preparados?: string[];
}
