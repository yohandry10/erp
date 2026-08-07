import Decimal from 'decimal.js';
import { parseFechaLocal } from './liquidacion-peru.util';

export type NormativaArgentinaPeriodo = {
  jubilacionAporte: number;
  inssjpAporte: number;
  obraSocialAporte: number;
  contribucionPatronal: number;
  artTasa: number;
  sindicatoAporteDefault: number;
  seguroVidaMonto: number;
  vacacionesDivisor: number;
  horasMensuales: number;
};

export const NORMATIVA_ARGENTINA_2026_DEFAULT: NormativaArgentinaPeriodo = {
  jubilacionAporte: 0.11,
  inssjpAporte: 0.03,
  obraSocialAporte: 0.03,
  // La alícuota patronal depende del tipo de empleador. El valor general se
  // sobreescribe por tenant en normativa_argentina_periodos.
  contribucionPatronal: 0.18,
  // ART es contractual. El cero evita inventar una tasa cuando el tenant aún
  // no confirmó la póliza; readiness impide operar un tenant real sin tasa.
  artTasa: 0,
  sindicatoAporteDefault: 0,
  seguroVidaMonto: 0,
  vacacionesDivisor: 25,
  horasMensuales: 200,
};

export type ConceptoCalculadoArgentina = {
  codigo: string;
  monto: number;
  observaciones: string;
  tipo: 'ingreso' | 'descuento' | 'aporte_empleador';
};

export type CalculoPlanillaArgentinaInput = {
  sueldoMensual: number;
  periodo: string;
  fechaIngreso: string | Date;
  diasTrabajados?: number;
  diasVacaciones?: number;
  horasExtras50?: number;
  horasExtras100?: number;
  mejorRemuneracionSemestre?: number;
  mesesComputablesSac?: number;
  sindicatoAporteTasa?: number;
  gananciasRetencion?: number;
  aporteAdicional?: number;
  artTasa?: number;
  seguroVidaMonto?: number;
  normativa?: NormativaArgentinaPeriodo;
};

export type CalculoPlanillaArgentina = {
  totalIngresos: number;
  totalDescuentos: number;
  totalAportes: number;
  netoPagar: number;
  baseAportes: number;
  conceptos: ConceptoCalculadoArgentina[];
};

const money = (value: Decimal.Value): number =>
  new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);

export function validarCuilArgentina(cuil: string): boolean {
  const value = String(cuil || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(value)) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return expected === Number(value[10]);
}

export function diasVacacionesArgentina(antiguedadAnios: number): number {
  const years = Math.max(0, Math.floor(Number(antiguedadAnios) || 0));
  if (years <= 5) return 14;
  if (years <= 10) return 21;
  if (years <= 20) return 28;
  return 35;
}

export function antiguedadAl(
  fechaIngreso: string | Date,
  fechaCorte: string | Date,
): { anios: number; meses: number; dias: number } {
  const start = parseFechaLocal(fechaIngreso);
  const end = parseFechaLocal(fechaCorte);
  if (end < start) return { anios: 0, meses: 0, dias: 0 };

  let anios = end.getFullYear() - start.getFullYear();
  let meses = end.getMonth() - start.getMonth();
  let dias = end.getDate() - start.getDate();

  if (dias < 0) {
    meses -= 1;
    dias += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }
  return {
    anios: Math.max(0, anios),
    meses: Math.max(0, meses),
    dias: Math.max(0, dias),
  };
}

export function mesesComputablesSacArgentina(
  periodo: string,
  fechaIngreso: string | Date,
): number | null {
  if (!/^\d{4}-(06|12)$/.test(periodo)) return null;
  const [yearRaw, monthRaw] = periodo.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const semesterStartMonth = month === 6 ? 0 : 6;
  const semesterStart = new Date(year, semesterStartMonth, 1);
  const semesterEnd = new Date(year, month, 0);
  const joined = parseFechaLocal(fechaIngreso);

  if (joined > semesterEnd) return 0;
  const effectiveStart = joined > semesterStart ? joined : semesterStart;
  return clamp(
    month - (effectiveStart.getMonth() + 1) + 1,
    0,
    6,
  );
}

export function calcularSacArgentina(
  mejorRemuneracionSemestre: number,
  mesesComputables = 6,
): number {
  const months = clamp(mesesComputables, 0, 6);
  return money(new Decimal(Math.max(0, mejorRemuneracionSemestre || 0)).times(0.5).times(months).div(6));
}

export function calcularPlanillaArgentina(
  input: CalculoPlanillaArgentinaInput,
): CalculoPlanillaArgentina {
  const normativa = input.normativa ?? NORMATIVA_ARGENTINA_2026_DEFAULT;
  const sueldo = new Decimal(Math.max(0, Number(input.sueldoMensual) || 0));
  const diasVacaciones = clamp(Number(input.diasVacaciones) || 0, 0, 30);
  const diasTrabajados = clamp(
    input.diasTrabajados === undefined ? 30 - diasVacaciones : Number(input.diasTrabajados),
    0,
    30,
  );
  const conceptos: ConceptoCalculadoArgentina[] = [];

  const sueldoTrabajado = sueldo.times(diasTrabajados).div(30);
  if (sueldoTrabajado.gt(0)) {
    conceptos.push({
      codigo: 'AR001',
      monto: money(sueldoTrabajado),
      observaciones: `Sueldo por ${diasTrabajados} días`,
      tipo: 'ingreso',
    });
  }

  if (diasVacaciones > 0) {
    const vacaciones = sueldo.times(diasVacaciones).div(normativa.vacacionesDivisor || 25);
    conceptos.push({
      codigo: 'AR002',
      monto: money(vacaciones),
      observaciones: `Vacaciones por ${diasVacaciones} días (LCT art. 155)`,
      tipo: 'ingreso',
    });
  }

  const valorHora = sueldo.div(normativa.horasMensuales || 200);
  const horas50 = Math.max(0, Number(input.horasExtras50) || 0);
  if (horas50 > 0) {
    conceptos.push({
      codigo: 'AR004',
      monto: money(valorHora.times(1.5).times(horas50)),
      observaciones: `${horas50} horas extra al 50%`,
      tipo: 'ingreso',
    });
  }

  const horas100 = Math.max(0, Number(input.horasExtras100) || 0);
  if (horas100 > 0) {
    conceptos.push({
      codigo: 'AR005',
      monto: money(valorHora.times(2).times(horas100)),
      observaciones: `${horas100} horas extra al 100%`,
      tipo: 'ingreso',
    });
  }

  const mesesSac =
    input.mesesComputablesSac ??
    mesesComputablesSacArgentina(input.periodo, input.fechaIngreso);
  if (mesesSac !== null && mesesSac > 0) {
    const mejorRemuneracion = Math.max(
      Number(input.mejorRemuneracionSemestre) || 0,
      Number(input.sueldoMensual) || 0,
    );
    const sac = calcularSacArgentina(mejorRemuneracion, mesesSac);
    if (sac > 0) {
      conceptos.push({
        codigo: 'AR003',
        monto: sac,
        observaciones: `SAC ${mesesSac}/6 del semestre (LCT arts. 121-123)`,
        tipo: 'ingreso',
      });
    }
  }

  const aporteAdicional = Math.max(0, Number(input.aporteAdicional) || 0);
  if (aporteAdicional > 0) {
    conceptos.push({
      codigo: 'AR006',
      monto: money(aporteAdicional),
      observaciones: 'Adicional remunerativo de convenio/empresa',
      tipo: 'ingreso',
    });
  }

  const baseAportes = money(
    conceptos
      .filter((concepto) => concepto.tipo === 'ingreso')
      .reduce((total, concepto) => total.plus(concepto.monto), new Decimal(0)),
  );

  const deductions: Array<[string, number, string]> = [
    ['AR101', normativa.jubilacionAporte, 'Aporte jubilatorio SIPA'],
    ['AR102', normativa.inssjpAporte, 'Aporte INSSJP'],
    ['AR103', normativa.obraSocialAporte, 'Aporte obra social'],
  ];
  for (const [codigo, tasa, observaciones] of deductions) {
    const monto = money(new Decimal(baseAportes).times(Math.max(0, Number(tasa) || 0)));
    if (monto > 0) {
      conceptos.push({ codigo, monto, observaciones, tipo: 'descuento' });
    }
  }

  const sindicatoTasa = Math.max(
    0,
    Number(input.sindicatoAporteTasa ?? normativa.sindicatoAporteDefault) || 0,
  );
  if (sindicatoTasa > 0) {
    conceptos.push({
      codigo: 'AR104',
      monto: money(new Decimal(baseAportes).times(sindicatoTasa)),
      observaciones: `Aporte sindical ${(sindicatoTasa * 100).toFixed(2)}%`,
      tipo: 'descuento',
    });
  }

  const ganancias = money(Math.max(0, Number(input.gananciasRetencion) || 0));
  if (ganancias > 0) {
    conceptos.push({
      codigo: 'AR105',
      monto: ganancias,
      observaciones: 'Retención Ganancias informada por liquidación SiRADIG',
      tipo: 'descuento',
    });
  }

  const contribucionPatronal = money(
    new Decimal(baseAportes).times(Math.max(0, normativa.contribucionPatronal || 0)),
  );
  if (contribucionPatronal > 0) {
    conceptos.push({
      codigo: 'AR201',
      monto: contribucionPatronal,
      observaciones: `Contribuciones patronales ${(normativa.contribucionPatronal * 100).toFixed(2)}%`,
      tipo: 'aporte_empleador',
    });
  }

  const artTasa = Math.max(0, Number(input.artTasa ?? normativa.artTasa) || 0);
  if (artTasa > 0) {
    conceptos.push({
      codigo: 'AR202',
      monto: money(new Decimal(baseAportes).times(artTasa)),
      observaciones: `ART ${(artTasa * 100).toFixed(2)}%`,
      tipo: 'aporte_empleador',
    });
  }

  const seguroVida = money(
    Math.max(0, Number(input.seguroVidaMonto ?? normativa.seguroVidaMonto) || 0),
  );
  if (seguroVida > 0) {
    conceptos.push({
      codigo: 'AR203',
      monto: seguroVida,
      observaciones: 'Seguro colectivo de vida obligatorio',
      tipo: 'aporte_empleador',
    });
  }

  const totalIngresos = money(
    conceptos
      .filter((concepto) => concepto.tipo === 'ingreso')
      .reduce((total, concepto) => total.plus(concepto.monto), new Decimal(0)),
  );
  const totalDescuentos = money(
    conceptos
      .filter((concepto) => concepto.tipo === 'descuento')
      .reduce((total, concepto) => total.plus(concepto.monto), new Decimal(0)),
  );
  const totalAportes = money(
    conceptos
      .filter((concepto) => concepto.tipo === 'aporte_empleador')
      .reduce((total, concepto) => total.plus(concepto.monto), new Decimal(0)),
  );

  return {
    totalIngresos,
    totalDescuentos,
    totalAportes,
    netoPagar: money(new Decimal(totalIngresos).minus(totalDescuentos)),
    baseAportes,
    conceptos,
  };
}

export type LiquidacionArgentinaInput = {
  fechaIngreso: string | Date;
  fechaTerminacion: string | Date;
  sueldoMensual: number;
  mejorRemuneracionNormalHabitual?: number;
  topeConvenio?: number | null;
  motivoTerminacion: string;
  preavisoOmitido?: boolean;
  fondoCeseReemplazaIndemnizacion?: boolean;
};

export function calcularLiquidacionArgentina(input: LiquidacionArgentinaInput) {
  const fechaIngreso = parseFechaLocal(input.fechaIngreso);
  const fechaTerminacion = parseFechaLocal(input.fechaTerminacion);
  const antiguedad = antiguedadAl(fechaIngreso, fechaTerminacion);
  const sueldo = Math.max(0, Number(input.sueldoMensual) || 0);
  const mejor = Math.max(
    sueldo,
    Number(input.mejorRemuneracionNormalHabitual) || 0,
  );
  const topeConvenio =
    input.topeConvenio === null || input.topeConvenio === undefined
      ? null
      : Math.max(0, Number(input.topeConvenio) || 0);
  const baseTopada = topeConvenio === null ? mejor : Math.min(mejor, topeConvenio);
  // La base nunca puede quedar por debajo del 67% de la mejor remuneración
  // normal y habitual (texto vigente del art. 245 desde marzo de 2026).
  const baseIndemnizacion = Math.max(baseTopada, mejor * 0.67);
  const fraccionMayorTresMeses = antiguedad.meses > 3 || (antiguedad.meses === 3 && antiguedad.dias > 0);
  const aniosIndemnizables = Math.max(1, antiguedad.anios + (fraccionMayorTresMeses ? 1 : 0));
  const sinCausa = ['despido', 'despido_sin_causa', 'despido_indirecto'].includes(
    String(input.motivoTerminacion || '').toLowerCase(),
  );
  const indemnizacionAntiguedad =
    sinCausa && !input.fondoCeseReemplazaIndemnizacion
      ? money(new Decimal(baseIndemnizacion).times(aniosIndemnizables))
      : 0;

  const inicioAnio = new Date(fechaTerminacion.getFullYear(), 0, 1);
  const diasTrabajadosAnio =
    Math.floor((fechaTerminacion.getTime() - Math.max(fechaIngreso.getTime(), inicioAnio.getTime())) / 86400000) + 1;
  const diasAnio = new Date(fechaTerminacion.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365;
  const diasVacacionesAnuales = diasVacacionesArgentina(antiguedad.anios);
  const diasVacacionesProporcionales = money(
    new Decimal(diasVacacionesAnuales).times(clamp(diasTrabajadosAnio, 0, diasAnio)).div(diasAnio),
  );
  const vacacionesNoGozadas = money(
    new Decimal(sueldo).div(25).times(diasVacacionesProporcionales),
  );

  const inicioSemestre = new Date(
    fechaTerminacion.getFullYear(),
    fechaTerminacion.getMonth() < 6 ? 0 : 6,
    1,
  );
  const inicioSac = fechaIngreso > inicioSemestre ? fechaIngreso : inicioSemestre;
  const diasSemestre =
    Math.floor((fechaTerminacion.getTime() - inicioSac.getTime()) / 86400000) + 1;
  // La liquidación proporcional se expresa como 1/12 de lo devengado en la
  // fracción del semestre (LCT art. 123).
  const sacProporcional = money(
    new Decimal(sueldo).times(Math.max(0, diasSemestre)).div(diasAnio),
  );

  const mesesPreaviso = antiguedad.anios >= 5 ? 2 : 1;
  const preaviso =
    sinCausa && input.preavisoOmitido
      ? money(new Decimal(sueldo).times(mesesPreaviso))
      : 0;
  const sacSobrePreaviso = preaviso > 0 ? money(new Decimal(preaviso).div(12)) : 0;

  const ultimoDiaMes = new Date(
    fechaTerminacion.getFullYear(),
    fechaTerminacion.getMonth() + 1,
    0,
  ).getDate();
  const diasIntegracion = sinCausa ? Math.max(0, ultimoDiaMes - fechaTerminacion.getDate()) : 0;
  const integracionMesDespido = money(new Decimal(sueldo).times(diasIntegracion).div(30));
  const sacSobreIntegracion =
    integracionMesDespido > 0 ? money(new Decimal(integracionMesDespido).div(12)) : 0;

  const total = money(
    new Decimal(indemnizacionAntiguedad)
      .plus(vacacionesNoGozadas)
      .plus(sacProporcional)
      .plus(preaviso)
      .plus(sacSobrePreaviso)
      .plus(integracionMesDespido)
      .plus(sacSobreIntegracion),
  );

  return {
    antiguedad,
    baseIndemnizacion: money(baseIndemnizacion),
    aniosIndemnizables,
    indemnizacionAntiguedad,
    diasVacacionesProporcionales,
    vacacionesNoGozadas,
    sacProporcional,
    preaviso,
    sacSobrePreaviso,
    diasIntegracion,
    integracionMesDespido,
    sacSobreIntegracion,
    fondoCeseAplicado: Boolean(input.fondoCeseReemplazaIndemnizacion),
    total,
  };
}
