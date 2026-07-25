# Límites internos del módulo CPE

<!-- DOC-NAV:START -->
> Navegación documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`.
>
> Rol de este archivo: `arquitectura_canonica`.
>
> Leer también: `docs/manuals/modules/VENTAS_POS_FISCAL.md`, `docs/00_coordination/DECISIONS.md`, `docs/audits/2026-06-16-sunat-beta-cpe-evidence.md`.
<!-- DOC-NAV:END -->

Actualizado: 2026-07-15.

## Propósito

`CpeService` es la fachada estable que consumen controladores y módulos externos. La implementación se divide por responsabilidad para impedir que XML, certificados, entrega, reportes, sincronización operativa y anulación vuelvan a mezclarse en un único archivo.

| Archivo | Responsabilidad | No debe hacer |
|---|---|---|
| `cpe.service.ts` | Fachada, emisión principal y compatibilidad pública | Reimplementar firma, transporte, reportes o reversos |
| `cpe-xml.builder.ts` | UBL 2.1, fechas SUNAT, factura/boleta y notas 07/08 | Persistir, firmar o enviar |
| `cpe-certificate.service.ts` | Resolver/descifrar PFX y aplicar guard RUC-certificado | Emitir o transportar CPE |
| `cpe-delivery.service.ts` | Firma preparada, PDF/QR, consulta y entrega OSE/SUNAT | Alterar reglas contables de anulación |
| `cpe-cancellation.service.ts` | Nota de crédito, reverso contable, CxC, stock y caja | Generar UBL de emisión ordinaria |
| `cpe-reporting.service.ts` | Listados, estadísticas y CSV | Modificar estado fiscal |
| `cpe-operational-document.service.ts` | Sincronizar CPE con el módulo Documentos | Enviar a SUNAT |
| `cpe-registration.service.ts` | Registrar XML firmado por escritorio y normalizar payloads | Firmar nuevamente el XML recibido |

Los colaboradores son internos y se componen dentro de la fachada para conservar el contrato de inyección y consumo existente de `CpeService`.

## Invariantes que no se pueden degradar

- UBL 2.1 aceptado en beta para `01`, `03`, `07` y `08`; las notas siguen siendo `CreditNote`/`DebitNote` con sus referencias y catálogos.
- En producción, un PFX cuyo RUC no coincide falla antes de firmar/enviar salvo confirmación explícita documentada.
- El mismo `eventId` debe continuar de CPE a outbox y a `asientos_contables.source_event_id`.
- Idempotencia por tenant/documento, estados fiscales, CDR, CxC, stock, caja y reversos no se separan silenciosamente.
- Ningún test o refactor local autoriza emisión productiva ni operaciones sobre PROD.

## Compuertas mínimas

```powershell
pnpm --filter @erp-suite/erp-api type-check
pnpm --filter @erp-suite/erp-api exec eslint src/modules/cpe/cpe*.ts
pnpm --filter @erp-suite/erp-api exec jest --runInBand src/modules/cpe/cpe.service.spec.ts src/modules/cpe/cpe.idempotency.spec.ts
pnpm --filter @erp-suite/erp-api exec jest --runInBand
```

Baseline del refactor: `cpe.service.ts` quedó por debajo de 1000 líneas; las 118 suites y 1085 pruebas del API pasan.

## Cierre de anulación POS y Documentos (2026-07-24)

La venta POS y la emisión fiscal conservan dos eventos legítimos: `venta.procesada`
puede crear primero el asiento, mientras `factura.emitida` conserva el `event_id`
del CPE. El listener evita el asiento duplicado por referencia fiscal. Por ello,
el guard de anulación aplica este orden fail-closed:

1. busca el asiento por el `event_id` directo del CPE;
2. si no existe, busca por la referencia fiscal canónica y sus variantes
   históricas dentro del mismo tenant;
3. exige exactamente un asiento y al menos un detalle contable.

La identidad de ninguno de los eventos se sobrescribe. El botón de anulación del
módulo Documentos delega en `CpeService.anularComprobante`; ya no puede adelantar
aisladamente `documentos.estado`. La operación genera la nota de crédito y
revierte venta POS, documento, stock single-ledger, caja y contabilidad.

Evidencia DEV: dos boletas POS consecutivas anuladas desde el navegador integrado.
`B001-00000001` creó `BC001-1`, restauró stock `14 -> 15`, registró caja
`-106.08` y asiento inverso `106.08 = 106.08`; `B001-00000002`, cuyo
`cpe.event_id` y `asiento.source_event_id` eran distintos, creó `BC001-2`,
restauró el stock físico y derivado de Azúcar `119 -> 120`, registró caja
`-7.67` y asiento inverso confirmado con tres detalles y cuadre `7.67 = 7.67`.
Ambos eventos `cpe.anulado` terminaron `completed`. Typecheck API/Web OK y suite
API `119/119`, `1095/1095`. PROD no fue consultada ni modificada.
