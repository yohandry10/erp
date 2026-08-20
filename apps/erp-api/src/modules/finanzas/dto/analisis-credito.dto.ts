import { IsIn, IsNumber, Min } from 'class-validator';

/**
 * Body de POST /api/finanzas/analisis-credito.
 *
 * Venía con el tipo declarado en línea, que no llega a runtime: el importe y el
 * plazo entraban sin comprobar y el análisis podía correr sobre valores
 * negativos o ausentes.
 */
export class AnalisisCreditoDto {
  @IsNumber() @Min(0) montoSolicitado!: number;
  @IsNumber() @Min(1) plazoMeses!: number;
  @IsNumber() @Min(0) ingresosMensuales!: number;

  @IsIn(['EXCELENTE', 'BUENO', 'REGULAR', 'MALO'])
  historialCrediticio!: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'MALO';
}
