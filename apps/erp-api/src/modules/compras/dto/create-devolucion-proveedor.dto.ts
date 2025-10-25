import { IsUUID, IsArray, IsOptional, IsString, IsNumber, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ItemDevolucionDto {
  @ApiPropertyOptional({ description: 'ID del item de recepción original (si aplica)' })
  @IsOptional()
  @IsUUID()
  recepcion_item_id?: string;

  @ApiProperty({ description: 'ID del producto a devolver' })
  @IsUUID()
  producto_id: string;

  @ApiProperty({ description: 'Descripción del producto' })
  @IsString()
  descripcion: string;

  @ApiProperty({ description: 'Cantidad a devolver' })
  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @ApiProperty({ description: 'Precio unitario del producto' })
  @IsNumber()
  @Min(0)
  precio_unitario: number;

  @ApiPropertyOptional({ description: 'ID del almacén desde donde se devuelve' })
  @IsOptional()
  @IsUUID()
  almacen_id?: string;

  @ApiPropertyOptional({ description: 'Número de lote del producto devuelto' })
  @IsOptional()
  @IsString()
  lote?: string;

  @ApiPropertyOptional({ description: 'Número de serie del producto devuelto' })
  @IsOptional()
  @IsString()
  serie?: string;

  @ApiPropertyOptional({ description: 'Motivo detallado de la devolución del item' })
  @IsOptional()
  @IsString()
  motivo_detalle?: string;
}

export class CreateDevolucionProveedorDto {
  @ApiPropertyOptional({ description: 'ID de la recepción de origen (opcional)' })
  @IsOptional()
  @IsUUID()
  recepcion_id?: string;

  @ApiProperty({ description: 'ID de la orden de compra' })
  @IsUUID()
  orden_id: string;

  @ApiProperty({ description: 'ID del proveedor al que se devuelve' })
  @IsUUID()
  proveedor_id: string;

  @ApiProperty({ description: 'Motivo general de la devolución' })
  @IsString()
  motivo: string;

  @ApiProperty({ description: 'Items a devolver', type: [ItemDevolucionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDevolucionDto)
  items: ItemDevolucionDto[];

  @ApiPropertyOptional({ description: 'Observaciones adicionales' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}
