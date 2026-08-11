import { IsString, IsUUID, IsDate, IsOptional, IsNumber, IsArray, ValidateNested, Min, IsInt, ArrayMinSize, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CotizacionCompraDetalleDto {
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

export class CreateCotizacionCompraDto {
  @ApiProperty({
    description: 'Clave única del intento de creación para reintentos seguros',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotency_key: string;

  @ApiProperty({ description: 'Número de cotización', example: 'COT-2024-001' })
  @IsString()
  numero: string;

  @ApiProperty({ description: 'ID del proveedor', example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsUUID('4', { message: 'El proveedor_id debe ser un UUID válido' })
  proveedor_id: string;

  @ApiPropertyOptional({ description: 'Fecha de la cotización', example: '2024-10-24' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha de cotización debe ser una fecha válida' })
  fecha_cotizacion?: Date;

  @ApiPropertyOptional({ description: 'Días de validez de la cotización', example: 30, default: 30 })
  @IsOptional()
  @IsInt({ message: 'Los días de validez deben ser un número entero' })
  @Min(1, { message: 'Los días de validez deben ser al menos 1' })
  validez_dias?: number;

  @ApiPropertyOptional({ description: 'Observaciones adicionales', example: 'Incluye envío gratuito' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiProperty({ 
    description: 'Detalle de productos cotizados',
    type: [CotizacionCompraDetalleDto]
  })
  @IsArray({ message: 'Los detalles deben ser un array' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => CotizacionCompraDetalleDto)
  detalles: CotizacionCompraDetalleDto[];
}
