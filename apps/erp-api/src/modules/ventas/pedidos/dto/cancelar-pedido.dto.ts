import { IsBoolean, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

/**
 * CancelarPedidoDto
 * DTO para cancelar un pedido
 * Requirements: 12.1, 12.2
 */
export class CancelarPedidoDto {
  @IsString({ message: 'El motivo debe ser texto' })
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(1000, { message: 'El motivo no puede exceder 1000 caracteres' })
  motivo!: string;

  @IsOptional()
  @IsBoolean({ message: 'La confirmación de retorno físico debe ser booleana' })
  confirmar_retorno_fisico?: boolean;
}
