import { IsUUID, IsOptional, IsString } from 'class-validator';

/**
 * PrepararPedidoDto
 * DTO para iniciar la preparación de un pedido
 * Requirements: 9.3, 9.4, 9.5
 */
export class PrepararPedidoDto {
  @IsOptional()
  @IsString()
  notas?: string;
}
