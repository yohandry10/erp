# Correlativo fiscal del POS fuera de la secuencia canónica — 2026-07-26

## Alcance y entorno

- Rama: `codex/accounting-production-closure`.
- Base operada: DEV `hbueraexcbowpfnjlppi`.
- PROD `wypnbcptofqdmoynlonq`: no se conectó, no se migró y no se cargaron datos.
- Fuentes revisadas antes de tocar código: `CURRENT_STATE`, `FLOW_STATUS`, `AGENT_SYNC`,
  migración `354__pos_fiscal_numbering_single_sequence.sql` y
  `docs/audits/2026-07-24-production-closure-functional-qa.md`.

Este documento cierra el pendiente "auditar colisiones fiscales históricas antes de `354`"
que `FLOW_STATUS` mantenía abierto para POS/CPE.

## Auditoría de colisiones históricas B/F

Barrido sobre `documentos`, `cpe` y `ventas_pos` en DEV para series con patrón
`^[FB][A-Z0-9]{3}$`:

| Control | Resultado |
|---|---|
| Duplicados `(tenant, tipo, serie, numero)` en `documentos` | 0 |
| Duplicados en `cpe` | 0 |
| Duplicados en `ventas_pos` | 0 |
| Filas duplicadas en `documento_series` | 0 |
| Contador canónico por debajo del máximo emitido | **3** |

No hay números fiscales repetidos en histórico. Sí había desfase de contador, que es la
condición previa a una colisión futura.

## Hallazgo: el comprobante heredaba el correlativo del ticket interno

`pos_registrar_venta_tx` numera el ticket con `obtener_siguiente_numero_pos(tenant, serie,
'TICKET', caja)`. La migración `354` hizo que esa función redirija a `documento_series`
**sólo cuando la serie del ticket ya es fiscal** (`B###`/`F###`). Si el cliente no envía
`comprobante.serie`, el backend cae al default `T001` (`pos.service.ts:814`), el ticket se
numera contra el contador interno por caja y después el CPE se construía con la serie
fiscal normalizada pero con **ese mismo correlativo**:

```ts
const correlativoStr = ventaResult.numero_ticket?.split('-')[1] || ventaData?.comprobante?.correlativo;
```

Resultado: se emiten comprobantes en la serie fiscal sin reservar el número en
`documento_series`, que queda atrasado y volverá a entregar números ya usados.

### Evidencia en DEV (tenant demo `723b26db`)

Estado encontrado antes del fix:

- `documentos`: `B001-00000001`, `B001-00000009`, `B001-00000010` emitidos.
- `documento_series` BOLETA/`B001`: `correlativo_actual = 1`.
- `ventas_pos`: tickets `T001-00000009` y `T001-00000010` — origen de los correlativos 9 y 10.

Colisión reproducida en transacción con `ROLLBACK`, sin mutar datos: nueve llamadas
consecutivas a `obtener_siguiente_numero_documento(tenant,'BOLETA','B001')` devolvieron
`00000002` … `00000010`, es decir la secuencia canónica reentrega `00000009` y `00000010`,
que ya están emitidos. El índice único
`ux_documentos_tenant_tipo_serie_numero_runtime` haría fallar la emisión; sin él serían dos
comprobantes distintos con el mismo número fiscal.

## Corrección aplicada

### Código

`apps/erp-api/src/modules/pos/pos.service.ts`:

- El correlativo fiscal se reserva en `documento_series` mediante
  `obtener_siguiente_numero_documento` cuando la serie del ticket no es la serie fiscal.
- Se conserva el correlativo del ticket cuando el POS ya lo reservó sobre la serie fiscal
  (camino de `354`), para no consumir dos números por venta.
- Un reintento de la misma venta reutiliza el correlativo ya guardado en
  `ventas_pos.cpe_data` en vez de quemar uno nuevo.

### Migración

`357__fiscal_correlativo_resync_documento_series.sql`: realinea `correlativo_actual` de
cada serie fiscal con el máximo ya emitido en `documentos`/`cpe`/`ventas_pos` y crea el
contador que falte. Nunca baja un contador y no renumera documentos históricos.

Aplicada y verificada en DEV: tenant demo `B001` pasó de `1` a `10`; se crearon los
contadores ausentes de `B018`/`F018` del tenant QA `cbdc828a`. PROD no fue tocada.

## Verificación

**Flujo real de usuario (navegador, tenant demo).** Con el contador de tickets `T001`
desalineado a propósito en `500` y el fiscal `B001` en `10`, se abrió caja con S/ 100.00, se
agregó Azúcar Rubia 1kg y se cobró en efectivo: la venta quedó **`B001-00000011`**, no
`B001-00000501`. Sin errores de consola, sin respuestas HTTP >= 400 y sin desborde
horizontal (`scrollWidth - clientWidth = 0`).

**Camino que producía el desfase (cliente sin `comprobante.serie`).**
`POST /api/pos/venta` sin bloque `comprobante` devolvió ticket interno **`T001-00000501`** y
dejó el comprobante en **`B001-00000012`**, con `documento_series` avanzando `11 -> 12`.
Antes del fix ese mismo caso habría emitido `B001-00000501`, saltando 489 correlativos y
dejando el contador en 11 para colisionar después.

**Pruebas.** Tres specs nuevos en `pos.service.spec.ts` cubren: reserva en
`documento_series` cuando el ticket usa serie interna, conservación del correlativo cuando
el ticket ya es fiscal, y reutilización del correlativo en reintento. Suite backend
124/124 suites y 1157/1157 tests. Type-check API limpio. `git diff -w --numstat` coincide
con `git diff --numstat`.

## Descartado como falso positivo

Los correlativos de 8 dígitos tipo `F001-92288622` en tenants QA de DEV no son un defecto de
producto: las specs E2E (`cpe-completo.spec.ts`) envían `numero` explícito derivado de
`Date.now()`, y `resolveNumeroCpe` respeta el número provisto — comportamiento necesario
para registrar CPE históricos/migrados.

## Datos dejados en DEV

- Dos ventas nuevas en el tenant demo (`B001-00000011` por UI y `T001-00000501`/`B001-00000012`
  por API) con su impacto de stock y caja. No se revirtieron, en línea con el criterio de
  sesiones anteriores para ventas POS.
- `pos_numeracion` serie `T001` del tenant demo quedó en `501` por el desalineado deliberado
  de la prueba.
