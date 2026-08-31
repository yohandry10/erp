import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LineaNotaReferenciadaDto {
  @IsUUID('4')
  source_document_line_id!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  cantidad!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  base!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  impuesto!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  total!: number;
}

export class CrearNotaReferenciadaDto {
  @IsUUID('4')
  documento_origen_id!: string;

  @IsIn(['07', '08', '91', '92'])
  tipo_documento!: '07' | '08' | '91' | '92';

  @IsString()
  @Matches(/^\d{1,2}$/)
  codigo_motivo!: string;

  @IsString()
  @Length(3, 500)
  motivo!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto_total!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineaNotaReferenciadaDto)
  lineas?: LineaNotaReferenciadaDto[];

  @IsOptional()
  @IsBoolean()
  prorrateo_global?: boolean;
}
