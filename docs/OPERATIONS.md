# Operación, configuración y base de datos

## Requisitos

- Node.js 24 LTS, con parche vigente; CI y las tres imágenes Docker usan la rama 24.
- pnpm 9.
- Docker, si se usa el stack local.
- PowerShell para scripts operativos.
- Acceso Supabase sólo al entorno autorizado.

## Preparación y arranque

```powershell
pnpm install
pnpm build
```

`pnpm dev` no es un arranque válido del monorepo: la API bloquea ese modo.
Para pruebas con escritura se usa el runner aislado
`node scripts/ci/run-peru-integrated-local.mjs --browser`, que crea y elimina
únicamente su infraestructura efímera y no carga secretos productivos.
El arranque operativo requiere primero el preflight PROD indicado más abajo;
después se ejecuta el paquete compilado mediante `pnpm --filter @erp-suite/erp-api start`.

Servicios principales:

- Web: `http://localhost:3001`.
- API: puerto definido por `PORT`.
- Supabase, Redis y observabilidad: según variables del entorno o Docker.

El arranque filtrado de la API (`pnpm --filter @erp-suite/erp-api start`) resuelve
`.env.production` tanto desde la raíz del workspace como desde
`apps/erp-api`; nunca recurre a `.env` ni `.env.local`.
El worker independiente (`pnpm --filter @erp-suite/worker start`) carga sólo
`.env.production` de su paquete y raíz, preservando secretos inyectados. Exige
`NODE_ENV=production`, `DEPLOYMENT_ENV=PROD` y la referencia del único Supabase
autorizado, validando antes de importar jobs que crean clientes. Su prueba de
configuración usa dobles y archivos temporales, sin conexiones remotas.
Antes de iniciar consumidores, consulta `/api/health/ready` y exige API, Redis
y contrato DB listos, con `REQUIRED_DATABASE_SCHEMA_VERSION >= 553`. Respuestas
incompletas, esquemas antiguos o HTTP fallido impiden el arranque. La imagen
Docker verifica también ese orden mediante HTTP local con red externa deshabilitada.
Se retiraron dos tareas simuladas del worker: la que sólo imprimía métricas sin
actualizar el dashboard y la que anunciaba limpieza sin borrar archivos. Las
métricas de usuario siguen en la API; no existe purga automática de logs por
esta vía. Cualquier borrado productivo conserva el requisito de autorización,
respaldo y evidencia.
Los envíos/consultas CPE del worker atestiguan el actor de origen del CPE en
el JWT; la RPC valida que siga activo en el tenant. No sustituyen ese actor
por un UUID inventado. Las consultas programadas usan ENVIADO/SENDING y una
clave por ciclo; éxito técnico de la API no equivale a aceptación fiscal.
Los reintentos GRE leen `gre_guias` y validan el resultado de la operación.
La generación PDF verifica la cabecera del archivo y registra el resultado;
no intenta escribir directamente metadatos ni logs en tablas protegidas.
Los crons globales registran su resultado estructurado en el log del proceso,
sin insertar un tenant ficticio `system` en columnas UUID. Los lotes POS exigen
conteos explícitos válidos; fallos parciales se registran como error.

Comandos frecuentes:

```powershell
pnpm build
pnpm type-check
pnpm test
pnpm lint
pnpm test:ui-styles
pnpm check-encoding
pnpm desktop:dev
pnpm desktop:build
```

## Variables

Los esquemas de configuración en código son la fuente exacta. Categorías:

- API: `NODE_ENV`, `DEPLOYMENT_ENV`, `PORT`, CORS y URLs públicas.
- Supabase: URL, anon key, service-role key y conexión PostgreSQL.
- Redis/worker: host, puerto, credenciales y flags de jobs.
- Auth: secretos JWT, cookies y expiraciones.
- SUNAT/OSE: ambiente, SOL, certificado, RUC esperado y GRE REST.
- ARCA: ambiente, certificado y punto de venta. WSAA/WSFE se derivan del
  ambiente y sólo admiten las URLs oficiales exactas: homologación usa
  `https://wsaahomo.afip.gov.ar/ws/services/LoginCms` y
  `https://wswhomo.afip.gov.ar/wsfev1/service.asmx`; producción usa
  `https://wsaa.afip.gov.ar/ws/services/LoginCms` y
  `https://servicios1.afip.gov.ar/wsfev1/service.asmx`. No se aceptan destinos,
  redirecciones, puertos, queries ni rutas configurables por tenant.
- DIAN: Software ID/PIN, TestSet, PFX, resolución/prefijo/rango y clave técnica
  pertenecen al tenant. El runtime implementa UBL/XAdES y SOAP 1.2 con
  WS-Security/WS-Addressing, pero la transmisión permanece bloqueada hasta que
  una validación técnica reciente y la evidencia del portal acrediten ese mismo
  software/TestSet como `HABILITADO`. No existe fallback a credenciales DIAN
  globales cuando hay tenant. Los endpoints se derivan del ambiente, admiten
  sólo la URL oficial exacta y rechazan redirecciones: habilitación usa
  `https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc` y producción usa
  `https://vpfe.dian.gov.co/WcfDianCustomerServices.svc`.
- Confianza DIAN: `DIAN_AUTHORITY_CA_BUNDLE_PEM` —o la ruta absoluta local
  admitida por el runtime— y `DIAN_AUTHORITY_SPKI_SHA256` contienen material
  público de la autoridad, no el PFX del tenant. Bundle y pins SHA-256 de SPKI
  son obligatorios; fuente ambigua, archivo/ruta inválidos, pin malformado,
  cadena no confiable o firmante no fijado bloquean readiness/aceptación. La
  rotación debe actualizar ambos de forma coordinada y pasar los controles
  criptográficos antes del deploy. El certificado HTTPS de
  `vpfe.dian.gov.co` sólo autentica el transporte: no es el certificado que
  firma el XML y nunca se usa para calcular este pin.
- Stripe, correo, observabilidad y almacenamiento.

Reglas:

- No versionar secretos.
- PROD usa `.env.production` o secretos inyectados.
- El caché de compilación de Turbo incluye `.env.production` como dependencia
  global y las variables públicas del build, modo Node, Tauri y destino
  autorizado para invalidarse al cambiar esa configuración, incluso inyectada.
- `.env.local`, `.env` y el antiguo proyecto DEV no son fuentes operativas.
- El frontend sólo recibe variables `NEXT_PUBLIC_*` expresamente públicas.
- Logs y evidencia deben redactar tokens, passwords y claves.
- Las mutaciones de autenticación, `/configuration*`, `/configuracion*`,
  conversión demo y rutas de certificados, credenciales, PFX o secretos exigen
  conexión viva. No se persisten en outbox Web/Tauri; al leer o sincronizar se
  purga cualquier entrada legacy sensible.
- En producción `REQUIRED_DATABASE_SCHEMA_VERSION` es obligatorio. Debe igualar
  la última migración requerida por el release; omitirlo es error de arranque,
  no un fallback a una versión antigua.

### Preflight Colombia DIAN

La verificación técnica y la habilitación legal son gates distintos. Para un
tenant colombiano real, antes del primer envío:

1. Confirmar país `CO`, cuenta no demo y NIT canónico con dígito de
   verificación. El certificado X.509 del PFX debe corresponder al mismo NIT.
2. Cargar por el writer de configuración el PFX/password, Software ID/PIN,
   TestSet, resolución, prefijo, rango, fechas y clave técnica. Nunca colocar
   esos valores en Git, logs, capturas o variables `NEXT_PUBLIC_*`.
3. Obtener por un canal oficial un `ApplicationResponse` 02/04 real y reciente
   generado por DIAN. Extraer el `X509Certificate` embebido, verificar firma,
   vigencia al `SigningTime`, revocación, identidad DIAN, issuer y cadena hasta
   una ECD acreditada por ONAC; confirmar el leaf/serial en el repositorio de la
   ECD o con DIAN. La caja FEV 1.9 v2026 no publica un leaf ni pin vigente y el
   certificado del ejemplo del Anexo está vencido: no sirven como trust.
   Descargar de la ECD exacta la raíz/subordinada y configurar el bundle; el pin
   es SHA-256 sobre el DER de `SubjectPublicKeyInfo` del leaf XML DIAN, no sobre
   el certificado completo, una CA, TLS o el PFX tenant. Verificar que runtime
   los considere listos y que una cadena/pin adulterados fallen cerrado.
4. Ejecutar `GetNumberingRange` para validar endpoint, certificado y numeración.
   Este método no recibe ni valida el Software PIN. Después, por el flujo de
   emisión en habilitación, enviar el TestSet asignado con `SendTestSetAsync` y
   consultar su `ZipKey` mediante `GetStatusZip` hasta un estado terminal. La
   firma del documento valida el PFX; recibir el ZIP no significa que el set fue
   aceptado ni que el PIN quedó homologado.
5. Comprobar en el portal DIAN que ese Software ID/TestSet pasó a
   `HABILITADO`. Un ADMIN puede registrar la referencia verificable sólo tras
   una validación técnica reciente. Cambiar NIT, Software ID, TestSet o la
   naturaleza demo invalida la evidencia.
6. Antes de cambiar a producción, consultar otra vez la numeración, confirmar
   rango/clave técnica y ejecutar una emisión controlada. Cerrar la evidencia
   con `GetStatus`, `ApplicationResponse` y `AttachedDocument`; después probar
   `91`, `92` y los eventos FEV 030-034 aplicables.
7. Si el cliente operará como participante directo RADIAN, tramitar por separado
   el registro en Eventos RADIAN, documentos/requisitos y verificación DIAN, y
   superar el Set RADIAN de 15 eventos. Es un gate adicional al TestSet FEV y
   no se acredita por haber enviado 030-034.

Para rotar confianza, instalar el pin/cadena nuevos antes del corte y admitir
old+new únicamente durante una ventana comprobada; monitorizar `NotAfter`,
CRL/OCSP e issuer. Conservar el material anterior para revalidación histórica,
pero retirarlo de aceptación corriente después de confirmar el cese del
firmante. Los eventos 030-034 los firma el participante y el
`AttachedDocument` exterior lo firma el emisor; el pin DIAN sólo se aplica a la
respuesta de autoridad interna y a respuestas DIAN separadas.

El snapshot de pruebas, PR, CI, migración, despliegue y retest vigente se registra
en `CURRENT_STATE.md`. Esta guía no autoriza operar por el solo hecho de que un
gate local pase: se exige siempre CI remoto, promoción DB-first, despliegue y
retest productivo autorizado sobre el mismo SHA.

Un fallo antes de sellar el XML puede reintentar la misma intención. Después
del sello, un timeout o respuesta ambigua obliga a consultar primero por la
clave persistida: CUFE/CUDE usa `GetStatus`, `ZipKey` usa `GetStatusZip` y los
eventos consultan `GetStatusEvent`; `GetXmlByDocumentKey` recupera la FEV que se
ancla. El retry server-side usa el `operationId` persistido aunque el navegador
haya perdido su clave de `sessionStorage`. No se cambia de idempotencia ni se
regenera nombre ZIP, correlativo, XML o código único para «destrabar» un envío
incierto.

La fuente normativa operativa para el gate separado es el
[Abecé RADIAN oficial vigente](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/abece-radian/),
consultado el 2026-08-29. La página exige 15 eventos para el Set de pruebas del
participante directo; no se sustituye por un documento histórico ni por el
TestSet de facturación electrónica.

## Contrato PROD-only

| Entorno   | Project ref            | Estado                                        |
| --------- | ---------------------- | --------------------------------------------- |
| PROD      | `wypnbcptofqdmoynlonq` | Único destino remoto; sólo datos reales       |
| Cualquier otro | —                 | Rechazado por runtime, build de web y scripts |

Antes de cualquier operación DB:

```powershell
.\scripts\db-environment-preflight.ps1 -Environment PROD
```

No continuar si project ref, marca interna o archivo de variables no coincide
exactamente con PROD. Las pruebas con escritura no se ejecutan contra PROD.

## Migraciones

1. Revisar `docs/CURRENT_STATE.md`.
2. Ejecutar el preflight del entorno.
3. Buscar prefijos duplicados:

```powershell
Get-ChildItem supabase\migrations -File |
  ForEach-Object { $_.Name.Split('__')[0] } |
  Group-Object |
  Where-Object Count -gt 1
```

4. Revisar SQL, dependencias, locks, RLS y rollback.
5. Respaldar antes de una promoción productiva.
6. Aplicar por orden y registrar evidencia.
7. Ejecutar validadores y comparar conteos.

No ejecutar SQL suelto de raíz contra PROD. Convertirlo primero en migración o
seed idempotente revisado.

## Baseline y reconstrucción DB

Las migraciones activas son la fuente principal. Los inventarios previos al reset
se conservaron fuera de la documentación en `artifacts/db-forensics/`.

Antes de borrar o reconstruir una base, consultar como mínimo:

- `db_forensic_baseline.md`
- `db_reconstruction_plan.md`
- `db_relations_catalog.csv`
- `db_tables_base_list.txt`
- `db_migration_numbering_report.txt`
- `db_migration_core_range_report.txt`
- `db_code_vs_relations_report.txt`
- `db_unmatched_table_references.txt`
- `db_rpc_vs_migrations_report.txt`
- `db_unmatched_rpc_references.txt`

Esos artefactos son forenses; pueden estar superados. Deben contrastarse con
`supabase/migrations/`, código actual y `docs/CURRENT_STATE.md`.

## Ensayo local de recuperación

`node scripts/ci/run-peru-integrated-local.mjs --browser` reconstruye PostgreSQL
16 efímero, verifica SQL y flujos HTTP y toma un respaldo con snapshot exportado.
`test-peru-backup-restore-local.mjs` sólo acepta el contenedor efímero del runner:
restaura en otro contenedor nuevo sin red, compara huellas/conteos de todas las
tablas de public/app/auth/storage y comprueba ACL/RLS. Guarda dump, SHA-256 y
resultados en el directorio `artifacts/peru-integrated-*/backup/`; retira únicamente
el contenedor que creó. No acredita respaldos de PROD, objetos externos de
Storage ni RTO del proveedor. El tiempo medido sólo corresponde al ensayo local.

El respaldo productivo se obtiene con `scripts/backup-peru-prod.mjs`, pasando
`--env-file` hacia `.env.production` y `--pg-bin` hacia un cliente PostgreSQL 17.
El script ejecuta el preflight, fuerza sólo lectura y conserva el dump privado
en `artifacts/db-backups/`, excluido de Git; el manifiesto sólo contiene hash,
tamaño y alcance. `node scripts/rehearse-peru-prod-local.mjs <manifiesto>` valida
ese hash y restaura public/app/auth/storage/supabase_migrations en un contenedor
PostgreSQL 17 nuevo sin red ni puertos publicados. Contrasta historia 536,
aplica 537..553 con registro transaccional, compara todas las filas previas y
RLS, ejecuta los verificadores con rollback y comprueba readiness 553.
Conserva las ACL de tablas salvo SELECT del backend y la retirada explícita
de DML de auditoría en 542. No supone que las concesiones heredadas de PROD
sean iguales a las de PostgreSQL limpio; un control negativo demuestra que
el comparador detecta nuevas escrituras. No respalda roles globales ni archivos
externos de Storage, ni acredita privilegio mínimo de todos los módulos.

El mismo ensayo genera el lote `peru-promotion-553-<hash>.sql` desde las
migraciones canónicas. Reúne DDL, backfills e historia en una transacción con
aislamiento repetible, verifica proyecto/esquema inicial y readiness final, y
notifica la recarga de PostgREST sólo al confirmar. Antes de validar cada
migración, el ensayo ejecuta ese lote con un fallo deliberado previo al commit
y demuestra que columnas, filas, políticas y permisos vuelven al estado 536.
Este control negativo ocurre exclusivamente en la copia sin red; nunca se
ejecutan verificadores ni fallos inyectados en PROD.

`node scripts/promote-peru-prod.mjs --backup <manifiesto> --rehearsal <ensayo>`
comprueba el respaldo de menos de 24 horas, su restauración, los hashes de las
17 migraciones y del lote, el commit del PR 109 y todos sus checks. Sin
`--apply` no conecta a PostgreSQL. La aplicación exige además `--env-file`
hacia `.env.production` y `--pg-bin` hacia PostgreSQL 17, repite el preflight,
contrasta la historia 533..536 y aplica únicamente el lote canónico ensayado.
Conserva evidencia de historia/readiness antes y después; el diagnóstico DB
queda en logs privados ignorados. Si se pierde la respuesta del commit, se
debe comprobar la historia remota antes de reintentar. Tras un commit exitoso,
una corrección se publica hacia adelante; no se restaura destructivamente PROD.

La opción `--survey` añade inspección de carga de las pantallas estáticas de
dashboard con navegador y API reales. Sus resultados y capturas quedan en
`module-survey/` dentro de la evidencia del ensayo; no acreditan todas las
operaciones de cada módulo ni las páginas que requieren un identificador.

## Operaciones destructivas en PROD

Requisitos obligatorios:

1. Autorización explícita y alcance exacto.
2. Preflight PROD satisfactorio.
3. Respaldo verificable.
4. Script revisado e idempotente cuando aplique.
5. Transacción o estrategia de rollback.
6. Conteos y validadores antes/después.
7. Evidencia sin secretos.

Nunca realizar borrados amplios con rutas, tenants o filtros no resueltos.

## Health y observabilidad

La API expone checks separados: `live` sólo acredita proceso; `ready` es pasivo
y no recarga el esquema ni muta PostgreSQL. Readiness exige la versión mínima
de DB configurada, Redis cuando es obligatorio y capacidad real del outbox; el
endpoint de versión debe publicar commit y fecha de build inyectados por el
despliegue.
Validar al menos:

- proceso API;
- conexión PostgreSQL/Supabase;
- Redis y worker cuando estén habilitados;
- latencia y errores;
- jobs pendientes/fallidos;
- logs de seguridad y auditoría.

Los dashboards y alertas deben usar métricas estructuradas. Un health “OK” no
demuestra que los flujos funcionales estén listos.

El worker de outbox sólo escribe mediante RPCs de enqueue/claim/heartbeat/
complete/fail/reset con token de claim; `service_role` no recibe DML directo en
la tabla. Las listas, métricas y reintentos expuestos a usuarios revalidan
`tenant_id`, actor activo y permiso dentro de PostgreSQL; sólo incluyen tipos
propiedad del worker contable, proyectan metadatos operativos mínimos y nunca
usan una lectura global de `service_role`. Al iniciar ejecuta catch-up, además
del cron. Antes de promover `492`,
el backfill revisa eventos laborales `pending`, `failed` y `processing`; si un
movimiento histórico no contiene un snapshot contable 1:1, la migración aborta
con `REGULARIZATION_REQUIRED` en vez de inferir el mapping bancario actual.

El listener contable conserva estado, intentos y errores en el outbox mediante
sus RPCs y registra el detalle de ejecución en el logger. No intenta duplicar
ese seguimiento con DML sobre `event_processing_log`, cuyos datos históricos
permanecen intactos. El mensaje de éxito sólo se escribe después de confirmar
la transición durable del evento.

## Pruebas operativas

El preflight `apps/erp-api/scripts/sunat-readiness-preflight.ts` carga únicamente
`.env.production` o secretos inyectados, igual que el runtime. Verifica ambiente,
transporte GRE, aliases SOL/OSE y vigencia del certificado; bloquea MODDATOS en
producción. Su informe es una comprobación local de configuración global:
no consulta credenciales del tenant, no envía documentos y no acredita un
ticket/CDR ni habilitación del contribuyente. `ra_rc.ticket_cdr` permanece en
advertencia hasta tener evidencia externa; no debe usarse para declarar go-live.

Las rutas `/api/migration` admiten JSON de hasta 21 MiB para el contrato existente
de 20 MiB base64. Las demás rutas conservan el límite JSON predeterminado de
100 KiB. El navegador ofrece CSV de hasta 5 MiB; cargas mayores al límite HTTP
devuelven 413 y un CSV estructuralmente inválido devuelve 400 antes de crear runs.

Antes de promover:

```powershell
pnpm type-check
pnpm build
pnpm test:cov
pnpm test:ui-styles
pnpm test:quality
pnpm test:dian-contract
```

Según el cambio, añadir:

- Playwright sólo con dobles o infraestructura local efímera, nunca contra PROD.
- Pruebas offline y build Tauri.
- Preflight SUNAT.
- Validadores SQL.
- Smoke por rol y tenant.
- Prueba de concurrencia/idempotencia.

### Cobertura

El suelo vive en `apps/erp-api/jest.config.js` y CI lo hace cumplir desde que el
job de tests ejecuta `pnpm test:cov`. Antes declaraba 80% pero Jest nunca lo
evaluaba: sin `--coverage`, el bloque `coverageThreshold` ni se lee.

Suelo vigente en código: **31% líneas · 28% ramas · 29% funciones · 31% sentencias**. Es un
suelo, no una meta, y la regla es que puede subir pero nunca bajar. Este dato
describe la configuración actual de Jest; no cambia sus umbrales. Un resultado
verde no acredita cobertura completa ni aceptación fiscal externa.

Dónde subirla primero, por riesgo y no por facilidad: `modules/cpe/` (emisión y
afectación de IGV), `ple-export.service.ts` (libros electrónicos),
`modules/rrhh/planillas*` y `modules/finanzas/cxp|cxc`.

### Lo que no existe

- **Gherkin/BDD**: ningún `.feature`, ningún Cucumber.
- **Pruebas de mutación**: no hay Stryker; nada mide si las pruebas detectarían
  un cambio que rompa la lógica.
- **Métricas centralizadas**: no hay SonarQube. La cobertura se publica como
  artefacto de CI y en el resumen de cada ejecución.
- **Validación PLE contra SUNAT**: los TXT siguen la estructura del Anexo 2 y las
  pruebas fijan el número de campos, pero quien certifica que un archivo es
  válido es el validador PVS, que no se puede ejecutar en CI.

CI ejecuta dos fronteras aisladas: PostgreSQL 16 efímero reconstruye la cadena,
corre los verificadores requeridos y prueba el readiness contra la versión
final; Playwright usa sólo localhost y mocks controlados para los recorridos sin
base. Las specs que necesiten datos reales continúan bloqueadas salvo que reciban
una base efímera explícita. Ningún E2E puede apuntar a PROD ni al DEV retirado.

El recorrido integrado Perú se ejecuta con
`node scripts/ci/run-peru-integrated-local.mjs --browser` (Docker, PostgreSQL
cliente 16 en PATH o `PSQL_BIN` y Chromium de Playwright). Reserva los puertos
locales 55456/55457/3126/3125 y crea contenedores nuevos sin volúmenes. Aplica
la cadena y los verificadores completos, prepara dos empresas sintéticas y
ejecuta Nest con sus guards/servicios y PostgREST real. Comprueba venta, IGV,
stock, caja, repetición de intención, aislamiento entre empresas y consumo
contable del outbox. También recorre alta de proveedor, orden, aprobación por
otro usuario, recepción, factura y pago bancario con sus asientos; contrasta
el contexto fiscal persistido y los conflictos al reintentar. `--browser`
añade login, apertura y cobro desde el POS, además de crear, aprobar y recibir
una compra desde la interfaz.
El ejecutor conserva logs/JSON/capturas en `artifacts/peru-integrated-<ejecución>`
y detiene sólo los recursos que creó. No carga archivos operativos ni cambia
la lista blanca PROD del runtime; la dependencia Supabase local se inyecta en
el módulo de prueba. GoTrue, Storage HTTP, SUNAT y OSE externos no forman parte
de este ensayo. Las migraciones 537/538 fijan lecturas explícitas del backend
para estos recorridos; no habilitan escrituras directas ni alteran RLS.
La 541 completa la lectura de categorías. El ensayo también incluye altas de
categoría/servicio, recepciones parciales con calidad mixta y devoluciones antes
y después de facturar, con rollback al devolver una compra ya pagada.
También contrasta factura en USD: deuda en moneda documental y asiento en
soles con la cotización de origen, sin consulta ni emisión fiscal externa.
La 542 añade el append complementario de auditoría/integraciones y sus lecturas
del backend. El ensayo prepara auditores independientes y usuarios sin permiso
en la base efímera, conserva la prohibición de auditoría de ADMIN_DEMO y prueba
historial, filtros, paginación, aislamiento y acceso denegado. El recorrido
visual verifica la consulta real y, mediante una inyección de respuesta parcial
explícita, que la pantalla advierta el fallo de una fuente y permita recuperarse.

La frontera PostgreSQL crea también un catálogo mínimo efímero de Supabase
Storage (`storage.buckets`, `storage.objects`, roles y RLS). Así las migraciones
de Storage no pueden saltarse silenciosamente la creación del bucket o sus
políticas; la compuerta 523 demuestra en rojo una configuración adulterada y una
policy ausente antes de ejecutar el verificador normal. Este doble sólo valida
el contrato SQL: no levanta la API de Storage ni sustituye el smoke posterior al
despliegue contra el único proyecto Supabase autorizado.

`test:dian-contract` comprueba primero el manifiesto SHA-256 de 22 artefactos y
genera con el código real nueve XML firmados: factura `01`, notas `91/92`,
eventos 030-034 y `AttachedDocument`. Los nueve pasan el XSD oficial; factura,
notas y eventos pasan además el Schematron compilado de la caja DIAN FEV 1.9 de
2026. El adjunto queda sólo bajo XSD porque el XSL distribuido no cubre su raíz.
Antes del Schematron, el gate exige los cuatro `ProfileID` descriptivos exactos
del Anexo FEV 1.9. La propia caja contiene divergencias entre XSL, listas de
códigos y ejemplos RADIAN. El gate fija URL/hash, página/regla y evidencia de
cada divergencia, y sólo tolera el conjunto completo de reglas/mensajes exactos enumerados en
`scripts/ci/fixtures/dian-fev-1.9/README.md`; cualquier otro fatal rompe CI. Es
una comprobación reproducible de estructura, no un reemplazo del TestSet ni de
la validación en el portal DIAN. Por sí solo tampoco prueba importación,
persistencia, secuencia o retry: esas capas están cubiertas separadamente por los
verificadores 527/528, la suite API y Playwright con APIs interceptadas. Ninguno
prueba transmisión ni habilitación real.

El verificador 528 debe permanecer en la frontera PostgreSQL 16: prueba que un
`ApplicationResponse` adulterado, con raíz/namespace incorrectos, firma múltiple,
referencia indirecta o CUFE/CUDE divergente no pueda promover el CPE a
`ACEPTADO`. El flag de trust que consume SQL sólo puede originarse en la
verificación criptográfica fail-closed del API.

Conviene recordar qué **no** cazan las pruebas. La suite estaba verde mientras el
sistema adelantaba las fechas un día pasadas las 19:00, perdía las bases
exoneradas en el reporte de ventas y exportaba el Registro de Compras con los
importes corridos de casilla. Un verde dice que no se rompió lo ya cubierto; no
dice que el módulo funcione.

## Evidencia técnica

- `artifacts/audit-evidence/`: respuestas y manifests de smokes.
- `artifacts/db-forensics/`: inventarios y reportes de reconstrucción.
- `artifacts/load-tests/`: resultados de carga.

`artifacts/` no es documentación canónica. No debe entrar en la lectura inicial
de agentes y no se enlaza desde `docs/README.md` salvo una investigación forense.

## Tipo de cambio oficial

No existe un tipo de cambio propio de SUNAT: SUNAT publica el que determina la
SBS. El sistema importa **compra y venta**, porque no son intercambiables: las
partidas de activo se contabilizan al promedio ponderado compra y las de pasivo
--y el IGV-- al de venta.

La SBS publica en una página ASPX y no en un servicio JSON, así que la
importación pasa por un tercero. Eso obliga a desconfiar por diseño, y no es
teórico: contrastando dos proveedores para el 2026-08-20 uno devolvía 3.647 y el
otro 3.355, con el día anterior en 3.356 y el siguiente en 3.355. El primero
servía un dato corrupto.

Por eso la importación **descarta lo que no cuadra en vez de guardarlo**: una
cotización que se aparte más de `TIPO_CAMBIO_DESVIACION_MAXIMA` (5% por defecto)
de la última conocida no entra, se registra en el log y queda para que el
contador la teclee si sabe que es correcta. Tampoco pisa nunca una cotización ya
registrada.

```powershell
# Rellenar un rango a mano (requiere token para no chocar con el limite de la fuente)
POST /api/contabilidad/tipos-cambio/importar?desde=2026-01-01&hasta=2026-08-24
```

El job diario corre a las 03:00 UTC y pide **la fecha de Lima**, no la del reloj:
a esa hora en UTC ya es el día siguiente en el servidor pero aún no en Perú, y
pedir una fecha que la SBS no ha publicado devuelve el arrastre del día previo.
