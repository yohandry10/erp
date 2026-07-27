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

## Lo que sigue sin implementar

Esto corrige la liquidación al cese. **No** implementa las obligaciones periódicas, que
siguen ausentes del módulo:

- Gratificaciones de julio y diciembre como concepto de planilla (Ley 27735).
- Depósito semestral de CTS en mayo y noviembre (D.S. 001-97-TR).
- Remuneración vacacional al momento del goce.

Mientras no existan, el sistema no puede operar una planilla peruana completa.
