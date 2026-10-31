import { Type } from 'class-transformer';
import { IsDefined, IsIn, IsUUID, ValidateNested } from 'class-validator';
import { CrearPlanillaFinancieraDto } from './planilla-financiera.dto';
import { CalcularPlanillaPersonalizadaDto } from './calcular-planilla-personalizada.dto';

export class CrearPlanillaConCalculoDto extends CrearPlanillaFinancieraDto {
  @IsIn(['PE', 'AR', 'CO']) pais_codigo!: string;
  @IsIn(['PEN', 'ARS', 'COP']) moneda!: string;
  @IsUUID('4') calculo_idempotency_key!: string;
  @IsDefined() @ValidateNested() @Type(() => CalcularPlanillaPersonalizadaDto)
  calculo_original!: CalcularPlanillaPersonalizadaDto;
}
