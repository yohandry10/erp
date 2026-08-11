import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CrearRmaItemDto {
  @IsUUID('4', { message: 'detalle_id debe ser un UUID válido' })
  detalle_id!: string;

  @IsOptional()
  @IsUUID('4', { message: 'producto_id debe ser un UUID válido' })
  producto_id?: string;

  @IsNumber({}, { message: 'La cantidad debe ser numérica' })
  @Min(0.01, { message: 'La cantidad debe ser mayor a cero' })
  cantidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo_item?: string;

  @IsOptional()
  @IsString()
  lote?: string;

  @IsOptional()
  @IsString()
  fecha_expiracion?: string;
}

export class CrearRmaDto {
  @IsUUID('4', { message: 'pedido_id debe ser un UUID válido' })
  pedido_id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  motivo_general!: string;

  @IsOptional()
  @IsUUID('4', { message: 'documento_origen_id debe ser un UUID válido' })
  documento_origen_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'almacen_retorno_id debe ser un UUID válido' })
  almacen_retorno_id?: string;

  @IsArray({ message: 'items debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item para RMA' })
  @ValidateNested({ each: true })
  @Type(() => CrearRmaItemDto)
  items!: CrearRmaItemDto[];
}
