# Alineacion SUNAT CPE/GRE XML y transporte - 2026-06-17

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `docs/audits/2026-06-16-sunat-beta-cpe-evidence.md`, `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md`, `docs/audits/2026-06-17-sunat-wizard-onboarding-readiness.md`, `docs/audits/2026-06-17-pos-sunat-print-readiness.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha: 2026-06-17

## Conclusion

Se cerro una brecha real en la alineacion SUNAT de CPE/GRE a nivel de codigo:

- CPE ya no convierte fecha/hora de emision por UTC al generar XML; preserva la fecha calendario y hora SUNAT recibidas.
- GRE remitente ya no emite el punto de partida como `cac:OriginAddress`; lo emite en `Shipment/Delivery/Despatch/DespatchAddress`, que es la ruta validada por SUNAT.
- GRE transporte privado exige y emite conductor principal (`cac:DriverPerson`) y placa en `Shipment/TransportHandlingUnit/TransportEquipment/cbc:ID`.
- GRE transporte publico exige RUC real del transportista y lo emite en `ShipmentStage/CarrierParty`.
- GRE peso bruto se emite con tres decimales (`KGM`) y las fechas de traslado preservan el calendario local.
- La UI/modal GRE ahora pide RUC de transportista o datos completos de conductor segun modalidad, para no crear solicitudes que SUNAT rechazaria.
- El cliente GRE REST queda cubierto por prueba unitaria de URL, Bearer token y payload oficial (`nomArchivo`, `arcGreZip`, `hashZip`).

No se ejecuto envio productivo real. La verificacion fue local/unitaria y de contrato contra documentacion oficial; el smoke real con CDR productivo sigue bloqueado por certificado/credenciales externas documentadas.

## Fuentes SUNAT verificadas

- `https://cpe.sunat.gob.pe/guias-y-manuales`
- `https://cpe.sunat.gob.pe/noticias/servicio-beta-para-realizar-pruebas-ubl-21`
- `https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual_Servicios_GRE%20%281%29_0.pdf`
- `https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual_URL_GRE.xlsx`
- `https://cpe.sunat.gob.pe/sites/default/files/inline-files/ValidacionesGREv20250421_0.xlsx`
- `https://cpe.sunat.gob.pe/tipos_de_comprobantes/guia-de-remision-electronica-desde-los-sistemas-del-contribuyente`
- `https://orientacion.sunat.gob.pe/06-guias-de-remision`

Puntos normativos/tecnicos usados:

- GRE REST usa token OAuth con `client_id`, `client_secret`, usuario/clave SOL, scope `https://api-cpe.sunat.gob.pe` y luego `Authorization: Bearer`.
- GRE REST envia a `/v1/contribuyente/gem/comprobantes/{ruc}-{codCpe}-{serie}-{numero}` con `archivo.nomArchivo`, `archivo.arcGreZip` y `archivo.hashZip`.
- Consulta GRE REST usa `/v1/contribuyente/gem/comprobantes/envios/{numTicket}`.
- Validaciones GRE vigentes exigen `UBLVersionID=2.1`, `CustomizationID=2.0`, tipo `09`, serie `T###`, peso en `KGM`/`TNE`, modalidad catalogo 18, motivo catalogo 20, direccion de llegada en `DeliveryAddress` y partida en `Delivery/Despatch/DespatchAddress`.
- Transporte publico exige datos del transportista.
- Transporte privado exige placa y conductor principal con documento, nombres/apellidos y licencia.

## Cambios aplicados

- `apps/erp-api/src/modules/cpe/cpe.service.ts`: preserva fecha/hora local SUNAT en XML CPE y evita corrimiento UTC.
- `apps/erp-api/src/modules/gre/gre.service.ts`: corrige estructura UBL GRE remitente, validaciones de transportista/conductor/placa, peso con tres decimales y fechas locales.
- `apps/erp-api/src/modules/gre/gre.types.ts`: agrega campos contractuales `transportistaDocumento`, `conductorDocumentoTipo`, `conductorDocumentoNumero`, `conductorNombres`, `conductorApellidos`.
- `apps/erp-api/src/modules/gre/gre.controller.ts`: representacion impresa GRE incluye RUC de transportista y datos del conductor cuando existen.
- `apps/web/components/modals/GreModal.tsx`: captura campos requeridos por modalidad antes de crear GRE.
- `apps/web/components/modals/GreViewModal.tsx`: muestra/print de GRE incluye transportista, conductor y documento.
- `apps/web/tests/e2e/gre-completo.spec.ts`: E2E GRE privado llena conductor y licencia/placa obligatorios.
- `apps/erp-api/src/modules/ose/ose.service.spec.ts`: cubre payload oficial GRE REST y ticket pendiente.

## Verificacion ejecutada

```powershell
pnpm --filter @erp-suite/erp-api exec jest src/modules/cpe/cpe.service.spec.ts src/modules/gre/gre.service.spec.ts src/modules/ose/ose.service.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api run type-check
pnpm --filter @erp-suite/web run type-check
```

Resultado:

- Jest focal SUNAT: OK, 42/42 tests.
- Backend type-check: OK.
- Web type-check: OK.

## Riesgos residuales

- No declarar produccion fiscal real hasta hacer smoke autorizado con certificado del RUC emisor, usuario SOL secundario, CDR real y almacenamiento de evidencia.
- GRE REST real requiere `SUNAT_GRE_CLIENT_ID` y `SUNAT_GRE_CLIENT_SECRET` del contribuyente si va a emitir guias por Plataforma Nueva.
- El flujo automatico de GRE desde venta no puede emitir una guia lista para SUNAT si el tenant no tiene transportista/conductor real; debe quedar como flujo asistido o fallar cerrado hasta configurar esos datos.
- GRE SOAP beta quedo previamente documentado como no concluyente por fault `2112`; esta correccion alinea XML contra validaciones vigentes, pero no sustituye la prueba REST real.
