import { IsString, IsUUID, IsDate, IsOptional, IsArray, ValidateNested, Min, IsInt, ArrayMinSize, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { OrdenCompraDetalleDto } from './create-orden-compra.dto';

export class UpdateOrdenCompraDto {
  @ApiPropertyOptional({ description: 'Número de orden de compra', example: 'OC-2024-001' })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({ description: 'ID del proveedor', example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsOptional()
  @IsUUID('4', { message: 'El proveedor_id debe ser un UUID válido' })
  proveedor_id?: string;

  @ApiPropertyOptional({ description: 'Moneda de la orden', enum: ['PEN', 'COP', 'ARS', 'USD'] })
  @IsOptional()
  @IsIn(['PEN', 'COP', 'ARS', 'USD'])
  moneda?: string;

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

  @ApiPropertyOptional({ description: 'Días de crédito', example: 30 })
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

  @ApiPropertyOptional({ 
    description: 'Detalle de productos de la orden',
    type: [OrdenCompraDetalleDto]
  })
  @IsOptional()
  @IsArray({ message: 'Los detalles deben ser un array' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => OrdenCompraDetalleDto)
  detalles?: OrdenCompraDetalleDto[];
}
