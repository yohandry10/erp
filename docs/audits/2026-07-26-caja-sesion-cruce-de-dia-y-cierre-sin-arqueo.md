# Sesión de caja: cruce de día y cierre sin arqueo — 2026-07-26

## Alcance y entorno

- Rama: `codex/accounting-production-closure`.
- Base operada: DEV `hbueraexcbowpfnjlppi`. PROD `wypnbcptofqdmoynlonq` no fue consultada.
- Cuarta entrega del barrido de POS. Todo el recorrido se hizo en el navegador integrado.

## Hallazgo principal: consultar el estado de caja la cerraba

`PosService.getSesionCajaActual`, que atiende `GET /api/pos/sesion-caja`, cerraba toda sesión
abierta cuya fecha de apertura no coincidiera con el día **UTC** actual:

```ts
.update({
  estado: 'CERRADA',
  hora_cierre: new Date().toISOString(),
  fecha_cierre: new Date().toISOString(),
  notas: 'Cierre automático por sesión anterior al día actual',
})
```

Sin saldo teórico, sin conteo, sin `cerrado_por` y sin marcar cierre administrativo. Un GET
mutaba estado y destruía la trazabilidad del efectivo: **abrir la pantalla del POS bastaba
para cerrar la caja del turno anterior**.

Dos agravantes:

1. **Comparación en UTC.** Con Perú en UTC-5, el día UTC cambia a las 19:00 locales. Una caja
   abierta a las 15:00 y todavía abierta a las 20:00 cae en distinto día UTC y se cierra a
   media jornada.
2. **Dos definiciones de "hoy".** El backend comparaba en UTC y `apps/web/app/dashboard/pos/page.tsx`
   comparaba en hora local para decidir si la sesión era válida. Las dos capas discrepan
   durante cinco horas cada día.

### Evidencia

Sesión `6f7e99ca` del tenant demo, con 11 ventas:

| Concepto | Realidad | Registrado al cerrar |
|---|---|---|
| Monto inicial | 100.00 | 100.00 |
| Movimientos de caja | 114.51 | — |
| Esperado en gaveta | **214.51** | **0.00** |
| Contado | sin arquear | **0.00** |
| Diferencia | desconocida | **0.00** |

El cierre afirmaba que la caja estaba vacía y cuadrada. Una sesión anterior (`b303d7d2`) con
**S/ 2,653.23 en movimientos** quedó igual: esperado 0, contado 0, diferencia 0, sin
`cerrado_por` y con `cierre_administrativo = false`, porque la cerró este GET y no el flujo
de apertura.

Además, con la sesión abierta en base de datos el POS mostraba "CAJA CERRADA" y ofrecía
abrir otra, empujando al cajero justo hacia la acción que destruía el arqueo.

## Corrección aplicada

- **`pos.service.ts`**: `getSesionCajaActual` ya no cierra nada. Devuelve la sesión abierta
  más reciente y deja el cierre al flujo de cierre, con su arqueo. Se eliminó también la
  comparación por día UTC.
- **`app/dashboard/pos/page.tsx`**: una sesión abierta se reconoce aunque se haya abierto
  ayer. Los negocios que operan pasada la medianoche cruzan de día con la caja abierta.
- **`cajas.service.ts`**: el cierre administrativo que sí es legítimo (al abrir una caja
  nueva habiendo otra colgada) ahora calcula el saldo teórico con la misma fórmula que el
  cierre con arqueo (`monto_inicio + Σ movimientos`) y lo registra en `monto_esperado`. Los
  dos puntos que hacían ese cierre comparten un único helper.

### Límite del esquema, declarado

La intención era dejar `monto_contado` y `diferencia` sin valor, para que "no contado" no se
confundiera con "contado cero". No es posible: el trigger `app.normalize_sesiones_caja_row`
fuerza `monto_contado` a 0 y deriva `diferencia = contado - esperado`. No se tocó el trigger
por ser una normalización que aplica a toda escritura de sesiones.

El resultado igualmente cambia de silencioso a ruidoso: la sesión queda con una diferencia
igual al saldo teórico y marcada como cierre administrativo con su razón, así que aparece
como descuadre en los reportes en vez de pasar como cierre limpio. `monto_contado = 0` sigue
significando literalmente "contado cero"; queda como imprecisión conocida.

## Verificación

Escenario completo ejecutado en el navegador integrado:

1. Sesión con apertura retrasada un día (50.00 inicial) y una venta de S/ 29.50 registrada
   sobre ella desde el POS: la caja de ayer se reconoce como **"Caja abierta"** y admite
   ventas. Antes mostraba "CAJA CERRADA".
2. Recarga del POS: la sesión sigue `ABIERTA` en base de datos. El GET ya no la cierra.
3. Apertura forzada de una caja nueva para disparar el cierre administrativo:
   `monto_esperado = 79.50` (50.00 + 29.50), `cierre_administrativo = true`,
   `razon_cierre_administrativo` y `usuario_cierre` presentes.

Suite backend 124/124 suites y 1162/1162 tests. Type-check API y Web limpios.
`git diff -w --numstat` coincide con `git diff --numstat`.

## Otros hallazgos de UI de esta pasada

- **Cabecera del POS rota a ~1050px**: el título se truncaba a "P..." con espacio libre a la
  derecha y el subtítulo se apilaba sobre los botones, porque el grupo de botones no tenía
  `shrink-0` y comprimía al título. Corregido con `shrink-0` y wrap: el título se ve completo
  y los botones bajan de línea.
- **Tarjeta "Inventario total" del dashboard**: rotulaba "Productos con stock" sobre un
  número que cuenta productos del catálogo (`totalInventario = productosData.length`). En el
  tenant demo mostraba 6 con 5 productos con stock. Corregida la etiqueta a "Productos en
  catálogo"; no se tocó la métrica, que es la que asume el e2e de analytics.
- **Falso positivo descartado**: "VENTAS HOY S/ 0.00" con 11 ventas recientes es correcto.
  Eran las 01:09 de Lima y esas ventas fueron del día anterior en hora local; que muestre
  0.00 y no 124.01 confirma que el dashboard usa hora local y no UTC.

## Nota sobre el diff

`cajas.service.ts` es un archivo CRLF con diez líneas sueltas en LF, y `pos/page.tsx` es CRLF
con dos líneas en LF. Al escribirlos se normalizaban esas líneas y aparecían como cambios sin
serlo. Las ediciones se aplicaron preservando los bytes de fin de línea originales.

## Datos dejados en DEV

Tenant demo con varias sesiones de caja cerradas por las pruebas y ventas asociadas, más una
sesión abierta con S/ 30.00. La sesión `a3556da7` tiene la apertura retrasada un día a
propósito para reproducir el cruce de medianoche. No se revirtió nada.
