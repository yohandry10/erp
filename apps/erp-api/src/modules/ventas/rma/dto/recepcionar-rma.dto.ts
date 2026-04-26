import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class RecepcionarRmaItemDto {
  @IsUUID('4', { message: 'rma_item_id debe ser un UUID válido' })
  rma_item_id!: string;

  @IsNumber({}, { message: 'La cantidad recibida debe ser numérica' })
  @Min(0.01, { message: 'La cantidad recibida debe ser mayor a cero' })
  cantidad_recibida!: number;

  @IsOptional()
  @IsUUID('4', { message: 'almacen_id debe ser un UUID válido' })
  almacen_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ubicacion_id debe ser un UUID válido' })
  ubicacion_id?: string;

  @IsOptional()
  @IsString()
  lote?: string;

  @IsOptional()
  @IsString()
  fecha_expiracion?: string;
}

export class RecepcionarRmaDto {
  @IsOptional()
  @IsUUID('4', { message: 'almacen_id debe ser un UUID válido' })
  almacen_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ubicacion_id debe ser un UUID válido' })
  ubicacion_id?: string;

  @IsOptional()
  @IsString()
  lote?: string;

  @IsArray({ message: 'items debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe registrar al menos un item recibido' })
  @ValidateNested({ each: true })
  @Type(() => RecepcionarRmaItemDto)
  items!: RecepcionarRmaItemDto[];
}
