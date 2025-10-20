import { IsOptional, IsBoolean } from 'class-validator';

/**
 * ConfirmarPedidoDto
 * DTO para confirmar un pedido (reservar stock)
 * Requirements: 5.5, 5.6
 */
export class ConfirmarPedidoDto {
  @IsOptional()
  @IsBoolean({ message: 'El campo forzar_confirmacion debe ser booleano' })
  forzar_confirmacion?: boolean;
}
