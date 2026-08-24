import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateSucursalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nombre: string;

  /**
   * Codigo de establecimiento anexo de la ficha RUC. Se teclea, no se inventa:
   * si se omite, la base asigna el siguiente correlativo libre.
   */
  @IsString()
  @IsOptional()
  @Matches(/^[0-9]{1,4}$/, {
    message: 'codigo_establecimiento debe ser numerico de hasta 4 digitos',
  })
  codigo_establecimiento?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  codigo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  direccion?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[0-9]{6}$/, { message: 'ubigeo debe tener 6 digitos' })
  ubigeo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  telefono?: string;

  @IsUUID()
  @IsOptional()
  centro_costo_id?: string;
}

export class UpdateSucursalDto {
  @IsString()
  @IsOptional()
  @MaxLength(160)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  codigo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  direccion?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[0-9]{6}$/, { message: 'ubigeo debe tener 6 digitos' })
  ubigeo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  telefono?: string;

  @IsUUID()
  @IsOptional()
  centro_costo_id?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}

export class AsignarSucursalesDto {
  /**
   * Lista completa: lo que no venga se retira. Una lista vacia devuelve al
   * usuario al alcance total, que es lo que significa no tener asignaciones.
   */
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  sucursal_ids: string[];
}
