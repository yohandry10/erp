# Release, producción y migración

## Principio

El código release candidate no equivale a producción autorizada. Un go-live
requiere entorno correcto, migraciones promovidas, secretos reales, dependencias
externas y smoke controlado.

## Gate de release

Debe cumplirse:

- Worktree y commit identificados.
- Type-check, build y pruebas relevantes en verde.
- Sin migraciones duplicadas ni pendientes desconocidas.
- Preflight PROD satisfactorio; el proyecto DEV retirado debe ser rechazado.
- Respaldo productivo disponible y probado.
- RLS, RBAC y aislamiento tenant validados.
- CPE y contabilidad cuadran en los escenarios aplicables.
- Inventario y caja cuadran después de ventas/anulaciones.
- Secretos productivos instalados fuera del repositorio.
- Plan de rollback aprobado.

Estado actual y pendientes: `docs/CURRENT_STATE.md`.

## Promoción de migraciones

1. Identificar exactamente el rango pendiente.
2. Ensayar el SQL dentro de una transacción con `ROLLBACK` o en infraestructura
   local efímera; nunca redirigirlo al DEV retirado.
3. Auditar SQL, duración, locks, backfills y rollback.
4. Ejecutar preflight PROD usando `.env.production` o secretos inyectados.
5. Crear respaldo verificable y registrar referencia.
6. Aplicar migraciones en orden.
7. Ejecutar validadores de entorno, seguridad, contabilidad, inventario y
   tesorería.
8. Comparar conteos y revisar logs.
9. Detener y revertir ante cualquier diferencia no explicada.

El release Colombia `529..532` se promovió el 2026-08-31 mediante el PR
[#97](https://github.com/yohandry10/erp/pull/97), fusionado en
`f6455355d12c8834a0c77a73b238647119dff04a`. Antes de la promoción pasaron la
reconstrucción limpia de PostgreSQL 16, los verificadores vigentes e históricos,
281 suites/2673 pruebas API, 46 pruebas Playwright, lint, type-check, builds,
CodeQL, auditoría de dependencias y el contrato DIAN oficial. Las migraciones se
aplicaron DB-first con preflight y respaldo verificable; Render y Vercel sirven
el mismo SHA. `/health/ready` confirma
`schema_version = required_schema_version = 532`, DB y Redis listos y outbox sin
filas claimable, processing, failed ni stale. Los siete `dead_letter` restantes
son históricos. Falta la revalidación visual autenticada del flujo Colombia en
PROD y, por contribuyente, los gates externos descritos abajo.

El candidato siguiente añade `533..534` y, al corte del 2026-09-04, está
**verificado sólo localmente y pre-PR**. La 533 hace fail-closed la procedencia
de CPE de demos Colombia: representación local no UBL/sin firma, sin
`SEND`/`QUERY`, aceptación ni evidencia externa, incluso después de convertir
el tenant a real. La 534 implementa el flujo atómico RMA→Nota Crédito DIAN `91`:
la nota permanece neutral hasta aceptación; la aceptación aplica exactamente
una vez los efectos enlazados y cierra la RMA, mientras el rechazo conserva cero
efecto y permite corregir/reintentar. La respuesta comercial usa la procedencia
persistida del CPE, reconsultada por `id + tenant_id`, y falla cerrado si no es
inequívoca; no decide con `empresa_config` mutable.

Su evidencia pre-PR es 283 suites/2693 pruebas API, type-check y builds API/Web,
52 pruebas Playwright más 1 contrato visual móvil, nueve XML DIAN y una
reconstrucción limpia PostgreSQL 16 con 531 migraciones, 44 verificadores
vigentes y 67 históricos hasta la 534. Esto no autoriza producción: faltan PR,
CI remoto, preflight y respaldo PROD, promoción DB-first `533..534`, despliegue
Render/Vercel, postchecks y retest visual autenticado sobre el mismo SHA. PROD
permanece en 532 mientras esa cadena no termine.

La regla estable se mantiene: después de cada deploy, `/health/ready` debe
informar `schema_version = required_schema_version`; que el esquema supere un
gate viejo no basta.

El rango `491..496` se promovió el 2026-08-17 en este orden:
respaldo/preflight; inspección y aplicación DB; API/worker con
`REQUIRED_DATABASE_SCHEMA_VERSION=496`; Web; postchecks de versión, readiness y
outbox. El backfill `490→492` procesó cero filas ambiguas. La regla estable se
mantiene: cualquier backfill futuro debe abortar si no puede congelar evidencia
contable histórica de forma inequívoca y nunca debe inferirla de un mapping
bancario mutable.

El 2026-08-13 el preflight PROD pasó y se creó un respaldo PostgreSQL 17 nuevo,
validado por listado y SHA-256. La restauración local preservó el estado `490`
(55 tenants), aplicó `491..496`, registró `496`, pasó `verify491..496` con
rollback y terminó con readiness `ready=true` para esquema requerido `496`.
La evidencia sin datos de negocio está en
`artifacts/qa-10-questions/prod-490-to-496-rehearsal-20260813.json`. Este ensayo
reduce el riesgo técnico, pero no autoriza la escritura PROD ni el cambio de
plan de Render.

El PR [#79](https://github.com/yohandry10/erp/pull/79) fue fusionado a `main` en
el commit `85f35175eaa6d51d4a0d19afe65930481a9c29c4`. Los gates de `main` quedaron
verdes, incluyendo PostgreSQL/contratos SQL, lint, type-check, tests, build,
Playwright, seguridad, CodeQL y NPM Audit. Render desplegó ese SHA con el gate
de esquema `496`; readiness remoto confirma DB, Redis y outbox listos. Vercel
publicó el Web productivo como `dpl_GDNtR83fFAQhoqNwnyxK5Aqgmv9W`. La evidencia
sin datos de negocio está en
`artifacts/qa-10-questions/prod-491-496-promotion-20260817.json`.

## Go-live

Orden recomendado:

1. Congelar cambios y registrar commit/tag.
2. Confirmar dominio, TLS, CORS, cookies y URLs públicas.
3. Instalar secretos de API, Supabase, Redis, correo y fiscal.
4. Verificar certificado y RUC productivo.
5. Configurar SOL y GRE REST si corresponde.
6. Promover DB mediante el procedimiento anterior.
7. Desplegar API, worker y Web/Tauri.
8. Verificar `/health/version` contra el commit esperado y readiness pasivo de
   esquema, Redis y outbox; después revisar logs, colas y observabilidad.
9. Crear o migrar el tenant real.
10. Ejecutar smoke mínimo autorizado:
    - login y RBAC;
    - catálogo y cliente;
    - compra/recepción;
    - stock por almacén;
    - venta/POS y pago;
    - CPE controlado;
    - caja y asiento;
    - reportes y auditoría.
11. Validar impresora y operación desde el `.exe` si aplica.
12. Registrar resultados y decisión de continuar.

No usar datos sintéticos en PROD para “probar rápido”.

## SUNAT

Antes de un envío productivo:

- `SUNAT_ENVIRONMENT=produccion`.
- SOL correcto para el RUC.
- PFX vigente y autorizado.
- El certificado contiene el RUC esperado o existe excepción explícita,
  justificada y aprobada.
- Endpoint y transporte corresponden al flujo.
- GRE REST tiene `client_id/client_secret` cuando aplica.
- Clock, correlativos, series y numeración están verificados.
- El preflight confirma que no se usó producción durante simulaciones.

Factura y boleta cuentan con evidencia aceptada en beta; RA/RC tienen evidencia
de ticket/consulta. El soporte de notas `07/08` está probado localmente, pero la
release no debe afirmar aceptación beta hasta guardar un CDR aceptado de cada
tipo como evidencia cruda. GRE SOAP beta no es un gate satisfactorio mientras
continúe el rechazo `2112`.

## Colombia DIAN

El alcance funcional interno FEV del candidato 533-534 queda cubierto por
código, una reconstrucción PostgreSQL 16 desde cero con 531 migraciones, 44
verificadores vigentes y 67 históricos, y 283 suites/2693 pruebas API. El perfil
aislado completo pasa 52 pruebas Playwright más 1 contrato visual móvil;
type-check y builds API/Web también están verdes. Los nueve XML pasan XSD y los
tipos cubiertos por el XSL oficial pasan además Schematron;
`AttachedDocument` queda bajo XSD porque ese XSL no cubre su raíz. Esa evidencia
no es homologación: para habilitar un contribuyente faltan sus credenciales reales,
resolución/rango, trust/pins, ejecutar `GetNumberingRange` y `SendTestSetAsync`,
conservar el resultado terminal, acreditar `HABILITADO` en el portal y realizar
el smoke oficial de factura, notas, adjunto y eventos.

La base desplegada hasta 532 implementa el núcleo FEV 1.9, la aceptación
estricta 528, las notas desde UI 529, la numeración/idempotencia reforzada 530,
el snapshot transaccional de pedidos 531 y el guard jurisdiccional RMA 532. La factura CO
real nace como UBL DIAN nativo firmado; la UI no puede escoger el consecutivo ni
el prefijo que DIAN haya asignado —y admite una resolución sin prefijo—, y el
retry no puede cambiar cliente, fechas, pago o perfil receptor.
El candidato 533 sella la procedencia demo CO y el 534 completa RMA→NC DIAN 91
sin efecto financiero hasta aceptación; ambos siguen pre-PR. También se
implementan los eventos FEV 030-034 sobre anclas emitidas/recibidas, pero nada de ello
habilita por sí solo a ningún contribuyente ni constituye RADIAN integral. Antes
de un go-live colombiano deben cumplirse, en este orden:

1. Abrir el PR del candidato 533-534 y exigir CI verde: gate oficial de nueve
   XML con `ProfileID` normativos, 283 suites/2693 pruebas API, type-check y
   builds API/Web, 52 Playwright más 1 visual móvil, y reconstrucción PostgreSQL
   16 con 531 migraciones, 44 verificadores vigentes y 67 históricos hasta 534.
   Las pruebas Chrome usan APIs interceptadas y no sustituyen el backend
   productivo.
2. Configurar el bundle CA público y los pins SHA-256 de SPKI oficiales en el
   runtime. Una fuente ambigua, cadena no confiable o pin divergente debe fallar
   cerrado; nunca usar el PFX privado del tenant como trust store.
3. Tras preflight, respaldo y ensayo transaccional, promover `533..534`
   DB-first y comprobar `schema_version = required_schema_version = 534` antes
   de desplegar API/worker y Web. El preflight de 533 debe abortar ante cualquier
   demo CO con estado/evidencia externa o una operación fiscal reclamada; no
   corrige historia ambigua. El de 534 exige los contratos RMA 456/532 y notas
   DIAN 529. Después de aplicar, ejecutar sus verificadores vigentes y los
   históricos declarados antes de mover el runtime.
4. Cargar por tenant el PFX, Software ID/PIN, TestSet,
   resolución/rango/fechas, prefijo sólo si DIAN lo asignó y clave técnica;
   confirmar que el PFX pertenece
   al mismo NIT efectivo, además de perfiles tributarios de receptores y series.
   Cambiar el NIT obliga a revalidar el PFX almacenado. No existe fallback a
   secretos globales.
5. Ejecutar `GetNumberingRange` para validar exclusivamente numeración; no tomar
   ese resultado como prueba del Software PIN. En el ambiente de habilitación
   FEV, enviar el TestSet asignado y consultar el
   `ZipKey` hasta resultado terminal. Guardar la evidencia cruda sin secretos.
6. Verificar en el portal FEV que el mismo Software ID/TestSet/PIN aparece
   `HABILITADO`; registrar la referencia con un ADMIN después de la validación
   técnica reciente. Un documento aceptado aislado no sustituye esta compuerta.
7. Cambiar al endpoint oficial de producción y ejecutar un smoke autorizado:
   factura `01` → `GetStatus` → `ApplicationResponse` →
   `AttachedDocument`; luego RMA→nota `91` con aceptación/cierre y
   rechazo/reintento sin efecto, nota `92`, importación de FEV recibida y eventos
   FEV 030-034. Verificar CUFE/CUDE, trust, numeración e identidad
   visible exacta `prefijo + consecutivo` (o sólo consecutivo), A4/logo,
   reintento por `operationId` y auditoría.
8. Si se ofrecerá operación directa RADIAN/factoring, completar además el
   registro como participante, documentos/requisitos, verificación DIAN y Set
   RADIAN de 15 eventos. Esta habilitación es independiente del TestSet FEV y
   030-034 no la acreditan por sí solos.
9. Repetir el flujo visual en Web sobre el mismo SHA, revisar consola, logs,
   colas y estados, y conservar la respuesta oficial. Sólo entonces puede
   decidirse el go-live de ese contribuyente.

La fuente primaria para el requisito separado es el
[Abecé RADIAN oficial vigente](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/abece-radian/),
consultado el 2026-08-29. Sin PFX, Software ID/PIN, TestSet FEV,
resolución/numeración, trust/pins y estado portal `HABILITADO` reales, el estado
correcto es: **base 532 técnicamente implementada y desplegada; candidato
533-534 técnicamente probado sólo en local; contribuyente no homologado ni listo
para emitir legalmente**. Para RADIAN directo faltan además su registro,
requisitos y Set de 15 eventos. Las demos permanecen simuladas y no contactan
DIAN.

## Migración de clientes

Orden de carga:

1. Tenant, empresa, usuarios y permisos.
2. Catálogos fiscales y configuración.
3. Clientes y proveedores.
4. Productos, almacenes y stock inicial.
5. Cuentas bancarias y saldos.
6. CxC y CxP abiertas.
7. Plan de cuentas, períodos y saldos contables.
8. Documentos históricos necesarios para trazabilidad.

Reglas:

- Plantillas CSV se validan antes de escribir.
- Cada fila lleva clave externa estable e idempotency key.
- Stock inicial exige `almacen_id`.
- Totales por módulo deben cuadrar contra el sistema origen.
- Una falla detiene el lote o queda registrada de forma reanudable.
- El rollback se prueba localmente o en una transacción revertida antes de usar
  datos reales; DEV no es un destino permitido.

## Rollback

Preparar antes del despliegue:

- versión anterior de aplicaciones;
- respaldo/restauración DB;
- compatibilidad entre código anterior y esquema nuevo;
- estrategia para jobs y mensajes en vuelo;
- responsables y criterio de abortar.

Si una migración no es reversible, el rollback debe ser roll-forward con script
correctivo probado. Nunca improvisarlo sobre PROD.

## Bloqueantes actuales

- Certificado productivo compatible con el RUC.
- Interno Colombia: la base 532 está desplegada en
  `f6455355d12c8834a0c77a73b238647119dff04a`, pero su revalidación visual/API
  autenticada sigue pendiente. Para el candidato 533-534 faltan además PR/CI,
  preflight y respaldo PROD, promoción DB-first, despliegues Render/Vercel y
  retest visual sobre el mismo SHA.
- Para Colombia: PFX compatible con el NIT, Software ID/PIN, TestSet,
  resolución/numeración, trust store/pins y constancia `HABILITADO` del portal;
  falta ejecutar y conservar el TestSet FEV y smoke DIAN reales. Para operación
  directa RADIAN faltan registro/requisitos, verificación y Set de 15 eventos.
  El transporte técnico presente no elimina estos bloqueos legales.
- Credenciales GRE REST si el cliente usa guías.
- Secretos finales y smoke productivo autorizado.
- Prueba física de impresión y cliente desktop.
- Validación legal externa de PLAME/T-Registro.
- Decisión de producto sobre venta rápida.
- Añadir un medio de pago en Render y aprobar el cambio de la instancia
  `free→starter` (USD 7/mes). La promoción `491..496`, el SHA de Render y los
  despliegues API/Web ya están verificados; el plan pagado es el único pendiente
  de infraestructura de esta ventana.

## Evidencia y cierre

La evidencia cruda se guarda en `artifacts/`, no en `docs/`. El cierre de release
actualiza únicamente:

- `docs/CURRENT_STATE.md` con resultado y pendientes;
- este documento si cambia el procedimiento estable;
- código, pruebas y migraciones que demuestren el cambio.
