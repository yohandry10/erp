# Hardening de secretos y almacenamiento local

Fecha: 2026-07-14

## Alcance

Revision no destructiva de auth web, demo, Tauri, outbox offline, estados E2E, archivos locales ignorados y permisos NTFS. No se leyeron cookies, perfiles, passwords ni contenido de Web Storage del navegador; se verificaron rutas de codigo y se elimino el almacenamiento residual completo de este WebView.

## Hallazgos confirmados y cierre

| Sintoma | Consecuencia | Remedio aplicado |
|---|---|---|
| `erp.auth.session.snapshot` podia incluir `access_token` | Un XSS podia extraer el JWT | Snapshot siempre sin token; web usa cookie HttpOnly; claves legacy se limpian al arrancar |
| Demo guardaba `token` y `demo_credentials` | Exposicion de JWT y password demo | Flujos migrados a `fetchApi`/`useAuth`, sin persistencia de credenciales |
| Outbox persistia headers de request | `Authorization` podia quedar en localStorage/SQLite/backups | Sanitizacion TS+Rust; token actual se inyecta solo al enviar; lectura Rust limpia filas legacy |
| Tauri necesitaba Bearer entre reinicios | Quitar el token romperia modo desktop | Nuevo `auth_token.dat` cifrado con DPAPI; plataformas sin keyring fallan cerradas |
| Estado Playwright `.auth/admin.json` contenia JWT | Token regenerable quedaba en disco | E2E usa cookie; archivo previo eliminado |
| Cache DeepSec, reportes y backup temporal copiaban material sensible | Multiplicacion innecesaria de secretos/datos Auth | Artefactos eliminados despues de verificar que eran regenerables |
| `.env` y PFX heredaban permisos amplios | Otros grupos locales podian leer secretos/certificados | Herencia removida; acceso limitado a usuario actual, SYSTEM y Administradores |

## Artefactos eliminados

- `.env.local.bak.1779811206`.
- `apps/web/tests/e2e/.auth/admin.json`.
- `.deepsec/data`, `apps/web/playwright-report` y `apps/web/test-results`.
- `C:\Users\PC\AppData\Local\Temp\erp-prod-backups\20260714-225411`.
- `Local Storage` y `Session Storage` del WebView `com.erpsuite.desktop`.

Los certificados `certs/demo.pfx` y `certs/sunat-20616053575.pfx` se conservaron porque participan en pruebas/fiscal; se endurecieron sus ACL. No se versionan.

## Verificacion

- `pnpm --filter @erp-suite/web test:offline`: OK; prueba explicita de que la cola no persiste `Authorization` y lo inyecta al sincronizar.
- `pnpm --filter @erp-suite/web exec tsc --noEmit`: OK.
- `cargo check` en `apps/web/src-tauri`: OK, solo tres warnings preexistentes de funciones de impresion no usadas.
- Escaneo de archivos versionados: 0 JWT completos, 0 bloques private key y 0 patrones `sk_live`/`sk_test`/`AKIA`.
- ACL verificadas sin reglas heredadas en nueve `.env` locales y dos PFX.

## Riesgo residual controlado

- Debe hacerse smoke manual de login/refresh/logout web y reinicio Tauri con API real.
- `auth_token.dat` es recuperable solo por el mismo usuario de Windows mediante DPAPI; el logout lo elimina.
- Secretos productivos deben vivir en el proveedor de despliegue, no copiarse al repositorio.
