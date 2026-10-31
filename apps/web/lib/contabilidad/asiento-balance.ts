export type EstadoBalanceAsiento = "PENDIENTE" | "DESCUADRADO" | "BALANCEADO";

/**
 * Un asiento sin importes no está balanceado: todavía está pendiente de captura.
 * Los totales deben coincidir al céntimo, como exige el writer contable.
 */
export function obtenerEstadoBalanceAsiento(
  totalDebe: number,
  totalHaber: number,
): EstadoBalanceAsiento {
  if (!Number.isFinite(totalDebe) || !Number.isFinite(totalHaber))
    return "DESCUADRADO";
  if (totalDebe === 0 && totalHaber === 0) return "PENDIENTE";
  if (totalDebe <= 0 || totalHaber <= 0) return "DESCUADRADO";

  return Math.round(totalDebe * 100) === Math.round(totalHaber * 100)
    ? "BALANCEADO" : "DESCUADRADO";
}
