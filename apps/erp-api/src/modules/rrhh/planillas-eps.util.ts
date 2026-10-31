import { BadRequestException, ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';
import type { CoberturaEpsPlanillaDto } from './dto/planilla-eps.dto';
import { regimenBonificacionGratificacionPeru } from './liquidacion-peru.util';
import { fechaHoyEnPeru } from '../../shared/utils/fecha-peru.util';

const dinero = (n: Decimal.Value) => new Decimal(n).toDecimalPlaces(2).toNumber();

/** Crédito del empleador, separado del pago a EPS que sustenta su aplicación. */
export function aplicarCreditoEpsPlanilla({
  periodo, actorId, empleados, calculos, conceptoEssaludId, uitOrigen, declaracion,
  hoy = fechaHoyEnPeru(),
}: {
  periodo: string; actorId: string; empleados: any[]; calculos: any[];
  conceptoEssaludId?: string; uitOrigen: number; declaracion?: CoberturaEpsPlanillaDto; hoy?: string;
}): Record<string, any> | undefined {
  const calculadosIds = new Set(calculos.map(fila => fila.empleado_id));
  const cubiertos = empleados.filter(e => calculadosIds.has(e.id) && regimenBonificacionGratificacionPeru(e) === 'EPS');
  if (!declaracion) {
    if (cubiertos.length) throw new ConflictException('La planilla EPS requiere declarar cobertura, importe efectivamente pagado, fecha, referencia y oportunidad del pago para calcular el crédito patronal');
    return undefined;
  }
  const dec = declaracion;
  const montoValido = (valor: unknown) => typeof valor === 'number' && Number.isFinite(valor)
    && valor >= 0 && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;
  const fecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dec.fecha_pago || '');
  const fechaReal = fecha && new Date(Date.UTC(+fecha[1], +fecha[2] - 1, +fecha[3])).toISOString().slice(0, 10) === dec.fecha_pago;
  const arrastre = dec.credito_arrastre_declarado ?? 0;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dec.periodo_cobertura) || dec.periodo_cobertura > periodo
    || !montoValido(dec.monto_pagado) || !montoValido(arrastre)
    || !fechaReal || dec.fecha_pago > hoy || dec.fecha_pago.slice(0, 7) < dec.periodo_cobertura
    || !String(dec.referencia || '').trim() || typeof dec.pago_oportuno !== 'boolean'
    || (arrastre > 0 && !String(dec.referencia_arrastre || '').trim())
    || !Number.isFinite(uitOrigen) || uitOrigen <= 0) {
    throw new BadRequestException('La declaración EPS requiere período válido, pago efectivo no futuro, importes monetarios y referencias de cobertura/arrastre');
  }
  // La mora difiere el uso al período tributario del pago, no cambia el origen
  // de la base ni la UIT que limitan el crédito (SUNAT088-2004).
  if ((!dec.pago_oportuno && dec.fecha_pago.slice(0, 7) !== periodo)
    || (dec.pago_oportuno && dec.periodo_cobertura !== periodo)) {
    throw new BadRequestException('El crédito EPS extemporáneo se aplica al período del pago; la cobertura oportuna debe corresponder a esta planilla');
  }
  const cubiertosIds = new Set(cubiertos.map(e => e.id));
  const filas = calculos.map(fila => {
    const concepto = fila.conceptos.find((c: any) => c.concepto_id === conceptoEssaludId);
    const bruto = Number(concepto?.monto ?? 0);
    if (!montoValido(bruto)) throw new ConflictException('El aporte EsSalud calculado no es válido para aplicar crédito EPS');
    return { fila, concepto, bruto };
  }).sort((a, b) => String(a.fila.empleado_id).localeCompare(String(b.fila.empleado_id)));
  const brutoTotal = dinero(filas.reduce((s, f) => s.plus(f.bruto), new Decimal(0)));
  const brutoCubiertos = dinero(filas.filter(f => cubiertosIds.has(f.fila.empleado_id)).reduce((s, f) => s.plus(f.bruto), new Decimal(0)));
  const origenAnterior = dec.periodo_cobertura < periodo;
  const aporteOrigen = origenAnterior ? dec.aporte_essalud_origen : brutoCubiertos;
  const numeroOrigen = origenAnterior ? dec.trabajadores_cubiertos_origen : cubiertos.length;
  const soloArrastreErp = !origenAnterior && cubiertos.length === 0 && arrastre > 0
    && dec.monto_pagado === 0 && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dec.planilla_arrastre_id || '');
  if (!montoValido(aporteOrigen) || !Number.isInteger(numeroOrigen)
    || (Number(numeroOrigen) < 1 && !soloArrastreErp)) {
    throw new BadRequestException(origenAnterior
      ? 'La cobertura EPS de un período anterior requiere aporte EsSalud bruto y número de cubiertos históricos declarados'
      : 'La cobertura EPS requiere al menos un trabajador con ficha SUNAT EPS en esta planilla');
  }
  const limiteAporte = new Decimal(aporteOrigen!).times('0.25').toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const limiteUit = new Decimal(uitOrigen).times('0.10').times(numeroOrigen!).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const generado = Decimal.min(limiteAporte, dec.monto_pagado, limiteUit);
  const disponible = generado.plus(arrastre);
  const aplicado = Decimal.min(disponible, brutoTotal).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const saldo = disponible.minus(aplicado);
  let porDistribuir = aplicado;
  const snapshot: Record<string, any> = {
    periodo_aplicacion: periodo, periodo_cobertura: dec.periodo_cobertura,
    fuente: 'FUENTE_EXTERNA_DECLARADA', declarado_por: actorId,
    monto_pagado: dec.monto_pagado, fecha_pago: dec.fecha_pago,
    referencia: dec.referencia.trim(), pago_oportuno: dec.pago_oportuno,
    aporte_essalud_origen: aporteOrigen, trabajadores_cubiertos_origen: numeroOrigen,
    uit_origen: uitOrigen, limite_25_por_ciento: limiteAporte.toNumber(), limite_10_uit: limiteUit.toNumber(),
    credito_generado: generado.toNumber(), credito_arrastre_declarado: arrastre,
    referencia_arrastre: arrastre > 0 ? dec.referencia_arrastre!.trim() : null,
    planilla_arrastre_id: arrastre > 0 ? dec.planilla_arrastre_id ?? null : null,
    credito_aplicado: aplicado.toNumber(), credito_saldo: saldo.toNumber(),
    aporte_essalud_bruto: brutoTotal, aporte_essalud_neto: dinero(new Decimal(brutoTotal).minus(aplicado)),
  };
  // El límite legal se calcula por cubiertos y la aplicación es patronal.
  // Para trazabilidad individual imputamos primero a cubiertos, proporcional
  // a sus aportes; el exceso/arrastre puede alcanzar el aporte de otros empleados.
  // Es una convención de imputación: no cambia bases ni el neto salarial.
  const grupos = [filas.filter(f => cubiertosIds.has(f.fila.empleado_id)),
    filas.filter(f => !cubiertosIds.has(f.fila.empleado_id))];
  for (const grupo of grupos) {
    let basePorDistribuir = grupo.reduce((s, f) => s.plus(f.bruto), new Decimal(0));
    let creditoGrupo = Decimal.min(porDistribuir, basePorDistribuir);
    for (const { fila, concepto, bruto } of grupo) {
    const parte = basePorDistribuir.isZero() ? new Decimal(0)
      : Decimal.min(bruto, creditoGrupo.times(bruto).div(basePorDistribuir).toDecimalPlaces(2, Decimal.ROUND_DOWN));
    const neto = new Decimal(bruto).minus(parte);
    porDistribuir = porDistribuir.minus(parte);
    creditoGrupo = creditoGrupo.minus(parte);
    basePorDistribuir = basePorDistribuir.minus(bruto);
    fila.total_aportes = dinero(new Decimal(fila.total_aportes).minus(parte));
    if (concepto) {
      concepto.monto = dinero(neto);
      concepto.observaciones = `EsSalud bruto ${bruto.toFixed(2)}; crédito EPS ${parte.toFixed(2)}; neto ${neto.toFixed(2)}`;
    }
    fila.metadata = {
      ...(fila.metadata || {}), eps_cobertura_snapshot: snapshot,
      essalud: { bruto, credito_eps: parte.toNumber(), neto: neto.toNumber() },
    };
    }
  }
  if (!porDistribuir.isZero()) throw new ConflictException('No se pudo distribuir exactamente el crédito EPS');
  return snapshot;
}
