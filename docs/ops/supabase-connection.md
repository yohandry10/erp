# Supabase Direct Database Connection

Fecha de corte: 2026-05-16

## Estado

La conexion directa al pooler de Supabase fue verificada con `psql`.

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

En esta maquina se guardo la cadena de conexion en:

- `.env.local`

Ese archivo esta ignorado por Git mediante:

- `.gitignore`: `*.env.*`

Variables disponibles en `.env.local`:

- `DATABASE_URL`
- `POSTGRES_URL`
- `SUPABASE_DB_POOLER_HOST`
- `SUPABASE_DB_POOLER_PORT`
- `SUPABASE_DB_POOLER_DB`
- `SUPABASE_DB_POOLER_USER`

## Cargar conexion en PowerShell

```powershell
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}
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

Nota: `321__tesoreria_cxp_payment_idempotency.sql` se habia creado inicialmente como `307__tesoreria_cxp_payment_idempotency.sql`, pero se renombro para evitar conflicto con `307__runtime_accounting_inventory_purchase_accounts.sql`.

## Verificacion posterior

Checks esperados:

- `public.contabilidad_asientos_numeracion` existe.
- `public.obtener_siguiente_numero_asiento(uuid,timestamptz)` existe.
- `public.mark_outbox_event_failed(uuid,text,timestamptz)` existe.
- `public.ux_movimientos_bancarios_tenant_idempotency_key_307` existe.
- Roles operativos: `10`.
- Permisos RBAC: `195`.

## Importante

La base remota no expuso `supabase_migrations.schema_migrations` al momento de esta validacion. Por eso las migraciones se aplicaron directamente con `psql` y se documento la evidencia en este archivo y en `ERP_PRODUCTION_READINESS.md`.
