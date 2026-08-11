import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class GenerarNotaCreditoDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(FC|BC)[0-9]{2}$/i, {
    message: 'serie debe ser FCnn o BCnn y coincidir con el CPE de origen',
  })
  serie?: string;

  @IsOptional()
  @IsIn(['06', '07'])
  tipo_nota_credito?: '06' | '07';
}
