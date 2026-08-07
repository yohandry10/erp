import Decimal from 'decimal.js';

export interface NormativaColombiaPeriodo {
  salarioMinimo: number;
  auxilioTransporte: number;
  saludEmpleado: number;
  pensionEmpleado: number;
  saludEmpleador: number;
  pensionEmpleador: number;
  cajaCompensacion: number;
  sena: number;
  icbf: number;
  arlClaseI: number;
  primaServiciosProvision: number;
  cesantiasProvision: number;
  interesesCesantiasProvision: number;
  vacacionesProvision: number;
  horasMensuales: number;
  jornadaSemanal: number;
  recargoDominicalFestivo: number;
  recargoNocturno: number;
  horaInicioNocturna: number;
  uvt: number;
  topeIbcSmmlv: number;
}

export const NORMATIVA_COLOMBIA_2026_DEFAULT: NormativaColombiaPeriodo = {
  salarioMinimo: 1_750_905,
  auxilioTransporte: 249_095,
  saludEmpleado: 0.04,
  pensionEmpleado: 0.04,
  saludEmpleador: 0.085,
  pensionEmpleador: 0.12,
  cajaCompensacion: 0.04,
  sena: 0.02,
  icbf: 0.03,
  arlClaseI: 0.00522,
  primaServiciosProvision: 1 / 12,
  cesantiasProvision: 1 / 12,
  interesesCesantiasProvision: 0.01,
  vacacionesProvision: 1 / 24,
  // Ley 2101 de 2021: desde 2026-07-15 la jornada máxima es 42 h/semana.
  horasMensuales: 210,
  jornadaSemanal: 42,
  // Ley 2466 de 2025: 90 % desde 2026-07-01 y jornada nocturna desde las 19:00.
  recargoDominicalFestivo: 0.9,
  recargoNocturno: 0.35,
  horaInicioNocturna: 19,
  // Resolución DIAN 238 de 2025.
  uvt: 52_374,
  topeIbcSmmlv: 25,
};

export interface PlanillaColombiaInput {
  sueldoMensual: number;
  diasTrabajados?: number;
  horasExtrasDiurnas?: number;
  horasExtrasNocturnas?: number;
  horasRecargoNocturno?: number;
  horasDominicalesFestivas?: number;
  horasExtrasDiurnasDominicales?: number;
  horasExtrasNocturnasDominicales?: number;
  retencionFuente?: number;
  fondoSolidaridadTasa?: number;
  arlTasa?: number;
  exoneradoSaludSenaIcbf?: boolean;
  recibeAuxilioTransporte?: boolean;
  otrosDevengados?: number;
  otrasDeducciones?: number;
  normativa?: NormativaColombiaPeriodo;
}

export interface ConceptoCalculadoColombia {
  codigo: string;
  monto: number;
  observaciones: string;
  tipo: 'INGRESO' | 'DESCUENTO' | 'APORTE';
}

const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2).toNumber();

export function resolverTasaFondoSolidaridad(ibc: Decimal.Value, salarioMinimo: Decimal.Value): number {
  const smmlv = new Decimal(salarioMinimo || 1);
  const salarios = new Decimal(ibc).div(smmlv);
  if (salarios.gte(20)) return 0.02;
  if (salarios.gte(19)) return 0.018;
  if (salarios.gte(18)) return 0.016;
  if (salarios.gte(17)) return 0.014;
  if (salarios.gte(16)) return 0.012;
  if (salarios.gte(4)) return 0.01;
  return 0;
}

export function calcularPlanillaColombia(input: PlanillaColombiaInput) {
  const normativa = input.normativa ?? NORMATIVA_COLOMBIA_2026_DEFAULT;
  const salario = new Decimal(Math.max(0, Number(input.sueldoMensual || 0)));
  const dias = Math.min(30, Math.max(0, Number(input.diasTrabajados ?? 30)));
  const salarioPeriodo = salario.div(30).times(dias);
  const valorHora = salario.div(normativa.horasMensuales || 230);
  const extrasDiurnas = valorHora.times(Math.max(0, Number(input.horasExtrasDiurnas || 0))).times(1.25);
  const extrasNocturnas = valorHora.times(Math.max(0, Number(input.horasExtrasNocturnas || 0))).times(1.75);
  const recargoNocturno = valorHora
    .times(Math.max(0, Number(input.horasRecargoNocturno || 0)))
    .times(normativa.recargoNocturno);
  const dominicalFestivo = valorHora
    .times(Math.max(0, Number(input.horasDominicalesFestivas || 0)))
    .times(normativa.recargoDominicalFestivo);
  const extraDiurnaDominical = valorHora
    .times(Math.max(0, Number(input.horasExtrasDiurnasDominicales || 0)))
    .times(new Decimal(1.25).plus(normativa.recargoDominicalFestivo));
  const extraNocturnaDominical = valorHora
    .times(Math.max(0, Number(input.horasExtrasNocturnasDominicales || 0)))
    .times(new Decimal(1.75).plus(normativa.recargoDominicalFestivo));
  const otrosDevengados = new Decimal(Math.max(0, Number(input.otrosDevengados || 0)));

  const tieneDerechoAuxilio =
    input.recibeAuxilioTransporte !== false &&
    salario.lte(new Decimal(normativa.salarioMinimo).times(2)) &&
    dias > 0;
  const auxilioTransporte = tieneDerechoAuxilio
    ? new Decimal(normativa.auxilioTransporte).div(30).times(dias)
    : new Decimal(0);

  const ingresosSalariales = salarioPeriodo
    .plus(extrasDiurnas)
    .plus(extrasNocturnas)
    .plus(recargoNocturno)
    .plus(dominicalFestivo)
    .plus(extraDiurnaDominical)
    .plus(extraNocturnaDominical)
    .plus(otrosDevengados);
  const ibcMinimo = new Decimal(normativa.salarioMinimo).div(30).times(dias);
  const ibcMaximo = new Decimal(normativa.salarioMinimo).times(normativa.topeIbcSmmlv);
  const ibc = Decimal.min(Decimal.max(ingresosSalariales, ibcMinimo), ibcMaximo);
  const saludEmpleado = ibc.times(normativa.saludEmpleado);
  const pensionEmpleado = ibc.times(normativa.pensionEmpleado);
  const tasaFondoSolidaridad = input.fondoSolidaridadTasa == null
    ? resolverTasaFondoSolidaridad(ibc, normativa.salarioMinimo)
    : Math.max(0, Number(input.fondoSolidaridadTasa));
  const fondoSolidaridad = ibc.times(tasaFondoSolidaridad);
  const retencionFuente = new Decimal(Math.max(0, Number(input.retencionFuente || 0)));
  const otrasDeducciones = new Decimal(Math.max(0, Number(input.otrasDeducciones || 0)));

  const exonerado = input.exoneradoSaludSenaIcbf === true
    && salario.lt(new Decimal(normativa.salarioMinimo).times(10));
  const saludEmpleador = exonerado ? new Decimal(0) : ibc.times(normativa.saludEmpleador);
  const pensionEmpleador = ibc.times(normativa.pensionEmpleador);
  const arl = ibc.times(Math.max(0, Number(input.arlTasa ?? normativa.arlClaseI)));
  const cajaCompensacion = ibc.times(normativa.cajaCompensacion);
  const sena = exonerado ? new Decimal(0) : ibc.times(normativa.sena);
  const icbf = exonerado ? new Decimal(0) : ibc.times(normativa.icbf);

  const basePrestaciones = ingresosSalariales.plus(auxilioTransporte);
  const primaServicios = basePrestaciones.times(normativa.primaServiciosProvision);
  const cesantias = basePrestaciones.times(normativa.cesantiasProvision);
  const interesesCesantias = basePrestaciones.times(normativa.interesesCesantiasProvision);
  const vacaciones = ibc.times(normativa.vacacionesProvision);

  const conceptos: ConceptoCalculadoColombia[] = [];
  const add = (
    codigo: string,
    value: Decimal,
    observaciones: string,
    tipo: ConceptoCalculadoColombia['tipo'],
  ) => {
    const monto = money(value);
    if (monto > 0) conceptos.push({ codigo, monto, observaciones, tipo });
  };

  add('CO001', salarioPeriodo, `Salario por ${dias} días`, 'INGRESO');
  add('CO002', auxilioTransporte, 'Auxilio de transporte', 'INGRESO');
  add('CO003', extrasDiurnas, 'Horas extra diurnas 25%', 'INGRESO');
  add('CO004', extrasNocturnas, 'Horas extra nocturnas 75%', 'INGRESO');
  add('CO005', recargoNocturno, 'Recargo nocturno 35%', 'INGRESO');
  add('CO007', dominicalFestivo, `Recargo dominical/festivo ${normativa.recargoDominicalFestivo * 100}%`, 'INGRESO');
  add('CO008', extraDiurnaDominical, 'Hora extra diurna dominical/festiva', 'INGRESO');
  add('CO009', extraNocturnaDominical, 'Hora extra nocturna dominical/festiva', 'INGRESO');
  add('CO006', otrosDevengados, 'Otros devengados', 'INGRESO');
  add('CO101', saludEmpleado, 'Aporte trabajador a salud 4%', 'DESCUENTO');
  add('CO102', pensionEmpleado, 'Aporte trabajador a pensión 4%', 'DESCUENTO');
  add('CO103', fondoSolidaridad, 'Fondo de Solidaridad Pensional', 'DESCUENTO');
  add('CO104', retencionFuente, 'Retención en la fuente configurada', 'DESCUENTO');
  add('CO105', otrasDeducciones, 'Otras deducciones autorizadas', 'DESCUENTO');
  add('CO201', saludEmpleador, 'Aporte empleador a salud 8,5%', 'APORTE');
  add('CO202', pensionEmpleador, 'Aporte empleador a pensión 12%', 'APORTE');
  add('CO203', arl, 'Aporte ARL según clase de riesgo', 'APORTE');
  add('CO204', cajaCompensacion, 'Caja de compensación familiar 4%', 'APORTE');
  add('CO205', sena, 'Aporte SENA 2%', 'APORTE');
  add('CO206', icbf, 'Aporte ICBF 3%', 'APORTE');
  add('CO207', primaServicios, 'Provisión prima de servicios', 'APORTE');
  add('CO208', cesantias, 'Provisión cesantías', 'APORTE');
  add('CO209', interesesCesantias, 'Provisión intereses a las cesantías', 'APORTE');
  add('CO210', vacaciones, 'Provisión vacaciones', 'APORTE');

  const totalIngresos = money(ingresosSalariales.plus(auxilioTransporte));
  const totalDescuentos = money(
    saludEmpleado.plus(pensionEmpleado).plus(fondoSolidaridad).plus(retencionFuente).plus(otrasDeducciones),
  );
  const totalAportes = money(
    saludEmpleador
      .plus(pensionEmpleador)
      .plus(arl)
      .plus(cajaCompensacion)
      .plus(sena)
      .plus(icbf)
      .plus(primaServicios)
      .plus(cesantias)
      .plus(interesesCesantias)
      .plus(vacaciones),
  );

  return {
    ibc: money(ibc),
    totalIngresos,
    totalDescuentos,
    totalAportes,
    netoPagar: money(new Decimal(totalIngresos).minus(totalDescuentos)),
    conceptos,
  };
}
