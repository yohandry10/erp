import { Type } from 'class-transformer';
import { IsDefined, IsObject, ValidateNested } from 'class-validator';
import { UpdateActivoFijoDto, DarDeBajaActivoDto } from '@erp-suite/dtos';

export class UpdateAssetOriginalDto {
  @IsDefined() @IsObject() expected: Record<string, unknown>;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => UpdateActivoFijoDto)
  original: UpdateActivoFijoDto;
}
export class RetireAssetOriginalDto {
  @IsDefined() @IsObject() expected: Record<string, unknown>;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => DarDeBajaActivoDto)
  original: DarDeBajaActivoDto;
}
