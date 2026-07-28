# Ventas: el IGV se aplicaba a plano sobre todo el pedido — 2026-07-27

## Alcance y entorno

- Rama: `codex/accounting-production-closure`.
- Base operada: DEV `hbueraexcbowpfnjlppi`. PROD no fue consultada.
- Primer barrido del módulo de Ventas, tras cerrar POS.

## Hallazgo

`PedidosService.calcularTotales` y `CotizacionesService.calcularTotales` aplicaban la tasa
de IGV al **subtotal completo**, sin mirar la afectación del Catálogo 07 de cada producto.
El detalle que reciben ni siquiera llevaba el producto: la firma era
`{ cantidad, precio_unitario }`.

Es el mismo defecto ya corregido en POS, en otro módulo: `cpe-integration.service.ts` sí
desglosa correctamente por afectación, de modo que el pedido y el comprobante quedaban
descuadrados entre sí.

La facturación repetía el error en dos sitios más: la cabecera del documento recalculaba
con `calcularImpuestos({ subtotal })` y cada línea de `documento_detalles` guardaba
`impuesto_igv = subtotal * tasa`, gravando también lo exonerado.

### Evidencia

Pedido con un producto gravado y uno exonerado, S/ 100 cada uno:

| | Antes | Correcto |
|---|---|---|
| Subtotal | 200.00 | 200.00 |
| IGV | **36.00** | **18.00** |
| Total | **236.00** | **218.00** |

S/ 18.00 de IGV cobrado de más sobre un bien exonerado, en un pedido de S/ 200.

## Corrección aplicada

- `calcularTotales` de pedidos y cotizaciones resuelve la afectación real consultando los
  productos por `tenant_id` y usa `calcularDesgloseIgv`, el mismo módulo que ya usaban el
  POS y la integración CPE.
- La facturación calcula la cabecera con ese desglose y cada línea de `documento_detalles`
  lleva IGV sólo si el ítem es gravado.
- La cotización queda alineada con lo que después se facturará: antes ofrecía al cliente un
  precio que el pedido nacido de ella no respetaba.
- Si no se puede leer la afectación, se asume gravado. Es el default del Catálogo 07 y el
  único que no sub-declara IGV; el fallo queda registrado en el log.

## Verificación

Mismo pedido creado por API tras el arreglo: subtotal 200.00, **IGV 18.00**, total
**218.00**.

Cuatro specs nuevos en `pedidos-igv-afectacion.spec.ts` fijan que no se grave lo exonerado,
lo inafecto ni la exportación, que un pedido íntegramente gravado conserve la tasa sobre
todo el subtotal, y que la ausencia de afectación se trate como gravado.

Los specs de pedidos y cotizaciones se actualizaron: el cálculo ya no pasa por
`calcularImpuestos`, así que la verificación de precisión Decimal del subtotal —que sigue
siendo válida— se comprueba ahora sobre el payload del RPC de creación.

Suite backend 126/126 suites y **1217/1217** tests. Type-check y build de la API limpios.
`git diff -w --numstat` coincide con `git diff --numstat`.

Los dos pedidos de prueba se borraron.

## Lo que no se revisó todavía en Ventas

Clientes, aprobaciones, RMA/devoluciones, reportes, y el recorrido de la interfaz del
módulo. Este barrido se centró en el cálculo fiscal por ser el de impacto económico
directo.
