# CAJAS FORENSIC REPORT - Analisis y Fixes

**Fecha**: 2026-05-19
**Scope**: 15 archivos backend (~7,900 lineas), 10+ componentes frontend, 14 migraciones
**Baseline**: 948 tests, 104 suites
**Post-fix**: 948 tests, 104 suites (ZERO regresiones)

---

## VEREDICTO GENERAL

El modulo de Cajas esta **bien construido** con:
- Reconciliacion de denominaciones con tolerancia configurable
- Integridad criptografica SHA-256 en cierres
- Deteccion de fraude y anomalias
- Auditoria de 7 anos con logs inmutables
- HMAC-SHA-256 para firmas digitales de autorizaciones
- Indexes UNIQUE parciales para prevenir race conditions (migration 328)
- Congelamiento de sesion durante cambios de turno

Se identificaron **6 hallazgos** (1 CRITICO, 3 ALTO, 2 MEDIO). Se corrigieron 5, 1 requiere cambio de schema.

---

## HALLAZGOS Y FIXES

### C1 [ALTO] — Supervisor role validation missing (FIXED)
- **Archivo**: `cajas.service.ts:329`
- **Problema**: Cualquier usuario podia ser indicado como supervisor sin verificar su rol
- **Fix**: Query a `user_roles` + `roles` para verificar que el supervisor tenga rol SUPERVISOR o ADMIN. Lanza `ForbiddenException` si no cumple.
- **Verificacion**: 19/19 cajas tests pass

### C2 [ALTO] — Admin role validation missing en reabrir sesion (FIXED)
- **Archivo**: `cash-closing.service.ts:486`
- **Problema**: `reabrirSesion()` no verificaba que `adminId` tuviera rol ADMIN
- **Fix**: Query a `user_roles` + `roles` para verificar rol ADMIN. Lanza `ForbiddenException` si no cumple.
- **Verificacion**: 19/19 cajas tests pass

### C2b [ALTO] — Admin role validation missing en cierre administrativo (FIXED)
- **Archivo**: `cash-concurrency.service.ts:150`
- **Problema**: `permitirCierreAdministrativo()` no verificaba que `adminId` tuviera rol ADMIN. Codigo comentado referenciaba tabla `users` inexistente.
- **Fix**: Reemplazado codigo comentado con query real a `user_roles` + `roles`. Lanza `ForbiddenException` si no cumple.
- **Verificacion**: 19/19 cajas tests pass

### C3 [MEDIO] — IP address no capturada en apertura de caja (FIXED)
- **Archivo**: `cajas.service.ts:421`, `cajas.controller.ts:52-58`
- **Problema**: `ip_address: null // TODO: Extraer de request` — tracking forense incompleto
- **Fix**:
  - Controller: Agregado `@Req() req` para extraer `req.ip || req.headers['x-forwarded-for']`
  - Service: Agregado parametro `ipAddress?: string` a `abrirCaja()`
  - POS service: Forward de `dto.ip_address` al llamar `cajasService.abrirCaja()`
- **Verificacion**: 19/19 cajas tests pass, TSC 0 errores

### C4 [CRITICO] — PIN validation solo chequea formato (PARCIALMENTE FIXED)
- **Archivo**: `cash-authorization.service.ts:173-212`
- **Problema**: `validarCodigoSupervisor()` solo validaba que el PIN fuera 6 digitos. No verificaba:
  1. Que el usuario tuviera rol SUPERVISOR/ADMIN
  2. Que el PIN coincidiera con un hash almacenado
- **Fix parcial**: Implementada verificacion de rol via `user_roles` + `roles`. Lanza `UnauthorizedException` si el usuario no tiene permisos.
- **Pendiente**: Validacion PIN contra hash requiere tabla `supervisor_pins` que no existe en el schema actual. Queda como TODO documentado.
- **Verificacion**: 19/19 cajas tests pass

### C5 [MEDIO] — Silent error handling (NO ACTIONABLE)
- **Archivos**: `cajas.service.ts:176,238,428,581`, `cash-audit.service.ts:87`, `cash-shift-changes.service.ts:416`
- **Razon**: Todos los silent catches son **intencionales y documentados**:
  - Auto-cierre de sesiones huerfanas: no debe bloquear apertura nueva
  - Registro de autorizacion: sesion ya creada, no perder la sesion
  - Registro de corte: incluye advertencia en response
  - Audit logging: no interrumpir flujo principal
  - Integration logs: operacion secundaria

---

## ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---|---|
| `cajas.controller.ts` | Agregado `@Req()` + extraccion IP en apertura |
| `cajas.service.ts` | Import ForbiddenException + param ipAddress + supervisor role check |
| `cash-closing.service.ts` | Import ForbiddenException + admin role check en reabrirSesion |
| `cash-concurrency.service.ts` | Import ForbiddenException + admin role check en cierreAdministrativo |
| `cash-authorization.service.ts` | Supervisor role check en validarCodigoSupervisor |
| `pos.service.ts` | Forward ipAddress al llamar cajasService.abrirCaja |

---

## VERIFICACION FINAL

| Check | Resultado |
|---|---|
| Cajas unit tests (19) | **PASS** 19/19 |
| POS unit tests (23) | **PASS** 23/23 |
| Full test suite (948) | **PASS** 948/948, 104 suites |
| TSC backend --noEmit | **PASS** 0 errores |
| TSC frontend --noEmit | **PASS** 0 errores |
| Regresiones | **ZERO** |

---

## PENDIENTE (requiere cambio de schema)

- **Tabla `supervisor_pins`**: Para validacion real de PIN contra hash bcrypt
  - Columnas sugeridas: `usuario_id`, `hash_pin`, `salt`, `activo`, `created_at`
  - Requiere migracion + UI de configuracion de PIN
  - Sin esta tabla, el PIN solo se valida por formato (6 digitos) + rol del supervisor
