# suministro · F03: entregas contractuales y conformidades

Feature local; la migración 575 no se promovió a PROD ni hubo escrituras remotas.

## Comportamiento
- Recepción del cliente por pedido vinculado: líneas por despacho y lote con
  recibido, aceptado y rechazado (motivo obligatorio), fecha, receptor, guía,
  PECOSA, conformidad e incidencias. Correlativo por contrato.
- Tope acumulado por despacho y lote; fecha no futura ni anterior al despacho.
- Sólo lo aceptado cumple la programación; el tracking "entregado" no cuenta.
- El rechazo libera saldo asignado (`app.suministro_asignado_572`) para vincular
  un pedido de reposición. Anular exige versión y motivo y se rechaza si el
  rechazo ya fue repuesto.
- `pedido_despachos` con aceptación no puede pasar a ANULADO (cancelación 467).
- Adjuntos privados con destino RECEPCION; `ventas.contratos.conformar` puede
  adjuntar sin gestionar el contrato.
- Corrección encontrada: la siembra canónica por patrón `^ventas\.` daba a
  VENDEDOR `ventas.contratos.gestionar` (defecto previo de F01) y `conformar`.
  El envoltorio de `seed_operational_rbac_for_tenant` los retira en la misma siembra.

## Evidencia
- `fresh-sql.log`: 571 migraciones hasta 575, 84 verificadores y 67 históricos.
- `api-tests.log`: 80 pruebas de contratos (incluye 22 de entregas).
- `browser.log`, `browser/`: recepción con rechazo, respuesta perdida y
  reintento con la misma clave, anulación; escritorio, móvil y lector.

## Límites
- No emite PECOSAS ni GRE nuevas: registra referencias y documentos.
- Los despachos por finalización de factura (446) no crean `pedido_despachos` y
  no aparecen en la ejecución contractual.
