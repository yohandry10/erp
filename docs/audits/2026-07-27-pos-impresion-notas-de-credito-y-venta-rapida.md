# POS: representación impresa, notas de crédito y venta rápida — 2026-07-27

## Alcance y entorno

- Rama: `codex/accounting-production-closure`.
- Base operada: DEV `hbueraexcbowpfnjlppi`. PROD no fue consultada.
- Recorrido en el navegador integrado, con captura en cada pantalla.
- No hay impresora térmica disponible; se verificó la vista previa anterior a la emisión,
  que es la representación que se envía a imprimir.

Cierra los tres puntos de POS que quedaban del barrido: impresión de ticket, notas de
crédito y modo de venta rápida.

## 1. La representación impresa no desglosaba las operaciones exoneradas

La vista previa mostraba únicamente `Subtotal`, `IGV (18%)` y `Total`. En una venta con
bienes exonerados eso oculta qué parte de la operación no está gravada, y la etiqueta
"IGV (18%)" sugiere que el impuesto se calculó sobre el subtotal completo cuando no fue así.

El importe **sí era correcto**: en una venta de Azúcar S/ 6.50 + Café S/ 25.00 (gravados) y
Papa Amarilla S/ 5.00 (exonerada), el IGV impreso era S/ 5.67, que es el 18 % de S/ 31.50 y
no del subtotal de S/ 36.50. El defecto estaba en la presentación, no en el cálculo.

`PosDocumentData` recibió las bases por afectación y la sección de totales las imprime
cuando la venta tiene algo distinto de gravado. Una venta íntegramente gravada conserva el
resumen corto de siempre.

### Verificación

| Caso | Totales impresos |
|---|---|
| Mixta (gravado + exonerado) | Op. gravada 31.50 · Op. exonerada 5.00 · IGV 5.67 · **Total 42.17** |
| Íntegramente gravada | Subtotal 31.50 · IGV 5.67 · **Total 37.17** |

El borrador se marca como `BORRADOR DE BOLETA DE VENTA` con `Nº SIN EMITIR`, y el pie
advierte que la impresión contiene únicamente el comprobante mostrado.

## 2. No se podía anular una venta de un turno anterior

`registrarReversionCajaPos` cargaba el reverso en efectivo sobre la **sesión de caja de la
venta original**. Si esa sesión ya estaba cerrada, la RPC lo rechazaba y la anulación
fallaba, aun habiendo una caja abierta en ese momento.

Además de bloquear una operación legítima, la alternativa era peor: cargar un movimiento en
una sesión ya arqueada rompe un cuadre cerrado.

Ahora el reverso usa la sesión de la venta si sigue abierta —anulación dentro del mismo
turno— y en caso contrario la sesión abierta vigente, dejando en la metadata la sesión
original y la marca `reverso_en_otra_sesion`. Si no hay ninguna sesión abierta, se rechaza
con un mensaje explícito.

### Defecto de atomicidad, encontrado a raíz del anterior

El primer intento fallido dejó estado a medias: el documento quedó **ANULADO**, se creó la
nota de crédito en borrador y **no hubo reverso de caja ni devolución de stock**. La venta
quedaba anulada fiscalmente mientras el dinero seguía contado en la gaveta.

La causa es que `aplicarReversionOperativa` encadena mutaciones independientes —documento,
CxC, pedido, venta, caja, stock— sin una transacción que las agrupe: si una de las últimas
falla, las anteriores ya se aplicaron y las posteriores nunca corren.

La condición que podía fallar por estado externo era la del reverso de caja, así que ahora
se valida **antes** de tocar nada. La anulación se rechaza entera en vez de dejar el
documento anulado sin devolver dinero ni stock.

### Verificación end-to-end

Anulación de la boleta `B001-00000021` (S/ 29.50, pagada con S/ 20.00 en efectivo y
S/ 9.50 con tarjeta), con la sesión de esa venta ya cerrada y otra sesión abierta:

| Efecto | Resultado |
|---|---|
| Documento | EMITIDO → **ANULADO** |
| Venta POS | PAGADA → **ANULADA** |
| Nota de crédito | **BC01-1**, tipo 07, serie de 4 caracteres |
| Reverso de caja | **−20.00** en la sesión abierta vigente, con `reverso_en_otra_sesion` |
| Caja acumulada | 2,909.93 → 2,889.93 |
| Stock Café Molido | 25 → **26** |

El reverso revierte sólo el efectivo, no el importe pagado con tarjeta, que es lo que
corresponde a la gaveta.

Cuatro specs nuevos fijan la resolución de la sesión destino.

## 3. El modo de venta rápida no hace nada

`modo_venta_rapida` está declarado en `CreateVentaPosDto` y el POS lo envía en cada venta,
pero **ningún punto del backend lo consume**. La casilla "Venta rápida" de la barra de
herramientas es un interruptor muerto: el cajero la activa y el comportamiento no cambia.

No se corrigió porque el comportamiento pretendido no es recuperable del código ni de la
documentación: no hay nada que describa qué debería hacer. Las dos salidas razonables son
implementarlo con un criterio explícito —lo habitual sería cobrar sin diálogo usando el
cliente genérico— o retirar el control. Queda como decisión de producto.

## Verificación global

- Backend: 125/125 suites y **1213/1213** tests.
- Type-check API y Web limpios.
- `git diff -w --numstat` coincide con `git diff --numstat` salvo una línea reindentada al
  entrar en una rama condicional, que es un cambio real.

## Datos dejados en DEV

Una venta adicional en el tenant demo (`B001-00000023`) y la boleta `B001-00000021` anulada
con su nota de crédito. El primer intento fallido de anulación sobre `B001-00000022` dejó
estado parcial que se revirtió a mano para poder repetir la prueba limpia; ese documento
conserva una nota de crédito asociada en `comprobantes_electronicos`.
