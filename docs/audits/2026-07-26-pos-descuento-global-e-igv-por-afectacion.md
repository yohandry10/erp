# Total cobrado en POS: descuento global e IGV por afectación — 2026-07-26

## Alcance y entorno

- Rama: `codex/accounting-production-closure`.
- Base operada: DEV `hbueraexcbowpfnjlppi`. PROD `wypnbcptofqdmoynlonq` no fue consultada.
- Continuación del barrido de POS iniciado en
  `docs/audits/2026-07-26-pos-fiscal-correlativo-single-sequence.md`.

Dos defectos independientes hacían que el importe cobrado no coincidiera con lo que
veía el cajero ni con el comprobante emitido. Ambos se reprodujeron en el navegador
antes de tocar código.

## Hallazgo 1 — el descuento global se mostraba pero no se cobraba

`descuento_global` sólo se usaba en el backend para calcular `maxDescuentoPct`; el
recálculo autoritativo de totales lo ignoraba. Al detectar la diferencia contra los
totales del cliente, el servicio dejaba una advertencia y forzaba sus propios totales.

Además el frontend lo restaba **después** del IGV, de modo que ni siquiera el importe
mostrado respetaba la regla: SUNAT trata el descuento global que afecta la base como una
reducción de la base imponible, con el IGV recalculado sobre la base neta.

### Evidencia previa al fix

Venta de Azúcar Rubia 1kg (S/ 6.50) con 10 % de descuento global:

| Momento | Importe |
|---|---|
| Resumen en pantalla | Subtotal 6.50 · Descuentos -0.65 · IGV 1.17 · **Total 7.02** |
| Modal de cobro | **"Cobrar S/ 7.02"** |
| Venta registrada (`ventas_pos`) | subtotal 6.50 · impuestos 1.17 · **total 7.67** |

El cajero anunciaba S/ 7.02 y el sistema cobraba y facturaba S/ 7.67. El importe correcto
es S/ 6.90 (base 5.85, IGV 1.05).

## Hallazgo 2 — IGV plano sobre bienes exonerados

`pos_registrar_venta_full_tx_legacy_327`, que es la RPC que realmente inserta la venta,
liquidaba `v_igv := round(v_subtotal * v_tasa_igv, 2)` sobre todo el subtotal, y lo mismo
por línea de detalle. La afectación del Catálogo 07 sólo se respetaba en el CPE.

### Evidencia previa al fix

Venta de Papa Amarilla (afectación `20`, exonerada, S/ 5.00):

| Registro | Resultado |
|---|---|
| Pantalla | IGV (18%) S/ 0.90 · Cobrar **S/ 5.90** |
| `ventas_pos` | impuestos 0.90 · **total 5.90** |
| `cpe_data` | exoneradas 5 · IGV 0 · **total 5** |

Se cobraba S/ 5.90 y se emitía un comprobante por S/ 5.00: IGV cobrado sobre un bien
exonerado y descuadre directo entre caja y comprobante.

Nota metodológica: la primera corrección se aplicó a `pos_registrar_venta_tx`, que resultó
no estar en el camino vivo — `pos_registrar_venta_full_tx` delega en
`..._legacy_327`. Se detectó porque la venta de prueba siguió registrando IGV 0.90 pese al
cambio. Ambas funciones quedaron corregidas.

## Corrección aplicada

### Backend (`pos.service.ts`)

- `aplicarDescuentoGlobal` descuenta el descuento global de la base imponible de cada ítem,
  prorrateado por su peso en el subtotal. El prorrateo evita mover base entre afectaciones:
  restarlo todo de un ítem gravado reduciría el IGV más de lo que corresponde. Acepta
  `PORCENTAJE` y `MONTO_FIJO`, con tope en el subtotal y en 100 %.
- `repartirIgvEntreItems` distribuye el IGV de cabecera entre los ítems gravados y deja el
  residuo del redondeo en el último, de modo que la suma por ítem coincide al céntimo con
  el desglose que viaja al comprobante.

### Frontend (`app/dashboard/pos/page.tsx`)

- El IGV se calcula sólo sobre la base gravada, filtrando por el código de afectación que
  ya venía en `/api/pos/productos`.
- El descuento global reduce la base antes del impuesto en vez de restarse del total.

### Migración `358__pos_igv_por_afectacion_en_venta.sql`

`pos_registrar_venta_full_tx_legacy_327` y `pos_registrar_venta_tx` liquidan el IGV
sumando el que trae cada ítem; la tasa plana queda sólo como compatibilidad para llamadas
que no lo declaren (clientes antiguos u offline). Firma, numeración, stock, caja, outbox e
idempotencia quedan idénticos. Generada a partir de la definición viva para evitar errores
de transcripción. Aplicada sólo en DEV.

## Verificación

Tres escenarios ejecutados como usuario real y contrastados contra BD:

| Escenario | Pantalla | `ventas_pos` | `cpe_data` |
|---|---|---|---|
| Descuento global 10 % sobre S/ 6.50 | 6.50 · -0.65 · IGV 1.05 · **6.90** | 5.85 · 1.05 · **6.90** | gravadas 5.85 · IGV 1.05 · total 6.90 |
| Producto exonerado S/ 5.00 | IGV **0.00** · **5.00** | 5.00 · **0.00** · **5.00** | exoneradas 5 · IGV 0 · total 5 |
| Mixto gravado + exonerado con 10 % (API) | — | 10.35 · 1.05 · **11.40** | gravadas 5.85 · exoneradas 4.50 · IGV 1.05 |

En el caso mixto el detalle quedó Azúcar 5.85 con IGV 1.05 y Papa 4.50 con IGV 0.00: el
prorrateo no movió base entre afectaciones.

**Pruebas.** Tres specs nuevos en `pos.service.spec.ts` cubren descuento global sobre la
base, exonerado sin IGV y prorrateo mixto. Suite backend 124/124 suites y 1160/1160 tests.
Type-check API y Web limpios. `git diff -w --numstat` coincide con `git diff --numstat`.

## Nota sobre el diff

El archivo `page.tsx` tiene dos líneas con final de línea LF dentro de un archivo CRLF.
Al escribir el archivo se normalizaban a CRLF y aparecían como cambio sin serlo; se
restauraron a sus bytes originales para que el diff no traiga ruido.

## Datos dejados en DEV

Cinco ventas adicionales en el tenant demo con su impacto de stock y caja, de las pruebas
antes y después del fix. No se revirtieron.
