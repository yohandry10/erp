import { IsOptional, IsString } from 'class-validator';

/**
 * ConvertirPedidoDto
 * DTO para convertir una cotización a pedido
 * Requirements: 4.1, 4.2, 4.3
 */
export class ConvertirPedidoDto {
  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;
}
