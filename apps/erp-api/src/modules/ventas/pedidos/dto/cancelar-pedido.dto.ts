import { IsString, IsOptional } from 'class-validator';

/**
 * CancelarPedidoDto
 * DTO para cancelar un pedido
 * Requirements: 12.1, 12.2
 */
export class CancelarPedidoDto {
  @IsOptional()
  @IsString({ message: 'El motivo debe ser texto' })
  motivo?: string;
}
