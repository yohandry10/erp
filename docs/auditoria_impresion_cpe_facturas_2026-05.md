# Auditoria de impresion CPE y facturas

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha: 2026-05-25
Alcance: preparacion del codigo para emitir y entregar/mostrar representaciones impresas o digitales de facturas, boletas, notas de credito y notas de debito cuando el contribuyente ya tenga RUC habilitado, Clave SOL, certificado/PSE, alta de emisor electronico, homologacion, beta y CDR aceptado.

## Conclusion ejecutiva

Estado inicial de auditoria: el sistema no estaba listo para que sea "solo poner credenciales" y empezar a imprimir facturas de forma productiva.

Estado despues de la remediacion aplicada el 2026-05-25: los bloqueos de codigo detectados quedaron mitigados en repo local. Actualizacion 2026-06-16: factura `01`, boleta `03`, nota de credito `07` y nota de debito `08` ya fueron aceptadas por SUNAT beta con CDR `responseCode=0`. Actualizacion 2026-06-17: el usuario SOL secundario `ERPFE001` fue validado por `getStatusCdr` read-only; el runner beta RA/RC/GRE dejo factura/boleta base aceptadas, RA/RC con tickets nuevos y CDR beta aceptado recuperado por reconsulta read-only, y GRE SOAP beta rechazada con fault `2112` aun con `CustomizationID=2.0` correcto. Se agrego soporte GRE por Plataforma Nueva REST, pendiente de credenciales API SUNAT. El POS ahora distingue ticket interno vs representacion fiscal CPE: cuando existe `cpe_id` imprime QR SUNAT + valor resumen/hash; si no existe, imprime comprobante interno de caja con CPE pendiente. Aun no se debe declarar produccion real completa hasta cerrar GRE REST si aplica, cargar/confirmar PFX productivo real del RUC `20616053575` y ejecutar produccion controlada.

- La ruta directa SUNAT ya no simula aceptacion: usa XML firmado existente y llamada SOAP, o falla si falta configuracion/path explicito.
- Actualizacion 2026-06-16: la ruta SUNAT directa quedo endurecida por operacion. CPE/GRE usan `sendBill`, comunicaciones de baja y resumenes diarios usan `sendSummary`, la consulta de ticket usa `getStatus` real y la consulta CDR usa `getStatusCdr`; GRE beta usa el endpoint oficial de guias, no otros CPE. Factura, boleta, nota de credito y nota de debito fueron aceptadas en beta con CDR real; ver `docs/audits/2026-06-16-sunat-beta-cpe-evidence.md`.
- La UI de creacion manual CPE tiene endpoint backend compatible (`POST /api/cpe/comprobantes`) que normaliza payload, toma emisor real y obtiene correlativo por RPC.
- El flujo legacy `documentos` ya no simula envio/PDF: delega al CPE asociado o falla con mensaje claro.
- `crearCPEDesdeDocumento` normaliza a codigos SUNAT `01/03/07/08`.
- El PDF A4 falla cerrado sin empresa real, carga logo antes de cerrar el PDF y no imprime leyendas fiscales no declaradas.
- POS conserva el tipo real `01/03`, etiqueta factura/boleta correctamente, imprime con CSS termico `@page` 80mm y solo llama representacion fiscal al comprobante que ya trae QR SUNAT + valor resumen/hash desde CPE.
- Impresion desktop/Tauri deja de usar `/tmp` en Windows y llama `copy /b` via `cmd /C`, no como ejecutable inexistente.

## Piezas listas o parcialmente listas

- Backend CPE principal:
  - `POST /api/cpe` crea CPE con `tipo_documento` SUNAT (`01`, `03`, `07`, `08`), valida certificado, RUC/configuracion y documento antes de emitir.
  - `GET /api/cpe/comprobantes/:id/pdf` devuelve `application/pdf`.
  - `POST /api/cpe/comprobantes/:id/enviar-sunat` envia a autoridad fiscal via `FiscalAdapterService`.
- POS:
  - La UI permite elegir boleta `03` o factura `01`.
  - El backend POS exige RUC valido para factura.
  - La venta POS deja `cpe_data` en cola para que el worker/reintento genere el CPE sin bloquear caja.
- PSE/OSE API:
  - Existe modo `empresa_config.emision_cpe_modo = 'OSE_API'` con `ose_url`, `ose_status_url`, auth basic/bearer/api-key y normalizacion de respuesta.

## Bloqueos antes de produccion

### 1. Ruta SUNAT directa no es real

Estado: mitigado en codigo el 2026-05-25.

`apps/erp-api/src/modules/fiscal/sunat-fiscal.service.ts` ya no retorna aceptacion simulada ni genera XML placeholder. Si `documento.xmlContent` no existe, falla e indica usar CPE real o PSE/OSE API. En produccion exige path SOAP explicito en la URL configurada para no inferir endpoints productivos.

Opciones validas:

- Activar por tenant `OSE_API` y usar un PSE/OSE real con contrato HTTP definido.
- O usar SUNAT directo SOAP con los endpoints por operacion ya cableados en `OseService`/`SunatFiscalService` y validar CDR/ticket real.

Actualizacion 2026-06-16:

- `OseService` ya no usa rutas beta hardcodeadas para todo. Resuelve `SUNAT_CPE_URL`, `SUNAT_GRE_URL`, `SUNAT_SUMMARY_URL`, `SUNAT_QUERY_URL` o defaults oficiales por ambiente.
- `ComunicacionBajaService` separa RA y RC: ambas se envian por `sendSummary` y consultan ticket con `getStatus`.
- `SunatFiscalService` consulta CDR por `getStatusCdr`.
- Verificacion ampliada: `pnpm --filter @erp-suite/erp-api run test -- cpe.controller.spec.ts cpe.idempotency.spec.ts cpe.service.spec.ts sunat-fiscal.service.spec.ts gre.idempotency.spec.ts gre.service.spec.ts gre.worker.controller.spec.ts ose.service.spec.ts sunat-retry.service.spec.ts cpe-integration.documento-cliente.spec.ts cpe-integration.verify.spec.ts gre-integration.service.spec.ts --runInBand` OK (12/12 suites, 38/38 tests) y `pnpm --filter @erp-suite/erp-api run type-check` OK.
- Smoke beta real 2026-06-16: se invoco `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService` con `[RUC]MODDATOS`/`MODDATOS`. Resultado por fases: XML minimo llego a SUNAT y fue rechazado por estructura (`Client.2075`); UBL sin firma avanzo y fue rechazado por firma faltante (`Client.2335 No signature`); firma manual previa fue rechazada por digest incorrecto (`Client.2335 Incorrect reference digest value`); se reemplazo firma manual por `xml-crypto`; luego se completo el UBL 2.1 SUNAT con `ProfileID`, `InvoiceTypeCode listID`, `cac:Signature`, `PaymentTerms`, precios de referencia, IGV por linea y totales. SUNAT beta acepto factura `20100066603-01-F001-50507464`, boleta `20100066603-03-B001-50578301`, nota de credito `20100066603-07-F001-13059219` y nota de debito `20100066603-08-F001-13059220` con CDR `responseCode=0` y sin notas. Verificacion: `pnpm --filter @erp-suite/crypto run build` OK; `pnpm --filter @erp-suite/erp-api run test -- cpe.service.spec.ts comunicacion-baja.service.spec.ts gre.idempotency.spec.ts gre.service.spec.ts ose.service.spec.ts sunat-fiscal.service.spec.ts xml-signer-runtime.spec.ts --runInBand` OK (7 suites, 43 tests); `pnpm --filter @erp-suite/erp-api run type-check` OK.
- Pendiente: GRE si aplica y produccion controlada. RA/RC beta ya devolvieron tickets en la corrida reproducible del 2026-06-17 (`1781679870729` y `1781679882872`) y la reconsulta read-only posterior recupero CDR aceptado para ambos; una reconsulta adicional devolvio `0127`, documentado como comportamiento de ticket ya consultado en beta, no como rechazo fiscal. GRE SOAP beta por endpoint de guia rechazo `20100066603-09-T001-39234515` y reintento `20100066603-09-T001-24734262` con fault `2112`, aunque el XML firmado mantiene `CustomizationID=2.0` como exige la validacion oficial vigente. Para GRE 2.0 queda implementado `SUNAT_GRE_TRANSPORT=rest`; el preflight sin `client_id/client_secret` falla cerrado (`gre.rest_credentials=FAIL`, `productionUsed=false`) y falta credencial API SUNAT para smoke por Plataforma Nueva GRE. No se declara produccion real completa.

### 2. Creacion manual CPE en UI esta desalineada

Estado: mitigado en codigo el 2026-05-25.

`POST /api/cpe/comprobantes` existe y normaliza el payload de `CpeModal`, incluyendo tipo, serie, correlativo fiscal por `obtener_siguiente_numero_documento`, emisor real desde `empresa_config`, receptor e items.

### 3. Legacy `documentos` no sirve para impresion oficial

Estado: mitigado en codigo el 2026-05-25.

`apps/erp-api/src/modules/documentos.service.ts` ya no usa envio SUNAT simulado ni contenido PDF placeholder. Envia/expone PDF solo si existe CPE asociado; de lo contrario falla y dirige al modulo CPE.

### 4. Tipo de documento incorrecto desde documentos fiscales

Estado: mitigado en codigo el 2026-05-25.

`CpeService.crearCPEDesdeDocumento()` ya normaliza `cpe.tipo_documento` a codigos SUNAT:

- `01`: Factura electronica
- `03`: Boleta de venta electronica
- `07`: Nota de credito electronica
- `08`: Nota de debito electronica

### 5. PDF A4 existe, pero necesita hardening fiscal

Estado: mitigado en codigo el 2026-05-25.

`PdfGeneratorService` genera A4 con QR, datos de emisor/receptor, items y totales. Debe ser la base para facturas/NC/ND y, si se decide, boletas A4.

Remediado:

- Quita leyendas no universales por tipo/IGV.
- Falla cerrado si falta RUC/razon social real de empresa.
- Deriva tasa de impuesto desde datos o totales y evita hardcode fijo de 18%.
- Carga logo antes de cerrar el documento.
- La tabla CPE expone accion `PDF`.

### 6. Ticket/POS no garantiza formato 80mm/58mm

Estado: mitigado en codigo el 2026-05-25 y reforzado el 2026-06-17.

`TicketPrint.tsx` y `CpeViewModal.tsx` incluyen stylesheet de impresion 80mm. POS pasa `tipo_comprobante` al modal de venta exitosa para etiquetar factura/boleta correctamente. Desde el 2026-06-17, `VentaExitosaModal.tsx` carga el CPE completo cuando existe `cpe_id` e imprime QR SUNAT, valor resumen/hash, receptor y estado SUNAT; si el CPE aun no existe, imprime ticket interno de caja con leyenda de CPE pendiente. Para facturas y notas, la ruta preferente de representacion sigue siendo PDF A4 desde CPE.

No se encontro en documentacion oficial SUNAT una medida obligatoria 80mm/58mm para representaciones CPE de sistemas del contribuyente; 80mm queda como criterio operativo por impresora termica POS, no como mandato SUNAT. Ver `docs/audits/2026-06-17-pos-sunat-print-readiness.md`.

### 7. Impresion desktop/Tauri no era portable en Windows

Estado: mitigado en codigo el 2026-05-25.

`apps/web/src-tauri/src/printer.rs` usaba `/tmp` para PDF y `C:\temp`/`copy` directo para raw printing en Windows. Ahora usa `std::env::temp_dir()` y ejecuta `copy /b` via `cmd /C`.

## Verificacion ejecutada

- `pnpm --filter @erp-suite/erp-api type-check`: OK.
- `pnpm --filter @erp-suite/web type-check`: OK.
- `cargo check` en `apps/web/src-tauri`: OK.
- `pnpm --filter @erp-suite/erp-api exec jest --runInBand cpe.service.spec.ts`: OK, 14 tests.
- `pnpm --filter @erp-suite/erp-api exec jest --runInBand ose.service.spec.ts`: OK, 1 test.
- `pnpm --filter @erp-suite/erp-api exec jest --runInBand validation.service.spec.ts`: OK, 37 tests entre validation/retenciones.

## Requisitos oficiales relevantes

- SUNAT indica que la representacion impresa o digital puede ser el medio de otorgamiento del CPE al adquirente/usuario, segun el sistema y tipo de documento.
- SUNAT exige colocar valor resumen/codigo de barras y, desde 2018, codigo QR en la representacion impresa de factura, boleta y notas vinculadas.
- SUNAT define el contenido del QR en el Anexo C de la RS 113-2018: RUC emisor, tipo de documento, serie, numero, IGV, total, fecha, tipo/numero de documento del receptor y valor resumen, separados por `|`.
- La RS 141-2017 regula el "Ticket POS" SEE-CF/PSE-CF, que no es lo mismo que la representacion impresa de una factura/boleta CPE emitida por este ERP.
- La representacion impresa no debe inventar leyendas fiscales que no correspondan a la operacion real.

Fuentes oficiales consultadas:

- SUNAT Orientacion, comprobantes electronicos: https://orientacion.sunat.gob.pe/02-comprobantes-de-pago-emitidos-de-manera-electronica
- SUNAT efectos de ser emisor electronico: https://orientacion.sunat.gob.pe/4-efectos-de-ser-emisor-electronico
- SUNAT CPE boleta: https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta
- SUNAT Anexo C RS 113-2018: https://www.sunat.gob.pe/legislacion/superin/2018/anexoC-113-2018.pdf
- SUNAT RS 141-2017 Anexo 1 Ticket POS: https://www.sunat.gob.pe/legislacion/superin/2017/anexo1-141-2017.pdf
- SUNAT OSE: https://cpe.sunat.gob.pe/informacion_general/operador_servicios_electronicos

## Orden recomendado de remediacion

1. Decidir camino productivo de envio:
   - PSE/OSE API por tenant, o
   - SUNAT directo SOAP real.
2. Configurar credenciales/certificado/PSE reales.
3. Validar en beta con CDR aceptado y guardar evidencia antes de mover a produccion. Factura/boleta/notas y RA/RC ya tienen evidencia beta; falta GRE REST si aplica.
