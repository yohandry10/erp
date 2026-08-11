import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MatchLoteParDto {
  @IsUUID('4')
  movimiento_sistema_id: string;

  @IsUUID('4')
  movimiento_extracto_id: string;
}

export class MatchLoteDto {
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => MatchLoteParDto)
  pares: MatchLoteParDto[];
}
