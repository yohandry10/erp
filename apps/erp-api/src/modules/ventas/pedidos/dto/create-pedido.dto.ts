import { IsString, IsUUID, IsOptional, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PedidoDetalleDto } from './pedido-detalle.dto';

/**
 * CreatePedidoDto
 * DTO para crear un nuevo pedido de venta
 * Requirements: 5.2, 15.1, 15.2, 15.3
 */
export class CreatePedidoDto {
  @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido' })
  cliente_id: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la cotización debe ser un UUID válido' })
  cotizacion_id?: string;

  @IsArray({ message: 'El detalle debe ser un array' })
  @ArrayMinSize(1, { message: 'El pedido debe tener al menos un producto' })
  @ArrayMaxSize(999, { message: 'El pedido no puede tener más de 999 productos' })
  @ValidateNested({ each: true })
  @Type(() => PedidoDetalleDto)
  detalle: PedidoDetalleDto[];

  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;
}
