import { IsOptional, IsString } from 'class-validator';

export class GenerarNotaCreditoDto {
  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsString()
  serie?: string;
}
