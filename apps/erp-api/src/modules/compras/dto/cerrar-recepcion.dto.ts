import { IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ReceiptCloseValuationDto {
  @ApiProperty({ description: 'Moneda de la orden' })
  @Matches(/^[A-Z]{3}$/)
  moneda: string;

  @ApiProperty({ description: 'Moneda contable del país de la empresa' })
  @Matches(/^[A-Z]{3}$/)
  moneda_base: string;

  @ApiProperty({ description: 'Unidades de moneda contable por unidad de moneda de la orden; decimal exacto' })
  @IsString()
  @Matches(/^(0|[1-9][0-9]{0,9})([.][0-9]{1,6})?$/)
  tipo_cambio: string;

  @ApiProperty({ description: 'Documento o fuente que sustenta la tasa utilizada' })
  @IsString()
  @Length(5, 200)
  referencia: string;
}

export class CerrarRecepcionDto {
  @ApiPropertyOptional({ description: 'Observaciones finales al cerrar la recepción' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiPropertyOptional({ type: ReceiptCloseValuationDto, description: 'Obligatoria cuando la moneda de la orden difiere de la contable' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiptCloseValuationDto)
  valuacion?: ReceiptCloseValuationDto;
}
