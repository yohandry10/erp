# Plan de revision por partes - ERP Suite

Objetivo: revisar el sistema completo por capas y dejar hallazgos accionables.

Alcance principal:
- Backend: `apps/erp-api`
- Frontend: `apps/web`
- Jobs: `apps/worker`
- Base de datos: `supabase/migrations`
- Docs y auditorias: `docs`, `tareas-errores.md`, `PROJECT_CONTEXT.md`
- Infra/ops: `docker-compose.yml`, `monitoring`, `scripts`

Plan por etapas (cada etapa cierra con notas y riesgos):

1) Mapa del sistema y dependencias
   - Revisar `PROJECT_CONTEXT.md`, `PROJECT_CONTEXT_ALL.md`, `TABLES.md`.
   - Identificar flujos principales (ventas, compras, inventario, contabilidad, CPE/GRE/SIRE).
   - Output: diagrama mental y lista de modulos criticos.

2) Base de datos y RLS (multi-tenant)
   - Revisar `supabase/migrations` y `RLS_TRIGGERS_FUNCTIONS*.md`.
   - Confirmar funciones de contexto de tenant y politicas por esquema.
   - Revisar tablas clave y indices de rendimiento.
   - Output: checklist de politicas, riesgos de aislamiento, consultas de verificacion.

3) Backend API (NestJS)
   - Revisar `apps/erp-api` por modulos (ventas, compras, inventario, contabilidad, tenants).
   - Validar contratos de eventos y outbox (ver `OUTBOX_STATUS.md`, `docs/outbox-events.md`).
   - Revisar validaciones, DTOs, manejo de errores, y auth/tenant guard.
   - Output: hallazgos por modulo y deuda tecnica.

4) Worker y jobs
   - Revisar `apps/worker` y su integracion con outbox.
   - Verificar reintentos, idempotencia y manejo de dead_letter.
   - Output: riesgos operativos y mejoras de resiliencia.

5) Frontend (Next.js)
   - Revisar `apps/web` por dominios (ventas, compras, admin, finanzas).
   - Verificar integracion con API, estado/errores y manejo multi-tenant.
   - Revisar pruebas E2E/integration.
   - Output: gaps de UX, errores funcionales y tests faltantes.

6) Infra, despliegue y observabilidad
   - Revisar `docker-compose.yml`, `monitoring/README.md`, `scripts/`.
   - Verificar configuracion de entorno, logs, metricas y alertas.
   - Output: checklist de despliegue y monitoreo.

7) Seguridad y cumplimiento
   - Revisar auth, RLS, secretos y permisos.
   - Verificar que no haya bypass de tenant ni acceso anon inseguro.
   - Output: riesgos de seguridad y mitigaciones.

8) Backlog y cierre
   - Revisar `tareas-errores.md` y cruzar con hallazgos.
   - Priorizar quick wins vs. cambios estructurales.
   - Output: plan de accion priorizado.

Formato de entrega por etapa:
- Resumen breve
- Hallazgos (alto/medio/bajo)
- Recomendaciones
- Pruebas o consultas sugeridas

## Etapa 1 - Mapa del sistema y dependencias (completada)

Resumen:
- Monorepo con tres apps principales (API, Web, Worker) y schema en Supabase.
- Dominio amplio: ventas, compras, inventario, contabilidad, CPE/GRE/SIRE, POS y cajas.
- Operacion multi-tenant apoyada en RLS y contexto de tenant en DB.

Hallazgos:
- Alto: sin hallazgos criticos en esta etapa de mapeo.
- Medio: la documentacion clave esta distribuida en varios archivos y algunos estan poco curados (`TABLES.md` es raw y dificil de navegar).
- Bajo: la lista de modulos en `apps/erp-api` es extensa y sugiere alto acoplamiento funcional; requiere priorizar por flujos criticos para no dispersar la revision.

Recomendaciones:
- Centralizar un indice de lectura rapida (links a docs clave) para reducir friccion de revision.
- Definir flujos criticos prioritarios (por ejemplo: venta -> outbox -> asientos).
- Mantener un mapa de modulos por dominio (API/DB/Frontend) para rastrear cambios.

Pruebas o consultas sugeridas:
- Confirmar flujos criticos desde docs: `PROJECT_CONTEXT.md`, `docs/outbox-events.md`.

## Etapa 2 - Base de datos y RLS (completada)

Resumen:
- Revision profunda de funciones de contexto y RLS en `supabase/migrations/009_multi_tenant_context_stock.sql`, `supabase/migrations/056_fix_rls_context_and_auth_policies.sql`, `supabase/migrations/112__rls_pos_tables.sql`, `supabase/migrations/059_create_outbox_events.sql`, `supabase/migrations/119__cash_operations_complete.sql`, `supabase/migrations/127_eventos_pos_auditoria.sql`, `supabase/migrations/086__flujo_ventas_documentos_completo.sql`.
- El aislamiento multi-tenant depende de variables de sesion (`app.current_tenant_id`, `app.current_user_id`) y/o headers HTTP (`x-tenant-id`, `x-user-id`) con excepcion de superadmin.
- Hay mezcla de estrategias (funcion vs `current_setting`, safe vs strict) que impactan seguridad y operacion.

Hallazgos:
- Alto: `app.set_tenant_context` esta expuesta a `authenticated` sin validar relacion usuario-tenant; combinado con politicas que usan solo `app.current_tenant_id` permite spoofing de tenant si un cliente puede invocar RPC directo. Referencia: `supabase/migrations/056_fix_rls_context_and_auth_policies.sql`.
- Alto: `app.current_tenant_id()` y `app.current_user_id()` leen `request.headers` (`x-tenant-id`, `x-user-id`) sin verificacion; si esos headers llegan desde el cliente, el aislamiento puede romperse. Referencia: `supabase/migrations/009_multi_tenant_context_stock.sql`.
- Medio: hay politicas en cajas/POS que usan `current_setting('app.current_tenant')` (sin _id); no hay `set_config` para esa variable, lo que puede bloquear acceso o crear comportamiento inconsistente. Referencias: `supabase/migrations/119__cash_operations_complete.sql`, `supabase/migrations/127_eventos_pos_auditoria.sql`.
- Medio: la politica de `plantillas_asientos_ventas` usa `current_setting('app.is_superadmin')` en vez de `app.is_superadmin()`, y no se observa `set_config` para esa variable; el bypass de superadmin puede no aplicar. Referencia: `supabase/migrations/086__flujo_ventas_documentos_completo.sql`.
- Medio: `_ensure_rls_if_tenant` crea politicas con fallback `true` si no existe `app.current_tenant_id()`, lo que desactiva aislamiento si falta la funcion o falla el orden de migraciones. Referencia: `supabase/migrations/112__rls_pos_tables.sql`.
- Medio: mezcla de `app.current_tenant_id()` (lanza excepcion) vs `current_setting(..., true)` vs `app.current_tenant_id_safe()` provoca errores operativos cuando el contexto no esta seteado (ej. "Tenant context is missing"). Referencias: `supabase/migrations/009_multi_tenant_context_stock.sql`, `supabase/migrations/056_fix_rls_context_and_auth_policies.sql`, `supabase/migrations/161__e2e_rpc_tenant_context.sql`.
- Bajo: comentario de politicas de login indica "sin autenticacion", pero el `TO` limita a `service_role, postgres`; mismatch documental. Referencia: `supabase/migrations/056_fix_rls_context_and_auth_policies.sql`.

Recomendaciones:
- Restringir `app.set_tenant_context` a `service_role` o validar que `p_tenant_id` pertenece a `app.current_user_id()` (o `auth.uid()`) antes de setear contexto.
- Eliminar confianza en headers arbitrarios o validar contra tablas de usuarios/tenants; si el frontend no accede directo a Supabase, documentar esa suposicion y bloquear RPCs expuestos.
- Normalizar variables: reemplazar `app.current_tenant` por `app.current_tenant_id` y usar una sola estrategia (funcion o `current_setting`) en todas las politicas.
- Reemplazar `current_setting('app.is_superadmin')` por `app.is_superadmin()` o definir el seteo de esa GUC de forma controlada.
- Cambiar `_ensure_rls_if_tenant` para fallar cerrado si no existe `app.current_tenant_id()`.

Pruebas o consultas sugeridas:
- Detectar inconsistencia de variables: `rg -n \"app\\.current_tenant\\b\" supabase/migrations -g \"*.sql\"`.
- Verificar uso de superadmin GUC: `rg -n \"app\\.is_superadmin\" supabase/migrations -g \"*.sql\"`.
- Simular acceso cross-tenant en entorno de prueba con y sin `app.set_tenant_context` para confirmar aislamiento.

## Etapa 3 - Backend API (NestJS) (completada)

Resumen:
- Backend con JwtAuthGuard, PermissionGuard global y contexto multi-tenant via middleware + interceptors.
- `SupabaseService` centraliza el acceso a PostgREST usando `SUPABASE_SERVICE_ROLE_KEY`.
- Se usan decorators `@CurrentTenant()` y `TenantBodyInterceptor` para evitar spoofing en payloads.

Hallazgos:
- Alto: el backend usa `SUPABASE_SERVICE_ROLE_KEY` para TODAS las consultas (incluye `Authorization: Bearer service_role`), lo que bypasea RLS. El aislamiento depende de filtros manuales por `tenant_id`; cualquier omision filtra datos de otros tenants. Referencia: `apps/erp-api/src/shared/supabase/supabase.service.ts`.
- Alto: `JWT_SECRET` tiene fallback a valores por defecto (`default-secret-key` / `your-default-secret-key`). Si la variable no esta configurada en prod, cualquiera puede forjar JWT con `is_super_admin` y `tenant_id`. Referencias: `apps/erp-api/src/modules/auth/strategies/jwt.strategy.ts`, `apps/erp-api/src/modules/auth/auth.module.ts`.
- Medio: se setean headers `X-Tenant-Id`/`X-User-Id` y `X-Superadmin-Bypass`, pero como se usa service_role, esos headers no aportan aislamiento real; crean falsa sensacion de RLS en backend. Referencia: `apps/erp-api/src/shared/supabase/supabase.service.ts`.
- Medio: `prepareTenantContext()` (RPC `app.set_tenant_context`) se usa solo en algunos servicios; en otros se asume que headers funcionan. Esto puede provocar errores intermitentes cuando funciones SQL dependen de `app.current_tenant_id()`. Referencias: `apps/erp-api/src/shared/supabase/supabase.service.ts`, `apps/erp-api/src/modules/tenants/tenant-management.service.ts`.
- Bajo: endpoints de metrics/observabilidad dependen de `METRICS_TOKEN`; si se omite en prod, quedan expuestos o fallan. Referencias: `apps/erp-api/src/modules/metrics/metrics.controller.ts`, `apps/erp-api/src/shared/observability/observability.controller.ts`.

Recomendaciones:
- Cambiar a `SupabaseClient` con JWT del usuario para lecturas/escrituras sensibles o forzar `row_security` y evitar `service_role` salvo tareas administrativas.
- Auditar todas las consultas `getClient()` y exigir `tenant_id` en filtros/joins; agregar tests que fallen si falta el filtro.
- Eliminar defaults inseguros de `JWT_SECRET` y fallar el arranque si no esta configurado.
- Estandarizar contexto: o usar siempre `app.set_tenant_context` por request o eliminar dependencias a `app.current_tenant_id()` en SQL.
- Asegurar `METRICS_TOKEN` en prod y documentar rotacion.

Pruebas o consultas sugeridas:
- Buscar usos de `getClient()` y revisar filtros: `rg -n \"getClient\\(\" apps/erp-api/src -g \"*.ts\"`.
- Verificar `JWT_SECRET` en entornos: revisar `.env` y config de despliegue.

## Etapa 4 - Worker y jobs (completada)

Resumen:
- Worker combina BullMQ (colas), cron y un motor in-memory con `setInterval`.
- Usa `SUPABASE_SERVICE_ROLE_KEY` directo para leer/escribir en DB y tokens JWT de worker para llamar API.
- Jobs principales: CPE/GRE/SIRE, validacion de certificados, chequeo de configuracion, POS reintentos.

Hallazgos:
- Alto: el worker firma tokens con `POS_WORKER_JWT_SECRET` para llamar endpoints CPE (`/cpe/:id/enviar-sunat`, `/cpe/:id/status`, `/cpe/comprobantes/:id/pdf`) que exigen `JwtAuthGuard` (JWT_SECRET). Esto causa 401 y bloquea procesamiento real. Referencias: `apps/worker/src/index.ts`, `apps/erp-api/src/modules/cpe/cpe.controller.ts`.
- Alto: jobs POS consultan `tenants.estado = 'ACTIVO'`, pero el esquema solo define `tenants.activo` (bool). Resultado: query falla o no retorna tenants. Referencias: `apps/worker/src/jobs/pos-cpe-retry.job.ts`, `apps/worker/src/jobs/pos-facturacion-pendiente.job.ts`, `supabase/migrations/160__align_supabase_e2e_schema.sql`.
- Medio: se crea `greQueue` pero no hay `Worker` asociado en `apps/worker/src/index.ts`, por lo que trabajos GRE no se procesan si se encolan. Referencia: `apps/worker/src/index.ts`.
- Medio: tareas de metricas/stock usan `SUPABASE_SERVICE_ROLE_KEY` y no filtran por `tenant_id`, lo que mezcla datos entre tenants y puede generar reportes incorrectos. Referencias: `apps/worker/src/index.ts`.
- Bajo: `logCronRun` usa `tenant_id = 'system'` (string) para `integration_logs` que espera `uuid`, por lo que el log probablemente falla y se pierde observabilidad. Referencia: `apps/worker/src/index.ts`.

Recomendaciones:
- Unificar autenticacion de worker: crear endpoints worker dedicados (con `WorkerAuthGuard`) o firmar con `JWT_SECRET` valido para `JwtAuthGuard`.
- Corregir la consulta de tenants en jobs POS (`activo = true`) o usar `empresa_config.estado` si ese es el origen.
- Agregar worker para `gre-processing` o eliminar la cola si no se usa.
- Asegurar filtros `tenant_id` en tareas que generan metricas o notificaciones.
- Ajustar `logCronRun` a un `tenant_id` valido o permitir NULL para logs de sistema.

Pruebas o consultas sugeridas:
- Verificar endpoints worker y guardias: `rg -n \"worker\" apps/erp-api/src/modules -g \"*.ts\"`.
- Verificar columnas en tenants: `rg -n \"ALTER TABLE IF EXISTS tenants\" supabase/migrations -g \"*.sql\"`.

## Etapa 5 - Frontend (Next.js) (completada)

Resumen:
- Frontend usa auth custom (JWT propio) con `localStorage` + cookie `access_token`.
- `useApi` centraliza llamadas al backend con `Authorization: Bearer` del token local.
- Contextos `AuthContext` y `TenantContext` decodifican JWT para tenant/superadmin.

Hallazgos:
- Alto: endpoints `apps/web/app/api/*` usan `supabase.auth.getUser()` (Supabase Auth), pero el login real es custom; no hay sesion Supabase, por lo que estas rutas probablemente devuelven 401 siempre. Referencias: `apps/web/app/api/configuracion-fiscal/route.ts`, `apps/web/app/api/help/search/route.ts`, `apps/web/app/api/help/sugerencias/route.ts`.
- Alto: `switchTenant` envia payload `{ tenant_id }` y endpoint `/auth/switch-tenant` (sin `/api`), pero el backend espera `targetTenantId` en `/api/auth/switch-tenant`. Resultado: no cambia de tenant. Referencias: `apps/web/contexts/TenantContext.tsx`, `apps/erp-api/src/modules/auth/auth.controller.ts`.
- Medio: hay claves de token inconsistentes en `localStorage` (`access_token`, `token`, `auth_token`). Esto genera 401 intermitentes en pantallas que no usan `useApi`. Referencias: `apps/web/app/demo/page.tsx`, `apps/web/components/modals/GreViewModal.tsx`, `apps/web/app/dashboard/rrhh/planillas/page.tsx`.
- Medio: UI de superadmin filtra tenants por `estado === 'ACTIVO'`, pero el esquema base usa `tenants.activo` boolean. Si el API no normaliza el campo, los contadores/selector pueden fallar. Referencias: `apps/web/app/superadmin/dashboard/page.tsx`, `apps/web/components/tenant/TenantSwitcher.tsx`.
- Bajo: hay dos capas de sesion (`AuthProvider` y `SessionProvider`) que pueden divergir en estado; aumenta complejidad y posibles race conditions. Referencias: `apps/web/contexts/AuthContext.tsx`, `apps/web/components/providers/session-provider.tsx`.

Recomendaciones:
- Unificar autenticacion en frontend: eliminar rutas API que dependen de Supabase Auth o inyectar la sesion custom en cookies para Supabase.
- Corregir `switchTenant` para usar `/api/auth/switch-tenant` y `targetTenantId`.
- Normalizar el almacenamiento del token (`access_token`) y reemplazar usos de `token`/`auth_token`.
- Alinear la fuente de estado de tenant (`estado` vs `activo`) con el API.

Pruebas o consultas sugeridas:
- Buscar usos de token legacy: `rg -n \"localStorage\\.getItem\\('token'\\)|auth_token\" apps/web -g \"*.tsx\"`.
- Verificar rutas API internas: `rg -n \"app/api\" apps/web/app -g \"*.ts\"`.

## Etapa 6 - Infra, despliegue y observabilidad (completada)

Resumen:
- Revision de `docker-compose.yml`, `monitoring/prometheus/prometheus.yml`, `monitoring/README.md` y scripts de setup.
- Observabilidad depende de Prometheus/Grafana y endpoints `/api/metrics` de la API.
- Deploy local usa Redis, worker y servicios de monitoreo.

Hallazgos:
- Alto: hay secretos de `SUPABASE_SERVICE_ROLE_KEY` comprometidos en archivos `.env` versionados. Riesgo de acceso total a la BD. Referencias: `apps/erp-api/.env`, `apps/worker/.env`.
- Alto: `docker-compose.yml` exporta `SUPABASE_SERVICE_KEY` pero el codigo usa `SUPABASE_SERVICE_ROLE_KEY`. Resultado: API/worker sin credenciales correctas o inconsistentes. Referencias: `docker-compose.yml`, `apps/erp-api/src/shared/supabase/supabase.service.ts`, `apps/worker/src/index.ts`.
- Alto: el worker en contenedor no puede conectar Redis porque espera `REDIS_HOST/REDIS_PORT` (por defecto localhost), pero el compose solo setea `REDIS_URL`. Referencias: `docker-compose.yml`, `apps/worker/src/index.ts`.
- Medio: Prometheus scrapea `host.docker.internal:3002` pero la API en compose expone `3001`. Ademas scrapea `worker:3003/metrics` sin endpoint real y `postgres-exporter:9187` sin servicio. Referencias: `monitoring/prometheus/prometheus.yml`, `docker-compose.yml`, `apps/worker/src/index.ts`.
- Medio: documentacion y scripts usan puertos 9090/3000, mientras el compose expone 9091/3300. Referencias: `monitoring/README.md`, `scripts/setup-monitoring.ps1`, `docker-compose.yml`.
- Bajo: Grafana usa credenciales por defecto en compose; si se despliega fuera de local es un riesgo. Referencia: `docker-compose.yml`.

Recomendaciones:
- Rotar inmediatamente las claves expuestas, eliminar `.env` versionados y añadir control de secretos.
- Alinear nombres de variables (`SUPABASE_SERVICE_ROLE_KEY`) en compose y en los servicios.
- Configurar Redis para worker (`REDIS_HOST=redis`, `REDIS_PORT=6379`) o soportar `REDIS_URL`.
- Corregir targets de Prometheus y exponer un endpoint real de metrics en el worker.
- Unificar puertos en docs/scripts con los del compose o parametrizarlos.

Pruebas o consultas sugeridas:
- Verificar variables en compose: `docker-compose config`.
- Validar targets Prometheus: `curl http://localhost:9091/targets` (segun puerto actual).

## Etapa 7 - Seguridad y cumplimiento (completada)

Resumen:
- Revision de guardias, rate limiting, endpoints demo, cifrado PII y validacion de entrada.
- La seguridad declarada en comentarios no siempre esta activa en runtime.

Hallazgos:
- Alto: los `@Throttle` no se aplican en la mayoria de endpoints porque el `RateLimitGuard` global esta comentado. Solo el login usa `AuthRateLimitGuard`, por lo que `auth/refresh`, `auth/validate` y password reset quedan sin limitacion real. Referencias: `apps/erp-api/src/app.module.ts`, `apps/erp-api/src/modules/auth/auth.controller.ts`.
- Alto: `PiiEncryptionService` existe pero no hay uso en servicios/repositorios (no hay referencias en el repo) y tiene fallback a claves/salt por defecto si faltan envs. Esto implica PII potencialmente en claro o cifrado debil si se usa sin configurar. Referencia: `apps/erp-api/src/shared/security/pii-encryption.service.ts`.
- Medio: endpoints demo (`/demo/create`, `/demo/planes`) son publicos cuando `DEMO_API_ENABLED=true` y el captcha es opcional si no hay secreto. En prod esto permite abuso o spam de creacion de tenants demo. Referencia: `apps/erp-api/src/modules/demo/demo.controller.ts`.
- Medio: `PermissionGuard` solo valida si hay `@RequirePermission`; endpoints sin `JwtAuthGuard` quedan publicos. Se requiere auditoria de cobertura. Referencia: `apps/erp-api/src/common/guards/permission.guard.ts`.
- Bajo: `auth/config-status` expone si hay secretos configurados y el entorno a cualquier usuario autenticado; es leakage de informacion. Referencia: `apps/erp-api/src/modules/auth/auth.controller.ts`.
- Bajo: el `ValidationInterceptor` limita payload segun `content-length`; si el header falta, no impone limite. Referencia: `apps/erp-api/src/shared/security/interceptors/validation.interceptor.ts`.

Recomendaciones:
- Reactivar un guard global de Throttler (o aplicar `@UseGuards(ThrottlerGuard|RateLimitGuard)` por controller) para que `@Throttle` sea efectivo.
- Integrar cifrado PII en los flujos de escritura/lectura (o eliminar el servicio si no se usa) y exigir claves/salts por env sin defaults.
- Deshabilitar demo en prod por defecto y exigir captcha/token o auth para crear tenants.
- Auditar controllers sin `JwtAuthGuard` y considerar un guard de autenticacion global para endpoints no publicos.
- Restringir `auth/config-status` a superadmin o solo en entorno no productivo.
- Enforzar limites de payload en body parser (Nest) y no depender solo de `content-length`.

Pruebas o consultas sugeridas:
- Auditar rate limiting real: `rg -n \"@Throttle\" apps/erp-api/src -g \"*.ts\"`.
- Revisar endpoints sin auth: `rg -n \"@Controller\\(\" apps/erp-api/src -g \"*.ts\"` y confirmar `@UseGuards(JwtAuthGuard)` por controlador.

## Etapa 8 - Backlog y cierre (completada)

Resumen:
- Se reviso `tareas-errores.md` y se cruzo con los hallazgos de esta revision.
- El backlog existente cubre varias areas, pero faltan riesgos criticos detectados aqui (especialmente seguridad operativa y configuracion).

Hallazgos:
- Alto: el backlog no contempla la exposicion de secretos en `.env` versionados ni la rotacion urgente de `SUPABASE_SERVICE_ROLE_KEY`. Referencias: `apps/erp-api/.env`, `apps/worker/.env`.
- Alto: no hay tarea para eliminar el uso global de `service_role` en el backend (bypass de RLS) ni para forzar JWT de usuario/row_security. Referencia: `apps/erp-api/src/shared/supabase/supabase.service.ts`.
- Alto: no aparece la revision de `app.set_tenant_context` (grant a `authenticated`) ni el uso de headers en funciones `app.current_*`, riesgo de spoofing a nivel DB. Referencias: `supabase/migrations/056_fix_rls_context_and_auth_policies.sql`, `supabase/migrations/009_multi_tenant_context_stock.sql`.
- Alto: no esta contemplado el bloqueo de worker por token invalido (POS_WORKER_JWT_SECRET vs JWT_SECRET) ni la consulta a `tenants.estado` en jobs POS. Referencias: `apps/worker/src/index.ts`, `apps/worker/src/jobs/pos-*.job.ts`.
- Medio: faltan issues de frontend (rutas `app/api/*` con Supabase Auth, `switchTenant` endpoint/payload, claves de token inconsistentes). Referencias: `apps/web/app/api/*`, `apps/web/contexts/TenantContext.tsx`.
- Medio: no esta en backlog la desalineacion de variables/puertos en `docker-compose.yml`, Redis y Prometheus. Referencias: `docker-compose.yml`, `monitoring/prometheus/prometheus.yml`.
- Alto (existente en backlog): `H-DB-MIG-001` indica que `npx supabase start` falla por migraciones que asumen tablas base inexistentes. Esto bloquea pruebas RLS/DB y debe priorizarse. Referencia: `tareas-errores.md`.

Recomendaciones (plan de accion priorizado):
- Bloqueantes inmediatos (seguridad/operacion):
  - Rotar y retirar secretos versionados; mover a vault/CI.
  - Eliminar `service_role` como default de consultas y definir estrategia de RLS real (JWT usuario o RPCs seguras).
  - Endurecer `app.set_tenant_context` y eliminar dependencia de headers en funciones RLS.
  - Arreglar worker auth y queries POS (`tenants.activo`).
- Estabilidad de entorno y despliegue:
  - Resolver `H-DB-MIG-001` para poder levantar Supabase desde cero.
  - Alinear variables/puertos en `docker-compose.yml` y `monitoring/*`.
- UX y consistencia frontend:
  - Corregir `switchTenant`, token storage y rutas `app/api/*`.
- Cierre de pendientes DB manuales:
  - Ejecutar T-0901..T-0906 de `tareas-errores.md` en entorno controlado y registrar evidencia.

Pruebas o consultas sugeridas:
- Ejecutar verificacion de schema: `npx supabase start` y `supabase db reset` en entorno limpio para validar `H-DB-MIG-001`.
- Re-ejecutar scripts de verificacion RLS/grants: `supabase/verify/verify_anon_access.sql`, `supabase/verify/verify_grants_matrix.sql`.

## Bloqueantes (inicio de ejecucion)

Progreso:
- Hecho: corregido filtro de tenants en jobs POS (`tenants.activo = true`) para que no fallen por `estado`. Archivos: `apps/worker/src/jobs/pos-facturacion-pendiente.job.ts`, `apps/worker/src/jobs/pos-cpe-retry.job.ts`.
- Hecho: endpoints worker dedicados para CPE/GRE y worker ajustado a usarlos con `POS_WORKER_JWT_SECRET`. Archivos: `apps/erp-api/src/modules/cpe/cpe.controller.ts`, `apps/erp-api/src/modules/gre/gre.worker.controller.ts`, `apps/erp-api/src/modules/gre/gre.module.ts`, `apps/worker/src/index.ts`.
- Hecho: migracion para endurecer `app.set_tenant_context` (validacion tenant/usuario + revoke a authenticated) manteniendo headers en funciones RLS. Archivo: `supabase/migrations/168__harden_tenant_context_no_headers.sql`.

Pendientes inmediatos:
- Rotacion/retiro de secretos versionados (.env) y mover a gestion segura.
- Estrategia para eliminar `service_role` como default (RLS real con JWT de usuario o RPCs seguras).
- Endurecer `app.set_tenant_context` y eliminar dependencia de headers en funciones RLS.
