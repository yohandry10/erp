# Liquidación de beneficios sociales: CTS, vacaciones, indemnización y gratificación — 2026-07-26

## Alcance y entorno

- Rama: `codex/accounting-production-closure`.
- Base operada: DEV `hbueraexcbowpfnjlppi`. PROD no fue consultada.
- Verificación end-to-end contra la API real con empleado y contrato creados y borrados.

## Hallazgo principal: la CTS se pagaba doce veces por debajo

`calcularDiasCts` devolvía días en razón de 2.5 por mes (30 al año), y el importe se
calculaba dividiendo entre 360:

```ts
const montoCts = (remuneracionComputableCts / 360) * diasCts;
```

Como los "días" ya venían expresados en dozavos, el resultado era la doceava parte de lo
que manda el D.S. 001-97-TR, que asigna una remuneración computable íntegra por año
completo de servicios.

| Empleado con 12 meses, sueldo S/ 1,300 | |
|---|---|
| Remuneración computable (sueldo + 1/6 gratificación) | S/ 1,516.67 |
| CTS que pagaba el sistema | **S/ 126.39** |
| CTS legal | **S/ 1,516.67** |

El comentario del propio código enunciaba la regla correcta —"se acumula 1 sueldo por
año"— y la fórmula la contradecía. Ningún test fijaba el importe.

## Hallazgos adicionales en la misma liquidación

- **Vacaciones sin prorratear.** Se asumían 30 días ganados desde el primer día de
  trabajo (`30 - vacacionesUsadas`), de modo que un cese a los seis meses pagaba treinta
  días en vez de quince. Además los días gozados se contaban por año calendario, no por
  periodo vacacional.
- **Indemnización por despido sin tope.** 1.5 sueldos por año sin el límite de doce
  remuneraciones del art. 38 del D.S. 003-97-TR, y con años decimales (`días/365`) en vez
  de dozavos y treintavos.
- **Gratificación trunca ausente.** La liquidación no pagaba la gratificación trunca del
  semestre en curso (Ley 27735, art. 7) ni la bonificación extraordinaria del 9 % que
  sustituye el aporte a EsSalud (Ley 30334). La variable `gratificacion` sólo se usaba
  como insumo de la base de CTS.
- **Fechas corridas un día.** `new Date('2026-08-01')` se interpreta como medianoche UTC
  y en `America/Lima` se lee como 31 de julio. Toda liquidación perdía un día de
  servicios, y un mes completo cuando el ingreso caía el día 1.

## Corrección aplicada

Los cálculos legales se extrajeron a `liquidacion-peru.util.ts`, un módulo puro y sin
dependencias, para poder fijarlos con pruebas: son importes que se pagan al trabajador.

- `tiempoDeServicios` devuelve meses completos y días sueltos por separado, que es como
  liquida la ley, en vez de años decimales.
- `parseFechaLocal` interpreta las fechas sin hora como locales.
- CTS: un dozavo de la remuneración computable por mes completo y un treintavo de ese
  dozavo por día suelto.
- Vacaciones: se adeudan las vencidas de periodos ya cumplidos y las truncas del periodo
  en curso, calculadas sobre el tiempo total de servicios menos los días efectivamente
  gozados.
- Indemnización: dozavos y treintavos, con tope de doce remuneraciones.
- Gratificación trunca del semestre en curso más la bonificación extraordinaria del 9 %.

El desglose se guarda en `liquidaciones.metadata`, porque la tabla no tiene columnas para
vacaciones truncas ni gratificación.

### Corrección durante la propia verificación

La primera versión calculaba las vacaciones sólo sobre el periodo vacacional en curso. El
end-to-end la descubrió: con cese exactamente en el aniversario de ingreso, ese periodo
mide cero y la liquidación pagaba **S/ 0.00** de vacaciones teniendo treinta días ganados.
Se corrigió pasando a calcular sobre el tiempo total de servicios, que cubre vencidas y
truncas a la vez.

## Verificación end-to-end

Empleado creado por API con ingreso 2025-02-01, sueldo S/ 1,300 y cese por despido el
2026-02-01 (doce meses exactos):

| Concepto | Sistema | Ley |
|---|---|---|
| CTS | 1,516.67 | 1,516.67 |
| Vacaciones (30 días) | 1,300.00 | 1,300.00 |
| Gratificación trunca + 9 % | 216.67 + 19.50 | 236.17 |
| Indemnización (1.5 × 1 año) | 1,950.00 | 1,950.00 |
| **Total** | **5,002.84** | **5,002.84** |

Antes del arreglo el mismo caso pagaba S/ 126.39 de CTS y ninguna gratificación.

**Pruebas.** 20 specs nuevos en `liquidacion-peru.spec.ts` fijan cada regla con su norma
citada. Suite backend 125/125 suites y **1185/1185** tests. Type-check y build de la API
limpios. `git diff -w --numstat` coincide con `git diff --numstat`.

El empleado y el contrato creados para la prueba se borraron; el tenant demo vuelve a
quedar en 0 empleados.

## Gratificaciones de julio y diciembre

La planilla no pagaba las gratificaciones legales: no existían como concepto y ningún
periodo las calculaba. Se implementaron en el mismo módulo legal.

- `mesesGratificablesDelPeriodo` reconoce los periodos `YYYY-07` y `YYYY-12`, que son los
  únicos en que se paga (Ley 27735, art. 1), y cuenta los meses calendario completos del
  semestre correspondiente. Quien ingresa a mitad de mes empieza a acumular el mes
  siguiente.
- Se agregaron los conceptos `006 Gratificacion legal` y `007 Bonificacion extraordinaria 9%`.
- El importe se calcula sobre la remuneración computable, que incluye la asignación
  familiar.

El punto crítico es dónde se suma: la gratificación y su bonificación se agregan **después**
de fijar la base asegurable, porque están inafectas de aportes y contribuciones
(Ley 30334). Sí son renta de quinta categoría, y el impuesto se calcula sobre el total de
ingresos, de modo que quedan gravadas por renta pero no por AFP/ONP/EsSalud.

### Verificación end-to-end

Empleado con ingreso 2020-01-01 y sueldo S/ 2,000, régimen ONP. Se calcularon dos planillas
consecutivas sobre el mismo trabajador:

| Concepto | Junio 2026 | Julio 2026 |
|---|---|---|
| Sueldo básico | 2,000.00 | 2,000.00 |
| Gratificación legal | — | **2,000.00** |
| Bonificación extraordinaria 9 % | — | **180.00** |
| ONP (13 %) | 260.00 | **260.00** |
| EsSalud (9 %) | 180.00 | **180.00** |
| Renta de quinta categoría | — | 77.73 |
| **Total ingresos** | 2,000.00 | **4,180.00** |

Los aportes son idénticos en ambos meses mientras el ingreso sube S/ 2,180: la
gratificación no engordó la base de aportes y sí la de renta, que es exactamente lo que
manda la norma. Seis specs fijan estas reglas, incluida la inafectación.

Los datos de prueba se borraron; el tenant demo queda en 0 empleados y 0 planillas.

## Depósito semestral de CTS

La CTS sólo se calculaba al cese. La norma obliga a depositarla dos veces al año
(D.S. 001-97-TR, art. 21): en mayo por el semestre noviembre-abril y en noviembre por el
semestre mayo-octubre.

La CTS **no es un concepto de planilla**: no se paga con la remuneración del mes, se
deposita en la cuenta CTS del trabajador y está inafecta de aportes y del impuesto a la
renta. Por eso se le dio su propio libro y no una fila de planilla.

- `361__depositos_cts_semestrales.sql` crea `depositos_cts` con RLS forzado y aislamiento
  por tenant, igual que el resto de tablas de RRHH. La unicidad por
  `(tenant, empleado, periodo)` hace idempotente el cálculo: recalcular un semestre
  actualiza el importe en vez de duplicar el depósito.
- `semestreCts` y `tiempoComputableCts` resuelven el semestre y los meses computables,
  contando desde el ingreso si el trabajador entró con el semestre empezado.
- `POST /api/rrhh/cts/depositos` calcula el semestre para todos los empleados activos.
- La asignación familiar entra en la base, por ser remuneración computable (Ley 25129).

### Verificación end-to-end

Dos empleados con antigüedad distinta, periodo `2026-05`:

| Empleado | Meses | Remuneración computable | Depósito |
|---|---|---|---|
| Ingreso 2020, S/ 1,200, sin hijos | 6 | 1,400.00 (1200 + 1200/6) | **700.00** |
| Ingreso feb-2026, S/ 1,200, con hijos | 3 | 1,531.83 (incluye asignación familiar) | **382.96** |

Un semestre completo deposita media remuneración computable, que es lo que corresponde a
seis dozavos. El periodo `2026-07` se rechaza con **HTTP 400** y mensaje explícito, no con
un 500. El recálculo del mismo semestre deja las mismas dos filas y el mismo total.

Siete specs adicionales fijan los límites del semestre, el prorrateo por ingreso tardío y
el rechazo de periodos que no son de depósito. Los datos de prueba se borraron.

## Remuneración vacacional al goce

Cuando un trabajador tomaba vacaciones durante la relación laboral, la planilla seguía
declarando el mes íntegro como sueldo básico. La remuneración vacacional no existía como
concepto.

El punto que define el diseño: en vacaciones el trabajador percibe **lo mismo** que si
hubiera trabajado (D. Leg. 713, art. 15). No es un pago adicional, es una reclasificación:
el importe del mes no cambia, cambia el concepto bajo el que se declara. Y como sigue
siendo remuneración computable, la base de aportes tampoco varía.

- Nuevo concepto `008 Remuneracion vacacional`.
- `dividirRemuneracionPorVacaciones` reparte la remuneración entre días trabajados y días
  de descanso; el tramo trabajado se obtiene por diferencia para que la suma cierre exacta
  aunque el treintavo no sea redondo.
- `diasEnPeriodo` cuenta el solape del descanso con el mes de la planilla, de modo que unas
  vacaciones que cruzan el cambio de mes se reparten entre las dos planillas.

### Defecto adicional corregido

`calcularVacacionesUsadas` no filtraba por tipo de solicitud: una licencia, un permiso o un
descanso médico aprobados descontaban días del récord vacacional y recortaban la
liquidación. Ahora sólo cuenta las solicitudes de tipo `vacaciones`.

### Verificación end-to-end

Empleado con sueldo S/ 3,000 y vacaciones aprobadas del 28 de marzo al 6 de abril:

| Periodo | Sueldo básico | Remuneración vacacional | Total | ONP | EsSalud |
|---|---|---|---|---|---|
| Febrero (sin descanso) | 3,000.00 | — | **3,000.00** | 390.00 | 270.00 |
| Marzo (4 días) | 2,600.00 | **400.00** | **3,000.00** | 390.00 | 270.00 |
| Abril (6 días) | 2,400.00 | **600.00** | **3,000.00** | 390.00 | 270.00 |

El descanso se repartió 4/6 entre los dos meses, el total del mes no varió en ninguno y los
aportes se mantuvieron idénticos a los del mes sin vacaciones. Once specs adicionales fijan
el reparto, el cierre exacto del redondeo y el solape entre meses. Los datos de prueba se
borraron.

## Estado del módulo

RRHH ya cubre el ciclo de la planilla peruana: remuneración mensual con asignación
familiar, remuneración vacacional al goce, gratificaciones de julio y diciembre, depósito
semestral de CTS y liquidación de beneficios sociales al cese, cada uno con su base de
afectación correcta.

Queda fuera de este trabajo, como estaba declarado desde antes: PLAME y T-Registro reales,
y la validación legal externa.
