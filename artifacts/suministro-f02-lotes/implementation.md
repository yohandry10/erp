# suministro · F02: inventario por lote y vencimiento

Feature local; la migración 574 no se promovió a PROD ni hubo escrituras remotas.

## Comportamiento
- Política por producto: control de lote, vencimiento obligatorio y vida útil mínima.
  Activar exige cero reservas; el stock previo queda "sin lote" hasta regularizarlo
  con motivo. Desactivar exige cero stock/reservas por lote.
- El writer único `aplicar_movimiento_inventario_tx` reparte cada movimiento entre
  saldos lote/ubicación y escribe `movimientos_inventario_lotes`. Sin política, el
  comportamiento es idéntico a la 347.
- Recepción y ajuste manual exigen lote. FEFO para reservas y salidas, excluyendo
  vencidos y lotes sin vida útil mínima contra la entrega programada del contrato.
- El despacho libera y descuenta los lotes reservados por el pedido. Reversos con
  `source_movement_id`, transferencias, notas de crédito de un solo lote y
  devoluciones a proveedor reflejan el lote de origen.
- Reasignación/división de reservas y regularización viven en el ledger por lote,
  sin movimientos físicos (la liberación legacy 349 descuenta liberaciones de
  cualquier tipo y se rompería con pares extra).

## Evidencia
- `fresh-sql.log`: PostgreSQL 16 nativo efímero, 570 migraciones hasta 574 y
  83 verificadores + 67 históricos. El verificador 574 recorre contrato, pedido
  vinculado, confirmación, división, dos despachos parciales, reverso, ajuste,
  transferencia, regularización, permisos y aislamiento.
- `api-tests.log` / `api-lotes-tests.log`: 254 + 28 pruebas.
- `browser*.log`, `browser/`: escritorio claro, móvil oscuro y lector.

## Límites
- POS y despacho por factura (446) usan FEFO; no hay selección manual de lote en POS.
- Las devoluciones de varios lotes con cantidad parcial quedan "sin lote".
- El stock inicial e importación histórica (F08) no traen lote todavía.
- Pendiente: prueba de concurrencia por lote con procesos paralelos.
