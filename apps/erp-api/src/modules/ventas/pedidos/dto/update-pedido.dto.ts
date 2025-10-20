import { IsString, IsUUID, IsOptional, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PedidoDetalleDto } from './pedido-detalle.dto';

/**
 * UpdatePedidoDto
 * DTO para actualizar un pedido de venta
 * Requirements: 5.2, 5.3
 */
export class UpdatePedidoDto {
  @IsOptional()
  @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido' })
  cliente_id?: string;

  @IsOptional()
  @IsArray({ message: 'El detalle debe ser un array' })
  @ArrayMinSize(1, { message: 'El pedido debe tener al menos un producto' })
  @ArrayMaxSize(999, { message: 'El pedido no puede tener más de 999 productos' })
  @ValidateNested({ each: true })
  @Type(() => PedidoDetalleDto)
  detalle?: PedidoDetalleDto[];

  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;
}
