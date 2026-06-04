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

Estado despues de la remediacion aplicada el 2026-05-25: los bloqueos de codigo detectados quedaron mitigados en repo local. Aun no se debe declarar produccion real hasta ejecutar beta/homologacion con CDR aceptado y credenciales/PSE reales.

- La ruta directa SUNAT ya no simula aceptacion: usa XML firmado existente y llamada SOAP, o falla si falta configuracion/path explicito.
- La UI de creacion manual CPE tiene endpoint backend compatible (`POST /api/cpe/comprobantes`) que normaliza payload, toma emisor real y obtiene correlativo por RPC.
- El flujo legacy `documentos` ya no simula envio/PDF: delega al CPE asociado o falla con mensaje claro.
- `crearCPEDesdeDocumento` normaliza a codigos SUNAT `01/03/07/08`.
- El PDF A4 falla cerrado sin empresa real, carga logo antes de cerrar el PDF y no imprime leyendas fiscales no declaradas.
- POS conserva el tipo real `01/03`, etiqueta factura/boleta correctamente e imprime ticket con CSS `@page` 80mm.
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
- O reemplazar/wirear la ruta directa a un cliente SOAP real, reutilizando o consolidando `OseService`, y eliminar la aceptacion simulada.

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

Estado: mitigado en codigo el 2026-05-25.

`TicketPrint.tsx` y `CpeViewModal.tsx` incluyen stylesheet de impresion 80mm. POS pasa `tipo_comprobante` al modal de venta exitosa para etiquetar factura/boleta correctamente. Para facturas y notas, la ruta preferente de representacion sigue siendo PDF A4 desde CPE.

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
- La representacion impresa no debe inventar leyendas fiscales que no correspondan a la operacion real.

Fuentes oficiales consultadas:

- SUNAT Orientacion, comprobantes electronicos: https://orientacion.sunat.gob.pe/02-comprobantes-de-pago-emitidos-de-manera-electronica
- SUNAT efectos de ser emisor electronico: https://orientacion.sunat.gob.pe/4-efectos-de-ser-emisor-electronico
- SUNAT CPE boleta: https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta
- SUNAT OSE: https://cpe.sunat.gob.pe/informacion_general/operador_servicios_electronicos

## Orden recomendado de remediacion

1. Decidir camino productivo de envio:
   - PSE/OSE API por tenant, o
   - SUNAT directo SOAP real.
2. Configurar credenciales/certificado/PSE reales.
3. Validar en beta con CDR aceptado y guardar evidencia antes de mover a produccion.
