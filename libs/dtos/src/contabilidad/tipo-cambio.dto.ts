import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUUID,
  IsPositive,
  Length,
  Matches
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Lado de la cotización a aplicar.
 *
 * La normativa peruana valúa los activos en moneda extranjera al tipo de cambio
 * COMPRA y los pasivos al de VENTA. El enum evita que esa regla quede escrita
 * como un booleano sin nombre en medio del cálculo.
 */
export enum LadoTipoCambio {
  COMPRA = 'COMPRA',
  VENTA = 'VENTA'
}

export class CreateTipoCambioDto {
  @ApiProperty({ description: 'Moneda cotizada en ISO 4217', example: 'USD' })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/, { message: 'moneda_origen debe ser un código ISO 4217 de 3 letras' })
  moneda_origen: string;

  @ApiProperty({ description: 'Moneda en la que se expresa la cotización', example: 'PEN' })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/, { message: 'moneda_destino debe ser un código ISO 4217 de 3 letras' })
  moneda_destino: string;

  @ApiProperty({ description: 'Fecha de la cotización (YYYY-MM-DD)' })
  @IsDateString()
  fecha: string;

  @ApiPropertyOptional({
    description: 'Tipo de cambio compra. Si se omite se replica el de venta.',
    example: 3.742
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  compra?: number;

  @ApiPropertyOptional({
    description: 'Tipo de cambio venta. Si se omite se replica el de compra.',
    example: 3.749
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  venta?: number;

  @ApiPropertyOptional({ description: 'Origen del dato', example: 'SUNAT', default: 'MANUAL' })
  @IsOptional()
  @IsString()
  fuente?: string;
}

export class TipoCambioResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  tenant_id: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  moneda_origen: string;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  moneda_destino: string;

  @ApiProperty()
  @IsDateString()
  fecha: string;

  @ApiProperty({ example: 3.742 })
  @IsNumber()
  compra: number;

  @ApiProperty({ example: 3.749 })
  @IsNumber()
  venta: number;

  @ApiProperty({ example: 'SUNAT' })
  @IsString()
  fuente: string;

  @ApiPropertyOptional({
    description:
      'True cuando la cotización devuelta no es de la fecha pedida sino la última anterior vigente.'
  })
  @IsOptional()
  vigente_desde_fecha_anterior?: boolean;
}

export class ListarTiposCambioQueryDto {
  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  moneda_origen?: string;

  @ApiPropertyOptional({ example: 'PEN' })
  @IsOptional()
  @IsString()
  moneda_destino?: string;

  @ApiPropertyOptional({ description: 'Fecha desde (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @ApiPropertyOptional({ description: 'Fecha hasta (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}
