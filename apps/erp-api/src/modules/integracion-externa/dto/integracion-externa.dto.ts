import { IsDateString, IsInt, IsString, IsUUID, Length, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CrearIntegracionExternaDto {
  @IsString() @Length(3, 120) nombre!: string;
  @IsString() @Length(2, 80) sistema!: string;
  @IsUUID() sucursal_id!: string;
  @IsDateString() expira_en!: string;
  @IsString() @Length(8, 200) idempotency_key!: string;
}

export class RotarIntegracionExternaDto {
  @IsInt() @Min(1) @Max(720) gracia_horas!: number;
}

export class VencimientoIntegracionExternaDto {
  @IsDateString() expira_en!: string;
}

export class RevocarIntegracionExternaDto {
  @IsString() @MinLength(3) @MaxLength(500) motivo!: string;
}
