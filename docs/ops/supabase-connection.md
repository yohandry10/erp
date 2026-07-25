# Supabase Direct Database Connection

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `operacion`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de corte: 2026-07-14

## Estado

La conexion directa al pooler de Supabase fue verificada con `psql`.

Contrato vigente: DEV usa `hbueraexcbowpfnjlppi` y `.env.local`; PROD usa `wypnbcptofqdmoynlonq` y `.env.production`. Antes de cualquier operacion ejecutar `scripts/db-environment-preflight.ps1`. La politica completa esta en `docs/architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md`.

Actualizacion 2026-06-18: la conexion PROD de `.env.production` vuelve a ser operativa por `psql` contra el proyecto `wypnbcptofqdmoynlonq` (Postgres 17.6). Con esa conexion se aplicaron y verificaron `342`, `343`, `344` y `345` en PROD. El fallo previo `FATAL: (ENOTFOUND) tenant/user postgres.wypnbcptofqdmoynlonq not found` queda documentado como incidente historico, no como bloqueo vigente. Antes de aplicar cualquier migracion nueva en PROD, repetir prueba read-only con `psql` y ejecutar archivos con `--set=ON_ERROR_STOP=1`.

Host:

- `aws-0-us-west-2.pooler.supabase.com`

Puerto:

- `5432`

Base:

- `postgres`

Usuario:

- `postgres.wypnbcptofqdmoynlonq`

## Secreto

La contrasena no debe documentarse ni versionarse.

En esta maquina las cadenas estan separadas:

- DEV: `.env.local`
- PROD: `.env.production`

Ese archivo esta ignorado por Git mediante:

- `.gitignore`: `*.env.*`

Variables disponibles en ambos archivos, con valores propios de cada proyecto:

- `DATABASE_URL`
- `POSTGRES_URL`
- `SUPABASE_DB_POOLER_HOST`
- `SUPABASE_DB_POOLER_PORT`
- `SUPABASE_DB_POOLER_DB`
- `SUPABASE_DB_POOLER_USER`

## Cargar conexion en PowerShell

Elegir explicitamente un entorno. Nunca cargar `.env.local` para operar PROD.

```powershell
$envFile = '.env.production' # usar '.env.local' solo para DEV
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}

./scripts/db-environment-preflight.ps1 -Environment PROD -EnvFile $envFile
```

## Probar conexion

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' `
  --set=ON_ERROR_STOP=1 `
  --dbname=$env:DATABASE_URL `
  --command="select current_database(), current_user, now();"
```

## Aplicar una migracion

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' `
  --set=ON_ERROR_STOP=1 `
  --dbname=$env:DATABASE_URL `
  --file='supabase/migrations/320__rbac_operational_roles_seed.sql'
```

## Migraciones aplicadas manualmente el 2026-05-16

Se aplicaron con `psql --set=ON_ERROR_STOP=1`:

- `312__contabilidad_source_event_idempotency_hardening.sql`
- `313__contabilidad_asientos_numbering_sequence.sql`
- `314__contabilidad_asientos_numbering_trigger.sql`
- `315__contabilidad_numbering_serialization_strict_trigger.sql`
- `316__contabilidad_renumber_existing_duplicate_asientos.sql`
- `317__outbox_failed_completed_guard.sql`
- `318__outbox_completed_status_integrity_guard.sql`
- `319__rrhh_asistencia_sync_without_partial_on_conflict.sql`
- `320__rbac_operational_roles_seed.sql`
- `321__tesoreria_cxp_payment_idempotency.sql`
- `322__tenant_creation_operational_rbac_seed.sql`
- `323__tenant_creation_operational_rbac_public_rpc.sql`
- `324__tenant_creation_operational_rbac_role_whitelist.sql`
- `325__tenant_creation_rbac_rpc_execute_hardening.sql`
- `326__outbox_accounting_event_id_reconciliation.sql`

Nota: `321__tesoreria_cxp_payment_idempotency.sql` se habia creado inicialmente como `307__tesoreria_cxp_payment_idempotency.sql`, pero se renombro para evitar conflicto con `307__runtime_accounting_inventory_purchase_accounts.sql`.

## Migraciones aplicadas/verificadas el 2026-06-18

Se aplicaron con `psql --set=ON_ERROR_STOP=1` y conexion directa por `.env.production`:

- `342__sunat_tenant_onboarding_credentials.sql`
- `343__job_lock_rpc_security_definer_hardening.sql`
- `344__cxc_total_alias_runtime_alignment.sql`
- `345__supabase_advisor_security_hardening.sql`

Verificacion PROD posterior:

- `acquire_job_lock` y `release_job_lock`: `anon=false`, `authenticated=false`, `service_role=true`, `search_path` fijo y `SECURITY DEFINER=true`.
- `empresa_config`: 15 columnas SUNAT tenant-level presentes, 3 constraints validadas, defaults correctos y 0 filas invalidas para `342`.
- Smoke lock no destructivo: primer lock `true`, segundo lock simultaneo `false`, release `true`.
- `cuentas_por_cobrar.total`: columna presente y `cxc_total_mismatches=0`.
- Supabase Advisor hardening por catalogo: `security_definer_views_remaining=0`, `rls_disabled_public_tables_remaining=0`, `user_functions_without_search_path=0`, `secdef_user_functions_client_executable=0`.
- `financial_forensic_repair_log`: RLS habilitado y forzado; `anon=false`, `authenticated=false`, `service_role=true`.

## Separacion de entornos verificada el 2026-07-14

- `346__deployment_environment_boundary.sql` aplicada en DEV y PROD.
- DEV: marca `DEV`, ref `hbueraexcbowpfnjlppi`, demos permitidas.
- PROD: marca `PROD`, ref `wypnbcptofqdmoynlonq`, demos prohibidas.
- PROD fue purgada de 41 tenants QA/demo y 133 usuarios de prueba; quedo con cero filas tenant-scoped.
- Preflight `DEV` y `PROD`: OK.
- Evidencia: `docs/audits/2026-07-14-prod-demo-data-cleanup.md`.

## Verificacion posterior

Checks esperados:

- `public.contabilidad_asientos_numeracion` existe.
- `public.obtener_siguiente_numero_asiento(uuid,timestamptz)` existe.
- `public.mark_outbox_event_failed(uuid,text,timestamptz)` existe.
- `public.ux_movimientos_bancarios_tenant_idempotency_key_307` existe.
- Roles operativos: `10`.
- Permisos RBAC: `195`.
- `public.seed_operational_rbac_for_tenant(uuid, uuid)` existe, no es ejecutable por `anon`/`authenticated` y si por `service_role`.
- `outbox_events` queda sin `dead_letter`, `failed`, `pending` ni `processing` segun `ERP_PRODUCTION_READINESS.md`.

## Nota posterior 2026-05-24

El repositorio local contiene migraciones posteriores `327..335`. La colision temporal de prefijo `333__` fue resuelta renumerando tesoreria a `334__treasury_cash_bank_forensic_closure.sql`; `335__descontar_stock_authoritative.sql` corrige la salida autoritativa de inventario. Antes de aplicar en remoto o reconstruir una base limpia:

- verificar que no existan prefijos duplicados;
- documentar cuales archivos `327..335` se aplican;
- ejecutar con `psql --set=ON_ERROR_STOP=1`;
- correr los validadores runtime/smoke indicados en las auditorias forenses recientes.

## Importante

La base remota no expuso `supabase_migrations.schema_migrations` al momento de esta validacion. Por eso las migraciones se aplicaron directamente con `psql` y se documento la evidencia en este archivo y en `ERP_PRODUCTION_READINESS.md`.
