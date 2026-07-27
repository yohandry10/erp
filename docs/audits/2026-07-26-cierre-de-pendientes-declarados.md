# Cierre de los pendientes declarados en el barrido de POS — 2026-07-26

## Alcance y entorno

- Rama: `codex/accounting-production-closure`.
- Base operada: DEV `hbueraexcbowpfnjlppi`. PROD no fue consultada.
- Recorrido de UI hecho en el navegador integrado, con captura en cada pantalla.

Este documento cierra los hallazgos que las entregas anteriores dejaron declarados sin
corregir, más los tres pendientes menores del encargo inicial.

## 1. Códigos HTTP: guardas de negocio que devolvían 500

`PlanillasService` lanzaba `Error` plano en situaciones que son del cliente, así que el
filtro global las convertía en 500. Recalcular una planilla ya calculada era el caso
citado, pero el patrón estaba repetido.

| Situación | Antes | Ahora |
|---|---|---|
| Planilla ya calculada o pagada al recalcular | 500 | **409** |
| Pagar una planilla que no está CALCULADA | 500 | **409** |
| Planilla ya pagada | 500 | **409** |
| Generar asientos con estado incompatible | 500 | **409** |
| Planilla inexistente (3 puntos) | 500 | **404** |
| Sin empleados seleccionados / sin empleados activos / sin datos de empleado | 500 | **400** |
| Conceptos de planilla no configurados / planilla sin periodo / sin tenant | 500 | **400** |

Se dejaron como 500 los doce `Error` restantes: son fallos reales de infraestructura
(errores de escritura, de consulta o de encolado), donde 500 es la respuesta correcta.

## 2. Contrato vigente sin criterio de desempate

`contratoVigenteDe` tomaba el primer contrato vigente del arreglo. Con una renovación que
deja dos contratos vigentes, el sueldo y el régimen pensionario de la planilla dependían
del orden en que la base devolviera las filas.

Ahora gana el de fecha de inicio más reciente, con `created_at` como respaldo, y la
consulta pide ese orden a la base (`order('fecha_inicio', { referencedTable: 'contratos' })`).
Tres specs nuevos cubren el desempate, la indiferencia al orden del arreglo y el respaldo
por `created_at`.

## 3. Etiquetas de formulario sin asociar

El problema era transversal, como se sospechaba: **442 `<label>` sin `htmlFor` en 83
archivos**, no solo en `EmpleadoModal`.

Se aplicó un codemod conservador que solo actúa cuando la relación es inequívoca: un label
sin `htmlFor` seguido de un único control del que se puede derivar el nombre del campo
(`name`, `handleChange('x')` o `formData.x`). Resultado: **192 asociaciones en 21 archivos**,
incluidos los 14 labels de `EmpleadoModal`.

Quedan **250 sin asociar** y se dejan a propósito: 174 no permiten derivar un nombre de
campo (controles con estado local o sin identificador) y 67 no tienen un control cercano
(labels usados como título de grupo). Asociarlos requiere criterio caso por caso.

Verificación: todos los `htmlFor` añadidos apuntan a un `id` existente en el mismo archivo
y no hay ids duplicados; type-check y build 111/111 limpios; el árbol de accesibilidad del
modal de empleado ya nombra los controles (`textbox "Nombres *"`, `combobox "DNI"`).

## 4. Contadores de categoría del POS

Los chips contaban sobre el catálogo completo mientras la grilla ocultaba lo que no tiene
stock o precio. En el tenant demo, `ELECTRONICA · 1` llevaba a una grilla vacía sin mensaje.

Se separó `productosVendibles` —el catálogo que la grilla puede mostrar— y de ahí salen
tanto los contadores como la lista de categorías. Verificado en pantalla: los chips pasan a
`Todos · 5` en línea con "5 productos disponibles", y `ELECTRONICA` desaparece porque su
único producto tiene stock 0.

## 5. Panel de apertura de caja fuera del bloque centrado

El panel "Abrir Caja" era hermano del contenedor `min-h-screen items-center`, así que
aparecía una pantalla completa por debajo de la tarjeta "CAJA CERRADA": el cajero pulsaba
el botón y no veía nada ocurrir. Ahora ambos comparten la misma columna centrada.
Verificado en pantalla: el formulario aparece pegado bajo la tarjeta.

## 6. Métodos de pago: los dos huecos que quedaban tras `359`

- **Tenant sin métodos propios.** La RPC buscaba el medio sólo entre las filas del tenant y,
  al no encontrarlo, caía a `COALESCE(v_metodo.tipo, 'EFECTIVO')`, acreditando la gaveta con
  cualquier medio. En DEV hay **4 tenants** en esa situación. Ahora la búsqueda cae al
  catálogo global (`tenant_id IS NULL`), que sí tiene la taxonomía correcta, prefiriendo
  siempre la fila propia del tenant.
- **Sin CHECK en `tipo`.** Un valor mal escrito pasaba sin aviso y rompía la clasificación de
  caja. Se restringe a `EFECTIVO`, `TARJETA`, `TRANSFERENCIA`, `BILLETERA_DIGITAL`.

Migración `360__metodos_pago_tipo_check_y_fallback_global.sql`, aplicada sólo en DEV.
Verificado: el CHECK rechaza un tipo inventado y la función contiene el respaldo al
catálogo global.

## 7. Cierre administrativo en el reporte de arqueo

El trigger `app.normalize_sesiones_caja_row` fuerza `monto_contado` a 0 y deriva la
diferencia, así que un cierre sin conteo se imprimía como si se hubiera arqueado. En vez de
cambiar una normalización que aplica a toda escritura de sesiones, el reporte usa
`cierre_administrativo`, que ya distingue el caso, e imprime "sin arqueo (cierre
administrativo)", "Diferencia: no verificada" y el motivo.

## Incidente durante la verificación

Se ejecutó `next build` con el servidor de desarrollo levantado. Ambos escriben en el mismo
`.next/`, de modo que el build de producción pisó los chunks que servía el dev server y la
aplicación quedó **sin CSS**. El fallo se detectó al mirar la pantalla; antes se había
inspeccionado esa misma ruta con lecturas de texto y de red, que no lo revelaban.

Se resolvió deteniendo el servidor, borrando `.next` y volviendo a levantarlo. En adelante,
el build sólo debe correrse con el dev server detenido.

Como consecuencia del mismo incidente, la pantalla de RRHH aparecía colgada en "Cargando
datos de RRHH...". **No es un defecto del producto**: tras rehacer el entorno la ruta carga
con normalidad; el retraso restante era la primera compilación después de borrar `.next`.

## Verificación global

- Backend: 124/124 suites y **1165/1165** tests.
- Type-check API y Web limpios.
- Build Next 111/111 páginas.
- `git diff -w --numstat` coincide con `git diff --numstat`.
