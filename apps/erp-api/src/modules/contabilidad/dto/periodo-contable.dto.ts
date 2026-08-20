import { IsInt, Max, Min } from 'class-validator';

/**
 * Año y mes de un período contable.
 *
 * Lo comparten el cierre de período y el refresco de estados financieros: los
 * dos recibían un body sin validar y comprobaban el rango a mano dentro del
 * handler, cada uno con su propio mensaje. Con el DTO el rechazo ocurre antes de
 * entrar al controlador y es el mismo en ambos.
 *
 * El límite inferior de año evita que un dígito de más convierta un cierre en un
 * recorrido de siglos; el superior deja margen para ejercicios futuros.
 */
export class PeriodoContableDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  mes!: number;
}
