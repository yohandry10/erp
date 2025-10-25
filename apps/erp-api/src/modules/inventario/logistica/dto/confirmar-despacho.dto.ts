import { Type, Transform } from 'class-transformer';
import { IsOptional, IsString, IsArray, IsUUID, IsNumber, Min, ValidateNested } from 'class-validator';

export class ItemDespachadoDto {
  @IsUUID('4', { message: 'detalle_id debe ser un UUID válido' })
  detalle_id!: string;

  @IsOptional()
  @IsNumber({}, { message: 'La cantidad debe ser numérica' })
  @Min(0, { message: 'La cantidad debe ser mayor o igual a cero' })
  cantidad?: number;

  @IsOptional()
  @IsUUID('4', { message: 'almacen_id debe ser un UUID válido' })
  almacen_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ubicacion_id debe ser un UUID válido' })
  ubicacion_id?: string;

  @IsOptional()
  @IsString()
  lote?: string;
}

/**
 * ConfirmarDespachoDto
 * DTO para confirmar el despacho de un pedido
 * Requirements: 9.3, 9.4, 9.5, 21.7, 21.8
 */
export class ConfirmarDespachoDto {
  @IsOptional()
  @IsString()
  notas?: string;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDespachadoDto)
  @Transform(({ value }) => {
    if (!Array.isArray(value)) {
      return value;
    }
    return value.map((item) => {
      if (typeof item === 'string') {
        return { detalle_id: item };
      }
      return item;
    });
  })
  items_despachados?: ItemDespachadoDto[]; // IDs y cantidades despachadas por línea

  @IsOptional()
  @IsNumber({}, { message: 'El número de bultos debe ser numérico' })
  bultos?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El peso total debe ser numérico' })
  peso_total?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El volumen total debe ser numérico' })
  volumen_total?: number;

  @IsOptional()
  @IsString()
  transportista?: string;

  @IsOptional()
  @IsString()
  placa?: string;

  @IsOptional()
  @IsString()
  conductor?: string;
}
