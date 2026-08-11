import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DesktopSignedCpeItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  descripcion!: string;

  @IsString()
  @Matches(/^[A-Z0-9]{2,5}$/)
  unidad!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(999999999)
  cantidad!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  precio_unitario!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valor_venta!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  igv!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio_venta!: number;

  @IsOptional()
  @IsUUID()
  producto_id?: string;
}

export class DesktopSignedCpeDto {
  @IsString()
  @Matches(/^local-fiscal-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  local_fiscal_id!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  idempotency_key!: string;

  @IsIn(['01', '03', '07', '08'])
  tipo_documento!: '01' | '03' | '07' | '08';

  @IsString()
  @Matches(/^[A-Z0-9]{1,10}$/)
  serie!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99999999)
  numero!: number;

  @IsString()
  @MinLength(100)
  @MaxLength(10_000_000)
  signed_xml!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9+/]{43}=$/)
  hash!: string;

  @IsDateString({ strict: true })
  fecha_emision!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  source_type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source_id?: string;

  @IsString()
  @Matches(/^[A-Za-z0-9-]{6,20}$/)
  documento_receptor!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{1,4}$/)
  tipo_documento_receptor!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  razon_social_receptor!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  direccion_receptor?: string;

  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  moneda!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(999)
  @ValidateNested({ each: true })
  @Type(() => DesktopSignedCpeItemDto)
  items!: DesktopSignedCpeItemDto[];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_gravadas!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_igv!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  total_venta!: number;
}
