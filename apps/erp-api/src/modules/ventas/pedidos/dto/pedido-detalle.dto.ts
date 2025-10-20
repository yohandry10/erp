import { IsString, IsUUID, IsNumber, Min } from 'class-validator';

/**
 * PedidoDetalleDto
 * DTO para el detalle de un pedido (línea de producto)
 * Requirements: 5.2, 15.1, 15.2
 */
export class PedidoDetalleDto {
  @IsUUID('4', { message: 'El ID del producto debe ser un UUID válido' })
  producto_id: string;

  @IsString({ message: 'La descripción debe ser texto' })
  descripcion: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @Min(0.01, { message: 'La cantidad debe ser mayor a 0' })
  cantidad: number;

  @IsNumber({}, { message: 'El precio unitario debe ser un número' })
  @Min(0, { message: 'El precio unitario debe ser mayor o igual a 0' })
  precio_unitario: number;
}
