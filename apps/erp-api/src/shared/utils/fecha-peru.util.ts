/**
 * Fecha de calendario en horario de Perú, en formato YYYY-MM-DD.
 *
 * `new Date().toISOString()` devuelve la fecha en UTC. Con el servidor en UTC
 * —lo habitual— entre las 19:00 y las 24:00 de Lima eso ya es el día siguiente,
 * y el validador de emisión, que sí compara contra America/Lima, rechaza el
 * comprobante por tener fecha futura. Cinco horas al día en las que no se podía
 * facturar.
 *
 * 'en-CA' es el locale que formatea como YYYY-MM-DD, que es lo que espera SUNAT.
 */
export function fechaHoyEnPeru(referencia: Date = new Date()): string {
  return referencia.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}
