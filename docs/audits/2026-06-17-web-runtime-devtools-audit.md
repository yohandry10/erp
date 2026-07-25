# Auditoria runtime web y DevTools - 2026-06-17

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `apps/web/README-DESKTOP.md`, `docs/security/session-auth.md`, `docs/audits/2026-06-01-desktop-offline-closure.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha: 2026-06-17

## Alcance

Auditoria segura de `apps/web` con servidor local `http://localhost:3001` y navegador integrado. En el primer pase no se ejecuto login, no se pulso "Acceso Demo", no se enviaron mutaciones y no se tocaron credenciales.

El backend local `http://localhost:3002` no estaba escuchando durante la prueba. Por eso la carga de paises en login uso su fallback local esperado.

Segundo pase del mismo dia: se levanto `apps/erp-api` local en `http://localhost:3002`, con `NODE_ENV=development`, SUNAT en `homologacion`, sin secretos GRE REST, sin PFX, sin envio fiscal y con crons de POS/outbox/contabilidad deshabilitados para smoke. Se intento login real con las credenciales de test configuradas sin imprimirlas. No se ejecuto "Acceso Demo" ni se crearon usuarios/tenants.

Tercer pase del mismo dia: se revalido el estado local despues de revisar criterio SUNAT/GRE. No se envio XML a SUNAT, no se ejecuto login demo y no se crearon datos. Se corrigieron defaults de GRE automatica y evidencia de firma XML offline.

Cuarto pase del mismo dia: se revalido auth local. El navegador integrado pudo cargar login y rutas protegidas, pero sus metodos de escritura (`fill`/`type`/DOM type) fallaron por falta de clipboard virtual del propio navegador integrado, y CDP quedo pausado para input. Por eso el submit del formulario se valido por contrato HTTP local, no con credenciales reales ni con sesion simulada.

Quinto pase del mismo dia: se revalido el entorno local despues del ajuste de precedencia `.env.local`, criterio contable/SUNAT y UI POS/GRE. No se ejecuto login real, no se uso "Acceso Demo", no se enviaron CPE/GRE a SUNAT y no se dispararon mutaciones de negocio.

Sexto pase del mismo dia: se revalido la regla SUNAT de boleta mayor a S/ 700 contra fuentes oficiales y se corrigio el mensaje/validacion que la describia como GRE automatica. Se probo el frontend local con navegador integrado en modo lectura y con credenciales ficticias; no se creo tenant demo, no se envio CPE/GRE y no se transmitieron credenciales reales.

Septimo pase del mismo dia: se intento ejecutar la matriz de login por roles y la puerta superadmin/RBAC/RLS contra `http://localhost:3001` + `http://localhost:3002`. No se crearon usuarios ni tenants porque ambos specs quedaron bloqueados en `global-setup.ts` antes del primer caso por `POST /api/auth/login` con `HTTP 503`.

Octavo pase del mismo dia: se reanudo la validacion autenticada con tenant demo local controlado y usuarios operativos por rol. No se ejecutaron ventas, cobros, CPE, GRE ni escrituras de negocio; la prueba fue navegacion de lectura, validacion de permisos, consola y red por rol.

Noveno pase, ejecutado con navegador integrado visible y usuario `ADMIN` del tenant QA `c0af84b5-5ea6-44a9-9e6e-a869f119b013`: se recorrio el dashboard y 55 rutas adicionales de modulos/submodulos reales con DevTools/CDP (`Network`, `Runtime`, `Log`) y consola del navegador. No se ejecutaron mutaciones de negocio, no se abrieron/cerraron cajas, no se crearon ventas, cobros, pagos, CPE, GRE ni envios SUNAT. La revision fue de navegacion/lectura, carga visual y errores de runtime/red.

## Resultado

- `/login/` carga con titulo correcto `ERP Suite - Sistema Tributario Peruano`.
- `/dashboard/` sin sesion redirige a `/login/?redirect=%2Fdashboard%2F`.
- Matriz de rutas protegidas sin sesion: `/dashboard`, POS, ventas/clientes, compras/proveedores, inventario, CPE, GRE, SIRE, finanzas/CxP, RRHH, contabilidad, configuracion y wizard redirigen 13/13 a login con pantalla no vacia y sin `warn/error` nuevos de consola.
- En viewport movil `390x844`, el card de login entra completo y los controles principales quedan dentro del viewport.
- El fallback de paises ya no genera `console.warn`; en desarrollo deja solo `console.info` acotado.
- `TicketPrint.tsx` mantiene `<img>` de forma explicita porque la impresion termica clona HTML a una ventana nueva y usa QR/logo dinamicos o `data:` URLs; `next/image` no aplica en ese documento impreso.
- Bloqueo externo actual: los hosts Supabase configurados (`hbueraexcbowpfnjlppi`, `wypnbcptofqdmoynlonq`, `ifivjoflcplenrgiyrmz`) no resuelven DNS desde esta maquina. Por eso no se pudo validar usuario/tenant real ni navegar modulos autenticados con backend real.
- Antes del ajuste, login UI mostraba "Credenciales invalidas" ante indisponibilidad de Supabase. Esto ocultaba una falla de infraestructura como error humano. Se corrigio para devolver y mostrar `Servicio de autenticacion temporalmente no disponible`.
- El navegador integrado bloqueo explicitamente URLs `javascript:`; no se intento bypass con CDP ni superficies alternas para simular cookie/sesion. La prueba autenticada real queda pendiente hasta tener Supabase/local auth operativo.
- El bloqueo anterior de auth `503` ya no aplica para esta auditoria local: se creo/uso tenant demo de QA y se pudo autenticar cada rol operativo con backend local.
- Matriz API por rol: 9 roles operativos autenticaron con rol correcto; cada endpoint permitido respondio `200` y cada endpoint fuera de alcance respondio `403`. `ADMIN_DEMO` queda sin `users.manage`; `ADMIN` conserva `/users`.
- Matriz UI por rol: 11/11 perfiles navegaron su ruta esperada sin `403`, sin `console.error/warning` y sin `pageerror`. Artefacto: `docs/audits/artifacts/web-runtime-roles/role-ui-playwright-2026-06-17T21-41-38-834Z.json`.
- Navegador integrado visible con `ADMIN`: 56/56 rutas de modulos/submodulos cargaron sin redireccion a login, sin texto de permiso denegado, sin `404`, sin `console.warn/error`, sin `Network.loadingFailed` y sin respuestas HTTP `>=400` relevantes en CDP. Se revisaron Core, POS/Cajas, Ventas, Compras, Inventario, Documentos, CPE/GRE/SIRE, Analytics, Finanzas, Contabilidad, RRHH, Usuarios, Configuracion, Wizard, Offline, Auditoria y Ayuda. Artefacto: `docs/audits/artifacts/web-runtime-admin-visible/admin-visible-cdp-2026-06-18T01-12-16-797Z.json`.
- En esa corrida visible se detectaron 44 textos `Cargando...` en lectura temprana; 32 se estabilizaron con espera corta y las 12 rutas lentas restantes se revalidaron con espera larga. Ninguna quedo con loader persistente; ejemplos cerrados: POS termino en `CAJA CERRADA`, CxC en empty state operativo, Tesoreria en centro de saldos, Monitoreo contable en KPIs/cola, Usuarios en tabla de 11 usuarios y Wizard en paso 1/8.

## Cambios aplicados

- `apps/web/hooks/use-paises.ts`: el fallo de conexion al cargar paises mantiene `error` y fallback local, pero baja el ruido de consola de `warn` a `info` solo en desarrollo.
- `apps/web/components/pos/TicketPrint.tsx`: se agrego una excepcion local de ESLint para `@next/next/no-img-element` con justificacion tecnica del flujo de impresion.
- `apps/erp-api/src/modules/auth/auth.service.ts`: distingue `PGRST116`/usuario inexistente de errores de red Supabase y propaga `ServiceUnavailableException` cuando auth no esta disponible.
- `apps/erp-api/src/modules/auth/auth.controller.ts`: documenta `503` en `POST /api/auth/login`.
- `apps/erp-api/src/modules/auth/auth.service.spec.ts`: agrega cobertura para Supabase inaccesible durante `validateUser`.
- `apps/web/app/login/page.tsx`: baja el fallo controlado de login a `console.info` en desarrollo y conserva el toast visible.
- `apps/web/lib/auth-service.ts`: el cliente web mapea errores por `status` y payload; `503` sin cuerpo o con cuerpo JSON se muestra como `Servicio de autenticacion temporalmente no disponible`, no como credenciales invalidas/error generico.
- `apps/erp-api/src/modules/gre/gre.service.ts`: GRE automatica queda fail-closed si falta configuracion explicita del tenant y rechaza crear una guia desde venta cuando faltan datos reales de traslado; se eliminaron placeholders como direccion/transportista por definir.
- `apps/erp-api/src/modules/configuracion/configuration.service.ts`: el wizard/configuracion ya no deja GRE automatica activada por omision.
- `apps/erp-api/src/modules/ventas/pedidos/gre-integration.service.ts` y `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts`: sugerencia GRE automatica queda opt-in, no default silencioso.
- `apps/erp-api/src/modules/ose/ose.service.ts`: `signXmlOnly` registra el modo real del certificado (`real`/`demo`) sin exponer secretos ni afirmar siempre `DEMO MODE`.
- Pruebas agregadas en `gre.service.spec.ts`, `gre-integration.service.spec.ts` y `ose.service.spec.ts` para bloquear regresiones de esos casos.
- `apps/erp-api/src/config/env-files.ts` y `apps/erp-api/src/app.module.ts`: `.env.local` queda antes de `.env` para que el entorno local/DEV pueda sobreescribir los valores base sin tocar archivos productivos.
- `apps/erp-api/src/config/env-files.spec.ts`: cobertura de regresion para la precedencia de archivos `.env`.
- `apps/web/app/dashboard/pos/page.tsx`: GRE automatica queda deshabilitada por defecto en UI y solo se activa si el tenant la devuelve explicitamente; la advertencia de boleta mayor a S/ 700 ya no promete generar GRE.
- `apps/web/app/dashboard/wizard/WizardContext.tsx` y `apps/web/hooks/use-empresa-config.tsx`: defaults de GRE automatica alineados a fail-closed.
- `apps/web/app/dashboard/audit-logs/page.tsx`: auditoria ya no queda hardcodeada a superadmin; acepta SuperAdmin o permiso `security.audit.read`.
- `apps/web/components/layout/sidebar.tsx`: el item Auditoria usa permiso `security.audit.read` y los items padre con permisos pasan por `PermissionMenuItem`, evitando sobreexposicion de modulos en roles como ALMACEN.
- `apps/web/components/audit/AuditLogsViewer.tsx`: el filtro de usuarios solo consulta `/api/users` cuando el usuario tiene `users.manage`; AUDITOR no dispara `403` para cargar su pagina.
- `apps/web/lib/auth-service.ts`: `signOut()` envia Bearer cuando hay access token para cerrar la sesion backend correcta en modo token.
- `apps/web/app/dashboard/finanzas/cxc/page.tsx`: el filtro Cliente ya no llama `/ventas/clientes` si el rol no tiene permiso de ventas; FINANZAS deriva opciones desde las CxC visibles y queda sin `403`.
- `apps/erp-api/src/modules/configuracion/configuration.controller.ts`: `GET /configuration/gre-thresholds` se expone con permiso `pos.read` para lectura operativa del POS; `PUT` mantiene `configuracion.write`.
- `apps/web/app/dashboard/pos/page.tsx`: el aviso de configuracion fiscal incompleta deja de ser `console.warn` operativo; la senal queda en UI y `console.info` solo en desarrollo.

## Verificacion

```powershell
pnpm --filter @erp-suite/web run lint
pnpm --filter @erp-suite/web run type-check
pnpm --filter @erp-suite/erp-api type-check
pnpm --filter @erp-suite/erp-api exec jest src/config/env-files.spec.ts --runInBand
cd apps/erp-api; pnpm exec jest src/modules/auth/auth.service.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api exec jest src/modules/gre/gre.service.spec.ts src/modules/ventas/pedidos/gre-integration.service.spec.ts src/modules/ose/ose.service.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api run type-check
pnpm --filter @erp-suite/web run type-check
curl -i -X POST http://localhost:3002/api/auth/login/ -H "Content-Type: application/json" --data-binary "@$env:TEMP/erp-login-body.json"
git diff --check
```

Resultado:

- Lint web: OK, sin warnings ni errores.
- Type-check web: OK.
- Type-check backend: OK.
- Jest env files: OK, 2/2 tests.
- Jest auth focal: OK, 42/42 tests.
- Jest SUNAT/GRE/OSE focal: OK, 27/27 tests.
- `git diff --check`: OK.
- Navegador integrado: login y redireccion protegida OK; responsive movil sin controles fuera de viewport.
- Navegador integrado segundo pase: login real devuelve mensaje de servicio no disponible; no queda `console.error` fatal por auth controlada; matriz de rutas protegidas sin sesion OK 13/13.
- Navegador integrado tercer pase filtrado por timestamp: `/login/` no vacio, controles de correo/clave/pais habilitados, matriz protegida OK 13/13 y `warn/error` frescos 0.
- Navegador integrado post-ajuste auth-service: `/login/` mantiene input correo/clave, matriz protegida OK 13/13 y `warn/error` frescos 0.
- API local: `GET /api/health/live` responde 200; `GET /api/health/ready` responde 503 por dependencia Supabase.
- Auth HTTP local con credenciales ficticias: `POST /api/auth/login/` responde `503` JSON con `Servicio de autenticacion temporalmente no disponible`; no se uso clave real ni se creo sesion.
- Diagnostico DNS local: `Resolve-DnsName`, `Test-NetConnection` y `curl` no resuelven `wypnbcptofqdmoynlonq.supabase.co` ni `hbueraexcbowpfnjlppi.supabase.co`; `google.com` si resuelve. La prueba autenticada con tenant normal queda bloqueada por infraestructura/DNS del proyecto Supabase, no por UI.
- Navegador integrado quinto pase: `/login` carga; `/dashboard`, `/dashboard/pos`, `/dashboard/cpe`, `/dashboard/gre`, `/dashboard/contabilidad`, `/dashboard/rrhh/planillas`, `/dashboard/finanzas/tesoreria` y `/dashboard/wizard` redirigen a `/login/?redirect=...` sin sesion, con `warn/error` de consola 0.
- Responsive login quinto pase: `390x844` y `1366x768` sin overflow horizontal y `warn/error` 0.
- Config local API: `apps/erp-api/src/app.module.ts` ya usa `apiEnvFilePath` con precedencia `apps/erp-api/.env.local`, `.env.local`, `apps/erp-api/.env`, `.env`; esto cierra el riesgo documentado de que el backend local ignore `.env.local` y apunte a `.env` por accidente.
- La regla boleta mayor a S/ 700 queda alineada: exige consignar identificacion del adquirente/usuario, no generar GRE por monto. Fuentes SUNAT revisadas: `https://www.sunat.gob.pe/legislacion/comprob/regla/capituloIII.pdf`, `https://orientacion.sunat.gob.pe/01-preguntas-frecuentes-comprobantes-de-pago`, `https://orientacion.sunat.gob.pe/03-boleta-de-venta`.
- Navegador integrado sexto pase: `/login/` carga; `/demo/` carga sin pulsar creacion; `/dashboard`, `/dashboard/pos`, `/dashboard/ventas`, `/dashboard/cpe`, `/dashboard/gre`, `/dashboard/contabilidad` y `/dashboard/rrhh` redirigen a `/login/?redirect=...` sin sesion y sin `warn/error` de consola.
- Login sexto pase: con API `ready` en `503`, el selector de pais cae al fallback local Peru/Colombia despues del timeout y mantiene la pantalla operable. El intento con credenciales ficticias no redirige ni deja errores fatales; la prueba autenticada real queda bloqueada por infraestructura.
- Backend fiscal focal: `sunat-fiscal.service.spec.ts` OK, 6/6 tests, incluyendo regresion de factura menor a S/ 700 sin advertencia falsa y boleta mayor a S/ 700 con identificacion obligatoria sin GRE.
- RBAC/auth focal backend: `permission.service.spec.ts` OK 11/11; `auth.service.spec.ts`, `jwt.strategy.spec.ts`, `permission.guard.spec.ts` y `tenant-management.service.spec.ts` OK 66/66. Esto valida la logica local de permisos, guardias, JWT y seed de roles, pero no reemplaza login real por rol.
- E2E por roles bloqueado por infraestructura: `roles-operativos.spec.ts` falla en `global-setup.ts:214` con `E2E auth setup failed with HTTP 503: Servicio de autenticacion temporalmente no disponible`; `superadmin-tenant-rbac-rls.spec.ts` falla igual. No se alcanzo ningun assert de rol.
- API local durante RBAC: `GET /api/health/live` responde 200; `GET /api/health/ready` responde 503; `POST /api/auth/login` responde 503. DNS general funciona (`google.com` resuelve), pero `wypnbcptofqdmoynlonq.supabase.co` y `hbueraexcbowpfnjlppi.supabase.co` no resuelven desde esta maquina. La CLI Supabase local existe, pero `projects list` devolvio `504`.
- Matriz API autenticada por rol reanudada: GERENCIA, COMPRAS, ALMACEN, VENDEDOR, CAJERO, FINANZAS, CONTADOR, RRHH y AUDITOR pasan endpoint permitido `200` y endpoint denegado `403`; ADMIN_DEMO no puede `/users`; ADMIN si puede `/users`.
- Matriz UI autenticada por rol: `ADMIN_DEMO`, `ADMIN`, `ALMACEN`, `AUDITOR`, `CAJERO`, `COMPRAS`, `CONTADOR`, `FINANZAS`, `GERENCIA`, `RRHH`, `VENDEDOR` pasan 11/11 contra `http://localhost:3001` + `http://localhost:3002`, sin errores DevTools ni respuestas API `>=400`. Artefacto final: `docs/audits/artifacts/web-runtime-roles/role-ui-playwright-2026-06-17T21-41-38-834Z.json`.
- Navegador integrado: `/dashboard/pos/` autenticado carga hasta `CAJA CERRADA`, muestra `Abrir Caja Registradora`, no muestra permisos denegados y `tab.dev.logs` devuelve 0 `warn/error`.
- Navegador integrado visible con `ADMIN`: 56/56 rutas OK. CDP habilitado (`Network`, `Runtime`, `Log`), consola `warn/error` 0, respuestas HTTP `>=400` relevantes 0, `Network.loadingFailed` 0. Revalidacion de loaders: 44 rutas con texto de carga temprano, 32 se asentaron con espera corta, 12 con espera larga, 0 loaders persistentes. Artefacto sanitizado: `docs/audits/artifacts/web-runtime-admin-visible/admin-visible-cdp-2026-06-18T01-12-16-797Z.json`.

## Riesgos residuales

- No se ejecutaron flujos de escritura de negocio en esta auditoria de roles para no crear ventas, CPE, GRE, cobros, pagos ni asientos de prueba.
- La matriz cubre navegacion y autorizacion por rol con tenant demo local; no sustituye smoke productivo con datos reales, carga, impresora fisica ni emision SUNAT/OSE.
- `next lint` esta deprecado y debera migrarse a ESLint CLI antes de Next.js 16.
- La validacion completa de dashboard/POS/CPE/GRE sigue requiriendo backend activo, credenciales de prueba autorizadas y suite E2E/smoke controlada segun `docs/release/GO_LIVE_RUNBOOK.md`.
