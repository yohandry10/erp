import { IsString, IsUUID, IsDate, IsOptional, IsNumber, IsEnum, IsArray, ValidateNested, Min, IsInt, ArrayMinSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EstadoCotizacionCompra, CotizacionCompraDetalleDto } from './create-cotizacion-compra.dto';

export class UpdateCotizacionCompraDto {
  @ApiPropertyOptional({ description: 'Número de cotización', example: 'COT-2024-001' })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({ description: 'ID del proveedor', example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsOptional()
  @IsUUID('4', { message: 'El proveedor_id debe ser un UUID válido' })
  proveedor_id?: string;

  @ApiPropertyOptional({ description: 'Fecha de la cotización', example: '2024-10-24' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha de cotización debe ser una fecha válida' })
  fecha_cotizacion?: Date;

  @ApiPropertyOptional({ description: 'Días de validez de la cotización', example: 30 })
  @IsOptional()
  @IsInt({ message: 'Los días de validez deben ser un número entero' })
  @Min(1, { message: 'Los días de validez deben ser al menos 1' })
  validez_dias?: number;

  @ApiPropertyOptional({ 
    description: 'Estado de la cotización', 
    enum: EstadoCotizacionCompra
  })
  @IsOptional()
  @IsEnum(EstadoCotizacionCompra, { message: 'Estado de cotización inválido' })
  estado?: EstadoCotizacionCompra;

  @ApiPropertyOptional({ description: 'Observaciones adicionales', example: 'Incluye envío gratuito' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiPropertyOptional({ 
    description: 'Detalle de productos cotizados',
    type: [CotizacionCompraDetalleDto]
  })
  @IsOptional()
  @IsArray({ message: 'Los detalles deben ser un array' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => CotizacionCompraDetalleDto)
  detalles?: CotizacionCompraDetalleDto[];
}
