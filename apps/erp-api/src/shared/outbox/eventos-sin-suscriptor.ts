/**
 * Eventos de outbox que existen como registro y no esperan que nadie reaccione.
 *
 * El worker falla cerrado a propósito: si un evento no tiene handler, `emitAndAwait`
 * lanza y el evento acaba en `dead_letter` en vez de darse por procesado. Esa
 * propiedad es la que impide que una integración se caiga en silencio, y no se
 * toca.
 *
 * El problema es el otro lado. La migración 464 emite `demo.lista` y
 * `configuracion.wizard.completado` como constancia de dos hitos, y nunca hubo
 * ningún suscriptor. Cada demo creada y cada wizard completado dejaba un
 * `dead_letter` permanente: en PROD había doce, creciendo. Eso no es sólo ruido.
 * `outbox_runtime_health_492` deja de reportar `ready` al pasar de cien
 * dead-letter, así que la cola habría terminado bloqueando el readiness por
 * eventos que funcionaban exactamente como debían. Y mientras tanto, quien
 * mirase la cola para detectar un fallo real la encontraba llena de falsos.
 *
 * Declararlos aquí distingue las dos situaciones que antes se veían iguales: un
 * evento sin suscriptor previsto (esto) y un evento cuyo handler falta por error
 * (sigue cayendo a dead_letter). Cualquier alta en esta lista debe explicar por
 * qué el evento no necesita reacción.
 */
export const EVENTOS_SIN_SUSCRIPTOR: ReadonlySet<string> = new Set([
  // Constancia de que una demo quedó lista. La demo se crea y se entrega dentro
  // de la propia transacción del RPC 464, credenciales incluidas: cuando el
  // evento se publica ya no queda nada por hacer.
  'demo.lista',

  // Constancia de que el asistente de configuración terminó. El writer deja la
  // configuración escrita y el progreso marcado en la misma transacción.
  'configuracion.wizard.completado',
]);

export function esEventoSinSuscriptor(eventType: string): boolean {
  return EVENTOS_SIN_SUSCRIPTOR.has(String(eventType ?? '').trim());
}
