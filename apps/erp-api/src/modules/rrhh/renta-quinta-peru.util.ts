import { Decimal } from 'decimal.js';

/**
 * Retención mensual del Impuesto a la Renta de quinta categoría (Perú).
 *
 * Procedimiento del artículo 40 del Reglamento de la Ley del Impuesto a la Renta.
 * El motor anterior hacía otra cosa: tomaba el ingreso del mes, lo multiplicaba
 * por doce, restaba 7 UIT, aplicaba los tramos y dividía siempre entre doce. Eso
 * fallaba de dos maneras. En un mes con gratificación la proyección anual se
 * duplicaba y disparaba una retención varias veces mayor de la que corresponde; y
 * al no descontar lo ya retenido ni cambiar el divisor durante el año, el total
 * retenido en el ejercicio nunca cuadraba con el impuesto anual.
 *
 * Este módulo es intencionalmente puro: la lectura del historial y de la normativa
 * queda en el servicio, y aquí sólo vive la regla, que es la parte que hay que
 * poder auditar contra la norma.
 */

/**
 * Divisor que el artículo 40 fija para cada mes. Diciembre no divide: regulariza
 * el saldo del ejercicio, por eso su divisor es 1.
 */
export const DIVISOR_RETENCION_POR_MES: Readonly<Record<number, number>> = Object.freeze({
  1: 12,
  2: 12,
  3: 12,
  4: 9,
  5: 8,
  6: 8,
  7: 8,
  8: 5,
  9: 4,
  10: 4,
  11: 4,
  12: 1,
});

/**
 * Tramos de la escala progresiva acumulativa, expresados en UIT sobre la renta
 * neta imponible. Se aplican por tramo, no como tasa plana sobre el total.
 */
const TRAMOS_QUINTA: ReadonlyArray<{ limiteUit: number; tasa: number }> = Object.freeze([
  { limiteUit: 5, tasa: 0.08 },
  { limiteUit: 20, tasa: 0.14 },
  { limiteUit: 35, tasa: 0.17 },
  { limiteUit: 45, tasa: 0.2 },
  { limiteUit: Number.POSITIVE_INFINITY, tasa: 0.3 },
]);

/** Bonificación extraordinaria de la Ley 30334: 9 % de la gratificación. */
export const BONIFICACION_EXTRAORDINARIA_GRATIFICACION = 0.09;

export interface RetencionQuintaInput {
  /** Mes del periodo que se liquida, 1 a 12. */
  mes: number;
  /** Remuneración ordinaria del mes, sin gratificaciones ni extraordinarios. */
  remuneracionOrdinariaMes: number;
  /** Total realmente percibido en los meses anteriores del mismo ejercicio. */
  percibidoMesesAnteriores?: number;
  /**
   * Gratificaciones —con su bonificación extraordinaria— que aún se percibirán en
   * el ejercicio, incluida la del mes que se liquida. Las de meses ya cerrados no
   * van aquí: ya están dentro de `percibidoMesesAnteriores` y contarlas dos veces
   * inflaría la proyección.
   */
  gratificacionesPendientes?: number;
  /** Ingresos extraordinarios del mes (bonos, utilidades) distintos del ordinario. */
  ingresosExtraordinariosMes?: number;
  /** Retenciones de quinta ya efectuadas en meses anteriores del ejercicio. */
  retencionesPrevias?: number;
  uit: number;
  /** UIT deducibles; la norma fija 7. */
  deduccionUit: number;
}

export interface RetencionQuintaResultado {
  rentaBrutaProyectada: number;
  rentaNetaProyectada: number;
  impuestoAnualProyectado: number;
  divisor: number;
  retencionesPrevias: number;
  retencionMes: number;
}

const round2 = (valor: Decimal): number => valor.toDecimalPlaces(2).toNumber();

const sane = (valor: number | undefined): Decimal => {
  const n = Number(valor ?? 0);
  return new Decimal(Number.isFinite(n) && n > 0 ? n : 0);
};

/**
 * Gratificaciones que todavía se percibirán en el ejercicio, contando desde el mes
 * que se liquida. En Perú son dos: julio y diciembre, cada una equivalente a una
 * remuneración más la bonificación extraordinaria de la Ley 30334.
 *
 * Se calcula aparte de la retención para que el servicio pueda sustituirla por el
 * importe real cuando lo conozca (gratificación trunca, por ejemplo) sin tener que
 * replicar el resto del procedimiento.
 */
export function gratificacionesPendientesDelEjercicio(
  mes: number,
  remuneracionOrdinariaMes: number,
  tasaBonificacion: number = BONIFICACION_EXTRAORDINARIA_GRATIFICACION,
): number {
  const mesNormalizado = Math.min(Math.max(Math.trunc(mes) || 1, 1), 12);
  const ordinaria = sane(remuneracionOrdinariaMes);
  const factor = new Decimal(1).plus(sane(tasaBonificacion));
  const pendientes = [7, 12].filter((mesGratificacion) => mesGratificacion >= mesNormalizado).length;
  return round2(ordinaria.times(factor).times(pendientes));
}

/** Impuesto anual según la escala progresiva acumulativa, sobre la renta neta. */
export function impuestoAnualQuinta(rentaNeta: number, uit: number): number {
  const neta = sane(rentaNeta);
  const unidad = sane(uit);
  if (neta.lessThanOrEqualTo(0) || unidad.lessThanOrEqualTo(0)) return 0;

  let impuesto = new Decimal(0);
  let consumido = new Decimal(0);

  for (const tramo of TRAMOS_QUINTA) {
    const techo = Number.isFinite(tramo.limiteUit)
      ? unidad.times(tramo.limiteUit)
      : neta;
    if (neta.lessThanOrEqualTo(consumido)) break;
    const gravableEnTramo = Decimal.min(neta, techo).minus(consumido);
    if (gravableEnTramo.greaterThan(0)) {
      impuesto = impuesto.plus(gravableEnTramo.times(tramo.tasa));
      consumido = consumido.plus(gravableEnTramo);
    }
  }

  return round2(impuesto);
}

/**
 * Retención del mes según el artículo 40.
 *
 * De enero a marzo el impuesto anual se divide entre doce sin descontar nada: en
 * esos meses la norma no manda restar lo ya retenido. Desde abril sí se resta el
 * acumulado del ejercicio antes de dividir por el divisor del mes, y en diciembre
 * se paga el saldo íntegro para que el total del año cuadre con el impuesto anual.
 */
export function calcularRetencionQuintaPeru(
  input: RetencionQuintaInput,
): RetencionQuintaResultado {
  const mes = Math.min(Math.max(Math.trunc(input.mes) || 1, 1), 12);
  const divisor = DIVISOR_RETENCION_POR_MES[mes] ?? 12;

  const ordinaria = sane(input.remuneracionOrdinariaMes);
  const mesesRestantes = 12 - mes + 1;

  const rentaBruta = ordinaria
    .times(mesesRestantes)
    .plus(sane(input.percibidoMesesAnteriores))
    .plus(sane(input.gratificacionesPendientes))
    .plus(sane(input.ingresosExtraordinariosMes));

  const deduccion = sane(input.uit).times(sane(input.deduccionUit));
  const rentaNeta = Decimal.max(rentaBruta.minus(deduccion), 0);
  const impuestoAnual = new Decimal(impuestoAnualQuinta(rentaNeta.toNumber(), input.uit));

  const retencionesPrevias = sane(input.retencionesPrevias);
  const base = mes <= 3
    ? impuestoAnual
    : Decimal.max(impuestoAnual.minus(retencionesPrevias), 0);

  const retencion = Decimal.max(base.dividedBy(divisor), 0);

  return {
    rentaBrutaProyectada: round2(rentaBruta),
    rentaNetaProyectada: round2(rentaNeta),
    impuestoAnualProyectado: round2(impuestoAnual),
    divisor,
    retencionesPrevias: round2(retencionesPrevias),
    retencionMes: round2(retencion),
  };
}

/** Extrae el mes de un periodo `YYYY-MM`; devuelve null si no tiene ese formato. */
export function mesDelPeriodo(periodo?: string | null): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodo ?? '').trim());
  if (!match) return null;
  const mes = Number(match[2]);
  return mes >= 1 && mes <= 12 ? mes : null;
}

/** Extrae el año de un periodo `YYYY-MM`; devuelve null si no tiene ese formato. */
export function anioDelPeriodo(periodo?: string | null): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodo ?? '').trim());
  return match ? Number(match[1]) : null;
}
