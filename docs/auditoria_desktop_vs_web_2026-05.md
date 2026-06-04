# Auditoria desktop vs web - 2026-05

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha: 2026-05-25

## Conclusion

La app desktop/Tauri fue alineada a una estrategia **online-first con soporte offline local** el 2026-05-25. Ya no depende del proxy Next `/backend`, el build estatico Tauri compila, los comandos nativos declarados por la UI existen y hay cache/outbox local para operar sin red. La fuente autoritativa sigue siendo el backend API.

Revision adicional del 2026-05-25: se ejecuto una matriz de smoke sobre **108 rutas exportadas** desde `apps/web/out` con API simulada, sesiones tenant-admin/superadmin segun ruta y deteccion de errores de consola/chunks. Resultado final: **108/108 OK, 0 fallas**.

Revision adicional de bugs/cuello de botella del 2026-05-25: se corrigio el modo offline forzado, la persistencia de cache para que falle suave ante cuota/localStorage, la sincronizacion de cola contra el API vigente y el acceso concurrente al outbox Tauri. Tambien se redujo el pico de navegacion del sidebar desktop limitando y escalonando el prefetch inicial.

Limitacion vigente: por usar `output: export`, las rutas dinamicas se generan con placeholders para permitir empaquetado. El flujo normal debe navegar desde listados/pantallas internas; el refresh o acceso directo a IDs reales en rutas dinamicas puede requerir una estrategia posterior de URL web remota, sidecar Next o refactor de rutas.

## Remediaciones aplicadas

### 1. Build Tauri estatico

Problema inicial: `TAURI_BUILD=1 next build` fallaba por route handlers `app/backend/**` y luego por paginas dinamicas sin `generateStaticParams`.

Remediacion:

- Se eliminaron las route handlers proxy `app/backend/**` y `app/api/public/paises`.
- Se agregaron `apps/web/lib/api-url.ts` y `apps/web/lib/api-fetch.ts`.
- `useApi`, `auth-service`, wizard, paises, help bot, demo, CPE/GRE downloads, finanzas/RRHH y `TenantContext` usan API absoluta centralizada por `fetchApi`/`buildApiUrl`.
- Las paginas dinamicas bajo `[id]`/`[token]` se separaron en wrapper `page.tsx` + `ClientPage.tsx`; el wrapper exporta `generateStaticParams()` para static export.
- Los helpers E2E dejaron de depender de `/backend`; usan `E2E_API_ORIGIN`/`NEXT_PUBLIC_API_URL` y si hacen login por API siembran el snapshot de sesion del frontend.

Evidencia:

- `pnpm --filter @erp-suite/web run build:tauri`: OK, 110 rutas generadas.
- `pnpm --filter @erp-suite/web run tauri:build -- --debug`: OK; genera ejecutable debug, MSI y NSIS.

### 2. Scripts y configuracion Tauri

Remediacion:

- `apps/web/package.json` agrega `build:tauri`.
- `desktop:build` delega en `tauri build`.
- `apps/web/next.config.js` activa `output: 'export'` cuando el lifecycle es `build:tauri`.
- `apps/web/src-tauri/tauri.conf.json` usa `beforeBuildCommand: "pnpm run build:tauri"`.
- CSP Tauri permite localhost y `https:` para conectar al API real. En produccion se recomienda restringir a dominios finales.

### 3. Comandos y plugins nativos

Problema inicial: `useTauri.ts` invocaba comandos no registrados y plugins no declarados.

Remediacion:

- `apps/web/src-tauri/src/lib.rs` registra `load_config`, `save_config`, `get_printers`, `print_document`, `sign_xml`, `send_to_sunat`, `generate_pdf`, `backup_database`, `export_sire_data`.
- Los comandos fiscales/offline devuelven error explicito: la operacion autoritativa se ejecuta en backend API.
- Se registran plugins `dialog`, `fs`, `notification`, `shell` y `log`.
- `capabilities/default.json` concede permisos default para esos plugins.
- `Cargo.toml` agrega `tauri-plugin-notification` y `uuid`.

### 4. Fiscal/PDF/offline

Estado vigente:

- Firma XML, envio SUNAT/OSE, PDF fiscal, SIRE y backups autoritativos se ejecutan en backend API.
- `database.rs`, `crypto.rs`, `sunat.rs` y `pdf.rs` quedan como prototipos legacy no conectados.
- `printer.rs` si queda conectado para impresoras/PDF local.
- Soporte offline operativo aplicado:
  - `apps/web/lib/offline-store.ts` maneja cache de lecturas JSON/text, outbox local y sincronizacion.
  - `apps/web/lib/api-fetch.ts` y `apps/web/hooks/use-api.ts` usan el soporte offline.
- `apps/web/src-tauri/src/lib.rs` persiste `offline_outbox.json` y expone comandos de cola/status.
- `/dashboard/offline` permite revisar, eliminar y reintentar operaciones locales.
- `OfflineStatusBadge` muestra estado de conexion y pendientes en el dashboard.
- `pnpm --filter @erp-suite/web run test:offline` cubre cache de lectura, cola de escritura, sincronizacion exitosa y fallo persistido.
- Restriccion vigente: no hay una segunda BD transaccional completa ni reconciliacion compleja local; correlativos, reglas fiscales, CDR y conflictos de negocio siguen resolviendose en backend al sincronizar.

Hardening adicional aplicado:

- `offline_mode` ahora fuerza continuidad local: las lecturas usan cache y las escrituras serializables entran directo a la cola sin intentar red.
- El cache de lecturas tiene limite de cuerpo y no rompe una respuesta online exitosa si `localStorage` falla por cuota.
- La sincronizacion usa el `endpoint` guardado para reconstruir la URL con `NEXT_PUBLIC_API_URL` vigente, evitando reintentos contra un origen viejo.
- Las operaciones Rust sobre `offline_outbox.json` quedan protegidas por lock de proceso y escritura por reemplazo para reducir carreras/corrupcion local.

### 5. Navegacion desktop/sidebar

Problema detectado: el sidebar prefetcheaba todas las rutas visibles durante idle. En desktop esto generaba un pico inicial innecesario de chunks/red al cambiar entre modulos.

Remediacion:

- Se mantiene prefetch por hover/focus para navegacion inmediata.
- El prefetch inicial queda limitado a las primeras rutas visibles y se escalona con pequenos timers para evitar bloquear el arranque o saturar el WebView.

## Verificaciones

- `pnpm --filter @erp-suite/web type-check`: OK.
- `pnpm --filter @erp-suite/web run test:offline`: OK.
- `pnpm --filter @erp-suite/web run build:tauri`: OK.
- `cargo check` en `apps/web/src-tauri`: OK, con warnings de funciones raw/thermal no usadas.
- `pnpm --filter @erp-suite/web run tauri:build -- --debug`: OK.
- `git diff --check`: OK.
- Verificacion adicional final: 108 paginas App Router no-API renderizan desde `out/` con API simulada sin 404, errores de chunks ni consola fatal. Incluye `/dashboard/offline` y rutas principales de web/desktop.

## Pendientes reales

- Definir dominios finales y restringir CSP `connect-src` de `https:` amplio a hostnames productivos.
- Configurar `ALLOWED_ORIGINS` del backend para el origen Tauri/WebView y dominio web final.
- Validar login, dashboard, CPE/PDF, POS ticket, GRE, finanzas y cola offline desde el ejecutable desktop contra API real.
- Decidir si se necesita paridad total de deep links dinamicos con refresh/acceso directo. Si si, elegir entre URL web remota, sidecar Next o redisenar rutas dinamicas para static export.
- Si se requiere offline transaccional profundo por vertical, agregar schema local versionado por dominio y reglas explicitas de reconciliacion.
