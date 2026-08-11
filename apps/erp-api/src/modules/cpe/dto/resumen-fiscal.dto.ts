import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CrearComunicacionBajaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  comprobantesIds: string[];

  @IsString()
  @Length(3, 500)
  motivoBaja: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  fechaComunicacion?: string;

  @IsString()
  @Length(8, 255)
  idempotencyKey: string;
}

export class CrearResumenDiarioDto {
  @IsISO8601({ strict: true })
  fechaReferencia: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  comprobantesIds: string[];

  @IsString()
  @Length(8, 255)
  idempotencyKey: string;
}

export class EnviarResumenFiscalDto {
  @IsOptional()
  @IsString()
  @Length(8, 255)
  idempotencyKey?: string;
}
