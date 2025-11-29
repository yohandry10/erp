import { ApiProperty } from '@nestjs/swagger';

export class CashflowDetalleDto {
  @ApiProperty({ example: 1000 })
  utilidadNeta: number;

  @ApiProperty({ example: -200 })
  variacionCxc: number;

  @ApiProperty({ example: 150 })
  variacionInventario: number;

  @ApiProperty({ example: 300 })
  variacionCxp: number;

  @ApiProperty({ example: -500 })
  variacionInversiones: number;

  @ApiProperty({ example: 250 })
  variacionFinanciamiento: number;
}

export class CashflowResponseDto {
  @ApiProperty({ example: 800 })
  operativo: number;

  @ApiProperty({ example: -500 })
  inversion: number;

  @ApiProperty({ example: 250 })
  financiamiento: number;

  @ApiProperty({ example: 550 })
  neto: number;

  @ApiProperty({ type: CashflowDetalleDto })
  detalle: CashflowDetalleDto;
}

export class RatiosResponseDto {
  @ApiProperty({ example: 1.5 })
  liquidez: number;

  @ApiProperty({ example: 1.1 })
  pruebaAcida: number;

  @ApiProperty({ example: 0.22 })
  ebitdaMargin: number;

  @ApiProperty({ example: 35 })
  dso: number;

  @ApiProperty({ example: 28 })
  dpo: number;

  @ApiProperty({ example: 45 })
  dio: number;

  @ApiProperty({ example: 3.5 })
  rotacionInventario: number;
}
