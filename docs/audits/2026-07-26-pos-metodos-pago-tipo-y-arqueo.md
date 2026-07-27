# Pago mixto y arqueo: `metodos_pago.tipo` nunca se sembraba — 2026-07-26

## Alcance y entorno

- Rama: `codex/accounting-production-closure`.
- Base operada: DEV `hbueraexcbowpfnjlppi`. PROD `wypnbcptofqdmoynlonq` no fue consultada.
- Tercera entrega del barrido de POS, tras
  `2026-07-26-pos-fiscal-correlativo-single-sequence.md` y
  `2026-07-26-pos-descuento-global-e-igv-por-afectacion.md`.

## Hallazgo

Una venta con pago mixto acreditaba la gaveta por el importe completo, incluida la parte
pagada con tarjeta.

Prueba en el navegador: Café Molido Premium (S/ 25.00, total S/ 29.50) cobrado como
**S/ 20.00 en efectivo + S/ 9.50 con tarjeta**.

| Registro | Antes del fix |
|---|---|
| `ventas_pos_pagos` | efectivo `EFECTIVO` 20.00 · tarjeta **`EFECTIVO`** 9.50 |
| `movimientos_caja` | **29.50** |

Al cierre el arqueo esperaría S/ 29.50 en la gaveta cuando sólo hay S/ 20.00: un faltante
fantasma de S/ 9.50 por cada venta con medio distinto al efectivo.

### Causa

La lógica de caja es correcta en las dos capas: la RPC acumula sólo pagos con
`tipo = 'EFECTIVO'` y el servicio filtra igual. El defecto está en el dato.

`DemoService.seedMetodosPago` inserta los cuatro métodos con `codigo` y `nombre` pero **sin
`tipo`**, y la columna tiene `DEFAULT 'EFECTIVO'` sin CHECK. Resultado: tarjeta,
transferencia y Yape quedan tipificados como efectivo. Estado encontrado en DEV:

| codigo | tipo | tenants |
|---|---|---|
| TARJETA | EFECTIVO | 26 |
| TRANSFERENCIA | EFECTIVO | 26 |
| YAPE | EFECTIVO | 26 |

El catálogo global sembrado por `024__seed_minimum_operational_catalogs.sql` sí tiene la
taxonomía correcta (`EFECTIVO`, `TARJETA`, `TRANSFERENCIA`, `BILLETERA_DIGITAL`); sólo las
filas por tenant estaban mal.

Es el mismo patrón ya visto varias veces en este ERP: la columna modela la regla, un
default la rellena en silencio y el código que crea el dato nunca la envía. No hay error ni
log; el sistema simplemente clasifica todo como efectivo.

## Corrección aplicada

- `demo.service.ts`: `seedMetodosPago` envía `tipo` explícito por método, con la taxonomía
  del catálogo global.
- `359__metodos_pago_tipo_por_codigo.sql`: realinea el `tipo` de las filas por tenant cuyo
  `codigo` identifica el medio sin ambigüedad y que hoy están marcadas como efectivo. No
  inventa tipos para códigos desconocidos. Aplicada sólo en DEV: 78 filas corregidas.
- `pos.service.ts`: la clasificación de crédito pasó de una lista por exclusión
  (`!== EFECTIVO && !== TARJETA && !== DIGITAL`) a una lista explícita de medios que se
  liquidan en el acto, que incluye `BILLETERA_DIGITAL` y `TRANSFERENCIA`. Sin este cambio,
  corregir el dato habría convertido cada venta con Yape o transferencia en una cuenta por
  cobrar de una venta ya pagada. `DIGITAL` se conserva por compatibilidad con catálogos
  anteriores.

## Verificación

Mismo pago mixto repetido en el navegador tras el fix:

| Registro | Después del fix |
|---|---|
| `ventas_pos_pagos` | efectivo `EFECTIVO` 20.00 · tarjeta **`TARJETA`** 9.50 |
| `movimientos_caja` | **20.00** |
| Cuentas por cobrar creadas | **0** |

**Pruebas.** Dos specs nuevos: un medio liquidado en el acto no abre cuenta por cobrar, y un
medio diferido sí se clasifica como crédito. Suite backend 124/124 suites y 1162/1162 tests.
Type-check API limpio. `git diff -w --numstat` coincide con `git diff --numstat`.

## Observación anexa, verificada pero no corregida

Los chips de categoría del POS cuentan productos que la grilla oculta. En el tenant demo el
chip dice `ELECTRONICA · 1` y al pulsarlo la cabecera pasa a "0 productos disponibles" sin
ningún mensaje de estado vacío: el producto tiene stock 0 y la grilla lo filtra, pero el
contador no. Severidad baja, sin impacto fiscal ni contable.

## Riesgo latente declarado, no atendido

`metodos_pago.tipo` conserva el `DEFAULT 'EFECTIVO'` y no tiene CHECK, así que cualquier
inserción futura que omita el campo repite el defecto en silencio. Además, un tenant sin
filas propias en `metodos_pago` hace que la RPC no encuentre método y caiga a
`COALESCE(v_metodo.tipo, 'EFECTIVO')`, con el mismo efecto sobre el arqueo. Ninguna de las
dos cosas se tocó en esta pasada.

## Datos dejados en DEV

Dos ventas más en el tenant demo (`B001-00000020` antes del fix y `B001-00000021` después),
con su impacto de stock y caja. No se revirtieron.
