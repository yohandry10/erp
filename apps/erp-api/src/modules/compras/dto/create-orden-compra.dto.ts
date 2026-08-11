import { IsString, IsUUID, IsDate, IsOptional, IsNumber, IsArray, ValidateNested, Min, IsInt, ArrayMinSize, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class OrdenCompraDetalleDto {
  @ApiProperty({ description: 'ID del producto', example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID('4', { message: 'El producto_id debe ser un UUID válido' })
  producto_id: string;

  @ApiProperty({ description: 'Descripción del producto', example: 'Laptop HP 15-dy2021la' })
  @IsString()
  descripcion: string;

  @ApiProperty({ description: 'Cantidad solicitada', example: 10 })
  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @Min(0.01, { message: 'La cantidad debe ser mayor a 0' })
  cantidad: number;

  @ApiProperty({ description: 'Precio unitario', example: 2500.00 })
  @IsNumber({}, { message: 'El precio unitario debe ser un número' })
  @Min(0, { message: 'El precio unitario no puede ser negativo' })
  precio_unitario: number;

}

export class CreateOrdenCompraDto {
  @ApiProperty({
    description: 'Clave única del intento de creación para reintentos seguros',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotency_key: string;

  @ApiProperty({ description: 'Número de orden de compra', example: 'OC-2024-001' })
  @IsString()
  numero: string;

  @ApiProperty({ description: 'ID del proveedor', example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsUUID('4', { message: 'El proveedor_id debe ser un UUID válido' })
  proveedor_id: string;

  @ApiPropertyOptional({ description: 'Fecha de la orden', example: '2024-10-24' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha de orden debe ser una fecha válida' })
  fecha_orden?: Date;

  @ApiPropertyOptional({ description: 'Fecha de entrega esperada', example: '2024-11-24' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha de entrega esperada debe ser una fecha válida' })
  fecha_entrega_esperada?: Date;

  @ApiPropertyOptional({ description: 'Condiciones de pago', example: 'CREDITO_30' })
  @IsOptional()
  @IsString()
  condiciones_pago?: string;

  @ApiPropertyOptional({ description: 'Días de crédito', example: 30, default: 0 })
  @IsOptional()
  @IsInt({ message: 'Los días de crédito deben ser un número entero' })
  @Min(0, { message: 'Los días de crédito no pueden ser negativos' })
  dias_credito?: number;

  @ApiPropertyOptional({ description: 'ID del almacén destino', example: '550e8400-e29b-41d4-a716-446655440004' })
  @IsOptional()
  @IsUUID('4', { message: 'El almacen_destino_id debe ser un UUID válido' })
  almacen_destino_id?: string;

  @ApiPropertyOptional({ description: 'Observaciones adicionales', example: 'Entregar en horario de oficina' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiProperty({ 
    description: 'Detalle de productos de la orden',
    type: [OrdenCompraDetalleDto]
  })
  @IsArray({ message: 'Los detalles deben ser un array' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => OrdenCompraDetalleDto)
  detalles: OrdenCompraDetalleDto[];
}
