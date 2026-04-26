import { IsUUID, IsArray, IsOptional, IsString, IsNumber, IsEnum, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CalidadRecepcion {
  OK = 'OK',
  OBSERVADO = 'OBSERVADO',
  RECHAZADO = 'RECHAZADO'
}

export class ItemRecepcionDto {
  @ApiProperty({ description: 'ID del detalle de la orden de compra' })
  @IsUUID()
  detalle_id: string;

  @ApiProperty({ description: 'Cantidad recibida' })
  @IsNumber()
  @Min(0)
  cantidad_recibida: number;

  @ApiProperty({ description: 'Calidad de la recepción', enum: CalidadRecepcion })
  @IsEnum(CalidadRecepcion)
  calidad: CalidadRecepcion;

  @ApiPropertyOptional({ description: 'ID del almacén de destino' })
  @IsOptional()
  @IsUUID()
  almacen_id?: string;

  @ApiPropertyOptional({ description: 'ID de la ubicación en el almacén' })
  @IsOptional()
  @IsUUID()
  ubicacion_id?: string;

  @ApiPropertyOptional({ description: 'Número de lote' })
  @IsOptional()
  @IsString()
  lote?: string;

  @ApiPropertyOptional({ description: 'Número de serie' })
  @IsOptional()
  @IsString()
  serie?: string;

  @ApiPropertyOptional({ description: 'Fecha de expiración del lote' })
  @IsOptional()
  @IsString()
  fecha_expiracion?: string;

  @ApiPropertyOptional({ description: 'Observaciones del item' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class CreateRecepcionDto {
  @ApiProperty({ description: 'ID de la orden de compra' })
  @IsUUID()
  orden_id: string;

  @ApiProperty({ description: 'Items recibidos', type: [ItemRecepcionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemRecepcionDto)
  items: ItemRecepcionDto[];

  @ApiPropertyOptional({ description: 'Observaciones generales de la recepción' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiPropertyOptional({ description: 'ID del almacén por defecto' })
  @IsOptional()
  @IsUUID()
  almacen_id?: string;

  @ApiPropertyOptional({ description: 'ID de la ubicación por defecto' })
  @IsOptional()
  @IsUUID()
  ubicacion_id?: string;

  @ApiPropertyOptional({ description: 'Lote por defecto' })
  @IsOptional()
  @IsString()
  lote?: string;
}
