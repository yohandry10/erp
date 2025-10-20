import { IsString, IsUUID, IsOptional, IsArray, ValidateNested, IsDateString, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CotizacionDetalleDto } from './cotizacion-detalle.dto';

/**
 * CreateCotizacionDto
 * DTO para crear una nueva cotización
 * Requirements: 3.2, 3.3, 15.1, 15.2, 15.3
 */
export class CreateCotizacionDto {
  @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido' })
  cliente_id: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida' })
  fecha_vencimiento?: string;

  @IsArray({ message: 'El detalle debe ser un array' })
  @ArrayMinSize(1, { message: 'La cotización debe tener al menos un producto' })
  @ArrayMaxSize(999, { message: 'La cotización no puede tener más de 999 productos' })
  @ValidateNested({ each: true })
  @Type(() => CotizacionDetalleDto)
  detalle: CotizacionDetalleDto[];

  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;
}
