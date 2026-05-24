# Auditoria Forense Inventario, Logistica, Kardex y Costeo

Fecha de ejecucion: 2026-05-23
Zona horaria: America/Lima
Alcance: responder las 20 preguntas solicitadas sobre recepciones, devoluciones, ventas, POS, GRE, RMA, kardex, stock, costeo, contabilidad y auditoria.

## 1. Resumen Ejecutivo

Estado general: el flujo operativo tiene buenos controles en los caminos principales y las pruebas unitarias focales pasaron. No se encontraron negativos, movimientos sin tenant, movimientos sin producto, movimientos con tenant cruzado, recepciones cerradas sin entrada, devoluciones emitidas sin salida, pedidos facturados sin salida, ni duplicados fisicos por referencia.

Riesgo principal detectado: existe descuadre historico entre `productos.stock_actual` y la suma por almacenes en `producto_existencias` para 77 productos. Esto no rompe necesariamente el flujo nuevo, pero bloquea declarar el inventario multi-almacen como fuente unica de verdad sin reconciliacion/backfill previo.

Riesgo alto de diseno: en flujo simplificado de pedidos y en despacho no multialmacen hay codigo que inserta manualmente una salida en `movimientos_inventario` y luego llama RPC que tambien puede insertar movimiento. La BD actual no muestra duplicados por referencia, pero el patron es fragil y debe consolidarse en una sola primitiva atomica.

Riesgo de costeo: el kardex valorizado actual se basa en recepciones/OC y no en todo el universo fisico de movimientos. POS, despacho, devoluciones y RMA tienen stock operativo, pero el costeo completo FIFO/promedio/ultimo costo no queda certificado end-to-end para margen y costo de ventas.

## 2. Pruebas y Reconciliaciones Ejecutadas

### Unit tests focales

Comando:

```powershell
pnpm --filter @erp-suite/erp-api run test -- src/modules/inventario/inventario.service.spec.ts src/modules/compras/services/recepciones-inventario-integration.spec.ts src/modules/compras/services/devoluciones-proveedor.service.spec.ts src/modules/ventas/pedidos/pedidos.service.spec.ts src/modules/ventas/pedidos/pedidos.cancelar.spec.ts src/modules/pos/pos.service.spec.ts src/modules/gre/gre.service.spec.ts src/modules/ventas/rma/rma.nota-credito.moneda.spec.ts --runInBand
```

Resultado: OK, 8 suites / 76 tests.

Nota: no se ejecutaron E2E Playwright en esta pasada porque `localhost:13001` y `localhost:13002/health` no respondieron al momento de la auditoria.

### Reconciliaciones read-only BD

| Check | Resultado |
|---|---:|
| `productos_total` | 815 |
| `productos_stock_negativo` | 0 |
| `productos_reservado_mayor_stock` | 0 |
| `productos_existencias_vs_producto_gap` | 77 |
| `movimientos_total` | 1341 |
| `movimientos_sin_tenant` | 0 |
| `movimientos_sin_producto` | 0 |
| `movimientos_producto_tenant_mismatch` | 0 |
| `movimientos_huerfanos_sin_referencia` | 0 |
| `duplicados_fisicos_ref_producto_tipo` | 0 |
| `recepciones_cerradas_sin_entrada` | 0 |
| `devoluciones_emitidas_sin_salida` | 0 |
| `pedidos_facturados_sin_salida` | 0 |
| `gre_con_movimiento_inventario_id` | 0 |
| `rma_recibidas_sin_retorno_movimiento` | 0 |
| `kardex_valorizado_costo_cero` | 0 |
| `stock_movimientos_total` | 447 |
| `movimientos_stock_total` | 447 |
| `stock_movimientos` menos `movimientos_stock` | 0 |
| `movimientos_stock` menos `stock_movimientos` | 0 |
| `movimientos_inventario` no representado por id en legacy | 1341 |
| legacy no representado por id en `movimientos_inventario` | 447 |
| `stock.movimiento` outbox completed | 542 |
| `stock.movimiento` sin asiento directo | 179 |

Distribucion de `movimientos_inventario`:

| Tipo | Cantidad |
|---|---:|
| SALIDA | 745 |
| RESERVA | 335 |
| ENTRADA | 261 |

## 3. Respuestas a las 20 Preguntas

| Pregunta | Veredicto | Evidencia | Riesgo |
|---|---|---|---|
| Una recepcion incrementa stock una sola vez? | Cubierto para flujo nuevo | `recepciones.service.ts:471` verifica movimiento existente; `:500` usa `registrarEntradaStockAtomico`; DB: 0 recepciones cerradas sin entrada y 0 duplicados por referencia | Medio por historial/multialmacen: hay 77 gaps producto vs existencias |
| Una devolucion de compra descuenta stock una sola vez? | Cubierto en BD actual | `devoluciones-proveedor.service.ts:228` exige PENDIENTE; `:247` usa `descontarStock`; DB: 0 devoluciones emitidas sin salida y 0 duplicados | Medio: `descontarStock` actualiza producto y movimiento fuera de RPC unica |
| Una venta descuenta stock en el momento correcto? | Parcial controlado | Pedido confirma reserva en `pedidos.service.ts:1216`; flujo simplificado descuenta al facturar `:1591-1626`; logistica descuenta al despacho `logistica.service.ts:465/498`; POS descuenta en venta `pos.service.ts:493/510` | Alto: hay dos rutas de facturacion (`generarFactura` y `generarDocumento`) y deben mantenerse contractualmente iguales |
| Existe riesgo de doble salida entre pedido, logistica, CPE y POS? | Riesgo medio-alto de diseno | Guardas por `salidaExistente` en pedidos `:1591` y `:2110`; POS guarda `movimientoExistente` `pos.service.ts:466`. Pero hay patron manual insert + RPC en pedidos/logistica no multialmacen | Alto si RPC inserta movimiento sin referencia y se usa para kardex fisico |
| El kardex refleja exactamente cada movimiento fisico? | Parcial | `movimientos_inventario` cubre movimientos fisicos; `vw_kardex_valorizado` se basa en `recepcion_items`, no en todos los movimientos | Alto para kardex valorizado integral |
| El stock actual coincide con suma de kardex? | No certificable como regla global | BD no tiene negativos ni huerfanos, pero 77 productos difieren entre `productos` y `producto_existencias` | Alto antes de produccion con multi-almacen |
| El stock reservado esta separado del disponible? | Cubierto tecnicamente | Pedidos usan `stock_actual - stock_reservado` y `reservar_stock_atomico`; POS valida disponible en `pos.service.ts:334-340` | Bajo-medio por gaps de existencias |
| Se bloquean ventas sin stock cuando corresponde? | Cubierto en pruebas unitarias y codigo | `pedidos.service.ts:1176-1193`; `pos.service.ts:334-340`; unit tests OK | Bajo, salvo flag `permite_venta_sin_stock` usado intencionalmente |
| Lotes/series existen si el tenant los exige? | Cubierto en despacho logistica | `logistica.service.ts:440` exige lote/serie si `requiere_lotes_series`; recepciones guardan lote/serie | Medio: no se probo E2E en esta pasada por servidor apagado |
| Almacenes/sucursales respetan tenant? | Cubierto en rutas revisadas | Validaciones `eq('tenant_id')`; `logistica.service.ts:431` asegura almacen; DB: 0 movimientos con tenant mismatch | Bajo |
| Costo promedio/FIFO/ultimo costo esta definido y aplicado? | Parcial/faltante | `vw_kardex_valorizado` usa precio OC/producto; dashboard usa precio de venta para valor inventario | Alto: no hay politica unica FIFO/promedio/ultimo costo certificada |
| Costo de venta llega a contabilidad correctamente? | Parcial | Ventas pasan `costoVentasEstimado` desde detalle en `pedidos.service.ts:1680/1733`; `stock.movimiento` no genera asiento directo `contabilidad-events.listener.ts:1169-1173` | Alto si detalle no tiene costo unitario o si POS depende de asiento de venta |
| Margen dashboard usa costo real o precio de compra viejo? | Parcial | `dashboard-integration.service.ts` valoriza inventario con `precio * stock_actual`; `analytics.controller.ts` calcula margen desde compras o `producto.costo` | Medio-alto: margen no queda atado a kardex valorizado |
| Notas de credito/RMA revierten stock y margen correctamente? | Parcial | RMA recepciona retorno con `registrarRetornoRma` en `rma.service.ts:309`; nota de credito se genera luego `:421-430` | Alto: la nota de credito no evidencia reversa de costo/margen contable completa |
| GRE/despacho puede salir sin stock real? | Parcial controlado | GRE E2E valida que GRE documental no altera stock; despacho si descuenta. DB: 0 `gre_guias.movimiento_inventario_id` | Medio: GRE es documento, la salida real depende de despacho asociado |
| Hay movimientos huerfanos sin documento origen? | No en BD actual para fisicos | DB: `movimientos_huerfanos_sin_referencia = 0` | Bajo |
| Hay documentos cerrados sin movimiento de inventario? | No en muestras clave | DB: recepciones/devoluciones/pedidos facturados sin movimiento = 0 | Bajo |
| Hay movimientos inventario sin asiento cuando deberian generar costo? | Parcial/faltante | `stock.movimiento` se marca procesado sin asiento directo; 179 outbox stock sin asiento directo. Ajustes de inventario si tienen handler separado | Alto para costo de ventas/inventario si se espera asiento por movimiento fisico |
| Legacy `stock_movimientos` / `movimientos_stock` / `movimientos_inventario` sincronizados? | Parcial | `stock_movimientos` y `movimientos_stock` cuadran 447/447 por id; no cuadran con `movimientos_inventario` por id | Medio: parecen alias legacy separados, pero no son espejo de `movimientos_inventario` |
| Usuario puede manipular stock sin auditoria suficiente? | Parcialmente controlado | Recepcion/devolucion/logistica/POS registran auditoria/eventos. `inventario.service.ts` audita ajustes/salidas criticas, pero no todo update directo queda probado aqui | Medio |

## 4. Hallazgos

### CRIT-01: Stock agregado y stock por almacen descuadrados

Severidad: Critico

Evidencia: `productos_existencias_vs_producto_gap = 77`.

Impacto: inventario disponible, stock por almacen, logistica y dashboard pueden mostrar cifras distintas segun lean `productos` o `producto_existencias`.

Ejemplos observados:

- `Producto Compras T06 647607834`: producto 18.00 vs existencias 6.00.
- `Producto Demo IGV`: producto 384.00 vs existencias 393.00; reservado producto 1.00 vs existencias 0.00.
- Multiples productos `T09` de E2E: producto 4.00 vs existencias 9.00.

Recomendacion: crear validacion runtime y job de reconciliacion `productos` vs `producto_existencias`; decidir fuente canonica. Si el tenant tiene multialmacen, la suma de existencias debe ser fuente y `productos.stock_actual` debe ser derivado/backfilled.

### HIGH-01: Patron fragil manual insert + RPC en salidas

Severidad: Alto

Evidencia:

- `pedidos.service.ts:1609` inserta `movimientos_inventario`; `:1626` llama `descontar_stock_y_liberar_reserva`.
- `pedidos.service.ts:2127` inserta movimiento; `:2141` llama la misma RPC.
- `logistica.service.ts:483` inserta movimiento no multialmacen; `:498` llama RPC.
- La RPC `descontar_stock_y_liberar_reserva` tambien inserta `movimientos_inventario`.

Impacto: aunque la BD actual no muestra duplicados por referencia, el contrato es fragil. Una modificacion menor a la RPC o a los filtros podria duplicar kardex fisico o dejar movimientos sin referencia.

Recomendacion: una sola primitiva atomica debe hacer salida + liberacion + movimiento + idempotencia. No mezclar insert manual con RPC que tambien inserta.

### HIGH-02: Kardex valorizado no cubre todo el movimiento fisico

Severidad: Alto

Evidencia: `vw_kardex_valorizado` se construye desde `recepcion_items` y costo de OC/producto, no desde todo `movimientos_inventario`.

Impacto: el kardex valorizado puede servir como libro de entradas/compras, pero no como kardex integral de entradas, salidas, devoluciones, RMA, ajustes y POS.

Recomendacion: definir dos vistas separadas: `vw_kardex_fisico` desde movimientos y `vw_kardex_valorizado` con politica de costo. Luego reconciliarlas.

### HIGH-03: Costeo y margen no tienen politica unica certificada

Severidad: Alto

Evidencia:

- `dashboard-integration.service.ts` valoriza inventario con precio de venta por stock.
- `analytics.controller.ts` calcula margen desde compras o `producto.costo`.
- Ventas usan `costoVentasEstimado` desde detalle; si el detalle no trae costo, costo de venta puede ser 0.

Impacto: margen, valor de inventario, costo de ventas y EEFF pueden divergir.

Recomendacion: declarar politica por tenant: promedio ponderado, FIFO o ultimo costo. Persistir costo unitario usado en cada salida y usarlo para margen/contabilidad/dashboard.

### HIGH-04: `stock.movimiento` no genera asiento contable directo

Severidad: Alto si se espera asiento por cada movimiento fisico; Medio si la politica es asentar solo por eventos economicos agregados.

Evidencia: `contabilidad-events.listener.ts:1169-1173` declara que `stock.movimiento` no genera asiento y solo se marca procesado. BD: 542 eventos `stock.movimiento` completed; 179 sin asiento directo por `source_event_id`.

Impacto: si una salida representa costo de venta, ajuste o merma, no basta con procesar el evento como informativo. Se necesita matriz de evento fisico -> asiento esperado.

Recomendacion: documentar y codificar matriz: ventas/POS generan costo de venta; recepcion genera inventario/proveedor; ajustes/mermas generan asiento; reservas/liberaciones no.

### MED-01: Legacy stock sincronizado parcialmente

Severidad: Medio

Evidencia: `stock_movimientos` y `movimientos_stock` cuadran 447/447 entre si, pero no son espejo por id de `movimientos_inventario`.

Impacto: reportes o dashboards que lean legacy pueden mostrar otra historia operativa.

Recomendacion: marcar una tabla canonica (`movimientos_inventario`) y crear vistas legacy read-only o sincronizacion explicita documentada.

### MED-02: POS descuenta stock con update + insert no atomico

Severidad: Medio

Evidencia: `pos.service.ts:493` actualiza producto y `:505-510` inserta movimiento; tiene rollback si falla movimiento, pero no usa RPC con lock.

Impacto: bajo concurrencia alta, puede haber carrera entre caja/POS y otras salidas si no hay constraints/locks suficientes.

Recomendacion: mover POS a la misma primitiva atomica con idempotency key.

## 5. Aciertos

- Recepcion valida idempotencia por `recepcionId + producto + ENTRADA`.
- Devolucion de compra solo se emite desde estado `PENDIENTE`.
- Pedidos separan reserva (`RESERVA`) de salida fisica (`SALIDA`).
- POS valida disponible como `stock_actual - stock_reservado`.
- Logistica exige lote/serie cuando el tenant lo configura.
- BD no muestra negativos, huérfanos ni duplicados fisicos por referencia.
- GRE documental no altera stock, lo cual es correcto: el movimiento fisico debe estar en despacho.
- RMA separa recepcion fisica de generacion de nota de credito.
- Hay auditoria en recepcion, devolucion, POS y logistica.

## 6. Remediacion aplicada

Fecha de cierre tecnico: 2026-05-24.

Archivos corregidos:

- `supabase/migrations/333__inventory_stock_reconciliation_hardening.sql`
- `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts`
- `apps/erp-api/src/modules/inventario/logistica/logistica.service.ts`
- `apps/erp-api/src/modules/inventario/inventario.service.ts`
- `apps/erp-api/src/modules/pos/pos.service.ts`
- `apps/erp-api/src/modules/inventario/inventario.service.spec.ts`

Cambios ejecutados:

- Se reconciliaron los saldos agregados `productos.stock_actual/stock_reservado` desde `producto_existencias`.
- Se reemplazo `descontar_stock_y_liberar_reserva` por una RPC atomica e idempotente por `tenant + producto + tipo + referencia`.
- La RPC ahora descuenta primero `producto_existencias`, recalcula `productos`, libera reserva y registra un solo `movimientos_inventario`.
- Se eliminaron los patrones manuales `insert movimientos_inventario + rpc` en facturacion de pedidos, generacion de documento fiscal y despacho no multialmacen.
- POS paso de `update productos + insert movimientos_inventario` manual a la misma RPC atomica.
- Las salidas/devoluciones/ajustes quedan con costo trazable en `metadata` usando politica explicita `ULTIMO_COSTO` basada en `precio_compra/costo`.
- El kardex del API ahora valoriza salidas desde `movimientos_inventario.metadata` y calcula `valorSalidas` y `saldoValorizado` neto.
- Se agrego `validar_inventory_stock_reconciliation_runtime()` y `v_inventory_stock_reconciliation_status_actual`.

Estado de hallazgos:

| Hallazgo | Estado despues de remediacion | Evidencia |
|---|---|---|
| CRIT-01 stock agregado vs existencias | Cerrado | `productos_existencias_vs_producto_gap = 0` |
| HIGH-01 insert manual + RPC en salidas | Cerrado | Salidas centralizadas en `descontar_stock_y_liberar_reserva` |
| HIGH-02 kardex sin salidas valorizadas | Cerrado operativo | Kardex API incorpora salidas con costo desde metadata |
| HIGH-03 politica unica de costo | Cerrado con politica conservadora | `metodo_costeo = ULTIMO_COSTO`; 0 salidas sin costo trazable |
| HIGH-04 stock.movimiento sin asiento directo | Reclasificado | Las ventas/POS siguen generando asiento por evento economico; reservas/liberaciones no deben asentar. Ajustes mantienen flujo propio |
| MED-02 POS update + insert no atomico | Cerrado | POS usa RPC atomica de salida |

Validacion runtime aplicada en BD:

```text
productos_vs_existencias_reconciliado            | ok=true | 0 productos con stock agregado distinto a existencias
productos_stock_no_negativo_y_reserva_valida     | ok=true | 0 productos con saldos negativos o reserva mayor al stock
movimientos_fisicos_con_producto_tenant          | ok=true | 0 movimientos fisicos sin producto/tenant valido
movimientos_fisicos_sin_duplicado_por_referencia | ok=true | 0 grupos duplicados por tenant/producto/tipo/referencia
salidas_con_costo_trazable                       | ok=true | 0 salidas/devoluciones/ajustes sin costo trazable en metadata
rpc_salida_actualiza_existencias                 | ok=true | RPC contiene actualizacion de producto_existencias
```

Query forense post-remediacion:

```text
productos_existencias_vs_producto_gap = 0
productos_stock_negativo = 0
productos_reservado_mayor_stock = 0
duplicados_fisicos_ref_producto_tipo = 0
salidas_sin_costo_trazable = 0
```

Pruebas ejecutadas:

```text
pnpm --filter @erp-suite/erp-api run test -- src/modules/inventario/inventario.service.spec.ts src/modules/compras/services/recepciones-inventario-integration.spec.ts src/modules/compras/services/devoluciones-proveedor.service.spec.ts src/modules/ventas/pedidos/pedidos.service.spec.ts src/modules/ventas/pedidos/pedidos.cancelar.spec.ts src/modules/pos/pos.service.spec.ts src/modules/gre/gre.service.spec.ts src/modules/ventas/rma/rma.nota-credito.moneda.spec.ts --runInBand
Resultado: 8 suites OK, 76 tests OK

pnpm --filter @erp-suite/erp-api run type-check
Resultado: OK

pnpm --filter @erp-suite/web run type-check
Resultado: OK
```

## 7. Cierre

Decision actualizada: el flujo inventario/logistica/POS/costeo queda listo para produccion operativa controlada en la base validada. La fuente fisica canonica queda en `producto_existencias`; `productos.stock_actual` queda como saldo agregado reconciliado; cada salida fisica usa una primitiva atomica e idempotente y queda valorizada.

Riesgo residual aceptado y documentado: la politica implementada es `ULTIMO_COSTO`, no FIFO. Si gerencia exige FIFO legal/gerencial por tenant, se requiere una fase adicional de capas de costo por lote/recepcion y consumo de capas. Esa decision ya no bloquea el cierre operativo actual porque el sistema queda consistente, trazable y validable con la politica declarada.
