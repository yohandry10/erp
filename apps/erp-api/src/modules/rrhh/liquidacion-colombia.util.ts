const MS_DAY = 86_400_000;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const parse = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Fecha laboral inválida');
  return date;
};
const daysInclusive = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_DAY) + 1);

export interface LiquidacionColombiaInput {
  fechaIngreso: string | Date;
  fechaTerminacion: string | Date;
  prestacionesPagadasHasta?: string | Date;
  sueldoMensual: number;
  auxilioTransporteMensual?: number;
  motivoTerminacion: string;
  tipoContrato?: string;
  fechaFinContrato?: string | Date;
  salarioMinimo?: number;
  vacacionesDiasGozados?: number;
}

export function calcularLiquidacionColombia(input: LiquidacionColombiaInput) {
  const ingreso = parse(input.fechaIngreso);
  const terminacion = parse(input.fechaTerminacion);
  if (terminacion < ingreso) throw new Error('La terminación no puede preceder al ingreso');
  const pagadoHasta = input.prestacionesPagadasHasta ? parse(input.prestacionesPagadasHasta) : ingreso;
  const inicioPrestaciones = pagadoHasta > ingreso ? new Date(pagadoHasta.getTime() + MS_DAY) : ingreso;
  const diasPrestaciones = daysInclusive(inicioPrestaciones, terminacion);
  const diasServicio = daysInclusive(ingreso, terminacion);
  const sueldo = Math.max(0, Number(input.sueldoMensual || 0));
  const auxilio = Math.max(0, Number(input.auxilioTransporteMensual || 0));
  const basePrestaciones = sueldo + auxilio;

  const cesantias = round((basePrestaciones * diasPrestaciones) / 360);
  const interesesCesantias = round((cesantias * 0.12 * diasPrestaciones) / 360);
  const primaServicios = round((basePrestaciones * diasPrestaciones) / 360);
  const diasVacacionesCausadas = (diasServicio * 15) / 360;
  const diasVacacionesPendientes = Math.max(
    0,
    diasVacacionesCausadas - Math.max(0, Number(input.vacacionesDiasGozados || 0)),
  );
  const vacaciones = round((sueldo / 30) * diasVacacionesPendientes);

  const motivo = String(input.motivoTerminacion || '').toLowerCase();
  const sinJustaCausa = ['despido', 'despido_sin_justa_causa', 'sin_justa_causa'].includes(motivo);
  let indemnizacion = 0;
  if (sinJustaCausa) {
    const tipo = String(input.tipoContrato || '').toLowerCase();
    if (tipo.includes('fijo') || tipo === 'temporal') {
      const fin = input.fechaFinContrato ? parse(input.fechaFinContrato) : terminacion;
      const diasRestantes = Math.max(15, daysInclusive(new Date(terminacion.getTime() + MS_DAY), fin));
      indemnizacion = round((sueldo / 30) * diasRestantes);
    } else {
      const salarioMinimo = Math.max(1, Number(input.salarioMinimo || 1_750_905));
      const anosAdicionales = Math.max(0, (diasServicio - 360) / 360);
      const diasIndemnizacion =
        sueldo < salarioMinimo * 10
          ? 30 + anosAdicionales * 20
          : 20 + anosAdicionales * 15;
      indemnizacion = round((sueldo / 30) * diasIndemnizacion);
    }
  }

  return {
    diasServicio,
    diasPrestaciones,
    cesantias,
    interesesCesantias,
    primaServicios,
    diasVacacionesPendientes: round(diasVacacionesPendientes),
    vacaciones,
    indemnizacion,
    total: round(cesantias + interesesCesantias + primaServicios + vacaciones + indemnizacion),
  };
}
