import Decimal from 'decimal.js';

/**
 * Circular 0033-2018-BCRP: desde 2019 el total pagado en efectivo se redondea
 * a favor del consumidor y la moneda de S/ 0,05 salió de circulación. La
 * unidad de cuenta conserva céntimos. Esa diferencia sólo es conciliable si
 * proviene del ledger inmutable de ajustes por venta/pago; su magnitud aislada
 * nunca acredita por sí sola que exista redondeo.
 *
 * Esta excepción es deliberadamente estrecha: sólo Perú, sólo soles, sólo una
 * diferencia negativa que coincide con la suma documentada. Cada venta queda
 * limitada por SQL a S/ 0,09, pero un turno puede acumular varias. Un sobrante,
 * otra moneda, otro país o un importe sin evidencia sigue el contrato normal.
 */
export function esRedondeoLegalEfectivoPeru(
  diferencia: Decimal.Value,
  pais: string | null | undefined,
  moneda: string | null | undefined,
  redondeoDocumentado: Decimal.Value,
): boolean {
  let diferenciaDecimal: Decimal;
  let documentadoDecimal: Decimal;
  try {
    diferenciaDecimal = new Decimal(diferencia).toDecimalPlaces(2);
    documentadoDecimal = new Decimal(redondeoDocumentado ?? 0).toDecimalPlaces(2);
  } catch {
    return false;
  }

  const paisNormalizado = String(pais ?? '').trim().toUpperCase();
  const monedaNormalizada = String(moneda ?? '').trim().toUpperCase();

  return (
    (paisNormalizado === 'PE' || paisNormalizado === 'PER')
    && monedaNormalizada === 'PEN'
    // Decimal conserva el signo de -0.00. Ese valor no es una merma real y no
    // debe entrar por la excepción legal; exigir magnitud distinta de cero evita
    // clasificar el cero negativo como redondeo de efectivo.
    && !diferenciaDecimal.isZero()
    && diferenciaDecimal.lt(0)
    && documentadoDecimal.gt(0)
    && diferenciaDecimal.plus(documentadoDecimal).abs().lessThanOrEqualTo('0.001')
  );
}

export function requiereSupervisorParaDiferenciaCaja(
  diferencia: Decimal.Value,
  tolerancia: Decimal.Value,
  pais: string | null | undefined,
  moneda: string | null | undefined,
  redondeoDocumentado: Decimal.Value = 0,
): boolean {
  let diferenciaDecimal: Decimal;
  let toleranciaDecimal: Decimal;
  try {
    diferenciaDecimal = new Decimal(diferencia).toDecimalPlaces(2);
    toleranciaDecimal = Decimal.max(new Decimal(tolerancia ?? 0), 0);
  } catch {
    return true;
  }

  if (diferenciaDecimal.abs().lessThanOrEqualTo(toleranciaDecimal)) {
    return false;
  }

  return !esRedondeoLegalEfectivoPeru(
    diferenciaDecimal,
    pais,
    moneda,
    redondeoDocumentado,
  );
}
