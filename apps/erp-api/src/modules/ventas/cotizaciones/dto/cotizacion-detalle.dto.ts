import { IsString, IsUUID, IsNumber, Min, MinLength } from 'class-validator';

/**
 * CotizacionDetalleDto
 * DTO para líneas de detalle de cotización
 * Requirements: 3.2, 15.1, 15.2
 */
export class CotizacionDetalleDto {
  @IsUUID('4', { message: 'El ID del producto debe ser un UUID válido' })
  producto_id: string;

  @IsString({ message: 'La descripción es requerida' })
  @MinLength(1, { message: 'La descripción no puede estar vacía' })
  descripcion: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @Min(0.01, { message: 'La cantidad debe ser mayor a 0' })
  cantidad: number;

  @IsNumber({}, { message: 'El precio unitario debe ser un número' })
  @Min(0, { message: 'El precio unitario debe ser mayor o igual a 0' })
  precio_unitario: number;
}
