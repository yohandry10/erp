# Evidencia SUNAT beta CPE - 2026-06-16

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `docs/auditoria_impresion_cpe_facturas_2026-05.md`, `docs/release/GO_LIVE_RUNBOOK.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Alcance

Evidencia de smoke real contra el servicio beta SUNAT UBL 2.1 usando el endpoint oficial `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService` y credenciales beta `[RUC]MODDATOS` / `MODDATOS`. No se uso ni se debe usar la Clave SOL principal para esta fase.

SUNAT define este servicio beta como un web service para probar estructuras XML de facturas, boletas, notas de credito y notas de debito electronicas; no debe usarse para comprobantes reales ni pruebas de carga.

Fuentes oficiales:
- https://cpe.sunat.gob.pe/noticias/servicio-beta-para-realizar-pruebas-ubl-21
- https://cpe.sunat.gob.pe/sites/default/files/inline-files/manual_programador%20%281%29.pdf

## Resultado cerrado

| Tipo | Archivo enviado | Hash documentado | Respuesta CDR beta |
|---|---|---|---|
| Factura `01` | `20100066603-01-F001-50507464` | `E038AB9822CDCD22557A664EB802D323` | `responseCode=0`; `La Factura numero F001-50507464, ha sido aceptada`; `notes=[]` |
| Boleta `03` | `20100066603-03-B001-50578301` | `6586C093C26EE4773F1703E0441AEDA8` | `responseCode=0`; `La Boleta numero B001-50578301, ha sido aceptada`; `notes=[]` |
| Factura `01` smoke adicional RA | `20100066603-01-F001-21603215` | `2EA6BF6B5DB7B859180037DD75F81865` | `responseCode=0`; `La Factura numero F001-21603215, ha sido aceptada`; `notes=[]` |
| Nota de credito `07` | `20100066603-07-F001-13059219` | `627CB4E05065C614F30A38849C974E45` | `responseCode=0`; `La Nota de Credito numero F001-13059219, ha sido aceptada`; `notes=[]` |
| Nota de debito `08` | `20100066603-08-F001-13059220` | `72E1FA38698A5F87A366F6C84CBE8D96` | `responseCode=0`; `La Nota de Debito numero F001-13059220, ha sido aceptada`; `notes=[]` |
| Factura `01` smoke adicional RA 2 | `20100066603-01-F001-37210267` | `7193F05765AB9159CD1BF7E76405969A` | `responseCode=0`; `La Factura numero F001-37210267, ha sido aceptada`; `notes=[]` |
| Boleta `03` smoke adicional RC | `20100066603-03-B001-23127826` | `379143B41E2EC0E52AF71EC31C7C1A05` | `responseCode=0`; `La Boleta numero B001-23127826, ha sido aceptada`; `notes=[]` |

Los XML fueron generados por `CpeService.generateXmlContent()`, firmados con `libs/crypto` (`xml-crypto`) y enviados por SOAP `sendBill`. SUNAT devolvio `applicationResponse` con CDR ZIP y codigo `0` para factura, boleta, nota de credito y nota de debito.

## Correcciones validadas

- El rechazo inicial `Client.2335 Incorrect reference digest value` quedo cerrado al reemplazar la firma manual por XMLDSig canonicalizado con `xml-crypto`.
- El rechazo `Client.3244`/`Client.3205` quedo cerrado para factura y boleta agregando contrato UBL 2.1 SUNAT: `cbc:ProfileID` con tipo de operacion, `cbc:InvoiceTypeCode listID`, `cac:Signature`, `cac:PaymentTerms` (`FormaPago Contado/Credito`), precios de referencia, totales tributarios por linea y totales legales completos.
- Notas `07/08` dejaron de emitirse como `Invoice`: ahora generan `CreditNote`/`DebitNote` UBL 2.1 con `DiscrepancyResponse`, `BillingReference`, catalogos SUNAT 09/10, totales monetarios correctos y `AddressTypeCode` del local anexo. El primer intento de NC beta rechazo `3030` por faltar local anexo; la correccion posterior fue aceptada por SUNAT beta.
- `OseService` parsea metadata real del CDR ZIP (`ResponseCode`, `Description`, `Note`), conserva codigos SOAP numericos puros como `2112` y no trata texto de `getStatus` como CDR aceptado.
- Las comunicaciones de baja y resumen diario ya no generan XML placeholder: ahora construyen `VoidedDocuments` y `SummaryDocuments` con proveedor fiscal real, lineas y totales.
- RA/RC no marcan `RECHAZADO` cuando SUNAT beta responde fallos tecnicos/no concluyentes de ticket (`99`, XML incompleto, `0127`).
- GRE ya no retorna XML sin firmar ni reporta exito operativo cuando SUNAT/OSE rechaza: genera `DespatchAdvice` con endpoint de guia, firma declarativa, `ShipmentStage`, motivo/modalidad SUNAT y falla cerrado.

## Evidencia parcial / no cerrada

| Flujo | Evidencia | Estado |
|---|---|---|
| Comunicacion de baja `RA` | `sendSummary` beta devolvio tickets `1781650666182` (`20100066603-RA-20260616-45203`), `1781651656311` (`20100066603-RA-20260616-35068`) y `1781653262140` (`20100066603-RA-20260616-80921`, observado en SOAP crudo). RA nueva se envio sobre factura beta aceptada `F001-37210267`. | Pendiente cerrar consulta de ticket/CDR: `getStatus` beta devolvio repetidamente `code=99`, `Convert HTTP produced invalid XML: Incomplete markup...`. No se declara RA aceptada ni rechazada fiscalmente. |
| Resumen diario `RC` | Boleta beta `B001-23127826` aceptada. `sendSummary` beta devolvio ticket `1781653419888` para `20100066603-RC-20260616-14469` observado en SOAP crudo. | Pendiente cerrar consulta de ticket/CDR: `getStatus` beta devolvio repetidamente `code=99`, `Convert HTTP produced invalid XML: Incomplete markup...`. No se declara RC aceptado ni rechazado fiscalmente. |
| GRE | Envio beta por endpoint de guia `https://e-beta.sunat.gob.pe/ol-ti-itemision-guia-gem-beta/billService` con archivo `20100066603-09-T001-37559129`, hash `BD536F60C45DAFA216148D0312B9560A`. | SUNAT beta rechazo con fault `2112`; el flujo queda fail-closed. Falta homologacion GRE completa si el contribuyente emitira guias. |

## Verificacion local ejecutada

- `pnpm --filter @erp-suite/crypto run build`: OK.
- `pnpm --filter @erp-suite/erp-api run test -- cpe.service.spec.ts comunicacion-baja.service.spec.ts gre.idempotency.spec.ts gre.service.spec.ts ose.service.spec.ts sunat-fiscal.service.spec.ts xml-signer-runtime.spec.ts --runInBand`: OK, 7 suites / 43 tests.
- `pnpm --filter @erp-suite/erp-api run type-check`: OK.
- `git diff --check`: OK.

## Criterio para produccion

No se declara produccion real completa solo por esta evidencia beta. Para pasar a produccion se requiere:

- Usuario SOL secundario con permisos de envio electronico. Actualizacion 2026-06-17: `ERPFE001` ya fue validado por consulta `getStatusCdr` read-only; no usar la clave SOL principal.
- Certificado productivo vigente del contribuyente, no el certificado demo.
- Repetir smoke controlado en beta/homologacion del tenant real con factura, boleta, nota de credito/debito, RA/RC y GRE si aplica.
- Cambiar a produccion solo despues de beta cerrada, emitir un CPE piloto de monto minimo y tener preparada anulacion/nota de credito.
