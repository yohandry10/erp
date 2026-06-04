# Auditoría de uso de clientes Supabase — P2.5

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `seguridad`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Estado
- Bloque actual: `P2.5`
- Fecha: `2026-04-27`
- Objetivo: inventariar y clasificar el uso de `getPublicClient`, `getAdminClient` y `getClient` en backend.
- Alcance de este bloque: control de superficie de riesgo por uso de service role, sin tocar lógica de negocio.

## Resumen de hallazgos
- `getPublicClient` (13 archivos de aplicación + specs): **69 ocurrencias de línea**.
- `getAdminClient` (1 archivo): **3 ocurrencias de línea**.
- `getClient` (todo backend): **991 ocurrencias de línea** en numerosos módulos (requerimiento de multi-tenant).

## Clasificación aplicada
- `PUBLIC_ALLOWLIST`: uso permitido por diseño con cliente público.
- `PUBLIC_RISKY`: uso público actual con riesgo residual (requiere hardening).
- `ADMIN_ONLY`: operación que debe ir sólo bajo credenciales de administración real.
- `TODO`: requiere refactor/documentación adicional.

### `getPublicClient` (revisión actualizada)

| Archivo | Recurso | Clasificación | Observación |
| --- | --- | --- | --- |
| `apps/erp-api/src/main.ts` | `pgrst_reload_schema` (rpc) | `PUBLIC_ALLOWLIST` | Notificación de schema al boot de API. |
| `apps/erp-api/src/modules/paises/paises.service.ts` | `paises` | `PUBLIC_ALLOWLIST` | Catálogo global de países. |
| `apps/erp-api/src/modules/paises/paises.service.ts` | `configuracion_fiscal` | `PUBLIC_ALLOWLIST` | Catálogo por país + filtros de publicación. |
| `apps/erp-api/src/modules/paises/paises.service.ts` | `tipos_documentos_fiscales` | `PUBLIC_ALLOWLIST` | Catálogo fiscal global. |
| `apps/erp-api/src/modules/paises/paises.service.ts` | `tipos_impuestos` | `PUBLIC_ALLOWLIST` | Catálogo fiscal global. |
| `apps/erp-api/src/modules/auth/auth.service.ts` | `auth_login_attempts` | `PUBLIC_ALLOWLIST` | Registro técnico de intentos sin contexto tenant. |
| `apps/erp-api/src/modules/auth/auth.service.ts` | `usuarios_sistema` | `PUBLIC_RISKY` | Lectura/escritura por login/sesión sin tenant. |
| `apps/erp-api/src/modules/auth/auth.service.ts` | `user_roles` | `PUBLIC_RISKY` | Lectura de roles sin filtro tenant explícito del contexto. |
| `apps/erp-api/src/modules/auth/auth.service.ts` | `user_sessions` | `PUBLIC_RISKY` | Manejo de sesiones global de tokens temporales. |
| `apps/erp-api/src/modules/auth/auth.service.ts` | `tenants` | `PUBLIC_RISKY` | Validación de switch de tenant para super-admin. |
| `apps/erp-api/src/modules/auth/auth.service.ts` | `audit_log` | `PUBLIC_RISKY` | Escritura de audit sin tenant explícito en cliente público. |
| `apps/erp-api/src/modules/demo/demo.service.ts` | `empresa_config` | `PUBLIC_RISKY` | Estado demo / conversión con validaciones globales. |
| `apps/erp-api/src/modules/demo/demo.service.ts` | `demo_conversiones_pendientes` | `PUBLIC_RISKY` | Flujo de conversión con datos sensibles. |
| `apps/erp-api/src/modules/demo/demo.service.ts` | `usuarios_sistema` | `PUBLIC_RISKY` | Chequeos de unicidad de email y migración de estado. |
| `apps/erp-api/src/modules/demo/demo.service.ts` | `create_demo_tenant` (rpc) | `PUBLIC_ALLOWLIST` | Creación inicial de tenant demo. |
| `apps/erp-api/src/modules/demo/guards/demo-expired.guard.ts` | `empresa_config` | `PUBLIC_RISKY` | Lectura de estado de demo por tenant_id externo. |
| `apps/erp-api/src/modules/demo/interceptors/demo-restrictions.interceptor.ts` | `empresa_config` | `PUBLIC_RISKY` | Restricción de endpoints demo por tenant_id externo. |
| `apps/erp-api/src/modules/contabilidad/services/outbox-events.service.ts` | `outbox_events` | `PUBLIC_RISKY` | Outbox global con estado transaccional. |
| `apps/erp-api/src/modules/pos/pos.worker.scheduler.ts` | `tenants` | `ADMIN_ONLY` (actualmente público) | Bucle de worker para procesos async por tenant. |
| `apps/erp-api/src/modules/tenants/tenant-management.service.ts` | `empresa_config` | `PUBLIC_RISKY` | Uso de fallback público ante errores de RLS (documentado). |
| `apps/erp-api/src/shared/jobs/background-jobs.service.ts` | `tenants` | `ADMIN_ONLY` (actualmente público) | Descubrimiento de tenants para jobs. |
| `apps/erp-api/src/shared/jobs/background-jobs.service.ts` | `integration_logs` | `PUBLIC_RISKY` | Logging operativo por tenant. |
| `apps/erp-api/src/shared/jobs/background-jobs.service.ts` | `acquire_job_lock` (rpc) | `PUBLIC_ALLOWLIST` | Lock distribuido para jobs. |
| `apps/erp-api/src/shared/jobs/background-jobs.service.ts` | `release_job_lock` (rpc) | `PUBLIC_ALLOWLIST` | Liberación de lock de job. |
| `apps/erp-api/src/shared/outbox/outbox-worker.service.ts` | `outbox_events` | `PUBLIC_RISKY` | Limpieza de eventos `PROCESSING` vencidos. |

### `getAdminClient`

| Archivo | Recurso | Clasificación | Observación |
| --- | --- | --- | --- |
| `apps/erp-api/src/modules/usuarios.controller.ts` | `auth.admin.createUser` | `ADMIN_ONLY` | Creación de usuarios de `auth.users`; justificado. |
| `apps/erp-api/src/modules/usuarios.controller.ts` | `auth.admin.deleteUser` | `ADMIN_ONLY` | Eliminación de credenciales de `auth.users`; justificado. |

### `getClient` (global)

| Archivo | Estado | Observación |
| --- | --- | --- |
| `apps/erp-api/src` (módulos y shared services) | `PUBLIC` | `991` ocurrencias detectadas en múltiples archivos; acceso esperado por dominio tenant. |

## Decisión de implementación de este bloque
- Se agregó allowlist en `SupabaseService` para `getPublicClient()`:
  - tablas permitidas:
    - `auth_login_attempts`, `user_roles`, `usuarios_sistema`, `user_sessions`, `outbox_events`, `empresa_config`, `paises`, `configuracion_fiscal`, `tipos_documentos_fiscales`, `tipos_impuestos`, `tenants`, `integration_logs`, `audit_log`, `demo_conversiones_pendientes`
  - RPC permitidos:
    - `pgrst_reload_schema`, `create_demo_tenant`, `acquire_job_lock`, `release_job_lock`
- Cualquier intento fuera de allowlist lanza error explícito para forzar refactor/auditoría.

## Acciones pendientes (post-P2.5)
1. Migrar en capas de dominio consultas con datos de tenant (`usuarios_sistema`, `user_roles`, `user_sessions`, `outbox_events`, `empresa_config`) hacia helper explícito `getClient` con contexto y guardias de dominio.
2. Revisar y documentar contratos de job/scheduler (`tenants`, `integration_logs`) para operación claramente `ADMIN_ONLY`.
3. En `tenant-management.service.ts`, eliminar fallback público por fuerza bruta y resolver la causa de `policy/RLS` en base de datos.
4. Mantener este documento actualizado al agregar nuevos usos de `getPublicClient` o RPC públicas.

## Evidencia de pruebas
- `apps/erp-api/src/shared/supabase/supabase.service.spec.ts`:
  - Verifica allowlist de tabla permitida.
  - Verifica bloqueo de tabla no permitida.
  - Verifica allowlist de RPC permitida.
  - Verifica bloqueo de RPC no permitida.

## Riesgo residual
- Hay usos de `getPublicClient` clasificados como `PUBLIC_RISKY` por herencia histórica y diseño operativo.
- El bloque reduce superficie por defecto, pero **no elimina** esos riesgos funcionales hasta que se complete el refactor señalado.
