import {
  IsIn,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CrearNotaReferenciadaDto {
  @IsUUID('4')
  documento_origen_id!: string;

  @IsIn(['07', '08'])
  tipo_documento!: '07' | '08';

  @IsString()
  @Length(2, 2)
  codigo_motivo!: string;

  @IsString()
  @Length(3, 500)
  motivo!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto_total!: number;
}
