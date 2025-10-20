import { IsString, IsUUID, IsOptional, IsArray, ValidateNested, IsDateString, IsEnum, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CotizacionDetalleDto } from './cotizacion-detalle.dto';
import { EstadoCotizacion } from '../entities/cotizacion.entity';

/**
 * UpdateCotizacionDto
 * DTO para actualizar una cotización existente
 * Requirements: 3.4, 3.5
 */
export class UpdateCotizacionDto {
  @IsOptional()
  @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido' })
  cliente_id?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida' })
  fecha_vencimiento?: string;

  @IsOptional()
  @IsEnum(EstadoCotizacion, { message: 'El estado debe ser válido' })
  estado?: EstadoCotizacion;

  @IsOptional()
  @IsArray({ message: 'El detalle debe ser un array' })
  @ArrayMinSize(1, { message: 'La cotización debe tener al menos un producto' })
  @ArrayMaxSize(999, { message: 'La cotización no puede tener más de 999 productos' })
  @ValidateNested({ each: true })
  @Type(() => CotizacionDetalleDto)
  detalle?: CotizacionDetalleDto[];

  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;
}
