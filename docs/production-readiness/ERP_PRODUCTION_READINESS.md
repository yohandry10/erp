# ERP Production Readiness

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `readiness`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de corte: 2026-05-16
Estado real: `validado tecnicamente en sandbox/local`
Decision: no declarar produccion real absoluta hasta cargar certificado/secretos productivos y repetir smoke final contra esas credenciales.

> Nota 2026-05-24: este documento sigue siendo la referencia del Gate 21/22, pero no representa por si solo el head actual del worktree. Despues del corte existen auditorias forenses de contabilidad, inventario/logistica/costeo y tesoreria/caja/bancos/CxC/CxP, mas migraciones `327..335`. La duplicidad local de prefijo `333__` quedo resuelta renumerando tesoreria a `334__treasury_cash_bank_forensic_closure.sql`; `335__descontar_stock_authoritative.sql` ajusta la salida autoritativa de inventario.

## Resumen Ejecutivo

El ERP fue validado funcionalmente en entorno local/sandbox con:

- API productiva local en `http://localhost:3002`.
- Web productiva local en `http://localhost:3003`.
- Redis real en `127.0.0.1:6379`.
- E2E por verticales criticos.
- Smoke global por tramos `146/146`.
- API tests completos `104` suites / `933` tests.
- Roles operativos diarios sembrados y validados con usuarios reales.
- Onboarding multi-tenant validado: superadmin crea tenants nuevos, RBAC operativo limpio, admins iniciales loguean y RLS impide lectura cruzada por API.

No quedan bloqueos funcionales locales conocidos despues de las correcciones registradas en este documento. Las migraciones que estaban pendientes fueron aplicadas manualmente en Supabase remoto el 2026-05-16 con `psql`. Los pendientes restantes son de salida productiva externa: certificado SUNAT/OSE real, secretos productivos y proveedor real de email si se usa correo.

## Estado De Alta

| Area | Estado | Evidencia |
|---|---|---|
| Configuracion/admin | Validado | `configuracion-operativa.spec.ts` OK |
| Usuarios/permisos/auditoria config | Validado | `usuarios-permisos-auditoria-config.spec.ts` OK |
| Roles diarios RBAC | Validado | `roles-operativos.spec.ts` OK |
| Superadmin/tenants/RBAC/RLS | Validado | `superadmin-tenant-rbac-rls.spec.ts` OK |
| Compras | Validado | `compras-vertical.spec.ts` OK |
| Inventario/logistica | Validado | `inventario-logistica.spec.ts` OK |
| Ventas B2B | Validado | `ventas-vertical.spec.ts` OK |
| POS/caja | Validado | `pos-vertical.spec.ts` OK |
| Finanzas/CxC/CxP/bancos/conciliacion | Validado | `finanzas-completo.spec.ts` OK |
| Contabilidad | Validado | `contabilidad-completo.spec.ts` OK despues de correccion de locks |
| CPE | Validado en sandbox | `cpe-completo.spec.ts` OK; pendiente certificado real para produccion SUNAT |
| GRE | Validado en sandbox | `gre-completo.spec.ts` OK; pendiente certificado real para produccion SUNAT/OSE |
| SIRE | Validado en sandbox | `sire-completo.spec.ts` OK |
| RRHH | Validado | `rrhh-completo.spec.ts` OK |
| Dashboard/Analytics | Validado | `analytics-dashboard.spec.ts` OK; CSV real probado |
| Auditoria | Validado | `auditoria-real.spec.ts` OK |
| Smoke UI global | Validado | `full-ui-smoke.spec.ts` por tramos, total `146/146` |
| Backend gates | Validado | type-check/build/API tests OK |
| Frontend gates | Validado | type-check/build OK |

## Correcciones Relevantes Hechas

### Contabilidad

Problema real detectado: eventos contables podian quedar en `dead_letter` por advisory locks de sesion usados via PostgREST/Supabase.

Correccion:

- `apps/erp-api/src/modules/contabilidad/services/asientos-generator.service.ts`
- Se elimino dependencia de `acquire_pos_lock` / `release_pos_lock` para eventos y numeracion contable.
- La proteccion queda en idempotencia por `source_event_id`, reconsulta por documento origen y numeracion transaccional de base de datos.
- Test endurecido en `apps/erp-api/src/modules/contabilidad/services/asientos-generator.service.spec.ts`.

Validacion:

- `pnpm --filter @erp-suite/erp-api run test -- asientos-generator.service.spec.ts --runInBand`: OK, `41/41`.
- `pnpm --filter @erp-suite/erp-api run type-check`: OK.
- `pnpm --filter @erp-suite/erp-api run build`: OK.
- `contabilidad-completo.spec.ts`: OK tras correccion.

### Smoke Global

Problema real detectado: el smoke podia caer en `/login` por sesion expirada y generar falsos negativos o validar una pantalla incorrecta.

Correccion:

- `apps/web/tests/e2e/full-ui-smoke.spec.ts`
- Cada prueba autentica con `login(page)` antes de navegar a la ruta protegida.
- Los comandos cortados por timeout no se contaron como verdes.

Validacion:

- Tramos contados:
  - `0..1`: OK `2/2`.
  - `1..6`: OK `10/10`.
  - `6..16`: OK `20/20`.
  - `16..31`: OK `30/30` despues de corregir auth por prueba.
  - `31..49`: OK `36/36`.
  - `49..73`: OK `48/48`.
- Total: `146/146`.

### RBAC Operativo

Problema real detectado: la base tenia `ADMIN` y roles QA restringidos, pero no roles diarios reales. La tabla `permisos` estaba vacia antes del seed operativo.

Correccion:

- Se sembraron `195` permisos derivados de `@RequirePermission(...)`.
- Se crearon roles operativos:
  - `GERENCIA`
  - `COMPRAS`
  - `ALMACEN`
  - `VENDEDOR`
  - `CAJERO`
  - `FINANZAS`
  - `CONTADOR`
  - `RRHH`
  - `AUDITOR`
- Se crearon `466` vinculos `rol_permisos`.
- Se corrigio `RRHH`: no debe heredar `finanzas.read`, porque eso permitia leer saldos bancarios.

Archivos:

- `apps/web/tests/e2e/roles-operativos.spec.ts`
- `supabase/migrations/320__rbac_operational_roles_seed.sql`

Validacion:

- `roles-operativos.spec.ts`: OK, `1/1` en `2.5m`.
- El test crea usuario real por rol, inicia sesion con password real, valida ruta permitida y valida `403` en ruta ajena.
- `pnpm --filter @erp-suite/web run type-check`: OK.

Estado de roles actual:

| Rol | Permisos |
|---|---:|
| ADMIN | 195 |
| CONTADOR | 64 |
| VENDEDOR | 51 |
| CAJERO | 35 |
| COMPRAS | 33 |
| ALMACEN | 23 |
| FINANZAS | 23 |
| GERENCIA | 20 |
| AUDITOR | 18 |
| RRHH | 3 |

### Gate 21: Superadmin, Tenants, RBAC y RLS

Problemas reales detectados:

- `TenantManagementService.createTenant` intentaba crear `empresa_config` antes de crear el registro canonico en `tenants`, pero varias tablas runtime tienen FK a `tenants(id)`.
- El seed inicial de RBAC para tenants nuevos dependia de un `TEMPLATE_TENANT_ID` hardcodeado y no garantizaba roles operativos completos para futuros clientes.
- La primera funcion de seed quedo en schema `app`; Supabase RPC/PostgREST buscaba el wrapper en `public`.
- El seed copiaba roles historicos QA del tenant fuente; un tenant nuevo podia nacer con roles operativos mas roles basura.

Correccion:

- `apps/erp-api/src/modules/tenants/tenant-management.service.ts`
  - Crea primero `public.tenants`.
  - Crea despues `empresa_config`.
  - Ejecuta `seed_operational_rbac_for_tenant`.
  - Crea el admin inicial usando el rol `ADMIN` del tenant nuevo.
  - Hace rollback por cascada desde `tenants` si falla onboarding.
- `supabase/migrations/322__tenant_creation_operational_rbac_seed.sql`
  - Agrega helper `app.seed_operational_rbac_for_tenant`.
- `supabase/migrations/323__tenant_creation_operational_rbac_public_rpc.sql`
  - Agrega wrapper `public.seed_operational_rbac_for_tenant` para Supabase RPC.
- `supabase/migrations/324__tenant_creation_operational_rbac_role_whitelist.sql`
  - Restringe el seed a los 10 roles operativos oficiales.
- `supabase/migrations/325__tenant_creation_rbac_rpc_execute_hardening.sql`
  - Revoca ejecucion del seed RBAC a `PUBLIC`, `anon` y `authenticated`; mantiene ejecucion solo para `service_role`.
- `supabase/migrations/326__outbox_accounting_event_id_reconciliation.sql`
  - Reconcilia `dead_letter` historicos mal clasificados por el listener contable anterior y reencola planilla contra el contrato contable corregido.
- `apps/web/tests/e2e/superadmin-tenant-rbac-rls.spec.ts`
  - E2E real del gate multi-tenant.

Validacion manual/API:

- Superadmin activo unico: `admin@erp.local`.
- Password normalizado con bcrypt a la credencial operativa indicada, sin exponer secreto.
- Login real superadmin: OK, `is_super_admin=true`.
- Tenant A fresco `QA Tenant Gate21 20260516074001 SAC`:
  - Admin inicial login OK.
  - Roles: `10`.
  - Permisos: `195`.
  - `rol_permisos`: `465`.
  - Roles exactos: `ADMIN`, `GERENCIA`, `COMPRAS`, `ALMACEN`, `VENDEDOR`, `CAJERO`, `FINANZAS`, `CONTADOR`, `RRHH`, `AUDITOR`.
- Tenant B fresco creado para aislamiento RLS.
- API RLS:
  - Admin A lee cliente A: `200`.
  - Admin A lee cliente B por ID directo: `404`.
  - Admin B lee cliente B: `200`.
  - Admin B lee cliente A por ID directo: `404`.
  - Admin A/B listando `/api/tenants`: `403`.
  - Superadmin listando `/api/tenants`: `200`.
- Seed RBAC:
  - Reejecutar seed sobre tenant Gate21 no duplica roles/permisos.
  - Conteos permanecen en `roles=10`, `permisos=195`, `rol_permisos=465`.
  - `RRHH` permanece sin `finanzas.read`.
- RPC seed:
  - `anon`: sin permiso de ejecucion.
  - `authenticated`: sin permiso de ejecucion.
  - `service_role`: con permiso de ejecucion.
- Tenant C fresco:
  - Nace con `10` roles operativos.
  - Admin inicial login OK.
  - Usuario `VENDEDOR` login OK.
  - Ruta permitida `ventas/clientes`: `200`.
  - Ruta ajena `compras/proveedores`: `403`.

Validacion automatizada:

- `pnpm --filter @erp-suite/erp-api run test -- tenant-management.service.spec.ts --runInBand`: OK, `17/17`.
- `pnpm --filter @erp-suite/erp-api run type-check`: OK.
- `pnpm --filter @erp-suite/erp-api run build`: OK.
- `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:3003 E2E_API_ORIGIN=http://localhost:3002 pnpm --dir apps/web exec playwright test tests/e2e/superadmin-tenant-rbac-rls.spec.ts --project=chromium --workers=1`: OK, `1/1`.
- `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:3003 E2E_API_ORIGIN=http://localhost:3002 pnpm --dir apps/web exec playwright test tests/e2e/superadmin-tenant-rbac-rls.spec.ts tests/e2e/roles-operativos.spec.ts tests/e2e/usuarios-permisos-auditoria-config.spec.ts tests/e2e/auth-session-country-wizard.spec.ts --workers=1`: OK, `7/7` en `7.0m`.

Nota operativa:

- Durante la creacion del admin inicial se registro `SMTP ECONNREFUSED ::1:587`; no bloqueo el flujo porque el envio de email esta tratado como pendiente externo de produccion si se requiere proveedor real.
- API local se levanto con `EMAIL_DISABLED=true` solo para sandbox/local; produccion requiere proveedor SMTP/SES/SendGrid si se enviaran correos.

### Gate 22: Micro-gate final post-Gate21

Motivo:

- GPT Pro pidio no repetir las 20 tareas, sino cerrar riesgos laterales generados por el cambio de onboarding multi-tenant/RBAC/RLS.

Correcciones adicionales:

- `ContabilidadEventsListener` ahora usa `outbox_events.event_id` como ID canonico de idempotencia contable. Antes algunos handlers preferian `payload.eventId`, lo que podia romper la verificacion si el payload y el outbox tenian IDs distintos.
- `supabase/migrations/326__outbox_accounting_event_id_reconciliation.sql` saneo eventos historicos:
  - `336` eventos operativos mal clasificados como `dead_letter` pasaron a `completed`.
  - `1` CxC historica con asiento balanceado fue reconciliada al `event_id` canonico del outbox.
  - `1` planilla historica fue reencolada y el cron contable la proceso con el codigo corregido.

Estado verificado:

- `outbox_events`: `2722` eventos `completed`.
- `outbox_events` recientes con `dead_letter`, `failed`, `pending` o `processing`: `0`.
- Redis: `PONG`.
- API log local: sin `statusCode:500`, `HTTP 500`, `Unhandled`, `FATAL`, `dead_letter` ni `ECONNREFUSED` despues del reinicio validado.
- `REDIS_REQUIRED=true` usado en el proceso API local.
- `git diff --check`: OK.
- Migraciones `312..326`: sin prefijos duplicados al corte del 2026-05-16.
- `.env.local` y logs locales: ignorados por Git.
- GPT Pro acepto el cierre como `sandbox/local funcionalmente listo` y recomendo congelar funcionalidad salvo fallo en checks administrativos finales.

## Evidencia De Gates

### Backend

- `pnpm --filter @erp-suite/erp-api run type-check`: OK.
- `pnpm --filter @erp-suite/erp-api run build`: OK.
- `pnpm --filter @erp-suite/erp-api run test -- --runInBand`: OK, `104` suites / `934` tests.
- `pnpm --filter @erp-suite/erp-api run test -- asientos-generator.service.spec.ts --runInBand`: OK, `41/41`.
- `pnpm --filter @erp-suite/erp-api run test -- contabilidad-events.listener.spec.ts --runInBand`: OK, `21/21`.

### Frontend

- `pnpm --filter @erp-suite/web run type-check`: OK.
- `pnpm --filter @erp-suite/web run build`: OK, `89/89` rutas generadas.
- `pnpm --filter @erp-suite/web run type-check` despues de agregar RBAC E2E: OK.
- `superadmin-tenant-rbac-rls.spec.ts`: OK, ejecutado contra API `3002` y Web `3003` existentes.
- Paquete E2E critico post-Gate21: OK, `7/7` en `7.0m`.

### E2E Por Flujo

- `configuracion-operativa.spec.ts`: OK.
- `usuarios-permisos-auditoria-config.spec.ts`: OK.
- `roles-operativos.spec.ts`: OK.
- `superadmin-tenant-rbac-rls.spec.ts`: OK.
- `compras-vertical.spec.ts`: OK.
- `inventario-logistica.spec.ts`: OK.
- `ventas-vertical.spec.ts`: OK.
- `pos-vertical.spec.ts`: OK.
- `finanzas-completo.spec.ts`: OK.
- `contabilidad-completo.spec.ts`: OK.
- `cpe-completo.spec.ts`: OK.
- `gre-completo.spec.ts`: OK.
- `sire-completo.spec.ts`: OK.
- `rrhh-completo.spec.ts`: OK.
- `analytics-dashboard.spec.ts`: OK.
- `auditoria-real.spec.ts`: OK.
- `full-ui-smoke.spec.ts`: OK por tramos, total `146/146`.

## Criterio Anti-Falsos Positivos

No se cuenta como verde:

- Comando cortado por timeout.
- Test con `skip`, `describe.skip` u `.only`.
- Ruta que solo muestra layout sin validar contenido.
- Login o pantalla de acceso confundida con pagina protegida.
- `try/catch` que oculte fallo critico.
- Assert debil como unica prueba de exito.
- Backend simulado para reemplazar flujos principales.

Cada flujo critico debe validar al menos uno de:

- ID persistido.
- Estado persistido tras recarga o reconsulta.
- Cambio de monto o saldo.
- Cambio de stock o Kardex.
- Asiento contable balanceado.
- Registro de auditoria.
- Permiso real `401/403`.
- Impacto en modulo conectado.
- Outbox sin pendientes/dead letters inesperados.

## Pendientes Reales

### Migraciones Aplicadas En Supabase Remoto

Conexion usada:

- Pooler Supabase via `psql`.
- La cadena real esta en `.env.local`, ignorado por Git.
- La documentacion operativa esta en `docs/ops/supabase-connection.md`.

Aplicadas el 2026-05-16:

- `supabase/migrations/312__contabilidad_source_event_idempotency_hardening.sql`
- `supabase/migrations/313__contabilidad_asientos_numbering_sequence.sql`
- `supabase/migrations/314__contabilidad_asientos_numbering_trigger.sql`
- `supabase/migrations/315__contabilidad_numbering_serialization_strict_trigger.sql`
- `supabase/migrations/316__contabilidad_renumber_existing_duplicate_asientos.sql`
- `supabase/migrations/317__outbox_failed_completed_guard.sql`
- `supabase/migrations/318__outbox_completed_status_integrity_guard.sql`
- `supabase/migrations/319__rrhh_asistencia_sync_without_partial_on_conflict.sql`
- `supabase/migrations/320__rbac_operational_roles_seed.sql`
- `supabase/migrations/321__tesoreria_cxp_payment_idempotency.sql`
- `supabase/migrations/322__tenant_creation_operational_rbac_seed.sql`
- `supabase/migrations/323__tenant_creation_operational_rbac_public_rpc.sql`
- `supabase/migrations/324__tenant_creation_operational_rbac_role_whitelist.sql`
- `supabase/migrations/325__tenant_creation_rbac_rpc_execute_hardening.sql`
- `supabase/migrations/326__outbox_accounting_event_id_reconciliation.sql`

Nota: `321__tesoreria_cxp_payment_idempotency.sql` nacio como `307__tesoreria_cxp_payment_idempotency.sql`; se renombro para evitar conflicto con `307__runtime_accounting_inventory_purchase_accounts.sql`.

Verificacion posterior:

- `public.contabilidad_asientos_numeracion`: existe.
- `public.obtener_siguiente_numero_asiento(uuid,timestamptz)`: existe.
- `public.ux_movimientos_bancarios_tenant_idempotency_key_307`: existe.
- Roles operativos: `10`.
- Permisos RBAC: `195`.
- Funcion `app.seed_operational_rbac_for_tenant(uuid, uuid)`: existe.
- Funcion `public.seed_operational_rbac_for_tenant(uuid, uuid)`: existe para Supabase RPC.
- `public.seed_operational_rbac_for_tenant(uuid, uuid)`: no ejecutable por `anon` ni `authenticated`; ejecutable por `service_role`.
- `outbox_events`: sin `dead_letter`, `failed`, `pending` ni `processing` despues de reconciliacion.

Limitacion:

- La base remota no expuso `supabase_migrations.schema_migrations`; las migraciones se aplicaron directamente con `psql --set=ON_ERROR_STOP=1`.

### Pendientes Externos De Produccion

- Certificado digital SUNAT/OSE productivo.
- Secretos productivos finales.
- Proveedor real de email si el entorno productivo debe enviar correos.
- Smoke final contra credenciales productivas reales despues de cargar certificado/secretos.

### Pendiente Documental/Tecnico Posterior Al Corte

- Revisar `docs/CODEX_HANDOFF_2026-05-24.md` antes de continuar trabajo: la sesion posterior agrego cierre forense de tesoreria/caja/bancos/CxC/CxP y aplico una migracion `334__treasury_cash_bank_forensic_closure.sql` en la BD configurada por `.env.local`.
- Contrastar con `docs/auditoria_forense_inventario_logistica_costeo_2026-05.md`, que tambien documenta una migracion `333__inventory_stock_reconciliation_hardening.sql`.
- Verificar el rango `327..335` sin prefijos duplicados y revalidarlo con `psql --set=ON_ERROR_STOP=1` antes de usarlo como linea canonica.

### Gate 22 - Infraestructura Docker y Observabilidad

Ejecutado el 2026-05-16.

Cambios cerrados:

- `docker-compose.yml` queda como fuente canonica del stack local con Web, API, Worker, Redis, Prometheus, Grafana, Redis exporter y Node exporter.
- Puertos host parametrizados para convivir con procesos locales: Web `13001`, API `13002`, Worker `3050`, Redis `6381`, Prometheus `9091`, Grafana `3300`, Redis exporter `9122`, Node exporter `9101`.
- API Docker corregida para ejecutar `apps/erp-api/dist/main.js`, el artefacto real emitido por `nest build`.
- Worker expone `/health` y `/metrics`; Prometheus scrapea `worker:3050/metrics`.
- Prometheus consolidado en `monitoring/prometheus/prometheus.yml`, sin targets inexistentes ni `host.docker.internal` para servicios del mismo Compose network.
- Grafana provisiona datasource y dashboards desde rutas separadas: provisioning en `/etc/grafana/provisioning`, dashboards en `/var/lib/grafana/dashboards`.
- Dashboards antiguos de Grafana normalizados al formato de provisioning por archivo, con `title` en la raiz.
- `.dockerignore` endurecido para excluir `target`, `.next`, logs y artefactos locales; el contexto Web bajo de mas de `6 GB` a `10.82 MB`.
- Workflow `.github/workflows/infra.yml` valida Compose, Prometheus, JSON de Grafana y build de imagenes `erp-api`, `web`, `worker`.

Validaciones:

- `docker compose --env-file .env.example -f docker-compose.yml config --quiet`: OK.
- `docker compose --env-file .env.example -f docker-compose.validation.yml config --quiet`: OK.
- `promtool check config /etc/prometheus/prometheus.yml`: OK, `1` archivo de reglas y `10` reglas.
- JSON dashboards Grafana: OK con `title` raiz en los cuatro dashboards.
- `docker compose --env-file .env -f docker-compose.yml up --build -d redis erp-api worker web redis-exporter node-exporter prometheus grafana`: OK.
- `docker compose ps`: API, Web, Worker y Redis `healthy`; Prometheus/Grafana/exporters `up`.
- API live `http://localhost:13002/api/health/live`: `200`.
- API ready `http://localhost:13002/api/health/ready`: `200`.
- Worker health `http://localhost:3050/health` con `x-health-token`: `200`.
- Worker metrics `http://localhost:3050/metrics`: expone `erp_worker_up 1`.
- Prometheus `http://localhost:9091/-/ready`: `200`.
- Prometheus targets: `erp-api`, `erp-worker`, `redis`, `node`, `prometheus` en `UP`.
- Grafana `http://localhost:3300/api/health`: `200`.
- Grafana API dashboard `erp-infra-readiness`: `200`.
- Grafana query anónima a datasource Prometheus para `up{job="erp-api"}`: `200`.
- Grafana datasource query para `up{job=~"erp-api|erp-worker|redis|node|prometheus"}`: todos `1`.
- Secret scan basico: sin `.env`/certificados versionados, sin password del pooler, sin private keys, sin patron JWT `eyJhbGciOiJIUzI1Ni` restante en archivos escaneados.

Observacion:

- Grafana `12.1.1` emite en arranque un `level=error` interno por plugin `table` ya registrado. No afecta provisioning ni dashboards; no hay errores de dashboards ni de datasource. Se deja fijada la version para evitar drift de `latest`.
- GitHub Actions queda configurado y validado localmente por los comandos equivalentes; queda pendiente primera ejecucion remota o `workflow_dispatch` para confirmar el runner real.

Veredicto GPT Pro:

- Infra Gate 22: `ACEPTADO`.
- Estado: infraestructura local/sandbox lista.
- No hay bloqueo tecnico local conocido.
- No tocar funcionalidad ni infra salvo que falle un check de cierre o la primera corrida remota de Actions.

## Estado De Navegador Integrado

El navegador integrado esta visible y se uso para coordinar con GPT Pro en:

- `https://chatgpt.com/c/6a02e40e-d2a4-8328-9e86-9354456ebf40`

GPT Pro marco como siguiente gate bloqueante: `SUPERADMIN -> tenant nuevo -> RBAC/RLS por tenant`. Ese gate quedo ejecutado y documentado en la seccion Gate 21.

## Documentacion Obsoleta Removida

Se elimino del documento principal el historial detallado que ya no representa el estado actual:

- Bloqueos antiguos de puertos `13003/13012`.
- Secciones `bloqueado` o `en progreso` que fueron superadas por gates posteriores.
- Duplicados de casos manuales ya cubiertos por el manifest E2E vigente.
- Notas de navegador integrado no disponible que ya no son criterio del estado tecnico actual.
- Evidencia importada antigua que podia leerse como estado vigente.

El detalle historico queda recuperable por Git si se necesita auditoria forense, pero no debe usarse para decidir readiness actual.

## Decision Final Vigente

Frase valida para el estado actual:

> ERP validado funcionalmente en entorno local/sandbox, con API productiva local, Web productiva local, Redis real, gates automatizados, E2E por archivo, smoke por tramos, RBAC operativo por roles diarios, onboarding multi-tenant validado, RLS de aislamiento A/B probado por API, migraciones remotas pendientes aplicadas y auditoria anti-falsos-positivos completados. No se detectan bloqueos funcionales locales pendientes. No se declara produccion real absoluta hasta cargar certificado SUNAT/OSE productivo, configurar secretos productivos/email real si aplica y ejecutar smoke final contra esas credenciales reales.
