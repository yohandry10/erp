# Indice Maestro de Revision Exhaustiva del ERP

Fecha de corte: 2026-05-12
Workspace: `C:\Users\PC\Desktop\erp`
Rama inicial: `main...origin/main`

## 1. Estado inicial congelado

- Worktree con cambios previos amplios: 83 archivos modificados y multiples archivos nuevos sin trackear antes de esta ronda.
- Regla operativa: no revertir ni borrar cambios existentes sin validacion explicita.
- `rg` esta instalado, pero falla con `Acceso denegado` desde `WindowsApps`; la revision usa PowerShell como fallback.
- No se borro documentacion en esta pasada. Los candidatos se registran en cuarentena.

## 2. Mapa de artefactos

| Area | Alcance | Estado de revision | Notas |
| --- | --- | --- | --- |
| Raiz | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`, README, SQL sueltos, temporales | Revisado inicial | Hay artefactos temporales en raiz y SQL sueltos que requieren decision. |
| API | `apps/erp-api` | Revision inicial + gates tecnicos OK | NestJS 11 con modulos ERP, shared guards, Supabase, seguridad y observabilidad; deepsec inicial auth/POS/worker corregido; POS feature flags, analytics y usuarios alineados con runtime; lint pasa con warnings no bloqueantes. |
| Web | `apps/web` | Verde tecnico + Browser runtime | Next.js 15.5.16, dashboard por verticales, Tauri, Playwright; type-check/lint/build pasan; Browser in-app autenticado recorrio modulos principales con datos demo sin pantallas fatales. |
| Worker | `apps/worker` | Verde tecnico + runtime local | Jobs fiscales/POS/configuracion, colas y outbox; type-check/build pasan, Dockerfile agregado, JWT POS alineado con API y worker local health OK en `3050`. |
| Libs | `libs/crypto`, `libs/dtos`, `libs/infra` | Verde tecnico inicial | `crypto` y `dtos` pasan type-check/build; `infra` contiene Helm/K8s, no package TS; manifests web/worker limpiados de deps workspace no usadas. |
| Base de datos | `supabase/migrations`, `seeds`, `verify`, `legacy`, `rebuild_sources` | Verde runtime inicial + remoto aplicado | Migraciones activas `000..305` con huecos `006..009`; 298 archivos SQL aplican desde cero hasta `301` en PostgreSQL temporal, `302..305` aplican incrementalmente y remoto Supabase ya tiene `000..305` aplicado; validadores runtime/smoke pasan. |
| Docs | `docs`, `audit_reports`, docs raiz | Consolidacion inicial avanzada | README y docs hub apuntan a fuentes vigentes; manuales antiguos siguen como historicos; se borraron doc vacio, outputs temporales de matriz, spec temporal duplicado y compilados antiguos del worker con evidencia. |
| Operacion | `.github`, `docker-compose.yml`, `monitoring`, Dockerfiles, scripts | Revision inicial corregida + runtime local | Docker daemon disponible, Redis local escucha, web/API/worker locales activos en `3001/3002/3050`, `/api/metrics` y health checks OK. El certificado cargado es demo/homologacion, no certificado fiscal productivo real. |
| Tests | specs API, Playwright web, `test` raiz | Gates tecnicos OK iniciales | API unit/e2e pasan; web smoke Playwright 73/73 rutas pasa; Browser in-app recorre modulos principales; falta E2E transaccional con seed completo. |

## 3. Inventario numerico

| Raiz | Archivos fuente/revision | Observacion |
| --- | ---: | --- |
| `apps/erp-api` | 1222 | Incluye fuente, specs, configs y artefactos del API. |
| `apps/web` | 591 fuente aprox. | Excluyendo `node_modules`, `.next`, `dist`, `target`; conteo bruto era mayor por Tauri/build outputs. |
| `apps/worker` | 17 | Worker compacto con jobs y queue manager. |
| `libs` | 29 fuente aprox. | Excluyendo dependencias internas. |
| `supabase` | 468 | Migraciones, seeds, verify, legacy y rebuild sources. |
| `docs` | 77 | 53 docs raiz, 12 security, 5 manuals, 3 manuals/modules, 2 ops, 2 release. |
| `scripts` | 16 | Incluye scripts temporales y utilidades operativas. |
| `.github` | 3 | CI, security scan, Dependabot. |

## 4. Cobertura por rondas

| Ronda | Estado | Evidencia actual | Proximo cierre |
| --- | --- | --- | --- |
| 0. Inventario y reglas | En progreso avanzado | Este indice, estado git, mapa por areas, comandos de validacion | Completar matriz fina por archivo si se requiere trazabilidad individual. |
| 1. BD/Supabase | Verde runtime inicial + remoto aplicado | Migraciones `000..305`, 302 archivos, huecos `006..009`; rebuild limpio `000..301` en PostgreSQL temporal; `302..305` aplicado incrementalmente; remoto Supabase `000..305` aplicado por `psql`; con tenant activo `validar_rebuild_runtime_summary` = 2320/2320, smoke 12/12, outbox 0 | Mantener validacion operativa por `psql`/validadores runtime; Supabase CLI no forma parte del flujo requerido por el proyecto. |
| 2. Backend | Verde tecnico inicial | Type-check, build, 94 suites/867 tests y lint pasan; hardening auth/POS/worker/Redis/firma fiscal/help aplicado; POS/analytics/usuarios validados contra runtime | Reducir warnings API y ejecutar revision funcional profunda por vertical. |
| 3. Frontend | Verde tecnico + runtime Browser | `type-check`, `lint`, build y smoke Playwright autenticado 73/73 pasan; Browser autenticado recorrio dashboard, wizard, POS, cajas, inventario, compras, ventas, documentos, CPE, GRE, SIRE, finanzas, contabilidad, RRHH, usuarios, auditoria, ayuda y analytics sin pantallas fatales; wizard queda completo 8/8 | Ejecutar E2E transaccional exhaustivo con datos productivos/controlados. |
| 4. Worker/Operacion | Verde tecnico + runtime local | Worker `type-check`/build pasan; `apps/worker/Dockerfile` agregado; Docker daemon disponible; Redis local escucha; config critica y token POS worker endurecidos; worker health OK en `3050`, API health y metrics OK | Verificar perfil Compose/infra definitivo con secretos productivos y certificado fiscal real. |
| 5. Libs/Contratos | Verde tecnico inicial | `@erp-suite/crypto` y `@erp-suite/dtos` pasan type-check/build; imports reales desde API inventariados; deps workspace no usadas removidas de web/worker | Revisar contratos DTO compartidos cuando se promuevan nuevos imports cross-app. |
| 6. Docs/Limpieza | En progreso avanzado | README raiz y `docs/README.md` consolidados; cuarentena ampliada; `docs/security/DASHBOARD_ARCHITECTURE.md`, outputs temporales de matriz, `temp_retenciones.spec.ts` y compilados antiguos del worker borrados con reemplazo validado | Consolidar manuales historicos y validar referencias antes de borrar mas. |
| 7. Validacion final | En progreso avanzado | API/web/build/tests/smoke/Browser ejecutados; Docker/Redis locales disponibles; bloquean stack Compose ERP completo con variables reales, certificado fiscal productivo y E2E transaccional con seed completo | Ejecutar Compose ERP completo y flujos transaccionales por vertical. |

### Cierre adicional 2026-05-12

- Stack Docker de validacion `erpval3` activo y saludable: `web` en `13001`, `erp-api` en `13002`, `worker` en `3050` y Redis interno.
- Imagen `erp-web:latest` reconstruida desde Dockerfile y recreada en Compose; el wizard corregido queda servido desde la imagen final.
- E2E transaccional `test:e2e:production-readiness` paso contra API Docker y cubre compra, recepcion, inventario, pedido, despacho, documento/CPE, GRE, CxC/CxP, POS, outbox y asientos.
- Browser in-app valido login real y rutas criticas contra Docker final sin errores nuevos: dashboard, wizard, POS, logistica, ventas/pedidos, GRE y contabilidad/asientos.
- La deuda principal restante ya no es flujo interno ERP, sino sustitucion de certificado demo por certificado fiscal productivo, secretos reales de produccion y certificacion externa SUNAT/OSE.

## 5. Verticales ERP a cerrar

| Vertical | API | Web | BD/Docs | Estado |
| --- | --- | --- | --- | --- |
| Auth, usuarios, permisos, tenants | Presente | Presente | Migraciones y docs security | Revisado tecnico inicial; fuga `password_hash` en usuarios corregida; pendiente E2E transaccional de gestion de usuarios. |
| Dashboard/configuracion/wizard | Presente | Presente | Docs config recientes | Dashboard muestra metricas demo; wizard verificado en Browser como completado 8/8, 100%, con RUC y razon social demo visibles. |
| Cajas/POS | Presente | Presente | Migraciones POS/cajas | POS muestra producto demo y caja/sesion operativa; cajas muestra sesion abierta con saldo inicial. |
| Ventas/comercial | Presente | Presente | Migraciones ventas | Specs API pasan y frontend sin warnings lint; pendiente revision funcional UI/BD runtime. |
| Compras/proveedores/recepciones | Presente | Presente | Migraciones compras | Frontend sin warnings lint del vertical; pendiente revision funcional profunda. |
| Inventario/logistica | Presente | Presente | Migraciones inventario | Frontend sin warnings lint; pendiente runtime DB y flujos E2E. |
| Contabilidad/finanzas | Presente | Presente | Migraciones contables/finanzas | CxP fue pagada parcialmente por E2E UI y el saldo quedo `PARCIAL` por SQL; contabilidad muestra asientos cuadrados de venta/compra/RRHH. Pendiente verificar persistencia completa de eventos de pago proveedor hacia movimiento/asiento cuando el listener procese outbox. |
| RRHH/planillas/asistencia | Presente | Presente | Migraciones RRHH | Endpoint real de planillas genero asiento `PLANILLA` cuadrado con cuentas UUID y tenant correcto. Pendiente ampliar E2E UI de planillas/asistencia/pagos completos. |
| Fiscal CPE/GRE/SIRE | Presente | Presente | Migraciones fiscal | Frontend sin warnings lint; SIRE ya exige permiso explicito en handler raiz; pendiente specs CPE/worker y runtime DB. |
| Demo/help/security/observabilidad | Presente | Parcial | Docs recientes y legacy | Help movido a backend; analytics sin errores de columnas runtime; pendiente revision funcional profunda. |

## 6. Comandos ejecutados

| Comando | Resultado |
| --- | --- |
| `git status --short --branch` | Worktree con cambios previos amplios en API, web, docs, CI y lockfile. |
| `git diff --stat` | 83 archivos modificados, 4242 inserciones, 3618 borrados antes de nuevos docs/fix. |
| `pnpm --filter @erp-suite/web type-check` | Pasa. |
| `pnpm --filter @erp-suite/web build` | Pasa. |
| `pnpm --dir apps/web exec playwright test tests/e2e/setup.spec.ts --reporter=line` | Pasa: 2 tests. |
| `pnpm --filter @erp-suite/worker type-check` | Pasa. |
| `pnpm --filter @erp-suite/worker build` | Pasa. |
| `docker compose --env-file .env.example config --quiet` | Pasa con `.env.example` raiz, variables placeholder y healthchecks con `HEALTH_TOKEN` opcional; no levanta servicios. |
| `pnpm --filter @erp-suite/crypto type-check` | Pasa. |
| `pnpm --filter @erp-suite/crypto build` | Pasa. |
| `pnpm --filter @erp-suite/dtos type-check` | Pasa. |
| `pnpm --filter @erp-suite/dtos build` | Pasa. |
| `pnpm build` | Pasa: 5 paquetes. |
| `pnpm type-check` | Pasa: 7 tareas Turbo. |
| `pnpm lint` | Pasa: web sin warnings/errores; API con 241 warnings. |
| `pnpm test` | Pasa: 93 suites, 863 tests antes del ultimo lote; API directa actual pasa con 94 suites, 867 tests. |
| `pnpm audit --audit-level=low` | Pasa: sin vulnerabilidades conocidas. |
| `pnpm audit --prod --audit-level=moderate` | Pasa: sin vulnerabilidades productivas conocidas en nivel moderate o superior. |
| `pnpm dlx update-browserslist-db@latest` | Pasa: `caniuse-lite` actualizado; sin cambios de target browsers. |
| `pnpm --filter @erp-suite/erp-api build` | Fallaba por `denominaciones`; pasa tras fix. |
| `pnpm --filter @erp-suite/erp-api type-check` | Pasa tras alinear specs/mocks/DTOs. |
| `pnpm --filter @erp-suite/erp-api run test -- --runInBand` | Pasa: 94 suites, 867 tests. |
| `pnpm --filter @erp-suite/erp-api exec jest --config ./jest-e2e.json --runInBand` | Pasa: 4 suites, 19 tests; health real cubre `/api/health/live`, `/api/health/ready` y `/api/health/version` bajo prefijo global. |
| `pnpm --filter @erp-suite/web exec playwright test tests/e2e/full-ui-smoke.spec.ts --reporter=line --max-failures=1` | Pasa historico: 73/73 rutas autenticadas; en entorno lento se ejecuta por rangos con `SMOKE_ROUTE_START/SMOKE_ROUTE_END`. |
| `full-ui-smoke.spec.ts` por rangos `0..19`, `19..38`, `38..57`, `57..73` | Pasa: 19 + 19 + 19 + 16 tests; inventario JSON final de 73 rutas y 600 botones visibles, todos nombrables/accesibles y habilitados. |
| `pnpm --filter @erp-suite/erp-api exec jest --config ./jest-e2e.json --runInBand` | Pasa: 4 suites, 19 tests; sin `console.error` pendiente. |
| `pnpm --filter @erp-suite/web lint` | Pasa: 0 warnings, 0 errores. |
| `scripts/check-encoding.ps1` | Pasa: 547 TS verificados, 0 problemas. |
| `git diff --check` | Falla por whitespace en cambios previos amplios; `git diff --check -- <archivos tocados>` pasa. |
| `docker info --format '{{.ServerVersion}}'` | OK: Docker daemon disponible, version 27.2.0. |
| `docker compose ps` | Parcial: solo monitoreo arriba; Compose advierte variables criticas vacias y no muestra `web`, `api`, `worker` ni `redis` como servicios levantados. |
| `Get-NetTCPConnection -LocalPort 6379,3001,3002` | OK parcial: Redis escucha en `6379`; web/API locales escuchan en `3001/3002`, fuera de la prueba de stack Compose completo. |
| Flujo BD sin Supabase CLI | OK: migraciones y validadores se operan por `psql`/runtime checks; Supabase CLI no es requisito del proyecto. |
| Rebuild PostgreSQL local `000..301` sobre `erp_rebuild_validation` | OK: 298 migraciones aplicadas desde cero. |
| `SELECT * FROM public.validar_rebuild_runtime_summary(NULL);` | OK: 2291 checks, 2291 pasados, 0 fallidos, 79 packs. |
| `SELECT COUNT(*) FROM public.validar_rebuild_runtime_orchestrator(NULL, true);` | OK: 0 fallos runtime. |
| `SELECT * FROM public.resumen_smoke_tests_modulos_runtime(NULL);` | OK: 11 modulos, todos 100%. |
| `SELECT COUNT(*) FROM public.ejecutar_smoke_tests_modulos_runtime(NULL) WHERE NOT ok;` | OK: 0 fallos smoke. |
| Remoto Supabase `000..305` via `psql` | OK: 302 archivos activos; con tenant activo runtime 2320/2320; smoke 12/12; outbox 0. |
| Browser in-app login + modulos principales | OK: admin autenticado, `/dashboard/usuarios/` visible, modulos principales sin pantallas fatales; POS queda en estado funcional `SIN CAJA CONFIGURADA`. |

## 7. Hallazgos iniciales priorizados

| Prioridad | Area | Hallazgo | Accion |
| --- | --- | --- | --- |
| P0 | API build | `cajas.controller.ts` pasaba `Record<string, any>` donde el servicio exige `Denominaciones`. | Corregido en esta ronda. |
| P1 | BD runtime | La aplicacion real `000..301` y validadores `296..301` ya pasan en PostgreSQL temporal; `302..305` aplican incrementalmente; remoto Supabase aplicado por `psql`. | Mantener `psql`/validadores runtime como flujo operativo; no usar Supabase CLI como requisito. |
| P1 | Docker runtime | Docker daemon ya esta disponible, pero `docker compose ps` solo muestra monitoreo arriba y variables criticas vacias. | Ejecutar `docker compose build` y `docker compose up` con env real para `web`, `api`, `worker` y `redis`; luego validar health checks. |
| P1 | Dependencias | `pnpm audit --audit-level=low` pasa tras upgrades/remociones, migracion Nest 11 y overrides transitorios. | Mantener vigilancia; queda advertencia peer dev `@angular-devkit/core`/`ajv-formats` sin impacto en gates. |
| P1 | Worker deploy | `docker-compose.yml` referenciaba `apps/worker/Dockerfile`, que no existia; ademas el worker recibia `SUPABASE_SERVICE_KEY`/`REDIS_URL` pero el codigo lee `SUPABASE_SERVICE_ROLE_KEY`/`REDIS_HOST`/`REDIS_PORT`; el JWT POS firmado por el worker no incluia el `scope` exigido por el API. | Corregido con Dockerfile nuevo, variables alineadas, healthcheck del worker, validacion fail-fast de config critica y JWT con `scope=pos.worker`. |
| P1 | API autorizacion | SIRE tenia un handler raiz solo autenticado, la matriz no reconocia permisos de clase en RRHH, y quedaban rutas de configuracion/demo/auth/worker clasificadas de forma imprecisa. | Corregido: permisos explicitos en SIRE, configuracion legacy/nueva, cotizaciones, finanzas, `auth.switch-tenant` y diagnostico; worker CPE/GRE/POS clasificado como `WORKER_AUTH`; demo publico condicionado por `DEMO_API_ENABLED`; matriz sin `TODO` ni `AUTHENTICATED` generico. |
| P1 | API rate limit | `THROTTLE_TTL` quedo alineado a milisegundos para Nest Throttler v6. | Corregido en schema, `.env.example`, docs y spec de configuracion. |
| P2 | Web runtime | Lint/type-check/build y smoke Playwright home/login pasan, pero falta validacion de flujos reales contra API/BD operativa. | Ejecutar Playwright/E2E de compras, finanzas, POS y verticales criticos al levantar servicios con datos de prueba. |
| P2 | E2E transaccional | Playwright y Browser cubren carga, navegacion y botones visibles; no todos los botones protegidos se auto-clickearon porque muchos son destructivos/transaccionales o requieren datos. | Agregar seeds completos y escenarios transaccionales por vertical con rollback/idempotencia controlada. |
| P1 | Outbox runtime | El builder de outbox estaba desalineado con la tabla activa (`payload/status`), y el flujo de planilla ignoraba errores de insert en outbox. | Corregido el contrato de codigo y el manejo de error; falta una corrida dedicada de listener/outbox end-to-end para marcarlo verde transversal. |
| P2 | Libs deps | `apps/web` declaraba `@erp-suite/dtos` y `apps/worker` declaraba `@erp-suite/crypto`/`@erp-suite/dtos`, aunque los imports actuales de libs compartidas aparecen solo en API; worker tambien declaraba `bull`, `redis` y `@types/ioredis` sin imports reales. | Corregido: manifests web/worker limpiados; `bullmq` e `ioredis` se conservan por uso real. |
| P2 | Docs | Docs antiguas de seguridad/manuales pueden estar desfasadas frente a `db_rebuild_status.md` y docs recientes. | Cuarentena, consolidacion y borrado validado. |
| P2 | Temporales | `tmp_route_audit*`, `route_matrix_block03*`, `temp_retenciones.spec.ts` y compilados `apps/worker/src/queue-manager.*` fueron validados como outputs/artefactos reemplazados; SQL sueltos raiz quedan como forenses/no ejecutar por tenant hardcodeado o consulta reproducible. | Borrado seguro aplicado al primer lote; mantener cuarentena para SQL raiz, `scripts/tmp_generate_route_matrix.js` y artefactos Playwright. |
