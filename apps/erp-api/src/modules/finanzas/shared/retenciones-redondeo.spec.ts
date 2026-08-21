import Decimal from 'decimal.js';
import { RetencionesService } from '../../retenciones/retenciones.service';
import { TipoAjusteFiscal } from '../../retenciones/dto/retenciones-input.dto';

/**
 * La comprobación de retenciones y quien las calcula tienen que dar lo mismo.
 *
 * `RetencionesService.calcularAjuste` usa Decimal; `RetencionesValidationService`
 * usaba `Math.round(v * 100) / 100`, que no redondea bien la mitad porque el
 * producto intermedio se queda por debajo: 3 % de 5.50 sale 0.16499999999999998
 * y se redondea a 0.16 en lugar de 0.17.
 *
 * No estaba provocando rechazos —la comprobación tolera `> 0.01` y la diferencia
 * es exactamente un céntimo—, pero eso significa que la tolerancia estaba
 * absorbiendo nuestra propia aritmética en vez de las diferencias de redondeo de
 * quien envía el dato. Con las dos partes en Decimal, la tolerancia vuelve a
 * medir lo que dice medir.
 */
describe('retenciones: el redondeo del validador coincide con el del cálculo', () => {
  const servicio = new RetencionesService({} as any);

  const conDecimal = (base: number, tasa: number) =>
    new Decimal(base).times(tasa).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  const conFlotante = (base: number, tasa: number) => Math.round(base * (tasa / 100) * 100) / 100;

  // Casos reales de las tasas peruanas donde las dos aritméticas discrepan.
  const casos: Array<[number, number, number]> = [
    [5.5, 3, 0.17], // retención IGV
    [7.25, 2, 0.15], // percepción IGV
    [0.35, 10, 0.04], // detracción
    [11, 1.5, 0.17],
  ];

  it.each(casos)('%s al %s %% son %s', (base, tasa, esperado) => {
    expect(conDecimal(base, tasa)).toBe(esperado);
  });

  it.each(casos)('la coma flotante se quedaba corta en %s al %s %%', (base, tasa, esperado) => {
    // Deja constancia de por qué se cambió: no es una preferencia de estilo.
    expect(conFlotante(base, tasa)).not.toBe(esperado);
  });

  it.each(casos)('calcularAjuste devuelve el mismo importe para %s al %s %%', (base, tasa, esperado) => {
    const resultado = servicio.calcularAjuste({
      tipo: TipoAjusteFiscal.RETENCION,
      base_calculo: base,
      tasa,
    } as any);

    expect(resultado.monto).toBe(esperado);
  });
});
