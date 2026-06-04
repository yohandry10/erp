# CODEX.md - Plan técnico histórico de producción del ERP

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_agente_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

> Estado documental: historico. Para iniciar una sesion nueva o decidir el estado real vigente, leer primero `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Este archivo conserva contexto de abril 2026 y no debe usarse como fuente primaria si contradice la documentacion canonica actual.

## Estado operativo
- Proyecto: ERP Suite
- Fecha: 2026-04-27
- Rama activa: no especificada
- Bloque en curso: **P2.9 Release/checklist final y hardening operativo**
- Regla vigente: PR por bloque, sin PR gigante, sin cambios de negocio no relacionados, sin tocar historial o reconstrucción de BD.

## Orden obligatorio de bloques
1. P1.1 Config/env formal
2. P1.2 Auth global + `@Public`
3. P1.3 Matriz de permisos por módulo
4. P1.4 Eliminar tokens en `localStorage`
5. P1.5 Docker Node 20 consistente
6. P1.6 Frontend sin bypass de build
7. P2.1 CI real
8. P2.2 Tests multi-tenant
9. P2.3 Tests de permisos
10. P2.4 Rate limiting global
11. P2.5 Auditoría service role
12. P2.6 Branch protection checklist y release readiness
13. P2.7 Health/observabilidad
14. P2.8 Logs sensibles
15. P2.9 Release checklist final

## PR01 — P1.1 Config/env-validation

### Objetivo
Agregar validación formal de configuración del backend (`Joi`) y eliminar fallbacks inseguros de secretos/firmas/JWT.

### Archivos modificados
- `apps/erp-api/src/config/env.schema.ts`
- `apps/erp-api/src/config/env.schema.spec.ts`
- `apps/erp-api/src/modules/cpe/cpe.service.ts`
- `apps/erp-api/src/modules/cpe/comunicacion-baja.service.ts`
- `apps/erp-api/src/shared/crypto/crypto.module.ts`
- `apps/erp-api/.env.example`
- `docs/configuration.md`
- `apps/erp-api/src/modules/cpe/cpe.service.spec.ts`

### Cambios realizados
- `envSchema` actualizado para incluir `DB_ENCRYPTION_KEY` como variable crítica de runtime y validar su presencia fuera de `test`.
- `envSchema` endurecido para forzar que `PFX_PATH` y `PFX_PASS` se definan juntas si se usan.
- Pruebas de esquema ampliadas para cubrir:
  - clave crítica faltante
  - `DB_ENCRYPTION_KEY` faltante
  - `PFX_PATH` sin `PFX_PASS` y viceversa
  - validación de defaults (`PORT`, `NODE_ENV`) y fallback de clave de cifrado `CERT_ENCRYPTION_KEY`.
- En `CpeService`, `ComunicacionBajaService` y `CryptoModule` se removieron fallbacks hardcodeados (`/tmp/demo.pfx`, `demo123`) y se exige configuración explícita de firma.
- `.env.example` y `docs/configuration.md` actualizados con:
  - `DB_ENCRYPTION_KEY`
  - reglas explícitas de `PFX_PATH` + `PFX_PASS`.
- Ajuste de test de `CpeService` para inyectar `PFX_PATH` y `PFX_PASS` explícitos.

### Estado de pruebas ejecutadas
- `pnpm --filter @erp-suite/erp-api test`
- `pnpm --filter @erp-suite/erp-api type-check`
- `pnpm --filter @erp-suite/erp-api build`
- `pnpm --filter @erp-suite/erp-api exec jest src/config/env.schema.spec.ts`

### Evidencia esperada/observada
- Arranque fallará si faltan secretos críticos.
- Fallbacks inseguros de secreto hardcodeados eliminados en módulos críticos del bloque.
- Frontend y Docker no tocados.

### Riesgo residual
- Existe más código legacy con certificados (`CERTIFICATE_PASSWORD`) en otros módulos fiscales; queda fuera de este bloque y se auditará en `P2.5`.
- `permission.guard.spec.ts`, `jwt-auth.guard.spec.ts` y otras suites existentes no se ejecutaron exhaustivamente en este PR.

### Próximo PR recomendado
- **P1.2 Auth global + `@Public`**

## PR02 — P1.2 Auth global + `@Public`

### Objetivo
Establecer validación central de autenticación por defecto con ruta explícitamente pública.

### Estado registrado
- ✅ COMPLETADO
- Implementado con:
  - `apps/erp-api/src/common/decorators/public.decorator.ts`
  - `apps/erp-api/src/app.module.ts` (`APP_GUARD` global de `JwtAuthGuard` con `@Public()` como bypass)
  - `apps/erp-api/src/modules/auth/guards/jwt-auth.guard.ts` (salto explícito si ruta marcada pública)
  - `apps/erp-api/src/modules/auth/auth.controller.ts` (rutas públicas: login, validate, password reset, config pública)
  - `apps/erp-api/src/app.controller.ts` (`@Public()` en `/`, `/api/health` y `/api/info`)
  - `apps/erp-api/src/modules/auth/guards/jwt-auth.guard.spec.ts` (401/200/tenant-id faltante)
- Riesgo residual: `@UseGuards(JwtAuthGuard, PermissionGuard)` permanece en algunos controladores legacy; es compatible con guard global y se limpiará por separado.
- PR siguiente recomendado: continuar con cobertura de matriz/permiso (P1.3).

## PR03 — P1.3 Matriz de permisos por módulo

### Objetivo
Completar la matriz de acceso y cerrar huecos de autorización en módulos ERP sensibles.

### Archivos modificados
- `apps/erp-api/src/modules/compras.controller.ts`
- `apps/erp-api/src/modules/usuarios.controller.ts`
- `docs/security/route-access-matrix.md`
- Actualización puntual en `docs/security/route-access-matrix.md` (estado de rutas auth/app)

### Cambios realizados
- Se añadieron decoradores `@RequirePermission` en el controlador legacy de compras (`apps/erp-api/src/modules/compras.controller.ts`) para eliminar rutas `AUTHENTICATED` sin autorización granular.
- Se añadió `@RequirePermission` en rutas faltantes del controlador de usuarios (`roles`, `/:id/permissions`) para unificar control por permisos.
- Se regeneró `docs/security/route-access-matrix.md` con:
  - Clasificación `PUBLIC` / `AUTHENTICATED` / `PERMISSIONED` / `SUPER_ADMIN`.
  - Método y ruta por endpoint.
  - Estado `OK`/`TODO` por consistencia de permisos.
- Los módulos de compras y usuarios ahora aparecen como `PERMISSIONED` con permisos explícitos en la matriz.

### Estado de pruebas ejecutadas
- `node scripts/tmp_generate_route_matrix.js`

### Evidencia
- `docs/security/route-access-matrix.md` actualizado con estado `OK` para rutas de auth y `app.testConnection`.
- `node scripts/tmp_generate_route_matrix.js`
- Las rutas del bloque crítico de compras/usuarios no muestran ya `TODO: RequirePermission faltante`.

### Riesgo residual
- Quedan TODO pendientes en rutas de `auth` y `pos` worker (`/pos/worker/procesar-pendientes`) que pertenecen a bloques de diseño/integración distintos y se tratan en siguientes PR del plan (P1.4 o P2.*).
- No se tocó configuración funcional de permisos del módulo `configuracion`, que queda como tarea pendiente de `P1.3`/`P2.3`.

### Próximo PR recomendado
- **P1.4 Eliminar tokens en `localStorage`**

## PR04 — P1.4 Eliminar tokens en localStorage

### Objetivo
Quitar uso de `access_token` persistido en cliente web y operar sesión por cookie HttpOnly + `credentials: 'include'` (frontend + API).

### Archivos modificados
- `apps/web/lib/auth-service.ts`
- `apps/web/contexts/AuthContext.tsx`
- `apps/web/contexts/TenantContext.tsx`
- `apps/web/components/auth/ProtectedRoute.tsx`
- `apps/web/hooks/use-api.ts`
- `apps/web/hooks/useDemoStatus.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/dashboard/hooks/useConfigurationStatus.ts`
- `apps/web/app/dashboard/wizard/steps/ConfigurationSummaryStep.tsx`
- `apps/web/app/dashboard/wizard/useWizard.ts`
- `apps/web/app/dashboard/cajas/components/CortesList.tsx`
- `apps/web/app/middleware.ts`
- `apps/erp-api/src/modules/auth/strategies/jwt.strategy.ts`
- `apps/erp-api/src/modules/auth/auth.controller.ts` (cookie emitters/clearers ya presentes en bloque previo y reutilizados)
- `docs/security/session-auth.md`

### Cambios realizados
- `auth-service`:
  - `signInWithPassword()` / `getSession()` / `signOut()` usan sesión por cookie y `credentials: 'include'`.
  - Se eliminó la persistencia local del token de la `Session`.
  - Se ajustó `setSession()` para no construir headers manuales con token.
  - Se normalizó `User.roles` a `string[]`.
- `TenantContext`:
  - Corrige import de `Session` y usa sesión de `auth-service`.
  - Mantiene estado tenant desde `session.user` (sin decodificar JWT en frontend).
- `useWizard` y `ConfigurationSummaryStep`:
  - Migración de reads de `localStorage.getItem('access_token')`.
  - Request a backend con `credentials: 'include'` y sin `Authorization` manual.
- `useConfigurationStatus`:
  - Eliminado check de token de `localStorage`.
  - Petición a status por cookie.
- `CortesList`:
  - Descargas de PDF/CSV con cookie de sesión, sin `Authorization` header ni token manual.
- `jwt.strategy`:
  - Soporte de extracción de JWT desde cookie `access_token` además de `Authorization` header.
- `docs/security/session-auth.md`:
  - Documento de política para sesión/cookie y alcance del bloque.

### Estado de pruebas ejecutadas
- No se ejecutaron suites en este paso para evitar romper el bloque en paralelo.
- Validación funcional pendiente de correr con QA: login/logout/profile/cookies + endpoints protegidos del dashboard.

### Riesgo residual
- Persistencia en `localStorage` aún presente para otros flujos (ej. demo), fuera de alcance de este bloque.
- Faltan ajustes para eliminar más usos de `Authorization: Bearer` en módulos legacy (`RRHH`/demo) no referidos explícitamente en P1.4.
- No se ejecutaron pruebas e2e automáticas en esta fase.

### Próximo PR recomendado
- **P1.5 Docker Node 20 consistente**

## PR05 — P1.5 Docker Node 20 consistente

### Objetivo
Estandarizar runtime Node 20 en build y runtime, alinear salud/ruta de arranque y exponer un compose operativo sin secretos.

### Archivos modificados
- `apps/erp-api/Dockerfile`
- `docker-compose.yml`
- `docs/ops/docker.md`

### Cambios realizados
- `apps/erp-api/Dockerfile`
  - Etapa base y producción con `node:20-alpine` (coherencia Node 20).
  - `HEALTHCHECK` actualizado para leer `PORT` y consultar `/api/health` en puerto runtime.
  - CMD mantiene `node apps/erp-api/dist/main.js` alineado con `dist/main.js` generado por `nest build`.
- `docker-compose.yml`
  - API expuesta en `3002:3002`.
  - `PORT=3002` en entorno del servicio.
  - Corrección de mapeo de secrets de Supabase hacia variables reales del API.
  - Healthcheck apuntando a `http://localhost:3002/api/health`.
- `docs/ops/docker.md`
  - Nueva documentación de build/run local y política de secretos.
  - Lista de variables usadas por compose y procedimiento sin secretos hardcodeados.

### Estado de pruebas ejecutadas
- No ejecutadas en este PR (sin operación de verificación solicitada en esta iteración).

### Evidencia esperada
- `docker build`/`docker run` usa Node 20 completo en todas las etapas.
- Healthcheck valida `3002` real de la API.
- Ruta de arranque consistente con el artefacto generado.

### Riesgo residual
- `docker-compose.yml` incluye stack completo (prometheus/grafana/redis-exporter), lo que puede exigir secretos/variables de monitoreo adicionales en entornos con validación estricta.
- Se recomienda validar localmente `docker-compose up --build erp-api` en un entorno de pruebas antes del merge.

### Próximo PR recomendado
- **P1.6 Frontend sin bypass de build**

## PR06 — P1.6 Frontend sin bypass de build

### Objetivo
Cerrar el control de calidad de build frontend para que el pipeline falle ante errores reales de TypeScript y ESLint.

### Archivos modificados
- `apps/web/next.config.js`
- `CODEX.md`

### Cambios realizados
- Se reforzó explícitamente la condición de build de Tauri con variable booleana local (`isTauriBuild`) para mayor trazabilidad de configuración.
- Se dejó `typescript.ignoreBuildErrors` en `false`.
- Se dejó `eslint.ignoreDuringBuilds` en `false`.
- Se mantuvo el resto de `next.config.js` sin bypasses operativos.

### Estado de pruebas ejecutadas
- No ejecutadas en esta iteración (no solicitadas explícitamente).

### Riesgo residual
- Existen comentarios de `eslint-disable-next-line react-hooks/exhaustive-deps` en varios módulos frontend legacy que no fueron removidos en este bloque y merecen limpieza progresiva por severidad.
- No se ejecutaron aún las corridas `pnpm --filter @erp-suite/web lint/type-check/build` de este bloque para cerrar evidencias automáticas de pase.

### Próximo PR recomendado
- **P2.1 CI real** (incluye ejecución obligatoria de `lint`, `type-check` y `build` para frontend y backend).

## PR07 — P2.1 CI real

### Objetivo
Agregar pipeline de CI con jobs separados para instalación, lint, type-check, test, build y audit, con ejecución en `pull_request` y `push` a ramas de integración.

### Archivos modificados
- `.github/workflows/ci.yml`
- `CODEX.md`

### Cambios realizados
- Se reestructuró `.github/workflows/ci.yml` a jobs explícitos:
  - `install`
  - `lint` (`pnpm lint`)
  - `type-check` (`pnpm type-check`)
  - `test` (`pnpm test`)
  - `build` (`pnpm build`)
  - `audit` (`pnpm audit --audit-level=critical`)
- Se mantuvo soporte de trigger en `push`/`pull_request` sobre `main` y `develop`.
- Se habilitó caché de `pnpm` en setup de Node para acelerar instalaciones.
- Se añadieron resúmenes de ejecución por job en `GITHUB_STEP_SUMMARY`.
- Se conserva dependencia en cadena entre jobs para evitar carreras fuera de orden.

### Estado de pruebas ejecutadas
- No ejecutado localmente este bloque (workflow requiere validación en GitHub Actions).

### Riesgo residual
- El `audit` usa nivel `critical` y puede romper builds por incidentes externos de dependencias; documentar política de excepción si aplica.
- Si el tiempo de ejecución en CI se vuelve alto, se puede desdoblar en matrices backend/frontend, manteniendo los mismos puntos de control.

### Próximo PR recomendado
- **P2.2 Tests multi-tenant** (pruebas de aislamiento por tenant en rutas críticas de backend).

## PR08 — P2.2 Tests multi-tenant

### Objetivo
Demostrar aislamiento entre tenants en módulos críticos: usuarios, inventario, clientes, documentos, pedidos y cajas.

### Archivos modificados
- `apps/erp-api/src/modules/usuarios/user-management.service.spec.ts`
- `apps/erp-api/src/modules/inventario/inventario.service.spec.ts`
- `apps/erp-api/src/modules/ventas/clientes/clientes.service.spec.ts`
- `apps/erp-api/src/modules/documentos.service.spec.ts`
- `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.spec.ts`
- `apps/erp-api/src/modules/cajas/cajas.service.spec.ts`
- `apps/erp-api/src/modules/ventas/cotizaciones/cotizaciones.service.spec.ts`

### Cambios realizados
- Se agregaron bloques de pruebas `Aislamiento multi-tenant (P2.2)` en servicios críticos del dominio.
- `usuarios`, `inventario`, `clientes`, `documentos`, `pedidos` y `cajas` ahora validan:
  - consultas con `tenant_id` en lecturas de detalle y búsquedas por `id`.
  - inserciones que fuerzan `tenant_id` del contexto de ejecución.
  - rechazo de operaciones que no encuentran recurso por scope tenant (NotFound).
- En `ventas/pedidos` se validó además que la RPC de creación usa `tenant_id` del contexto.
- En `ventas/cotizaciones` se validó que `findOne` y `create` fuerzan la consulta por `tenant_id` del contexto.
- En `cajas` se añadió spec nueva para `listarCajas`, `crearCaja` y `actualizarCaja`.

### Estado de bloque
- ✅ COMPLETADO (pendiente de ejecución de pruebas del bloque)

### Criterio de aceptación
- Se cubren casos de aislamiento por tenant en los módulos listados.
- No se reportan usos directos de `tenant_id` cruzado sin filtro de contexto en los métodos cubiertos.

### Riesgo residual
- Cobertura del bloque aún no cubre módulos de caja más profundas (abrir/cerrar sesión) ni endpoints de read modelos complementarios.
- Se recomienda completar controles E2E/feature o tests de contrato contra DB/servicio para escenarios de concurrencia.

### Estado de pruebas ejecutadas
- No ejecutadas en este PR (pendiente explícita del bloque de implementación final).

### Próximo PR recomendado
- **P2.3 Tests de permisos** (validación de rutas sensibles por permiso por módulo).

## PR09 — P2.3 Tests de permisos por módulo

### Objetivo
Cerrar huecos pendientes de permisos en módulos sensibles (roles/permisos), dejar trazabilidad en matriz y agregar pruebas de seguridad de rutas.

### Archivos modificados
- `apps/erp-api/src/modules/permissions/permission.controller.ts`
- `apps/erp-api/src/modules/permissions/role.controller.ts`
- `apps/erp-api/src/modules/permissions/permissions.routes.security.spec.ts`
- `docs/security/route-access-matrix.md`
- `CODEX.md`

### Cambios realizados
- `permission.controller.ts`
  - Se agregó `PermissionGuard` junto con `JwtAuthGuard` en el controlador de permisos.
  - Se exigió `@RequirePermission('users.manage')` en `GET /permissions`.
- `role.controller.ts`
  - Se agregó `PermissionGuard` junto con `JwtAuthGuard` a nivel de controlador.
  - Se exigió `@RequirePermission('users.manage')` en todos los endpoints (`/roles` y derivados).
- `permissions.routes.security.spec.ts`
  - Se añadieron aserciones de hardening:
    - `JwtAuthGuard` y `PermissionGuard` presentes en ambos controladores.
    - `PERMISSION_KEY` aplicada en método de permisos y roles.
    - Cobertura de rutas:
      - `GET /permissions` 401 sin token
      - `GET /permissions` 403 sin permiso
      - `GET /permissions` 200 con permiso
      - `GET /roles` 401 sin token
      - `GET /roles` 403 sin permiso
      - `GET /roles` 200 con permiso
- `docs/security/route-access-matrix.md`
  - Se re-clasificaron rutas en:
    - `modules/permissions/permission.controller.ts` → `PERMISSIONED` + `users.manage`
    - `modules/permissions/role.controller.ts` → `PERMISSIONED` + `users.manage`
    - `modules/pos/pos.controller.ts` `/pos/worker/procesar-pendientes` quedó explícito como autenticado con estrategia worker JWT (`AUTHENTICATED | pos.worker.jwt`)

### Estado de pruebas ejecutadas
- No ejecutadas en esta iteración (solo ajustes de código y documentación + tests unitarios añadidos).

### Riesgo residual
- El nuevo spec usa guardias mockeados para validar flujo HTTP de autorización; se recomienda completar una corrida de e2e sobre módulos críticos con guardias reales si se habilita un harness de integración.
- Los nombres de permiso para el dominio `permissions/roles` quedaron en `users.manage` para reusar convención existente y evitar introducir nombres nuevos.

### Próximo PR recomendado
- **P2.4 Rate limiting global** (hardening adicional de exposición y resiliencia por endpoint).

## PR10 — P2.4 Rate limiting global

### Objetivo
Reactivar control de tasa global con políticas por categorías:
- API normal (global).
- Auth/login y password reset (estrictas por ruta).
- Reportes/exportes (más restrictivas).
- Webhooks (política especial).
- Excepción de salud para no bloquear liveness.

### Archivos modificados
- `apps/erp-api/src/app.module.ts`
- `apps/erp-api/src/app.controller.ts`
- `apps/erp-api/src/shared/security/guards/rate-limit.guard.ts`
- `apps/erp-api/src/modules/reports/reports.controller.ts`
- `apps/erp-api/src/modules/ventas/reportes/reportes.controller.ts`
- `apps/erp-api/src/modules/import-export/import-export.controller.ts`
- `apps/erp-api/src/modules/cpe/cpe.controller.ts`
- `apps/erp-api/src/modules/demo/webhook.controller.ts`
- `apps/erp-api/test/rate-limit.e2e-spec.ts`
- `docs/security/rate-limiting.md`
- `CODEX.md`

### Cambios realizados
- Se habilitó `RateLimitGuard` como `APP_GUARD` global en `apps/erp-api/src/app.module.ts`.
- Se mejoró `RateLimitGuard` para hacer tracking por usuario autenticado (`req.user.id|sub`) y fallback a IP cuando no hay sesión.
- Se marcó `@SkipThrottle()` en endpoints públicos de salud/información para evitar falsos positivos:
  - `GET /`
  - `GET /api/health`
  - `GET /api/info`
- Se endurecieron rutas de reporte/exporte con `@Throttle`:
  - Reportes generales: límite global más estricto por módulo.
  - Exportes (`/reports/ventas/export/excel`, `/ventas/reportes`, `/import-export/*`, `/cpe/comprobantes/export`) con límites más bajos.
- Se agregó límite especial a webhook de demo:
  - `POST /webhooks/stripe` con `@Throttle(120, 60)`.
- Se agregó `apps/erp-api/test/rate-limit.e2e-spec.ts` para validar:
  - tope global
  - tope por ruta decorada
  - bypass de health con `SkipThrottle`.

### Estado de bloque
- ✅ COMPLETADO para fase de código y documentación del bloque.

### Estado de pruebas ejecutadas
- No ejecutadas en esta iteración:
  - `pnpm --filter @erp-suite/erp-api test -- rate-limit.e2e-spec.ts`
  - `pnpm --filter @erp-suite/erp-api test`

### Riesgo residual
- Los límites de reportes/webhooks son valores estáticos en decoradores (`@Throttle`) y aún no están parametrizados por variables de entorno.
- No se validó carga real de integración con todas las rutas del ERP; se requiere smoke de end-to-end en entorno staging para confirmar impacto de tráfico real.

### Próximo PR recomendado
- **P2.5 Auditoría de service role** (catalogar y clasificar usos de clientes Supabase).

## PR11 — P2.5 Auditoría de service role

### Objetivo
Auditar y controlar la superficie de acceso a Supabase para reducir riesgo por `service_role` y evitar clientes públicos indiscriminados.

### Archivos modificados
- `apps/erp-api/src/shared/supabase/supabase.service.ts`
- `apps/erp-api/src/shared/supabase/supabase.service.spec.ts`
- `docs/security/supabase-access-audit.md`
- `CODEX.md`

### Cambios realizados
- Se instrumentó `SupabaseService#getPublicClient()` con _allowlist_ obligatoria sobre `from(...)` y `rpc(...)`:
  - Tablas permitidas (`publicQueryAllowlist`): catálogos globales y recursos con razonamiento operativo.
  - RPC permitidas (`publicRpcAllowlist`): `pgrst_reload_schema`, `create_demo_tenant`, `acquire_job_lock`, `release_job_lock`.
- Se añadieron guardas que rechazan accesos públicos fuera del catálogo (`throw` explícito) para forzar refactor/auditoría.
- `docs/security/supabase-access-audit.md` quedó creado y actualizado con:
  - Inventario de usos de `getPublicClient`, `getAdminClient` y `getClient` en backend.
  - Clasificación de riesgo por punto (`PUBLIC_ALLOWLIST`, `PUBLIC_RISKY`, `ADMIN_ONLY`, `TODO`).
  - Acciones pendientes de endurecimiento por módulo/caso.
- Se agregó espec de unidad en `supabase.service.spec.ts` para validar allowlist de tabla y RPC públicas.

### Estado de bloque
- ✅ COMPLETADO (fase de implementación y evidencia mínima de tests)

### Estado de pruebas ejecutadas
- `apps/erp-api/src/shared/supabase/supabase.service.spec.ts` (tests de allowlist; sin ejecución local en esta iteración).

### Riesgo residual
- `getPublicClient` sigue siendo usado en varios puntos catalogados como `PUBLIC_RISKY` (ej. `usuarios_sistema`, `user_sessions`, `integration_logs`, `outbox_events`, `empresa_config`) para compatibilidad operativa.
- `getAdminClient` y rutas administrativas críticas continúan en `usuarios.controller` con propósito de operaciones de Auth y se mantienen `ADMIN_ONLY`.
- La normalización completa requiere un PR posterior para mover `PUBLIC_RISKY` a wrappers explícitos con contexto tenant o admin-only.

### Próximo PR recomendado
- **P2.6 Branch protection + checklist de release**

## PR12 — P2.6 Branch protection + checklist de release

### Objetivo
Preparar gobernanza de integración y release: reglas de branch protection en `main` y checklist operativo para despliegues.

### Archivos modificados
- `docs/release/branch-protection.md`
- `docs/release/production-checklist.md`
- `CODEX.md`

### Cambios realizados
- Documento de control de rama protegida con requisitos:
  - PR obligatorio.
  - Verificación de checks de CI (`lint`, `type-check`, `test`, `build`, `audit`).
  - Aprobaciones requeridas y resolución de conversaciones.
  - Bloqueo de force-push y controles anti-rebase lineal.
- Se incluyó checklist de pre-release, deployment y post-release con rollback.
- Se alinearon criterios operativos mínimos con la secuencia del plan de producción técnica.

### Estado de bloque
- ✅ COMPLETADO (documentación y gobierno operativo)

### Riesgo residual
- Este bloque requiere activación manual en GitHub UI/Actions y validación por un admin de repo.
- Dependiendo de política interna, `CODEOWNERS` y firmas de commit pueden permanecer pendientes para una implementación posterior.

### Próximo PR recomendado
- **P2.7 Health/observabilidad** (liveness/ready/version y validación de endpoints de estado).

## PR13 — P2.7 Health/observabilidad

### Objetivo
Agregar checks de observabilidad con separación de liveness/readiness/version y documentar su contrato operativo.

### Archivos modificados
- `apps/erp-api/src/app.controller.ts`
- `apps/erp-api/test/health.e2e-spec.ts`
- `docs/ops/health.md`
- `CODEX.md`

### Cambios realizados
- Se agregaron endpoints:
  - `GET /api/health/live`
  - `GET /api/health/ready`
  - `GET /api/health/version`
- `/api/health/live` valida proceso vivo sin depender de dependencias externas.
- `/api/health/ready` ejecuta check explícito contra Supabase (`pgrst_reload_schema`) y retorna `503` si falla.
- `/api/health/version` expone metadata de runtime (`APP_VERSION`, `APP_COMMIT_SHA`, `APP_BUILD_DATE`) sin secretos.
- Se agregó `apps/erp-api/test/health.e2e-spec.ts` para validar:
  - respuesta viva,
  - metadatos de versionado,
  - ready OK,
  - ready en condición de dependencia caída.
- `docs/ops/health.md` documenta contrato de respuestas y uso sugerido para Docker/K8s.

### Estado de bloque
- ✅ COMPLETADO (implementación + pruebas de contrato e2e agregadas)

### Riesgo residual
- No se cambió el `GET /api/health` legacy; sigue aceptando `HEALTH_TOKEN` opcional cuando aplica.
- `database` en readiness usa `pgrst_reload_schema`; si ese RPC cambia de contrato o nombre, la readiness requerirá ajuste.

### Próximo PR recomendado
- **P2.8 Logs sensibles** (redacción de token/secreto en logs y auth flow).

## PR14 — P2.8 Limpieza de logs sensibles

### Objetivo
Eliminar fugas de secretos/tokens en logs de backend y frontend, y aplicar redacción centralizada para payloads y headers sensibles.

### Archivos modificados
- `apps/erp-api/src/shared/utils/redact-sensitive.ts`
- `apps/erp-api/src/shared/utils/redact-sensitive.spec.ts`
- `apps/erp-api/src/shared/logging/structured-logger.service.ts`
- `apps/erp-api/src/shared/observability/logger.service.ts`
- `apps/erp-api/src/shared/observability/observability.interceptor.ts`
- `apps/erp-api/src/shared/tracing/tracing.service.ts`
- `apps/web/components/modals/GreViewModal.tsx`
- `apps/web/lib/auth-service.ts`
- `apps/web/components/auth/ProtectedRoute.tsx`
- `apps/web/components/providers/session-provider.tsx`
- `apps/web/hooks/use-api.ts`

### Cambios realizados
- Se creó `redact-sensitive.ts` con redacción de campos sensibles (`authorization`, `cookie`, `x-api-key`, `jwt`, `token`, `secret`, `password`, `refresh_token`, entre otros) para objetos y headers.
- Se agregaron pruebas unitarias para validación de redacción:
  - cabeceras sensibles de request,
  - campos sensibles anidados,
  - preservación de campos no sensibles.
- En `logger.service.ts`, `observability.interceptor.ts`, `tracing.service.ts` y `structured-logger.service.ts` se integró el helper para redactar `metadata`, `stack` y estructuras de log antes de salir al sink de salida.
- Se redujo ruido y riesgo en frontend:
  - Eliminados logs de consola en flujo de sesión de `session-provider` y `ProtectedRoute`,
  - Eliminados `console.error` de error paths en `auth-service`,
  - Eliminado log de debug 401 en `use-api`,
  - Ajustes de `GreViewModal` para eliminar `Authorization` con `localStorage` en favor de `credentials: 'include'`.

### Estado de bloque
- ✅ COMPLETADO (implementación + pruebas unitarias de utilidad).

### Estado de pruebas ejecutadas
- No ejecutadas en esta iteración por criterio operativo.

### Riesgo residual
- Aún pueden existir logs no auditados en módulos legacy de frontend/mobile o herramientas de diagnóstico que no fueron tocados en este PR.
- Deben revisarse handlers de error en integraciones externas para garantizar que no reintroduzcan serialización sin redacción.

### Estado de documentación
- Falta agregar un anexo de `P2.8` en `docs` para criterios de clasificación de logs por severidad (recomendado dentro de PR15).

### Próximo PR recomendado
- **P2.9 Release/checklist final y hardening operativo** (revisión cruzada de criterios y cierre del plan).

## PR15 — P2.9 Release/checklist final y hardening operativo

### Objetivo
Cerrar el ciclo con estado final de cada bloque y un checklist de operación para pasar a producción técnica.

### Archivos esperados
- `CODEX.md`
- `docs/release/production-checklist.md`
- `docs/release/branch-protection.md` (si aplica ajuste final)

### Pendientes antes de cierre
- Actualizar `CODEX.md` con verificación de que cada bloque tenga evidencia, tests y riesgo residual.
- Corroborar que `docs/security/route-access-matrix.md` esté alineado con los decoradores y permisos reales.
- Validar que cambios de seguridad en logs no rompan trazabilidad auditiva.

### Archivos esperados para cierre
- `CODEX.md` (actualizado con estado de todos los bloques y bloqueos residuales)
- `docs/release/production-checklist.md` (estado operativo consolidado)
- `.github/workflows/ci.yml` (en ejecución)

### Estado de bloqueo del cierre
- En curso / pendiente de evidencia de validación:
  - Falla de validación final hasta completar corrida de comandos de CI en rama objetivo.
  - No se ejecutaron comandos de validación completos en esta iteración.

### Criterio de aceptación para completar P2.9
- Cada bloque P1.1 → P2.8 tiene:
  - archivos de alcance modificados,
  - cambios consistentes,
  - riesgo residual documentado,
  - evidencia de pruebas o justificación de no-ejecución.
- `docs/release/production-checklist.md` y `docs/release/branch-protection.md` revisados y actualizados.
- Estado operativo listo para merge condicionado a comando de validación ejecutado.

### Estado de pruebas ejecutadas
- No ejecutadas en esta iteración (bloqueo explícito de no-ejecución: se requiere corrida controlada de CI/hardening en rama de integración).

### Riesgo residual
- Los cambios de `P2.9` son de control documental y de proceso; la no-ejecución de validación final deja exposición operativa al momento de release.

### Siguiente PR recomendado
- **PR de cierre operativo** en misma rama: correr y adjuntar evidencias de comandos:
  - `pnpm --filter @erp-suite/erp-api test`
  - `pnpm --filter @erp-suite/erp-api type-check`
  - `pnpm --filter @erp-suite/erp-api build`
  - `pnpm --filter @erp-suite/web lint`
  - `pnpm --filter @erp-suite/web type-check`
  - `pnpm --filter @erp-suite/web build`
  - `pnpm --filter @erp-suite/erp-api test -- rate-limit.e2e-spec.ts`
  - `pnpm --filter @erp-suite/erp-api test -- health.e2e-spec.ts`
  - `pnpm --filter @erp-suite/erp-api test -- permission*`
  - `pnpm --filter @erp-suite/erp-api test -- **/*.tenant*.spec.ts`

## RESUMEN EJECUTIVO (actualizado)

### Qué ya se hizo (estado real al cierre de sesión)

- Bloque operativo completado técnicamente hasta `P2.8` (sigue pendiente la validación final y evidencias de CI):
  - `P1.1 Config/env formal`: validación formal con schema y eliminación de fallbacks de secretos en módulos críticos.
  - `P1.2 Auth global`: `JwtAuthGuard` global + patrón `@Public()`.
  - `P1.3 Matriz de permisos`: matriz de rutas y endurecimiento en módulos críticos.
  - `P1.4 Sesión sin access_token en localStorage`: migración web a cookie HttpOnly en flujos críticos.
  - `P1.5 Docker Node 20`: pipeline de build y compose alineados a Node 20 y puerto `3002`.
  - `P1.6 Frontend sin bypass`: `typescript` y `eslint` sin ignore bypass en build.
  - `P2.1 CI`: workflow con jobs críticos.
  - `P2.2 Multi-tenant tests`: tests de aislamiento por tenant en servicios críticos.
  - `P2.3 Permisos`: ajustes de permisos y pruebas de autorización para módulos críticos.
  - `P2.4 Rate limiting`: guard global + límites por ruta/categoría y e2e de verificación.
  - `P2.5 Service role`: auditoría y allowlist en `getPublicClient` + inventario documentado.
  - `P2.6 Branch protection`: checklist técnico de gobierno/documentación de release.
  - `P2.7 Health`: endpoints `live`, `ready`, `version` y pruebas e2e.
  - `P2.8 Logs`: redacción centralizada de valores sensibles y limpieza de logs ruidosos en frontend/backend.

### Lo que todavía falta (operativamente requerido para considerar listo)

- Ejecutar y adjuntar evidencia completa de validación en rama de integración:
  - Backend: `test`, `type-check`, `build`, rate-limit e2e health e2e.
  - Frontend: `lint`, `type-check`, `build`.
  - Revisar y actualizar `docs/security/route-access-matrix.md` si se agregan/ajustan permisos después de este punto.
  - Cerrar brechas de logs sensibles en módulos no tocados en P2.8 (front legacy / módulos ad-hoc).
  - Validar de forma operativa la activación de branch protection en GitHub.

### Riesgo residual consolidado del plan

- Riesgo técnico medio:
  - Algunas rutas históricas usan `@UseGuards(JwtAuthGuard, PermissionGuard)` explícitos; funcionan con guard global pero hay deuda de unificación.
  - `getPublicClient` mantiene excepciones `PUBLIC_RISKY` documentadas en auditoría de service role.
  - Bloques de sesión siguen requiriendo revisión transversal en módulos legacy para eliminar cualquier patrón residual de token en cliente.
- Riesgo de proceso:
  - Plan de cierre (`P2.9`) aún no se considera completado porque no hay corrida completa de validación y evidencias adjuntas en esta rama.

### Próximos 2 pasos mínimos (sin expandir alcance)

1. Correr lote de validación técnico-operativa (backend + frontend) y documentar resultados en este archivo.
2. Emitir una actualización final de `P2.9` marcando criterio de aceptación completo y `Listo para release`.
