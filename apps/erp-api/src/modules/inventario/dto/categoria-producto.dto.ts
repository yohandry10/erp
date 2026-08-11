import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CampoExtraProductoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z0-9_]+$/)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;

  @IsIn(['text', 'number', 'date', 'select'])
  tipo!: 'text' | 'number' | 'date' | 'select';

  @IsBoolean()
  requerido!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  opciones?: string[];
}

export class CreateCategoriaProductoDto {
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CampoExtraProductoDto)
  campos_extra?: CampoExtraProductoDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}

export class UpdateCategoriaProductoDto extends PartialType(CreateCategoriaProductoDto) {
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;

  @IsOptional()
  @Equals(true, { message: 'La desactivación requiere DELETE y su permiso específico' })
  activo?: true;
}
