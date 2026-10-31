import { HttpException, ServiceUnavailableException } from '@nestjs/common';

/** Conserva las excepciones HTTP ya clasificadas; cualquier otra falla de lectura es 503. */
export function lecturaInventarioFallida(error: unknown, subject: string): HttpException {
  if (error instanceof HttpException && error.getStatus() < 500) return error;
  return new ServiceUnavailableException(`No se pudo consultar ${subject}; reintente`);
}

const ERRORES_LOTE: Record<string, string> = {
  INVENTORY_LOT_REQUIRED: 'Indique el lote: el producto controla lotes y esta operación conoce el lote físico.',
  INVENTORY_LOT_EXPIRY_REQUIRED: 'Indique la fecha de vencimiento del lote nuevo.',
  INVENTORY_LOT_EXPIRY_MISMATCH: 'El lote ya existe con otro vencimiento. Revise el código o la fecha.',
  INVENTORY_LOT_NOT_FOUND: 'El lote indicado no existe para este producto.',
  INVENTORY_LOT_CODE_INVALID: 'El código de lote debe tener entre 1 y 80 caracteres.',
  INVENTORY_LOT_EXPIRED_OR_SHORT_DATED:
    'El lote está vencido o no cumple la vida útil mínima para la fecha de entrega.',
  INVENTORY_LOT_AVAILABLE_INSUFFICIENT:
    'No hay saldo suficiente en lotes vigentes. El stock sin lote debe regularizarse antes de usarse.',
  INVENTORY_LOT_AVAILABLE_INSUFFICIENT_FOR_RESERVATION:
    'No hay saldo suficiente en lotes vigentes para reservar. El stock sin lote, vencido o ya reservado no se compromete.',
  INVENTORY_LOT_RESERVATION_INSUFFICIENT: 'La reserva por lote de este documento no cubre la cantidad solicitada.',
  INVENTORY_LOT_RESERVATION_REFERENCE_REQUIRED:
    'La liberación debe indicar el documento que reservó: los productos con lote no liberan reservas anónimas.',
  INVENTORY_LOT_ALLOCATION_MISMATCH: 'El reparto por lotes no coincide con la cantidad del movimiento.',
  INVENTORY_LOT_UNASSIGNED_INSUFFICIENT: 'No hay stock sin lote suficiente para revertir esta entrada.',
  INVENTORY_LOT_LOCATION_INVALID: 'La ubicación no pertenece al almacén o no está activa.',
  INVENTORY_LOT_LEDGER_INCOHERENT: 'Los saldos por lote no cuadran con el almacén. La operación se canceló sin cambios.',
  INVENTORY_LOT_CONTROL_REQUIRES_NO_RESERVATIONS:
    'Libere las reservas vigentes del producto antes de activar el control de lote.',
  INVENTORY_LOT_CONTROL_HAS_LOT_STOCK: 'No se puede desactivar el control de lote mientras haya stock o reservas por lote.',
  INVENTORY_LOT_CONTROL_DISABLED: 'Active el control de lote del producto antes de operar por lote.',
  INVENTORY_LOT_REGULARIZATION_EXCEEDS_UNASSIGNED: 'La regularización supera el stock sin lote del almacén.',
  INVENTORY_LOT_REASSIGNMENT_MUST_KEEP_QUANTITY:
    'La reasignación debe repartir exactamente la cantidad reservada por el documento.',
  INVENTORY_LOT_REASON_REQUIRED: 'Indique un motivo de entre 5 y 1000 caracteres.',
  INVENTORY_LOT_LINES_REQUIRED: 'Indique entre 1 y 100 líneas.',
  INVENTORY_LOT_QUANTITY_INVALID: 'Las cantidades deben ser positivas y tener hasta 4 decimales.',
  INVENTORY_LOT_VERSION_CONFLICT: 'La política de lote cambió. Actualice antes de guardar.',
  INVENTORY_LOT_IDEMPOTENCY_CONFLICT: 'La referencia de operación ya se usó con otros datos. Actualice y vuelva a intentarlo.',
  INVENTORY_LOT_INPUT_INVALID: 'Revise los datos de la operación de lote.',
  INVENTORY_LOT_QUERY_INVALID: 'Revise los filtros de la consulta de lotes.',
  INVENTORY_LOT_ACTION_INVALID: 'Acción de lote no admitida.',
  INVENTORY_LOT_WAREHOUSE_NOT_FOUND: 'El almacén no existe en esta empresa.',
  INVENTORY_LOT_PRODUCT_NOT_FOUND: 'El producto no existe en esta empresa.',
  INVENTORY_PRODUCT_DOES_NOT_CONTROL_STOCK: 'El producto no controla stock.',
  INVENTORY_MASTER_LOCATION_HAS_STOCK_OR_RESERVATIONS: 'La ubicación tiene stock o reservas.',
};

/** Código de dominio de un error SQL de lote: el texto previo al detalle. */
export function codigoErrorLote(message?: string | null): string | null {
  const codigo = String(message ?? '').split(':')[0].trim();
  return codigo in ERRORES_LOTE ? codigo : null;
}

/**
 * Mensaje legible para un rechazo del inventario por lote (574), o null si el
 * error no pertenece al control de lote. Conserva el lote afectado cuando la
 * base lo informa.
 */
export function mensajeErrorLote(message?: string | null): string | null {
  const codigo = codigoErrorLote(message);
  if (!codigo) return null;
  const lote = /lote=([^\s]+)/.exec(String(message))?.[1];
  return lote ? `${ERRORES_LOTE[codigo]} Lote: ${lote}.` : ERRORES_LOTE[codigo];
}
