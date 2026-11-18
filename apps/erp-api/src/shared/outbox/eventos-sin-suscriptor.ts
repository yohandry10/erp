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
 * El 2026-11-17 PROD acumulaba nueve más del mismo origen (RMA, cancelación de
 * pedido, canje POS, aprobación de OC y GRE): la UAT integrada nunca los vio
 * porque apaga el worker general. Ahora lo ejecuta y falla si alguno queda sin
 * suscriptor.
 *
 * Si un evento declarado gana un suscriptor, el worker lo despacha igualmente:
 * la lista sólo cubre el caso en que nadie escucha.
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

  // El RPC 464 ya actualiza empresa_config, sincroniza tenants y registra la
  // auditoría en la misma transacción. Este evento sólo deja constancia del
  // cambio; no representa una integración ni una tarea adicional pendiente.
  'configuracion.empresa.actualizada',

  // El RPC 464 crea la empresa, su RBAC y el primer administrador, y audita, en
  // una transacción.
  'tenant.creado',

  // Los RPC atómicos de RMA (456) dejan escritos en su transacción la RMA, su
  // bitácora `rma_eventos`, el stock devuelto y el saldo a favor. Lo contable
  // viaja aparte en `saldo_favor.*`, que sí tiene suscriptor.
  'rma.creada',
  'rma.decidida',
  'rma.recepcionada',
  'rma.recepcion.revertida',

  // El RPC 467 cancela el pedido, libera reservas y audita en una transacción.
  'pedido.cancelado',

  // El RPC 471 reserva y aplica el canje del ticket POS en su transacción; el
  // efecto contable sale por `pos.venta.registrada`.
  'pos.ticket.canje.reservado',

  // El RPC 453 aprueba la orden y registra su historial de aprobación; la
  // obligación contable nace con la recepción y la factura del proveedor.
  'orden.compra.aprobada',

  // GreService firma y persiste la guía antes de emitir; ningún módulo
  // reacciona a su creación.
  'gre.creada',
]);

export function esEventoSinSuscriptor(eventType: string): boolean {
  return EVENTOS_SIN_SUSCRIPTOR.has(String(eventType ?? '').trim());
}
