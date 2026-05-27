# Estado Actual del Proyecto ERP

Fecha de corte: 2026-05-12

## Resumen ejecutivo

El proyecto esta en una fase avanzada de estabilizacion posterior a cambios amplios ya presentes en el worktree. La revision exhaustiva dejo inventario real, validaciones principales de API/web/worker, clasificacion documental inicial, correcciones de contratos/tests del API y una nueva ronda de navegador visible contra el ERP local.

Estado actual:

- API NestJS: migrado a Nest 11; type-check, build y unit tests pasan; lint pasa con warnings no bloqueantes en API; produccion ahora falla temprano si Redis o certificado fiscal real son obligatorios y no estan disponibles. Se corrigieron divergencias runtime detectadas en POS, analytics, usuarios y metricas Prometheus.
- Web Next.js: type-check, lint, build y smoke autenticado completo pasan; Next queda actualizado a 15.5.16. El smoke revisa todos los botones visibles de cada ruta cubierta. El navegador in-app quedo abierto y visible en `/dashboard/` contra `localhost:3003`.
- Worker: type-check y build pasan; Dockerfile de produccion agregado; JWT POS worker alineado con el scope exigido por el API; runtime local activo en puerto `3050` con health OK.
- Libs compartidas: `@erp-suite/crypto` y `@erp-suite/dtos` pasan type-check y build.
- Base de datos: migraciones activas `000..305`, 302 archivos SQL, huecos `006..009`; rebuild limpio `000..301` en PostgreSQL temporal pasa, `302..305` fueron aplicadas incrementalmente y la BD remota Supabase queda con validadores runtime/smoke en verde.
- Browser/UI: Playwright completo autenticado cubre 73 rutas y todos los botones visibles; Browser in-app fue abierto y usado contra modulos principales. En esta ronda se corrigio una pantalla vacia de logistica y se dejo estado explicito cuando el flujo logistico esta desactivado en el tenant.
- Documentacion: cuarentena actualizada; se borraron outputs temporales validados, un doc vacio, un spec temporal duplicado y artefactos compilados antiguos en `apps/worker/src`.

## Estado por subsistema

| Subsistema | Estado | Evidencia |
| --- | --- | --- |
| Base de datos/Supabase | Verde runtime remoto aplicado | Linea `000..301` aplicada desde cero en PostgreSQL temporal; `302..305` aplicado incrementalmente; BD remota Supabase con `000..305` aplicado manualmente por `psql`; con tenant activo: 2320/2320 checks runtime, 0 fallos; smoke modulos/checks 12/12; outbox pendiente 0. El flujo operativo definido usa `psql`/validadores runtime, no Supabase CLI. |
| API | Verde tecnico | Type-check, build y 94 suites unitarias pasan: 868 tests. Lint pasa con 241 warnings de deuda tecnica no bloqueante. |
| Frontend web | Verde tecnico + smoke autenticado | Type-check, lint, build y Playwright smoke autenticado 73/73 rutas pasan contra API local + Supabase remoto; el smoke revisa todos los botones visibles de cada ruta cubierta. Browser in-app visible valido `/dashboard/` y recorrio bloques principales; durante la ronda se detecto y corrigio estado vacio en logistica. |
| Worker/jobs | Verde tecnico + runtime local | Type-check/build pasan; Dockerfile del worker agregado; config critica valida al arranque y JWT POS incluye `scope=pos.worker`; worker local escucha en `3050` y health responde `healthy` con `x-health-token`. |
| Libs compartidas | Verde tecnico inicial | `@erp-suite/crypto` y `@erp-suite/dtos` pasan type-check/build; imports reales concentrados en API y manifests web/worker ya no declaran dependencias workspace no usadas. |
| CI/Operacion | Amarillo | `pnpm build`, `pnpm type-check`, `pnpm lint`, `pnpm test`, Playwright E2E completo y `pnpm audit --audit-level high` pasan; Docker daemon disponible, Redis local escuchando, web/API/worker locales activos en `3001/3002/3050`, `/api/health/live` OK y `/api/metrics` OK. Sigue siendo validacion local/homologacion: el certificado cargado es demo, no certificado fiscal productivo real. |
| Documentacion | Amarillo | Hub actualizado para marcar estado historico; cuarentena ampliada; borrados seguros registrados para doc vacio, outputs temporales de matriz, spec temporal duplicado y compilados antiguos del worker. |

## Actualizacion final 2026-05-12: Docker, flujo transaccional y Browser

- Stack Docker de validacion levantado con `docker-compose.validation.yml` en puertos aislados: web `13001`, API `13002`, Redis interno y worker `3050`; los cuatro servicios quedan `healthy`.
- Se corrigio Compose para production runtime: Redis obligatorio via servicio interno, variables criticas de cifrado/sesion/CSRF, origen permitido, feature flags y certificado demo montado como `/app/certs/demo.pfx`.
- Se corrigio el wizard web para usar proxy same-origin `/backend` en lugar de llamar directo a `localhost:3002`; esto elimina el `Failed to fetch` por perdida de cookie HttpOnly.
- Se reconstruyo la imagen `erp-web:latest` desde `apps/web/Dockerfile` y se recreo el contenedor web desde esa imagen, sin depender de copias manuales de `.next`.
- E2E transaccional real contra API Docker paso: login/configuracion -> proveedor/producto/cliente -> OC -> aprobacion -> recepcion -> stock -> pedido -> preparacion/listo/despacho -> documento/CPE/CxC -> GRE -> POS, con asserts de CxP, movimientos de stock, outbox y asientos contables.
- Browser in-app contra la imagen Docker final valido login y rutas criticas: dashboard, wizard, POS, logistica listo-despacho, pedidos, GRE y contabilidad/asientos, sin pantallas fatales, sin bloqueo de autenticacion y con `newErrorCount=0`.
- Browser in-app tambien recorrio 18 rutas criticas autenticadas con espera real: dashboard, POS, productos, logistica pendiente/listo, compras, ventas, CPE, GRE, SIRE, CxC, CxP, RRHH, contabilidad, documentos y wizard; resultado sin fallos ni errores nuevos.

## Validaciones ejecutadas

| Gate | Resultado |
| --- | --- |
| `docker compose -p erpval3 --env-file .env --env-file apps/web/.env.local -f docker-compose.validation.yml config --quiet` | OK: sin warnings de `CERT_ENCRYPTION_KEY_OLD` y con env de produccion validado. |
| `docker build -f apps/web/Dockerfile -t erp-web:latest .` | OK: imagen reconstruida el 2026-05-12, Next 15.5.16 genera 84 paginas. |
| `docker compose -p erpval3 ... up -d --no-deps --force-recreate web` | OK: web recreado desde `erp-web:latest`, health `healthy` en `13001`. |
| `pnpm --filter @erp-suite/erp-api run test:e2e:production-readiness` contra `http://localhost:13002/api` | OK: flujo integral compra -> recepcion -> inventario -> pedido -> despacho -> CPE -> GRE -> CxC/CxP -> POS con trazabilidad contable/outbox. |
| Browser in-app final contra `http://localhost:13001` | OK: login admin, dashboard, wizard, POS, logistica, pedidos, GRE y contabilidad/asientos cargan sin errores nuevos. |
| Browser in-app sweep 18 rutas criticas contra Docker | OK: 18/18 rutas autenticadas cargan shell real, sin `Failed to fetch`, sin pantallas fatales y sin errores console nuevos. |
| `pnpm --filter @erp-suite/erp-api build` | OK |
| `pnpm --filter @erp-suite/erp-api type-check` | OK |
| `pnpm --filter @erp-suite/erp-api run test -- --runInBand` | OK: 94 suites, 868 tests. |
| `pnpm --filter @erp-suite/erp-api run lint` | OK con deuda: 0 errores, 241 warnings `no-unused-vars`/similares. |
| `pnpm --filter @erp-suite/erp-api exec jest --config ./jest-e2e.json --runInBand` | OK: 4 suites, 19 tests. |
| API local `GET /api/health/live` despues de reinicio | OK: liveness responde `alive`; `/api/api/health/live` queda 404 como debe ser. |
| API local `GET /api/metrics` | OK: 200 con metricas Prometheus tras excepcion explicita en guards globales. |
| Worker local health `GET :3050/health` con `x-health-token` | OK: `healthy`. |
| Certificado fiscal demo `LLAMA-PE-CERTIFICADO-DEMO-12345678910.pfx` | OK: PFX valida y API carga certificado desde `certs/demo.pfx`; entorno en homologacion/demo. |
| Seed demo Supabase por `psql` | OK: empresa RUC `12345678910`, producto, cliente, proveedor, caja/sesion, venta POS, documento, CPE, GRE, CxC, CxP, banco, movimientos de stock y 2 asientos contables. |
| Validacion SQL de trazabilidad demo | OK: `empresa_config=1`, `ventas_pos=1`, `documentos=1`, `cpe=1`, `gre_guias=1`, `asientos_balanceados=2`; CxC `118.00`, CxP `118.00`, stock `100.00`, banco `10000.00`. |
| Browser in-app sweep autenticado 2026-05-08 | OK sin pantallas fatales: dashboard, wizard, POS, cajas, inventario, kardex, compras/proveedores/ordenes, ventas/clientes, documentos, CPE, GRE, SIRE, CxC, CxP, tesoreria, contabilidad/asientos, RRHH, usuarios, auditoria, ayuda y analytics. Wizard verificado en paso 8/8, 100%, con RUC `12345678910` y razon social demo visibles. |
| `pnpm --filter @erp-suite/web type-check` | OK |
| `pnpm --filter @erp-suite/web exec playwright test tests/e2e/finanzas.spec.ts -g "Aplicar pago a CxP" --reporter=line` | OK: pago parcial de CxP ejecutado por UI; SQL posterior confirma CxP `PARCIAL` con saldo `68.00`. |
| `pnpm --filter @erp-suite/web exec playwright test tests/e2e/compras.spec.ts -g "Crear OC completa" --reporter=line` | OK: se crea orden de compra con detalle real. |
| `pnpm --filter @erp-suite/erp-api run test -- rrhh-accounting-integration.service.spec.ts jwt-auth.guard.spec.ts permission.guard.spec.ts --runInBand` | OK: 3 suites, 12 tests. |
| `pnpm --filter @erp-suite/erp-api run type-check` | OK tras correcciones RRHH/outbox. |
| `POST /api/rrhh/planillas/:id/generar-asientos` contra API local + Supabase remoto | OK: genero asiento `RRHH-2026-05-000003`, tipo `PLANILLA`, 3 lineas, debe/haber `2500.00`, cuentas UUID reales y tenant correcto. |
| Browser in-app automation retry 2026-05-08 | Bloqueado por herramienta: el panel existe para el usuario, pero la API de Browser devuelve que no hay pane activo automatizable. Se uso Playwright como fallback reproducible y se reintento la conexion varias veces. |
| `pnpm --filter @erp-suite/web build` | OK. |
| `pnpm --filter @erp-suite/web lint` | OK: 0 warnings, 0 errores. |
| `pnpm --filter @erp-suite/web run type-check` posterior a build limpio | OK. |
| `pnpm --filter @erp-suite/web run build` posterior a limpieza segura de `.next` | OK: 84 paginas generadas. |
| Browser in-app visible 2026-05-12 `http://localhost:3003/dashboard/` | OK: dashboard visible, menu ERP presente y DOM sin bloqueo de autenticacion. |
| Browser in-app bloque core 2026-05-12 | OK: dashboard, POS, documentos, contabilidad/asientos, compras/proveedores/ordenes/devoluciones, CPE, GRE y SIRE sin errores fatales. |
| Browser in-app bloque operacion 2026-05-12 | OK parcial corregido: inventario, productos, kardex, finanzas bancos/conciliacion/CxC/CxP cargan; logistica ya no queda en blanco y muestra estado explicito si el flujo esta desactivado. |
| Browser in-app bloque RRHH 2026-05-12 | OK tras espera real: RRHH, asistencia, candidatos, contratos, pagos y planillas renderizan sin errores de consola ni loaders colgados. |
| `full-ui-smoke.spec.ts` por rangos 2026-05-12 (`0..20`, `20..47`, `47..73`) | OK: 20 + 27 + 26 tests pasan; se corrigio falso positivo de paginacion `Anterior/Siguiente` deshabilitada por estado. |
| `pnpm --filter @erp-suite/web exec playwright test tests/e2e/full-ui-smoke.spec.ts -g "loads /dashboard/ayuda without crashing" --reporter=line` | OK: modulo Ayuda carga contra backend `/api/help/*`. |
| `pnpm --filter @erp-suite/web exec playwright test tests/e2e/full-ui-smoke.spec.ts --reporter=line --max-failures=1` | OK: 73/73 rutas autenticadas; inventario generado para 600 botones visibles en 73 rutas, todos con nombre accesible y habilitados. |
| `full-ui-smoke.spec.ts` por rangos `SMOKE_ROUTE_START/SMOKE_ROUTE_END` (`0..19`, `19..38`, `38..57`, `57..73`) | OK: 19 + 19 + 19 + 16 tests pasan; inventario preservado con 73 rutas, 600 botones, 49 safe-click y 551 guarded-not-auto-clicked. |
| `pnpm --dir apps/web exec playwright test tests/e2e/setup.spec.ts --reporter=line` | OK: 2 tests pasan. |
| `pnpm --filter @erp-suite/web exec playwright test --reporter=line` | OK: 20/20 tests E2E pasan contra API local + Supabase remoto; varios flujos saltan ramas dependientes de seed faltante con mensaje explicito. |
| `pnpm --filter @erp-suite/worker type-check` | OK |
| `pnpm --filter @erp-suite/worker build` | OK |
| `node -e` smoke `XmlSigner({ allowDemoFallback:false })` con PFX inexistente | OK: falla como se espera cuando se exige certificado real. |
| Remoto `SELECT * FROM public.validar_rebuild_runtime_summary(<tenant_activo>);` | OK: 2320 checks, 2320 pasados, 0 fallidos, 79 packs. |
| Remoto `SELECT * FROM public.validar_rebuild_runtime_orchestrator(<tenant_activo>, true);` | OK: 0 filas de fallos. |
| Remoto `SELECT COUNT(*) FROM public.validar_smoke_tests_modulos_runtime(<tenant_activo>);` | OK: 12 checks, 12 pasados, 0 fallidos. |
| Remoto `SELECT COUNT(*) FROM public.get_pending_outbox_events(100, NULL);` | OK: 0 pendientes. |
| `docker compose --env-file .env.example config --quiet` | OK con variables placeholder; no levanta servicios. |
| `pnpm --filter @erp-suite/crypto type-check` | OK |
| `pnpm --filter @erp-suite/crypto build` | OK |
| `pnpm --filter @erp-suite/dtos type-check` | OK |
| `pnpm --filter @erp-suite/dtos build` | OK |
| `pnpm build` | OK: 5 paquetes. |
| `pnpm type-check` | OK: 7 tareas Turbo. |
| `pnpm lint` | OK: web 0 warnings/errores; API 241 warnings no bloqueantes. |
| `pnpm test` | OK: 93 suites, 863 tests antes de los ultimos specs focales; suite API directa actualizada queda en 94 suites, 867 tests. |
| `pnpm audit --audit-level=low` | OK: sin vulnerabilidades conocidas; queda warning runtime de Node por `url.parse()` en tooling/transitivo. |
| `pnpm audit --audit-level high` | OK: sin vulnerabilidades conocidas. |
| `pnpm audit --prod --audit-level=moderate` | OK: sin vulnerabilidades productivas conocidas en nivel moderate o superior. |
| `powershell -ExecutionPolicy Bypass -File .\scripts\check-encoding.ps1` | OK |
| `git diff --check` | Falla por whitespace en cambios previos amplios del worktree; no se limpio masivamente para no mezclar cambios ajenos. |
| `docker info --format '{{.ServerVersion}}'` | OK: Docker daemon disponible, version 27.2.0. |
| `docker compose ps` | Parcial: solo monitoreo arriba (`grafana`, `prometheus`, `node-exporter`, `redis-exporter`); `web`, `api`, `worker` y `redis` no aparecen como servicios Compose levantados, y faltan variables criticas en el entorno Compose. |
| `Get-NetTCPConnection -LocalPort 6379,3001,3002` | OK parcial: Redis escucha en `6379`; web/API locales escuchan en `3001/3002`, pero no como stack Compose completo. |
| Rebuild PostgreSQL local `000..301` sobre `erp_rebuild_validation` | OK: 298 migraciones aplicadas desde cero. |
| `SELECT * FROM public.validar_rebuild_runtime_summary(NULL);` | OK: 2291 checks, 2291 pasados, 0 fallidos, 79 packs. |
| `SELECT COUNT(*) FROM public.validar_rebuild_runtime_orchestrator(NULL, true);` | OK: 0 fallos runtime. |
| `SELECT * FROM public.resumen_smoke_tests_modulos_runtime(NULL);` | OK: 11 modulos al 100%. |
| `SELECT COUNT(*) FROM public.ejecutar_smoke_tests_modulos_runtime(NULL) WHERE NOT ok;` | OK: 0 fallos smoke. |
| `psql -h localhost -p 55432 -U postgres -d erp_rebuild_validation -v ON_ERROR_STOP=1 -f supabase/migrations/302__auth_failed_login_attempts_atomic_rpc.sql` | OK |
| Aplicacion remota Supabase `000..305` via `psql` sobre pooler SSL | OK: linea activa aplicada; `public_tables=181`; schema `app`, RPC `app.increment_failed_login_attempts`, outbox overload y seed de retenciones presentes. |
| Remoto `SELECT * FROM public.validar_rebuild_runtime_summary(NULL);` | OK: 2291 checks, 2291 pasados, 0 fallidos, 79 packs. |
| Remoto `SELECT COUNT(*) FROM public.validar_rebuild_runtime_orchestrator(NULL, true) WHERE NOT ok;` | OK: 0 fallos runtime. |
| Remoto `SELECT * FROM public.resumen_smoke_tests_modulos_runtime(NULL);` | OK: 11 modulos al 100%. |
| Remoto `SELECT COUNT(*) FROM public.ejecutar_smoke_tests_modulos_runtime(NULL) WHERE NOT ok;` | OK: 0 fallos smoke. |
| Aplicacion remota Supabase `303__service_role_app_schema_grants.sql` via `psql` | OK: `service_role` puede ejecutar helpers `app` requeridos por RLS/triggers desde PostgREST. |
| API local `POST /backend/api/auth/login/` + `GET /backend/api/auth/profile/` | OK: admin autenticado, perfil resuelto y cookie HttpOnly funcional via proxy Next. |
| API local `GET /api/health/live` | OK: liveness responde `alive` tras corregir el doble prefijo. |
| API/web local `GET /backend/api/help/sugerencias/`, `GET /backend/api/help/search/`, `GET /backend/api/configuracion-fiscal/` con cookie admin | OK: 200 por proxy Next; `/api/help/search/` directo queda 404 tras borrar rutas Next obsoletas. |
| Browser in-app `http://localhost:3001/login/` -> `/dashboard/usuarios/` | OK: login `admin@erp.local`, menu ERP visible, usuarios carga con 1 usuario/1 rol y sin exponer campos sensibles. |
| Browser in-app sweep posterior por modulos principales | OK: recorridos `/dashboard`, POS, documentos, contabilidad, analytics, CPE, GRE, SIRE, compras, inventario, finanzas/CxC, RRHH, usuarios, wizard, audit logs y ayuda sin pantallas fatales ni errores console `error`; POS muestra bloqueo funcional esperado `SIN CAJA CONFIGURADA`. |

## Bloqueantes actuales

1. Certificado fiscal: el PFX demo local carga correctamente y habilita homologacion, pero para produccion SUNAT/OSE real debe reemplazarse por certificado productivo de la empresa y activar `SUNAT_ENVIRONMENT=produccion`/`REQUIRE_REAL_FISCAL_CERTIFICATE=true`.
2. Secretos productivos: el stack Docker de validacion queda `healthy`, pero antes de alta real hay que inyectar secretos definitivos de produccion, rotarlos fuera del historial local y verificar que no se use ningun valor demo.
3. Ambito fiscal externo: CPE/GRE/SIRE quedan validados con contrato interno, BD, flujo y certificado demo; la certificacion final ante SUNAT/OSE con credenciales reales depende del certificado productivo y del ambiente externo.
4. API lint: el gate no falla, pero quedan warnings de deuda tecnica no bloqueante; no afectan build/test, pero conviene reducirlos antes de congelar una release larga.
5. Documentacion: quedan docs antiguas y temporales en cuarentena; solo se borra documentacion con reemplazo validado.

## Cambios aplicados en esta implementacion

- Se agrego `PROJECT_REVIEW_INDEX.md` como matriz maestra de revision.
- Se agrego `PROJECT_STATUS.md` como estado operativo vigente.
- Se agrego `docs/DOCUMENTATION_QUARANTINE.md` para clasificar candidatos de limpieza sin borrar.
- Se actualizo `docs/db_rebuild_status.md` con una nota de auditoria 2026-05-07.
- Se corrigio `apps/erp-api/src/modules/cajas/cajas.controller.ts` para que `cerrarCajaAvanzado` use `Denominaciones` en vez de `Record<string, any>`.
- Se alinearon specs/mocks del API con contratos actuales en auth, audit, CPE, finanzas, POS, validaciones, contabilidad, cajas, ventas y compras.
- Se corrigio el contrato HTTP de password reset para devolver `200` en endpoints POST documentados como operaciones de validacion/confirmacion.
- Se reemplazo el e2e de password reset por una suite controlada sobre `AuthController` con `AuthService` mockeado, sin depender de BD real.
- Se completo el mock de devoluciones e2e para cubrir proveedor/orden durante emision de evento; la suite ya no registra `console.error`.
- Se elimino el lote de 7 warnings frontend de cajas estabilizando callbacks de carga y derivando el total de denominaciones con `useMemo`.
- Se elimino el sublote POS compartido: `TicketPrint` usa callback estable para autoimpresion y `ProductGrid` usa `next/image` en imagenes de producto.
- Se limpio el vertical ventas frontend: paginas, formularios, selector de cliente y reportes ya no aparecen en warnings `react-hooks/exhaustive-deps`.
- Se limpio el vertical compras frontend: paginas dinamicas, paneles y wizards ya no aparecen en warnings `react-hooks/exhaustive-deps`.
- Se limpio el vertical contabilidad frontend: paginas de asientos, centros de costo, periodos, monitoreo, presupuestos y componentes de estados/presupuesto ya no aparecen en warnings lint.
- Se limpio el vertical finanzas frontend: bancos, conciliacion, CxC/CxP y componentes de reportes/tesoreria ya no aparecen en warnings lint.
- Se limpio el vertical RRHH frontend y modales compartidos: paginas RRHH, asistencia, planillas/candidatos/contratos/pagos y modales de candidatos, cotizacion, GRE, orden de compra y planillas ya no aparecen en warnings lint.
- Se limpio el cierre frontend restante: inventario, POS, analytics, usuarios, fiscal/documentos, admin/audit, configuracion, notificaciones, help bot, wizard y layout quedaron sin warnings lint.
- Se reemplazaron usos restantes de `<img>` en el lote revisado por `next/image` y se estabilizaron callbacks/effects para evitar stale closures.
- Se actualizo el smoke Playwright y el helper de login para usar selectores accesibles reales (`Correo Electrónico`, `Contraseña`, `Iniciar Sesión`).
- Se ejecuto Playwright basico sobre home/login: 2 tests pasan.
- Se elimino `tmp_web_lint_output.txt`, temporal generado durante la auditoria de lint.
- Se verifico `git diff --check -- <lote frontend/documental tocado>` sin errores de whitespace.
- Se ejecuto la Ronda 5 tecnica inicial: `libs/crypto` y `libs/dtos` compilan y pasan type-check; `libs/infra` no es paquete TS sino infraestructura Helm/K8s.
- Se cerro la Ronda 5A de manifests: se removio `@erp-suite/dtos` de `apps/web`; se removieron `@erp-suite/crypto`, `@erp-suite/dtos`, `bull`, `redis` y `@types/ioredis` de `apps/worker` porque no tienen imports reales. `bullmq` e `ioredis` se conservan porque si se usan.
- Se agrego `apps/worker/Dockerfile`, que faltaba aunque `docker-compose.yml` lo referenciaba.
- Se alineo el servicio `worker` en `docker-compose.yml` con las variables que lee el codigo: `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_HOST`, `REDIS_PORT`, `ERP_API_URL`, `WORKER_PORT` y `POS_WORKER_JWT_SECRET`.
- Se cambio el healthcheck del API en Compose de `curl` a Node para compatibilidad con imagen `node:20-alpine`.
- Se elimino el atributo obsoleto `version` de Compose y `docker compose config --quiet` valida con placeholders.
- Se elimino `docs/security/DASHBOARD_ARCHITECTURE.md` tras validar que estaba vacio y sin referencias entrantes fuera de cuarentena.
- Se actualizo `docs/README.md` para marcar `docs/manuals/PROJECT_STATUS.md` como historico, no como estado vigente.
- Se amplio `docs/DOCUMENTATION_QUARANTINE.md` con SQL sueltos raiz, artefactos compilados del worker y artefactos Playwright.
- Se eliminaron outputs temporales raiz de matriz de rutas (`route_matrix_block03.*`, `tmp_route_audit*.tsv`) porque no tenian referencias fuera de cuarentena y quedaron reemplazados por `docs/security/route-access-matrix.md`.
- Se eliminaron compilados antiguos trackeados dentro de `apps/worker/src` (`queue-manager.js`, `.d.ts`, `.js.map`), conservando `queue-manager.ts` como fuente y `dist` como salida de build.
- Se elimino `temp_retenciones.spec.ts` tras confirmar cobertura equivalente en `apps/erp-api/src/modules/finanzas/shared/retenciones-validation.service.spec.ts`.
- Se actualizo el README principal para reflejar NestJS 11, `node-forge` 1.4.0, API en puerto 3002, variables `SUPABASE_SERVICE_ROLE_KEY`, migraciones activas y fuentes vigentes de estado/documentacion.
- Se ejecuto una pasada `deepsec` inicial sobre auth/POS/worker, se corrigieron hallazgos de alto impacto: refresh JWT con usuario/sesion revalidada, JWT ligado a `user_sessions`, logout revoca la sesion del token, endpoint worker POS usa `WorkerAuthGuard` con `@Public()`, scope `pos.worker` y tenant canonicalizado, apertura/cierre de caja POS ya no acepta autorizacion/sesion controlada por cliente, detalle de venta usa `:id` y logs POS dejan de imprimir payloads completos.
- Se agregaron pruebas enfocadas para `JwtStrategy` y `WorkerAuthGuard`; `pnpm --filter @erp-suite/erp-api type-check` y 5 suites enfocadas de auth/worker pasan con 46 tests.
- Se agrego `302__auth_failed_login_attempts_atomic_rpc.sql` y el backend usa `app.increment_failed_login_attempts` via `getAdminClient()` para eliminar el incremento read-modify-write de intentos fallidos.
- Se agrego `303__service_role_app_schema_grants.sql` para permitir que `service_role` ejecute helpers del schema `app` requeridos por RLS/triggers en PostgREST.
- Se corrigio auth end-to-end: el extractor JWT lee cookie HttpOnly desde `Cookie`, las sesiones se crean/validan/revocan con cliente admin y el frontend usa proxy Next same-origin `/backend` para login/profile/API.
- Se creo el admin operativo `admin@erp.local` en la BD remota y se valido login real en Browser hasta `/dashboard/`.
- Se ajusto `POST /auth/password-reset/request` para responder sin esperar hash/BD/email y reducir enumeracion por timing; el e2e controlado de password reset pasa con 10 tests.
- Se actualizo `docs/README.md` para marcar manuales antiguos como historicos y priorizar docs vigentes de seguridad, operacion, BD y estado del proyecto.
- Se agrego lint ejecutable para `apps/erp-api` con ESLint 8 + `@typescript-eslint`; el gate raiz ahora pasa y deja warnings API como deuda tecnica clasificada.
- Se removieron imports/dependencias no usadas de XML signing en `libs/crypto` (`xmldom`, `xml-crypto`, tipos asociados), eliminando el critico directo por `xmldom`.
- Se actualizaron dependencias vulnerables: `next` a 15.5.16, `jspdf` a 4.2.1, `jspdf-autotable` a 5.0.7, `axios` a 1.16.0, `node-forge` a 1.4.0, `express-rate-limit` a 8.5.1, `nodemailer` a 8.0.7, `postcss` a 8.5.14, `uuid` a 11.1.1 y overrides root para transitorios (`ajv`, `body-parser`, `brace-expansion`, `diff`, `fast-xml-parser`, `handlebars`, `jws`, `lodash`, `multer`, `minimatch`, `path-to-regexp`, `qs`, `validator`).
- Se migro el API a Nest 11 (`@nestjs/common/core/platform-express/testing/cli` y paquetes compatibles), ajustando `@nestjs/throttler` v6: decoradores `@Throttle`, `ThrottlerModule.forRootAsync`, `getTracker` asincrono y `generateKey`.
- Se elimino `xlsx` del frontend y se reemplazo el exportador por SpreadsheetML nativo (`.xls`) para retirar las vulnerabilidades productivas high de SheetJS.
- Se corrigio JSX suelto en `apps/web/app/dashboard/contabilidad/page.tsx` que bloqueaba el build con Next 15.5.16.
- Se ejecuto el set raiz de CI local: `pnpm build`, `pnpm type-check`, `pnpm lint`, `pnpm test` (91 suites, 856 tests), Playwright E2E 20/20 y `pnpm audit --audit-level high` pasan.
- Se fijo `outputFileTracingRoot` en `apps/web/next.config.js` para evitar que Next infiera un workspace root externo por lockfiles fuera del repo.
- Se actualizo `caniuse-lite`/`baseline-browser-mapping`; `pnpm --filter @erp-suite/web build` queda sin warnings de workspace root ni Browserslist.
- Se agrego `.env.example` raiz para validar `docker compose --env-file .env.example config --quiet` sin depender de secretos reales.
- Se alinearon healthchecks de Compose para API/worker con `HEALTH_TOKEN` opcional mediante header `x-health-token`.
- Se endurecio `apps/worker/src/index.ts`: valida `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ERP_API_URL` en produccion, puertos y `POS_WORKER_JWT_SECRET` al arranque; ademas el JWT firmado para endpoints POS ahora incluye `scope: pos.worker`, contrato requerido por `PosController.procesarVentasPendientesWorker`.
- Se corrigio `THROTTLE_TTL` a milisegundos (`60000`) en schema/env/docs tras migrar a `@nestjs/throttler` v6 y se agrego cobertura en `env.schema.spec.ts`.
- Se cerro el gap de permiso explicito en `SireController.findAll` con `@RequirePermission('sire.read')` y prueba de metadata de seguridad.
- Se endurecieron controladores legacy autenticados: `ConfiguracionController`, `CotizacionesController` y `FinanzasController` ahora tienen permisos de clase/handler y spec de metadata.
- Se cerro la Ronda 1 DB runtime inicial: se corrigieron dependencias de vistas/triggers durante migraciones `citext`, RLS de `rol_permisos`, validadores con nombres truncados por PostgreSQL, recursion del orquestador y revocacion de `EXECUTE` cliente en funciones `SECURITY DEFINER`; el rebuild limpio `000..301` pasa con 2291/2291 checks runtime y smoke por modulos sin fallos.
- Se actualizo `docs/security/route-access-matrix.md`: RRHH queda marcado con permiso de clase `rrhh.access`, SIRE raiz con `sire.read`, configuration/configuracion fiscal queda con `configuracion.read/write`, `auth.switch-tenant` queda con `tenants.manage`, worker CPE/GRE/POS queda clasificado como `WORKER_AUTH`, demo publico queda condicionado por `DEMO_API_ENABLED`, y ya no quedan filas `TODO` ni `AUTHENTICATED` generico.
- Se removieron logs de import en `feature-flags.ts` para no contaminar tests/runtime.
- Se estabilizo E2E web para ejecucion stateful: `playwright.config.ts` usa un solo worker, timeout de 90s y storage state autenticado generado por `tests/e2e/global-setup.ts`, evitando chocar con el rate limit real de login.
- Se corrigio el helper E2E de auth para reutilizar sesion existente, marcar onboarding como completado y tolerar el boton `Saltar` si un tour ya esta activo.
- Se corrigieron specs E2E de compras para URLs con slash final de Next, datos de proveedor unicos por corrida, validaciones Zod sin bloqueo nativo de `type=email`, esperas de `<option>` por estado attached/seed y skips explicitos cuando faltan productos/recepciones.
- Se corrigieron specs E2E de finanzas para rutas con slash final, carga lenta contra Supabase remoto y skips explicitos cuando no existen cuentas bancarias/CxP seed.
- Se corrigio `ProveedorForm` con `noValidate` para que la validacion visible venga del schema Zod y no del validador nativo del navegador.
- Se corrigio conciliacion financiera para usar el proxy same-origin `/backend` en vez de llamar directo a `localhost:3002`, y para pasar `cuentas_bancarias.id` a consultas/import CSV en vez del objeto embebido.
- Se redujo el bloqueo de dashboards de tesoreria/lote ante endpoints lentos o sin seed usando `useApi({ retries: 1, timeoutMs: 8000 })`.
- Se ejecuto Playwright completo: 20/20 tests pasan contra API local y Supabase remoto.
- Se ajusto el campo email del login a `type="text"` con `inputMode="email"` para mantener teclado/semantica de email y permitir automatizacion Browser confiable.
- Se reabrio Browser in-app tras los gates, se hizo login real como admin y se verifico `/dashboard/` con menu ERP y metricas visibles.
- Se agrego `304__outbox_pending_events_tenant_overload.sql` para compatibilidad de llamada runtime `get_pending_outbox_events(limit, tenant_id)`.
- Se agrego y aplico `305__retenciones_required_seed_backfill.sql`, corrigiendo drift de seed obligatorio `CUARTA`/`QUINTA` por tenant activo.
- Se corrigio `TesoreriaService.obtenerFlujoCaja` para devolver respuesta vacia exitosa cuando no hay cuentas bancarias activas, evitando 404 en dashboards sin seed financiero.
- Se corrigieron contratos PostgREST ambiguos en ventas para pedidos/cotizaciones con FKs explicitas a `clientes`.
- Se agrego `/dashboard/ventas` como landing real para evitar 404 por breadcrumbs/prefetch.
- Se agrego smoke Playwright autenticado completo `full-ui-smoke.spec.ts`: 73 rutas cargan sin crash.
- Se amplio `full-ui-smoke.spec.ts` para revisar todos los botones visibles por ruta, no solo los primeros 60; la corrida completa sigue en verde 73/73 y genera inventario JSON en `apps/web/tests/e2e/artifacts/button-inventory`.
- El inventario UI final cubrio 600 botones visibles: 49 clasificados como seguros para clic automatico cuando son unicos y 551 clasificados como protegidos/no auto-click por riesgo transaccional, destructivo o por requerir datos.
- Se estabilizo `global-setup.ts` de Playwright para reutilizar storage state valido, evitar escrituras parciales de `.auth/admin.json` y no disparar rate limit por logins simultaneos.
- Se agregaron variables `SMOKE_ROUTE_START`/`SMOKE_ROUTE_END` y `PRESERVE_BUTTON_INVENTORY` al smoke para ejecutar los 73 recorridos por lotes reproducibles sin perder el inventario de botones.
- Se reejecuto el smoke UI en 4 lotes: 19 + 19 + 19 + 16 tests pasan, inventario final 73 rutas/600 botones.
- Se ejecuto gate final remoto con tenant activo: DB runtime `2320/2320`, smoke DB `12/12`, outbox pendiente `0`.
- Se ejecuto gate final API: 91 suites y 856 tests pasan.
- Se endurecio Redis para que `NODE_ENV=production` o `REDIS_REQUIRED=true` fallen al arranque si Redis no conecta; en development conserva fallback in-memory con reintentos acotados.
- Se endurecio firma fiscal: `XmlSigner` soporta `allowDemoFallback=false`; `OseService` y `SunatFiscalService` no aceptan certificado demo cuando `SUNAT_ENVIRONMENT=produccion` o `REQUIRE_REAL_FISCAL_CERTIFICATE=true`.
- Se actualizo `env.schema` y `.env.example` con `REDIS_*`, `REDIS_REQUIRED` y `REQUIRE_REAL_FISCAL_CERTIFICATE`; los tests de schema cubren certificado fiscal obligatorio en production.
- Se agrego `cache.module.spec.ts` para cubrir contrato Redis production/fallback: `NODE_ENV=production`, `REDIS_REQUIRED=true`, reintentos acotados en development y reintentos continuos cuando Redis es obligatorio.
- Se reejecuto API completo: 92 suites y 860 tests pasan.
- Se corrigio el doble prefijo de health/info/debug en `AppController`: los handlers internos ya no declaran `api/...` porque el prefijo global lo agrega `main.ts`; `/api/health/live` responde y `/api/api/health/live` queda 404.
- Se actualizo `health.e2e-spec.ts` para probar los endpoints con `app.setGlobalPrefix('api')`, alineado con runtime real.
- Se corrigio el wildcard legacy de `TenantMiddleware` para Nest 11 (`forRoutes('*path')`), eliminando el warning de arranque `Unsupported route path: "/api/*"`.
- Se movio Help Bot a backend autenticado: nuevo `HelpModule` con `/api/help/search` y `/api/help/sugerencias`, `HelpBot` usa `/backend/api/help/*`, y se eliminaron rutas Next obsoletas que dependian de Supabase Auth.
- Se elimino la ruta Next obsoleta `/api/configuracion-fiscal`; la configuracion fiscal queda servida por el backend existente `/backend/api/configuracion-fiscal`.
- Se agrego `help.controller.spec.ts`; el API completo quedo en 93 suites y 863 tests antes del hardening posterior de usuarios.
- Se corrigio `FeatureFlagGuard` para evaluar flags en runtime despues de que `ConfigModule` carga `.env`; POS deja de responder 503 cuando `FEATURE_POS_ENABLED=true` esta en `.env`.
- Se agregaron regresiones de feature flags: POS habilitado por carga tardia e inventario habilitado por defecto.
- Se alinearon selects de analytics con el schema remoto real: `cuentas_por_pagar` usa `saldo/total`, productos usa `categoria`, y se eliminan errores PostgREST por columnas inexistentes.
- Se cerro una fuga de seguridad en `UsuariosController`: lista, detalle, crear, actualizar y cambio de estado ya no devuelven `password_hash`, tokens de reset, locks ni contadores sensibles; tambien se bloquea actualizacion directa de esos campos por payload.
- Se reejecuto API completo: 94 suites y 867 tests pasan.
- Se reejecuto web: type-check, lint y build pasan; smoke focal `/dashboard/analytics` y `/dashboard/usuarios` pasa tras los cambios de contratos.
- Se reabrio Browser in-app, se autentico como admin, se recorrio el set principal de modulos y se dejo evidencia visual en `/dashboard/usuarios/`; POS muestra estado funcional esperado `SIN CAJA CONFIGURADA` en vez de error 503.
- Se desambiguaron embeds PostgREST de `detalle_asientos` hacia `asientos_contables` y `plan_cuentas` usando FKs explicitas; `/backend/api/contabilidad/registro-compras` y `/registro-ventas` vuelven `success:true`.

## Proximas rondas recomendadas

1. Ronda 1A: mantener la ruta operativa sin Supabase CLI; usar `psql`/validadores runtime y documentar explicitamente que el proyecto no depende de Supabase CLI para operacion.
2. Ronda seguridad deps: revisar la advertencia peer dev de `@angular-devkit/core`/`ajv-formats` y decidir si se acepta hasta la proxima version del CLI Nest o se fuerza con overrides adicionales.
3. Ronda 3A: ampliar Playwright con seed completo de productos, bancos, CxP y recepciones para cubrir las ramas que hoy se saltan por falta de datos operativos.
4. Ronda 4A: levantar el stack Docker ERP completo con env real, validar `web/api/worker/redis`, health checks reales de API/worker y cron smoke tests.
5. Ronda 6A: consolidar docs security/manuals contra `docs/db_rebuild_status.md`, `docs/security/*` recientes y README.
