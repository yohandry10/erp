import { IsString, IsUUID, IsNumber, Min, IsInt } from 'class-validator';

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

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser al menos 1 unidad' })
  cantidad: number;

  @IsNumber({}, { message: 'El precio unitario debe ser un número' })
  @Min(0, { message: 'El precio unitario debe ser mayor o igual a 0' })
  precio_unitario: number;
}
