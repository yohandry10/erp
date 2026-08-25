export type EstadoBalanceAsiento = "PENDIENTE" | "DESCUADRADO" | "BALANCEADO";

/**
 * Un asiento sin importes no está balanceado: todavía está pendiente de captura.
 * La tolerancia de un céntimo sólo aplica cuando ambos lados tienen movimiento.
 */
export function obtenerEstadoBalanceAsiento(
  totalDebe: number,
  totalHaber: number,
): EstadoBalanceAsiento {
  if (!Number.isFinite(totalDebe) || !Number.isFinite(totalHaber))
    return "DESCUADRADO";
  if (totalDebe === 0 && totalHaber === 0) return "PENDIENTE";
  if (totalDebe <= 0 || totalHaber <= 0) return "DESCUADRADO";

  return Math.abs(totalDebe - totalHaber) < 0.01 ? "BALANCEADO" : "DESCUADRADO";
}
