/**
 * Cálculo de beneficios sociales al cese, según la normativa laboral peruana.
 *
 * Se aísla del servicio para poder fijarlo con pruebas: los importes que salen de
 * aquí son dinero que se le paga al trabajador y no pueden depender de una
 * fórmula sin cobertura.
 *
 * Referencias:
 * - CTS: D.S. 001-97-TR (TUO del D. Leg. 650), arts. 9, 21 y 22.
 * - Vacaciones: D. Leg. 713, arts. 10 y 22 (récord trunco).
 * - Indemnización por despido arbitrario: D.S. 003-97-TR, art. 38.
 * - Gratificaciones: Ley 27735 (trunca, art. 7) y Ley 30334 (bonificación 9%).
 */

/**
 * Interpreta una fecha sin hora como fecha local. `new Date('2026-08-01')` la
 * parsea como medianoche UTC y en Perú (UTC-5) se lee como 31 de julio: la
 * liquidación perdía un día de servicios, y un mes entero cuando el ingreso caía
 * el día 1.
 */
export function parseFechaLocal(valor: string | Date | null | undefined): Date {
  if (valor instanceof Date) return valor;

  const texto = String(valor ?? '').trim();
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (soloFecha) {
    return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
  }

  return new Date(texto);
}

export interface TiempoServicios {
  /** Meses completos entre ambas fechas. */
  meses: number;
  /** Días sueltos del mes incompleto final. */
  dias: number;
}

/**
 * Meses completos y días restantes entre dos fechas. La normativa liquida los
 * beneficios por dozavos (meses completos) y treintavos (días sueltos), así que
 * ambos se devuelven por separado en vez de un número decimal de años.
 */
export function tiempoDeServicios(ingreso: Date, cese: Date): TiempoServicios {
  if (!(ingreso instanceof Date) || !(cese instanceof Date)) return { meses: 0, dias: 0 };
  if (Number.isNaN(ingreso.getTime()) || Number.isNaN(cese.getTime())) return { meses: 0, dias: 0 };
  if (cese <= ingreso) return { meses: 0, dias: 0 };

  let meses = (cese.getFullYear() - ingreso.getFullYear()) * 12 + (cese.getMonth() - ingreso.getMonth());
  let dias = cese.getDate() - ingreso.getDate();

  if (dias < 0) {
    meses -= 1;
    // Días del mes anterior al del cese, para completar el mes incompleto.
    dias += new Date(cese.getFullYear(), cese.getMonth(), 0).getDate();
  }

  return { meses: Math.max(0, meses), dias: Math.max(0, dias) };
}

const redondear = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

/** Fracción de año en dozavos y treintavos, que es como liquida la ley. */
export function fraccionAnual({ meses, dias }: TiempoServicios): number {
  return meses / 12 + dias / 360;
}

/**
 * Remuneración computable para CTS: remuneración mensual más un sexto de la
 * última gratificación (D.S. 001-97-TR, art. 9).
 */
export function remuneracionComputableCts(remuneracionMensual: number, ultimaGratificacion?: number): number {
  const base = Number(remuneracionMensual) || 0;
  const gratificacion = Number.isFinite(Number(ultimaGratificacion)) ? Number(ultimaGratificacion) : base;
  return redondear(base + gratificacion / 6);
}

/**
 * CTS: un dozavo de la remuneración computable por mes completo y un treintavo
 * de ese dozavo por día suelto. Un año completo equivale a una remuneración
 * computable íntegra.
 */
export function calcularCts(remuneracionComputable: number, tiempo: TiempoServicios): number {
  const rc = Number(remuneracionComputable) || 0;
  if (rc <= 0) return 0;
  return redondear(rc * fraccionAnual(tiempo));
}

/**
 * Vacaciones adeudadas al cese: las vencidas de periodos ya cumplidos y no
 * gozadas, más las truncas del periodo en curso. Se calculan sobre todo el
 * tiempo de servicios y se descuentan los días efectivamente gozados; mirar solo
 * el periodo en curso dejaba en cero a quien cesaba justo en su aniversario, con
 * treinta días ganados sin pagar.
 */
export function calcularVacacionesTruncas(
  remuneracionMensual: number,
  tiempoServicios: TiempoServicios,
  diasGozados = 0,
): number {
  const base = Number(remuneracionMensual) || 0;
  if (base <= 0) return 0;

  const ganado = base * fraccionAnual(tiempoServicios);
  const gozado = (base / 30) * (Number(diasGozados) || 0);

  return redondear(Math.max(0, ganado - gozado));
}

/** Días de vacaciones pendientes al cese, para mostrar en la liquidación. */
export function diasVacacionesPendientes(tiempoServicios: TiempoServicios, diasGozados = 0): number {
  const ganados = 30 * fraccionAnual(tiempoServicios);
  return redondear(Math.max(0, ganados - (Number(diasGozados) || 0)));
}

/**
 * Indemnización por despido arbitrario: una remuneración y media por año completo,
 * con las fracciones en dozavos y treintavos, y **tope de doce remuneraciones**
 * (D.S. 003-97-TR, art. 38). Sin el tope, una antigüedad larga generaba importes
 * sin límite.
 */
export function calcularIndemnizacionDespido(remuneracionMensual: number, tiempo: TiempoServicios): number {
  const base = Number(remuneracionMensual) || 0;
  if (base <= 0) return 0;

  const bruto = base * 1.5 * (tiempo.meses / 12 + tiempo.dias / 360);
  return redondear(Math.min(bruto, base * 12));
}

/**
 * Gratificación trunca: un sexto de la remuneración por mes completo trabajado en
 * el semestre en curso (Ley 27735, art. 7), más la bonificación extraordinaria del
 * 9% que sustituye el aporte a EsSalud (Ley 30334).
 */
export function calcularGratificacionTrunca(
  remuneracionMensual: number,
  mesesDelSemestre: number,
): { gratificacion: number; bonificacionExtraordinaria: number; total: number } {
  const base = Number(remuneracionMensual) || 0;
  const meses = Math.max(0, Math.min(6, Math.floor(Number(mesesDelSemestre) || 0)));

  const gratificacion = redondear((base / 6) * meses);
  const bonificacionExtraordinaria = redondear(gratificacion * 0.09);

  return {
    gratificacion,
    bonificacionExtraordinaria,
    total: redondear(gratificacion + bonificacionExtraordinaria),
  };
}

/**
 * Meses computables para la gratificación de un periodo de planilla `YYYY-MM`.
 * Devuelve `null` si el periodo no es julio ni diciembre, que son los únicos en
 * los que se paga (Ley 27735, art. 1): julio liquida el semestre enero-junio y
 * diciembre el semestre julio-diciembre.
 *
 * Sólo cuentan los meses calendario completos: quien ingresa a mitad de mes
 * empieza a acumular desde el mes siguiente.
 */
export function mesesGratificablesDelPeriodo(periodo: string, fechaIngreso: Date): number | null {
  const partes = /^(\d{4})-(\d{2})$/.exec(String(periodo ?? '').trim());
  if (!partes) return null;

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  if (mes !== 7 && mes !== 12) return null;

  const inicioSemestre = mes === 7 ? new Date(anio, 0, 1) : new Date(anio, 6, 1);
  // Primer día del mes siguiente al semestre, para que un semestre completo mida seis meses.
  const finSemestre = mes === 7 ? new Date(anio, 6, 1) : new Date(anio + 1, 0, 1);

  const desde = fechaIngreso > inicioSemestre ? fechaIngreso : inicioSemestre;
  if (desde >= finSemestre) return 0;

  return Math.max(0, Math.min(6, tiempoDeServicios(desde, finSemestre).meses));
}

/** Meses completos transcurridos del semestre gratificatorio (ene-jun o jul-dic). */
export function mesesDelSemestreGratificatorio(ingreso: Date, cese: Date): number {
  const inicioSemestre = new Date(cese.getFullYear(), cese.getMonth() < 6 ? 0 : 6, 1);
  const desde = ingreso > inicioSemestre ? ingreso : inicioSemestre;
  return tiempoDeServicios(desde, cese).meses;
}

