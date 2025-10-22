import { IsOptional, IsString, IsArray } from 'class-validator';

/**
 * PrepararPedidoDto
 * DTO para iniciar la preparación de un pedido
 * Requirements: 9.3, 9.4, 9.5
 */
export class PrepararPedidoDto {
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
  items_preparados?: string[];
}
