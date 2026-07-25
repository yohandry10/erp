# Verificacion DeepSec de seguridad - 2026-06-04

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_seguridad`.
>
> Leer tambien: `docs/security/session-auth.md`, `docs/security/route-access-matrix.md`, `docs/security/supabase-access-audit.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Alcance

Se verifico el reporte local `.deepsec/data/erp/reports/report.md` contra el codigo actual del backend. No se tomo el reporte como verdad: cada punto se contrasto con controladores, guards, services y tests.

## Veredicto ejecutivo

- Confirmado y corregido: workers CPE/GRE quedaban bloqueados por el `JwtAuthGuard` global antes de ejecutar `WorkerAuthGuard`; ahora sus rutas tienen `@Public()` y siguen protegidas por JWT worker.
- Confirmado y corregido: `revokeUserSessions()` borraba filas, pero no limpiaba caches positivas de sesion; ahora lista tokens con cliente admin, invalida cache por token y luego borra sesiones.
- Confirmado y corregido: `resetPassword()` tenia una ventana de carrera entre validar token y limpiar token; ahora la actualizacion exige que `password_reset_token` siga siendo el mismo hash y falla si ya fue consumido.
- Ya corregido antes de esta pasada: POS worker es `@Public()` + `WorkerAuthGuard`, conflicto `x-tenant-id` vs `tenant_id` se rechaza, detalle POS usa el parametro URL, apertura/cierre de caja no confian en supervisor/sesion arbitrarios del cliente, logs POS ya no vuelcan payload completo.
- Mitigado parcialmente por diseno: `/auth/refresh` no usa refresh token rotativo separado; si exige `session_token` vigente, revalida sesion y recarga usuario fresco antes de firmar. Riesgo residual: un access token robado puede refrescar mientras la sesion siga viva. Deuda recomendada: migrar a refresh token rotativo si el producto necesita revocacion instantanea por token individual.

## Cambios aplicados

| Area | Archivo | Cambio |
|---|---|---|
| Reset password | `apps/erp-api/src/modules/auth/auth.service.ts` | Consumo atomico del token: `UPDATE usuarios_sistema ... WHERE id = user.id AND password_reset_token = user.password_reset_token RETURNING id`. |
| Sesiones | `apps/erp-api/src/modules/auth/auth.service.ts` | `revokeUserSessions()` usa cliente admin, lista `session_token`, borra `auth:session:<token>` de cache y luego elimina filas. |
| CPE worker | `apps/erp-api/src/modules/cpe/cpe.controller.ts` | Rutas worker marcadas `@Public()` para saltar solo el guard JWT global y permitir `WorkerAuthGuard`. |
| GRE worker | `apps/erp-api/src/modules/gre/gre.worker.controller.ts` | Controller worker marcado `@Public()` y sigue con `@UseGuards(WorkerAuthGuard)`. |
| Regresion | `apps/erp-api/src/modules/auth/auth.service.spec.ts` | Tests de token reset consumido concurrentemente y limpieza de cache al revocar sesiones de usuario. |
| Regresion | `apps/erp-api/src/modules/cpe/cpe.controller.spec.ts`, `apps/erp-api/src/modules/gre/gre.worker.controller.spec.ts` | Tests de metadata `@Public()` en rutas worker. |

## Puntos DeepSec verificados

| Hallazgo reportado | Estado actual |
|---|---|
| `/auth/refresh` renueva access tokens sin refresh token real | Parcialmente mitigado: requiere `session_token`, valida sesion vigente y recarga usuario fresco. No hay refresh rotativo separado. |
| `refreshToken()` confia en claims stale | Cerrado previamente: recarga usuario por `sub`, valida estado activo y firma con datos frescos + misma sesion. |
| `POST /auth/validate` publico expone usuario completo | Mitigado previamente: `validateToken()` devuelve vista autenticada sin `password_hash` ni `password_reset_token`. Sigue siendo endpoint publico de introspeccion de tokens validos. |
| `logout` / `logout-all` no invalidan JWT/sesion | Cerrado: `logout` invalida cache + fila; `logoutAll` ahora invalida cache de todos los tokens y borra filas. |
| Reset password permite enumeracion por timing | Mitigado previamente: respuesta generica y duracion minima en request. |
| Reset token validate/consume race | Cerrado en esta pasada con update condicional por hash de token. |
| Failed login counter no atomico | Cerrado previamente: RPC `app.increment_failed_login_attempts` via admin/service role. |
| Access JWT no ligado a sesiones revocables | Cerrado previamente: `JwtStrategy` exige `session_token` y `validateSession()`. |
| POS apertura caja permite supervisor controlado por cliente | Cerrado previamente: controller rechaza `supervisor_id`/`razon_autorizacion` arbitrarios. |
| POS cierre caja permite cerrar otra sesion | Mitigado previamente: service toma la sesion actual con `getSesionCajaActual(user)` e ignora sesion/caja arbitraria del body. |
| POS worker cruza tenant por header/query | Cerrado previamente: `WorkerAuthGuard` rechaza selectores conflictivos y canonicaliza `request.tenantId`. |
| `WorkerAuthGuard` no canonicaliza tenant | Cerrado previamente con test de conflicto. |
| Worker endpoints bloqueados por `JwtAuthGuard` global | Cerrado en esta pasada para CPE/GRE; POS ya estaba corregido. |
| POS detalle ignora parametro URL | Cerrado previamente: controller usa `@Param('id')`. |
| POS logs payload sensible | Cerrado previamente: logs actuales son resumidos y no serializan payload completo de venta. |

## Riesgos residuales recomendados

1. Refresh token rotativo: no bloquea el codigo core actual porque la sesion server-side ya revoca access tokens en el siguiente request autenticado, pero mejoraria robo de token durante la ventana de sesion.
2. Renombrar el scope worker de `pos.worker` a un scope neutral o granular (`erp.worker`, `cpe.worker`, `gre.worker`) si se quiere separar permisos por job. Hoy es consistente con el worker existente, pero el nombre ya no describe todos los usos.
3. Revisar la matriz de rutas al agregar nuevos controllers worker: cualquier ruta que use `WorkerAuthGuard` detras del guard JWT global debe estar marcada `@Public()`.

## Verificacion ejecutada

```powershell
pnpm --filter @erp-suite/erp-api run test -- auth.service.spec.ts worker-auth.guard.spec.ts cpe.controller.spec.ts gre.worker.controller.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api run type-check
```

Resultado: 4 suites enfocadas OK, 49/49 tests OK, type-check backend OK.
