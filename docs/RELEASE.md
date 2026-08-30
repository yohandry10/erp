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

El estado remoto comprobado el 2026-08-29 llega a `522`. El release candidate
local es `523..528`: sus verificadores pasan en PostgreSQL 16 y `render.yaml`/CI
exigen 528, pero sigue pre-PR y no está autorizado para PROD hasta que el CI
remoto cierre. La promoción vuelve a comenzar por preflight, respaldo y ensayo
transaccional; el API/worker no puede desplegarse hasta que DB registre 528.
Después del deploy, `/health/ready` debe informar
`schema_version = required_schema_version = 528`: que el esquema supere un gate
viejo no basta.

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

El release candidate implementa el núcleo FEV 1.9, la aceptación estricta 528 y
los eventos FEV 030-034 sobre anclas emitidas/recibidas, pero nada de ello
habilita por sí solo a ningún contribuyente ni constituye RADIAN integral. Antes
de un go-live colombiano deben cumplirse, en este orden:

1. Abrir el PR y exigir CI verde: gate oficial de nueve XML con `ProfileID`
   normativos, suite API completa, type-check/build, Playwright Colombia,
   verificación de offline sensible y reconstrucción PostgreSQL 16 hasta 528.
   Las pruebas Chrome usan APIs interceptadas.
2. Configurar el bundle CA público y los pins SHA-256 de SPKI oficiales en el
   runtime. Una fuente ambigua, cadena no confiable o pin divergente debe fallar
   cerrado; nunca usar el PFX privado del tenant como trust store.
3. Promover `523..528` DB-first y comprobar `schema_version =
   required_schema_version = 528` antes de desplegar API/worker y Web.
4. Cargar por tenant el PFX, Software ID/PIN, TestSet,
   resolución/prefijo/rango/fechas y clave técnica; confirmar que el PFX pertenece
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
   `AttachedDocument`; luego nota `91`, nota `92`, importación de FEV recibida
   y eventos FEV 030-034. Verificar CUFE/CUDE, trust, numeración, A4/logo,
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
correcto es **técnicamente implementado en local, no homologado ni listo para
emitir legalmente**. Para RADIAN directo faltan además su registro, requisitos y
Set de 15 eventos. Las demos permanecen simuladas y no contactan DIAN.

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
- Interno Colombia: PR/CI remoto, promoción DB-first 523-528, despliegue y retest
  visual/API contra el mismo SHA; el cierre local no sustituye esos gates.
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
