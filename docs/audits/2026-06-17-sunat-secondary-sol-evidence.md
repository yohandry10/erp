# Evidencia SUNAT SOL secundario - 2026-06-17

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `docs/audits/2026-06-16-sunat-beta-cpe-evidence.md`, `docs/release/GO_LIVE_RUNBOOK.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Alcance

Verificacion posterior a la creacion del usuario SOL secundario `ERPFE001` para el RUC `20616053575`.

Esta evidencia no declara go-live ni emision fiscal productiva. Cierra el requisito de credencial secundaria validada, documenta la carga local de un PFX real no-demo y corrige una deuda del cliente SOAP que impedia consultar SUNAT produccion de forma compatible.

Fuentes oficiales consultadas:
- https://cpe.sunat.gob.pe/noticias/servicio-beta-para-realizar-pruebas-ubl-21
- https://cpe.sunat.gob.pe/informacion_general/certificados_digitales
- https://orientacion.sunat.gob.pe/04-certificado-digital
- https://cpe.sunat.gob.pe/sites/default/files/inline-files/manual_programador%20%281%29.pdf
- https://www.sunat.gob.pe/legislacion/superin/2016/182-2016.pdf
- https://www.sunat.gob.pe/legislacion/superin/2015/357-2015.pdf
- https://www.sunat.gob.pe/legislacion/oficios/2019/informe-oficios/i161-2019-7T0000.pdf

## Resultado

| Control | Resultado |
|---|---|
| Usuario secundario SOL | `ERPFE001` visible en SUNAT como `Activo`, asociado a `ANGEL RICARDO GADEA LIRA` y correo configurado. |
| Pregunta segura SUNAT | Registrada por requisito de SUNAT para continuar usando Menu SOL. No se documenta como secreto operativo del ERP. |
| Credencial secundaria | Validada contra SUNAT produccion por `getStatusCdr` read-only, sin enviar XML ni CPE. |
| `.env` local | Actualizado con `EMPRESA_RUC=20616053575`, `SUNAT_USERNAME=20616053575ERPFE001`, `SUNAT_PASSWORD=<redacted>`, `SUNAT_ENVIRONMENT=homologacion`, `SUNAT_CREDENTIAL_VERIFIED_AT=2026-06-17T00:00:00-05:00`. |
| Certificado PFX configurado | Actualizado el 2026-06-17 a `certs/sunat-20616053575.pfx` desde `CT2604146559.pfx`. Carga con clave privada, `demoMode=false`, thumbprint `74EA9ABFF4BB8A7A515FDAA0443632E1635D06FA`, issuer `Llama.pe SHA256 Standard CA`, vigencia `2026-04-28` a `2027-04-28`. El subject visible corresponde a `GADEA LIRA ANGEL RICARDO CE:003581663`, no al certificado demo `12345678910`. |
| Inspeccion local del PFX | Cadena local valida (`ChainBuildsLocally=true`, sin revocacion online), algoritmo `sha256RSA`, clave publica `RSA`, key usage `Firma digital, Sin repudio`, EKU `Autenticacion del cliente` y `Correo seguro`. No se envio nada a SUNAT en esta inspeccion. |
| Compatibilidad RUC 20 | No cerrada. SUNAT Orientacion indica que, si es persona juridica, el certificado debe contener el RUC de la empresa; la RS 182-2016/SUNAT exige que la firma digital corresponda al contribuyente y que el certificado que genera esa firma tenga nombres/razon social y numero de RUC del titular. Este PFX visible contiene CE de persona natural y no muestra el RUC `20616053575`. Por prudencia fiscal no se debe enviar CPE de la empresa con este PFX hasta obtener confirmacion escrita del proveedor/SUNAT o un certificado emitido para el RUC 20. |
| Firma XML local | Smoke local con `XmlSigner({ allowDemoFallback:false })` firmo XML UBL minimo y genero `DigestValue`/`SignatureValue`; SHA-256 del XML firmado `f1e27ce15cdfb9c229c40b5e3010a1c55d16e9344aee87e2cf2f2ff94b242a02`. |
| Guard productivo RUC/certificado | Implementado en `XmlSigner` y conectado a CPE/RA/RC/GRE/SUNAT: si `SUNAT_ENVIRONMENT=produccion`, el certificado debe contener `SUNAT_CERT_EXPECTED_RUC`/`EMPRESA_RUC`. Si no coincide, el backend falla antes de firmar/enviar, salvo confirmacion explicita `SUNAT_CERT_RUC_MISMATCH_CONFIRMED=true` con razon documentada. En `homologacion`/beta no bloquea pruebas tecnicas. |
| Produccion real | No se envio `sendBill`, `sendSummary` ni GRE a produccion. Sigue pendiente ejecutar smoke productivo controlado autorizado y obtener CDR/acuse real. |

## Smoke read-only ejecutado

Operacion: `getStatusCdr` contra `https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService`.

Parametro de consulta deliberadamente inexistente:

```text
RUC: 20616053575
Tipo: 01
Serie: F001
Numero: 99999999
```

Evidencia:

| Caso | Resultado |
|---|---|
| Credencial real `20616053575ERPFE001` por WS-Security UsernameToken | `HTTP 200`, `statusCode=0127`, `statusMessage=El ticket no existe`. |
| Misma consulta con password falsa | `HTTP 500`, fault `La Clave ingresada es incorrecta`. |
| Misma credencial real agregando HTTP Basic ademas de WS-Security | `HTTP 401`. |

Conclusion: la credencial secundaria fue aceptada por SUNAT cuando se usa WS-Security UsernameToken, y el resultado cambia correctamente con una clave falsa. El `0127` no es aceptacion fiscal de un CPE; solo demuestra autenticacion y respuesta del servicio para una consulta no emisora.

## Correcciones aplicadas

- `apps/erp-api/src/modules/ose/ose.service.ts`: para hosts `*.sunat.gob.pe`, el SOAP usa WS-Security UsernameToken sin HTTP Basic. HTTP Basic queda reservado para endpoints externos no SUNAT.
- `apps/erp-api/src/modules/fiscal/sunat-fiscal.service.ts`: misma regla de autenticacion para SUNAT directo.
- Ambos servicios ahora prefieren `SUNAT_USERNAME`/`SUNAT_PASSWORD` sobre aliases legacy `OSE_USUARIO`/`OSE_USERNAME`/`OSE_PASSWORD`, para evitar que el runtime ignore la credencial secundaria nueva si existen valores legacy en `.env`.

## Verificacion local ejecutada

```powershell
pnpm --filter @erp-suite/crypto run build
pnpm --filter @erp-suite/erp-api run test -- ose.service.spec.ts sunat-fiscal.service.spec.ts xml-signer-runtime.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api run test -- env.schema.spec.ts xml-signer-runtime.spec.ts ose.service.spec.ts sunat-fiscal.service.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api run test -- cpe.service.spec.ts comunicacion-baja.service.spec.ts gre.idempotency.spec.ts gre.service.spec.ts ose.service.spec.ts sunat-fiscal.service.spec.ts xml-signer-runtime.spec.ts env.schema.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api run test -- cpe.service.spec.ts comunicacion-baja.service.spec.ts gre.idempotency.spec.ts gre.service.spec.ts ose.service.spec.ts sunat-fiscal.service.spec.ts xml-signer-runtime.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api run type-check
git diff --check
```

Resultados:

- Crypto build: OK.
- Smoke local del PFX con `XmlSigner({ allowDemoFallback:false })`: OK, `demoMode=false`.
- Tests focales SOAP/firma: 3 suites / 16 tests OK.
- Tests del guard productivo RUC/certificado: 4 suites / 32 tests OK.
- Tests fiscales completos con guard: 8 suites / 63 tests OK.
- Type-check backend: OK.
- `git diff --check`: OK.

## Preflight SUNAT local sin envio

Se agrego la compuerta no destructiva:

```powershell
pnpm --filter @erp-suite/erp-api run sunat:readiness-preflight -- --out docs/audits/artifacts/sunat-readiness-preflight/2026-06-17T07-42-54-611Z/manifest.json
```

Controles:

- Carga `.env` local y `apps/erp-api/.env` sin imprimir secretos.
- Inspecciona el PFX con `XmlSigner({ allowDemoFallback:false })`.
- No ejecuta `sendBill`, `sendSummary`, `getStatus`, `getStatusCdr` ni REST GRE.
- Escribe un JSON sanitizado con `productionUsed=false`, checks `PASS/WARN/FAIL` y `canAttemptProductionSend`.

Resultado de la corrida local:

| Control | Resultado |
|---|---|
| Produccion usada | `false` |
| Ambiente SUNAT local | `homologacion` |
| RUC esperado | `20616053575` |
| PFX local | Carga OK, `demoMode=false` |
| Match RUC certificado | `false` |
| GRE transport | `soap` |
| `canAttemptProductionSend` | `false` |

Conclusion: el PFX local puede firmar tecnicamente, pero no contiene el RUC esperado. La compuerta confirma que este entorno no debe intentar emision productiva SUNAT. Evidencia: `docs/audits/artifacts/sunat-readiness-preflight/2026-06-17T07-42-54-611Z/manifest.json`.

Se ejecuto ademas la misma compuerta forzando `SUNAT_ENVIRONMENT=produccion`, sin red y con `SUNAT_CERT_RUC_MISMATCH_CONFIRMED=false`, para probar el fallo cerrado productivo:

```powershell
pnpm --filter @erp-suite/erp-api run sunat:readiness-preflight -- --out docs/audits/artifacts/sunat-readiness-preflight/2026-06-17T07-48-32-656Z/production-simulated-manifest.json
```

Resultado esperado: el comando termino con exit code `1` porque hay al menos un `FAIL`. El reporte conserva `productionUsed=false`, carga el PFX como real no-demo, muestra `rucMatches=false`, marca `certificate.ruc_match=FAIL` y mantiene `canAttemptProductionSend=false`.

Conclusion adicional: aun si alguien cambia localmente `SUNAT_ENVIRONMENT=produccion`, este PFX no pasa la compuerta previa a emision. Evidencia: `docs/audits/artifacts/sunat-readiness-preflight/2026-06-17T07-48-32-656Z/production-simulated-manifest.json`.

## Consulta beta read-only de tickets RA/RC

El 2026-06-17 se consultaron en SUNAT beta, sin emitir nuevos documentos, los tickets RA/RC generados en la evidencia del 2026-06-16:

| Tipo | Ticket | Resultado beta |
|---|---|---|
| RA | `1781650666182` | `0127` - `El ticket no existe` |
| RA | `1781651656311` | `0127` - `El ticket no existe` |
| RA | `1781653262140` | `0127` - `El ticket no existe` |
| RC | `1781653419888` | `0127` - `El ticket no existe` |

Conclusion: no hay CDR RA/RC recuperable para esos tickets beta. No se declara RA/RC aceptado ni rechazado. El flujo queda implementado y fail-closed, pero el cierre con CDR requiere un ticket vigente de beta/homologacion o produccion controlada autorizada.

## Smoke beta RA/RC/GRE reproducible

El 2026-06-17 se agrego y ejecuto un runner controlado:

```powershell
pnpm --filter @erp-suite/erp-api run sunat:beta-smoke:ra-rc-gre
```

Controles del runner:

- Se niega a correr con `SUNAT_ENVIRONMENT=produccion`.
- Usa exclusivamente SUNAT beta/homologacion con `20100066603MODDATOS` / `MODDATOS`.
- Usa el PFX demo `certs/demo.pfx`; no usa la credencial SOL secundaria real ni el PFX del RUC 20.
- Ejecuta un lote minimo y espaciado: factura base para RA, `sendSummary` RA, consulta de ticket RA, boleta base para RC, `sendSummary` RC, consulta de ticket RC y GRE beta.
- Guarda manifiesto, XML unsigned y respuestas SOAP crudas sin secretos en `docs/audits/artifacts/sunat-beta-ra-rc-gre/2026-06-17T07-04-03-049Z-1489/`.

Resultado de la corrida final:

| Paso | Archivo / ticket | Resultado |
|---|---|---|
| Factura base para RA | `20100066603-01-F001-39234513` | CDR beta aceptado `responseCode=0`; hash CPE `9EF78372446A4DA986C6C5A15CC6B82C`; CDR SHA-256 `0F5775FCE2E89E0A01F71BA862F15F860908038C5567D956024A7D78B617C867`. |
| RA `sendSummary` | `20100066603-RA-20260617-34513` | SUNAT beta devolvio ticket `1781679870729`; hash CPE `3D72C7C3658B0E1A621CDFA862C9BDD4`. |
| RA `getStatus` inicial | ticket `1781679870729` | SUNAT beta devolvio `HTTP 401` HTML `401 Authorization Required`; se reconsulto luego en modo read-only y se recupero CDR aceptado. |
| Boleta base para RC | `20100066603-03-B001-39234514` | CDR beta aceptado `responseCode=0`; hash CPE `D489FB95341DED81D5043F2D218F586C`; CDR SHA-256 `24DED742AC4A1876AA87B939898D44B7EE78477C33FBBAB4872663352A7B63E3`. |
| RC `sendSummary` | `20100066603-RC-20260617-34514` | SUNAT beta devolvio ticket `1781679882872`; hash CPE `DC80206C6049E0351F85720CA12C0C61`. |
| RC `getStatus` inicial | ticket `1781679882872` | SUNAT beta devolvio `HTTP 401` HTML `401 Authorization Required`; se reconsulto luego en modo read-only y se recupero CDR aceptado. |
| GRE `sendBill` | `20100066603-09-T001-39234515` | SUNAT beta rechazo con fault `2112`; detalle SOAP: `CustomizationID - La version del documento no es correcta` para `DespatchAdvice/cbc:CustomizationID` valor `2.0`. |

Conclusion: RA/RC avanzan mas que la evidencia previa porque `sendSummary` beta devuelve tickets vigentes. La primera consulta `getStatus` devolvio `401` no SOAP, pero una reconsulta read-only posterior recupero CDR aceptado para ambos tickets. GRE sigue fail-closed con rechazo SUNAT beta `2112`; no hay envio productivo.

## Reconsulta read-only RA/RC vigente

Se agrego un runner separado que no firma ni envia XML nuevo:

```powershell
pnpm --filter @erp-suite/erp-api run sunat:beta-ticket-readonly
pnpm --filter @erp-suite/erp-api run sunat:beta-ticket-readonly -- --ticket RC:1781679882872
```

Controles:

- Se niega a correr con `SUNAT_ENVIRONMENT=produccion`.
- Usa exclusivamente SUNAT beta/homologacion con `20100066603MODDATOS` / `MODDATOS`.
- Ejecuta solo `getStatus` sobre tickets ya emitidos por la evidencia previa.
- Guarda manifiesto y respuestas SOAP crudas en `docs/audits/artifacts/sunat-beta-ticket-readonly/`.

Evidencia:

| Tipo | Ticket | Artefacto | Resultado |
|---|---|---|---|
| RA | `1781679870729` | `docs/audits/artifacts/sunat-beta-ticket-readonly/2026-06-17T07-56-24-782Z-3619/manifest.json` | CDR beta aceptado: `La Comunicacion de baja RA-20260617-34513, ha sido aceptada`; CDR SHA-256 `3D91CD861E2841DF84B4EC24FFD8BF215012C5AD9B829E9007C65BA214F1EB43`. |
| RC | `1781679882872` | `docs/audits/artifacts/sunat-beta-ticket-readonly/2026-06-17T07-56-41-259Z-1286/manifest.json` | CDR beta aceptado: `El Resumen diario RC-20260617-34514, ha sido aceptado`; CDR SHA-256 `0D1710B6437FA850CD3F2E30F47F795C1373ED45AE4B9F12DDB5D584E297FE76`. |

Una consulta posterior combinada (`docs/audits/artifacts/sunat-beta-ticket-readonly/2026-06-17T07-57-15-425Z-3044/manifest.json`) devolvio `0127 El ticket no existe` para ambos tickets. No se interpreta como rechazo fiscal, porque antes ya se recuperaron los CDR aceptados; queda documentado como comportamiento de reconsulta/reuso de ticket en SUNAT beta.

## Reintento GRE-only y Plataforma Nueva GRE

Se consultaron fuentes oficiales adicionales de SUNAT para GRE:

- `ValidacionesGREv20250421_0.xlsx`: para `Guía-Remitente2_0`, `UBLVersionID` debe ser `2.1` y `CustomizationID` debe ser `2.0`; el error `2112` corresponde a valor distinto de `2.0`.
- `Manual URL – GRE.xlsx`: SUNAT publica Plataforma Nueva GRE por REST, con envio `POST https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/{numRucEmisor}-{codCpe}-{numSerie}-{numCpe}` y token Bearer.
- `Manual_Servicios_GRE (1)_0.pdf`: el token REST se obtiene con `client_id/client_secret` de API SUNAT registrados en SOL, `grant_type=password`, `scope=https://api-cpe.sunat.gob.pe`, usuario SOL y clave SOL.

Se aplico un ajuste conservador al XML GRE: `cbc:CustomizationID` queda como tag simple `<cbc:CustomizationID>2.0</cbc:CustomizationID>` sin atributos, porque la tabla oficial GRE solo define el valor del campo. Luego se ejecuto un unico reintento GRE-only en beta, sin RA/RC nuevos:

```powershell
pnpm --filter @erp-suite/erp-api exec ts-node --transpile-only tmp-gre-only-beta.ts
```

El script temporal fue eliminado al terminar. Evidencia guardada:

`docs/audits/artifacts/sunat-beta-ra-rc-gre/2026-06-17T07-22-43-886Z-gre-only-8975/`

Resultado:

| Paso | Archivo | Resultado |
|---|---|---|
| GRE-only SOAP beta | `20100066603-09-T001-24734262` | XML firmado con `CustomizationID=2.0` y sin atributos; SHA-256 firmado `9B8641D3319D949323BE90EB22F0C4F0E73A090F96AB184E4B0B7282DF2ADEBA`; SUNAT beta SOAP volvio a responder `2112`, detalle `CustomizationID` valor `2.0`. |

Conclusion tecnica: el valor `2.0` es correcto segun la validacion oficial vigente; el endpoint SOAP beta usado sigue rechazando la GRE. Para GRE 2.0 productiva/controlada el backend quedo preparado con transporte REST opcional `SUNAT_GRE_TRANSPORT=rest`, `SUNAT_GRE_CLIENT_ID`, `SUNAT_GRE_CLIENT_SECRET`, token OAuth de API SUNAT y envio a `api-cpe.sunat.gob.pe`. Sin esas credenciales API GRE no se puede cerrar el smoke REST ni obtener ticket/CDR por Plataforma Nueva GRE.

## Preflight GRE REST sin credenciales API

Se ejecuto una verificacion no destructiva forzando `SUNAT_GRE_TRANSPORT=rest` y dejando vacios `SUNAT_GRE_CLIENT_ID`/`SUNAT_GRE_CLIENT_SECRET`:

```powershell
pnpm --filter @erp-suite/erp-api run sunat:readiness-preflight -- --out docs/audits/artifacts/sunat-readiness-preflight/2026-06-17T08-08-29-088Z/gre-rest-missing-credentials-manifest.json
```

Resultado esperado: el comando falla cerrado con exit code `1` por `gre.rest_credentials=FAIL`. El manifiesto confirma `productionUsed=false`, `SUNAT_ENVIRONMENT=homologacion`, `greTransport=rest`, `canAttemptProductionSend=false`, PFX real cargado pero `rucMatches=false`, y no ejecuta envio ni consulta real a SUNAT. Evidencia: `docs/audits/artifacts/sunat-readiness-preflight/2026-06-17T08-08-29-088Z/gre-rest-missing-credentials-manifest.json`.

Conclusion: GRE REST no debe intentarse en este entorno hasta registrar/obtener credenciales API SUNAT. El bloqueo es externo y seguro: sin `client_id/client_secret`, el backend/preflight no habilita el flujo.

## Pendiente real

Para declarar produccion real todavia falta:

1. Confirmar por escrito con el proveedor de certificado o SUNAT que el PFX `CT2604146559.pfx` puede firmar CPE del RUC `20616053575`, porque el subject visible es de persona natural/CE y no muestra el RUC. Si no hay confirmacion expresa, emitir/obtener un certificado para la persona juridica con RUC 20.
2. Repetir CPE/RA/RC en produccion controlada autorizada solo despues de resolver el certificado del RUC 20. En beta/homologacion RA y RC ya tienen CDR aceptado.
3. Si el contribuyente emitira guias, registrar credenciales API SUNAT GRE (`client_id/client_secret`) en SOL y ejecutar GRE por `SUNAT_GRE_TRANSPORT=rest`; SOAP beta queda documentado como no concluyente por `2112` aun con `CustomizationID=2.0` correcto.
4. Solo despues cambiar `SUNAT_ENVIRONMENT=produccion` y emitir un CPE piloto de monto minimo con plan de anulacion/nota de credito listo.
